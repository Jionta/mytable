import { schema, savePost, createPostsApp } from './posts';
import { createMediaApp } from './media';
import { ensurePersonalWorkspace, hydratePosts, postColumns, type PostRow } from './db';
import { requestPublishing } from './publishing';
const encoder=new TextEncoder();
const digest=async(value:string)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(value)))).map(b=>b.toString(16).padStart(2,'0')).join('');
const json=(payload:unknown,status=200)=>Response.json(payload,{status,headers:{'Cache-Control':'no-store'}});
const stable=(value:string[])=>[...value].sort().join('\0');
async function bridgeJSON(request:Request):Promise<Record<string,unknown>>{
 if(!request.headers.get('Content-Type')?.startsWith('application/json'))throw new TypeError('Send JSON.');
 if(Number(request.headers.get('Content-Length'))>100000)throw new RangeError('Request too large.');
 const reader=request.body?.getReader();if(!reader)throw new TypeError('Send JSON.');let size=0,text='',decoder=new TextDecoder();
 for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>100000){await reader.cancel();throw new RangeError('Request too large.');}text+=decoder.decode(value,{stream:true});}text+=decoder.decode();
 const result:unknown=JSON.parse(text);if(!result||typeof result!=='object'||Array.isArray(result))throw new TypeError('Send a JSON object.');return result as Record<string,unknown>;
}
/** Private GROW service binding. No OAuth credentials or owner sessions cross this bridge. */
export async function growBridge(request:Request,env:Env){
 try{
  const url=new URL(request.url),secret=(env as Env & {GROW_SOCIAL_BRIDGE_SECRET?:string}).GROW_SOCIAL_BRIDGE_SECRET;
  if(url.hostname!=='grow-bridge.internal'||!secret||!request.headers.get('X-Grow-Bridge'))return json({error:'Not found.'},404);
  const key=await crypto.subtle.importKey('raw',encoder.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign','verify']);
  const signature=await crypto.subtle.sign('HMAC',key,encoder.encode(secret));
  if(!await crypto.subtle.verify('HMAC',key,signature,encoder.encode(request.headers.get('X-Grow-Bridge')!)))return json({error:'Not found.'},404);
  const path=url.pathname.slice('/internal/grow'.length),{workspaceId,userId}=await ensurePersonalWorkspace(env.DB);
  if(path==='/accounts'&&request.method==='GET'){
   const rows=await env.DB.prepare("SELECT id,platform,label,CASE WHEN connection_status='active' AND token_expires_at IS NOT NULL AND token_expires_at<=? THEN 'expired' ELSE connection_status END AS connectionStatus FROM social_accounts WHERE workspace_id=? AND external_account_id IS NOT NULL ORDER BY platform,label").bind(new Date().toISOString(),workspaceId).all();
   return json({accounts:rows.results});
  }
  if(path==='/uploads'&&request.method==='POST')return createMediaApp().fetch(new Request(new URL('/api/uploads',url),request),env);
  if(request.method==='POST'&&path==='/drafts'){
   const input=await bridgeJSON(request),validated=schema.safeParse(input.payload);
   if(!validated.success||typeof input.sourceKey!=='string'||input.sourceKey.length>250)return json({error:validated.success?'Invalid source.':validated.error.issues[0].message},400);
   const payload={...validated.data,scheduledFor:null,revision:undefined};
   const id='grow_'+await digest(input.sourceKey+'\0'+JSON.stringify(payload));
   const saved=await savePost(env.DB,payload,workspaceId,userId,undefined,id);
   return 'error'in saved?json({error:saved.error},saved.status):json({...saved,url:'https://social.iamjubayer.com/?growPost='+saved.id});
  }
  const match=/^\/posts\/(grow_[a-f0-9]{64})(\/publish)?$/.exec(path);
  if(match&&((request.method==='GET'&&!match[2])||(request.method==='POST'&&match[2]))){
   const row=await env.DB.prepare(`SELECT ${postColumns} FROM posts p WHERE p.id=? AND p.workspace_id=? AND p.deleted_at IS NULL`).bind(match[1],workspaceId).first<PostRow>();
   if(!row)return json({error:'This Social draft is unavailable. Open Social to check its history.'},404);
   const post=(await hydratePosts(env.DB,[row]))[0];
   if(!match[2])return json({id:row.id,state:row.state,revision:row.revision,targets:post.targets.map(t=>({label:t.label,platform:t.platform,state:t.state,lastError:t.lastError})),url:'https://social.iamjubayer.com/?growPost='+row.id});
   const input=schema.safeParse((await bridgeJSON(request)).payload);if(!input.success)return json({error:'An approved content snapshot is required.'},400);
   const expected=input.data;
   if(expected.platforms.length!==1||expected.platforms[0]!=='facebook'||!expected.accountIds?.length)return json({error:'Choose Facebook Pages to publish. Other networks are draft-only.'},400);
   if((row.title||'')!==(expected.title||'')||row.baseContent!==expected.content||stable(post.accountIds)!==stable(expected.accountIds)||post.variants.length!==1||post.variants[0].platform!=='facebook'||post.variants[0].content!==expected.content||post.media.map(m=>m.id).join('\0')!==expected.mediaIds.join('\0'))return json({error:'This draft changed in Social. Review it there before publishing.'},409);
   const result=await requestPublishing(env,workspaceId,row.id,row.revision);
   return 'error'in result?json({error:result.error},result.status):json(result,202);
  }
  return json({error:'Not found.'},404);
 }catch(error){if(error instanceof RangeError)return json({error:'Request too large.'},413);if(error instanceof TypeError||error instanceof SyntaxError)return json({error:'Send valid JSON.'},400);console.error(JSON.stringify({event:'grow_bridge_failed',kind:error instanceof Error?error.name:'Error'}));return json({error:'The Social connection could not complete this request.'},500);}
}
