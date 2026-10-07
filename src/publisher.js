export const publisherFields=['publisher_post_id','publisher_state','publisher_error','publisher_media','publisher_account_ids'];
export const publisherLocked=['sending','publishing','published','uncertain'];
const platforms={Facebook:'facebook',Instagram:'instagram',LinkedIn:'linkedin',YouTube:'youtube','YouTube Shorts':'youtube',X:'x',TikTok:'tiktok'};
export function publisherPayload(db,record,accountIds){
 const platform=platforms[record.channel];if(!platform)throw new db.ValidationError('This channel is managed through its website. Social supports your social networks.');
 if(!Array.isArray(accountIds)||accountIds.length>100||accountIds.some(id=>typeof id!=='string'||id.length>150)||new Set(accountIds).size!==accountIds.length)throw new db.ValidationError('Choose valid Social destinations.');
 const media=JSON.parse(record.publisher_media||'[]');
 if(!record.copy.trim()&&!media.length)throw new db.ValidationError('Write the post or upload its media first.');
 if(record.copy.trim().length>5000)throw new db.ValidationError('Social captions support up to 5,000 characters. Shorten this caption first.');
 return {title:record.title.slice(0,120).trim(),content:record.copy.trim(),platforms:[platform],variants:[],mediaIds:media.map(m=>m.id),accountIds,scheduledFor:null,timezone:'Asia/Dhaka'};
}
export async function approvedFingerprint(payload){
 const value={title:payload.title||'',content:payload.content,variants:payload.platforms.map(platform=>({platform,content:payload.variants?.find(v=>v.platform===platform)?.content??payload.content,title:payload.variants?.find(v=>v.platform===platform)?.title||payload.title||''})).sort((a,b)=>a.platform.localeCompare(b.platform)),mediaIds:payload.mediaIds,accountIds:[...payload.accountIds].sort()};
 return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(value))))).map(b=>b.toString(16).padStart(2,'0')).join('');
}
export async function socialRequest(env,path,method='GET',data,extraHeaders={}){
 if(!env.SOCIAL||!env.GROW_SOCIAL_BRIDGE_SECRET)throw new Error('The Social connection has not been configured.');
 const response=await env.SOCIAL.fetch('https://grow-bridge.internal/internal/grow'+path,{method,headers:{...extraHeaders,'X-Grow-Bridge':env.GROW_SOCIAL_BRIDGE_SECRET,'Content-Type':'application/json'},body:data===undefined?undefined:JSON.stringify(data),signal:AbortSignal.timeout(30000)});
 const result=await response.json();if(!response.ok)throw new Error(result.error||'Social could not complete this action.');return result;
}
export function ensureUpload(db,id){const content=db.one('content',id);if(!['Idea','Draft','Changes requested'].includes(content.status)||publisherLocked.includes(content.publisher_state))throw new db.ValidationError('Return this content to Draft before changing its attachments.');if(JSON.parse(content.publisher_media||'[]').length>=10)throw new db.ValidationError('A post can have at most 10 attachments.');return content;}
export function attachMedia(db,id,media){return db.ctx.storage.transactionSync(()=>{const content=ensureUpload(db,id);const files=JSON.parse(content.publisher_media||'[]');files.push({id:media.id,filename:media.filename,contentType:media.contentType,bytes:media.bytes});content.publisher_media=JSON.stringify(files);content.status='Draft';content.updated_at=new Date().toISOString();db.put('content',content);db.audit('Attached media','content',id,media.filename);return content;});}
export function detachMedia(db,id,mediaId){return db.ctx.storage.transactionSync(()=>{const content=db.one('content',id);if(!['Idea','Draft','Changes requested'].includes(content.status)||publisherLocked.includes(content.publisher_state))throw new db.ValidationError('Return this content to Draft before changing attachments.');content.publisher_media=JSON.stringify(JSON.parse(content.publisher_media||'[]').filter(m=>m.id!==mediaId));content.updated_at=new Date().toISOString();db.put('content',content);return content;});}
export async function publisherAction(db,id,action,data,authorize=()=>{}){
 authorize();
 const initial=db.one('content',id);
 if(action==='status'){
  if(!initial.publisher_post_id)throw new db.ValidationError('Send this content to Social first.');
  let fingerprint='',snapshot='';try{const payload=publisherPayload(db,initial,JSON.parse(initial.publisher_account_ids||'[]'));snapshot=JSON.stringify(payload);fingerprint=await approvedFingerprint(payload);}catch{}
  const result=await socialRequest(db.publisherEnv,'/posts/'+initial.publisher_post_id,'GET',undefined,{'X-Grow-Fingerprint':fingerprint});
  return db.ctx.storage.transactionSync(()=>{const record=db.one('content',id);if(record.publisher_state==='sending')throw new db.ValidationError('A publishing action is in progress. Wait a moment, then check again.');if(record.publisher_post_id!==initial.publisher_post_id)throw new db.ValidationError('This content changed. Refresh and check again.');let unchanged=false;try{unchanged=JSON.stringify(publisherPayload(db,record,JSON.parse(record.publisher_account_ids||'[]')))===snapshot;}catch{}record.publisher_state=result.state;record.publisher_error=(result.targets||[]).map(t=>t.lastError).filter(Boolean).join('; ').slice(0,1000);if(result.state==='published'&&result.matches===true&&unchanged){record.status='Published';record.date=record.date||db.today();}else if(result.matches===false||!unchanged){if(result.state==='published')record.publisher_state='changed';record.publisher_error='The Social version differs from this content. Review it in Social; GROW has kept your current content status.';}record.updated_at=new Date().toISOString();db.put('content',record);return {...result,record};});
 }
 if(!['draft','publish'].includes(action))throw new db.ValidationError('Unknown publishing action.');
 const prepared=db.ctx.storage.transactionSync(()=>{
  authorize();const record=db.one('content',id);
  if(action==='publish'&&record.demo)throw new db.ValidationError('Sample content can be sent as a draft only. Create your own content before publishing.');
  if(!['Approved','Scheduled'].includes(record.status))throw new db.ValidationError('Approve the content before sending it to Social.');
  const expiredSending=record.publisher_state==='sending'&&Date.parse(record.updated_at)<Date.now()-120000;
  if(record.publisher_state==='sending'&&!expiredSending)throw new db.ValidationError('This content is being sent. Wait a moment, then check its status.');
  if(action==='draft'&&publisherLocked.includes(record.publisher_state)&&!expiredSending)throw new db.ValidationError('Check the existing publishing result before sending another draft.');
  const accounts=action==='publish'?JSON.parse(record.publisher_account_ids||'[]'):(data.accountIds||[]),payload=publisherPayload(db,record,accounts);
  if(action==='publish'&&(!record.publisher_post_id||payload.platforms[0]!=='facebook'||!accounts.length))throw new db.ValidationError('Send a draft with explicitly selected Facebook Pages before publishing.');
  const oldState=expiredSending?'':record.publisher_state;record.publisher_state='sending';record.updated_at=new Date().toISOString();record.publisher_error='';db.put('content',record);
  return {record,payload,oldState};
 });
 try{
  const result=action==='draft'?await socialRequest(db.publisherEnv,'/drafts','POST',{sourceKey:db.publisherEnv.WORKSPACE_ID+':'+id,payload:prepared.payload}):await socialRequest(db.publisherEnv,'/posts/'+prepared.record.publisher_post_id+'/publish','POST',{payload:prepared.payload});
  return db.ctx.storage.transactionSync(()=>{const record=db.one('content',id);record.publisher_post_id=result.id||prepared.record.publisher_post_id;record.publisher_state=result.state||'publishing';record.publisher_account_ids=JSON.stringify(prepared.payload.accountIds);record.publisher_error='';record.updated_at=new Date().toISOString();if(record.publisher_state==='published'){record.status='Published';record.date=record.date||db.today();}db.put('content',record);db.audit(action==='draft'?'Sent to Social':'Requested publishing','content',id,record.title);return {...result,record,url:'https://social.iamjubayer.com/?growPost='+record.publisher_post_id};});
 }catch(error){db.ctx.storage.transactionSync(()=>{const record=db.one('content',id);record.publisher_state=action==='publish'?'uncertain':prepared.oldState;record.publisher_error=String(error.message).slice(0,1000);db.put('content',record);});throw new db.ValidationError(error.message);}
}
