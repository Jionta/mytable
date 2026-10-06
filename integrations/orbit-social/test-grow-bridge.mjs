import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {build} from 'esbuild';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
const secret='fixture-grow-bridge-secret';
const bundle=await build({entryPoints:['src/worker/index.ts'],bundle:true,write:false,format:'esm',platform:'browser'});
const mf=new Miniflare(convertV4MiniflareOptions({workers:[{modules:true,script:new TextDecoder().decode(bundle.outputFiles[0].contents),compatibilityDate:'2026-09-28',d1Databases:{DB:'bridge-fixture'},r2Buckets:{MEDIA:'bridge-fixture'},bindings:{OWNER_EMAIL:'fixture@example.invalid',OWNER_PASSWORD_SHA256:'dummy',SESSION_SECRET:'fixture-session-secret',GROW_SOCIAL_BRIDGE_SECRET:secret},outboundService:async()=>{throw new Error('Bridge draft tests must not contact a social platform');}}]}));
const base='https://grow-bridge.internal',request=(path,method='GET',body,options={})=>mf.dispatchFetch((options.base||base)+'/internal/grow'+path,{method,headers:{'X-Grow-Bridge':options.secret??secret,'Content-Type':'application/json',...options.headers},body:body===undefined?undefined:typeof body==='string'?body:JSON.stringify(body)});
try{
 const db=await mf.getD1Database('DB');for(const file of readdirSync('migrations').filter(f=>f.endsWith('.sql')).sort())for(const sql of readFileSync('migrations/'+file,'utf8').replace(/^--.*$/gm,'').split(';').map(s=>s.trim()).filter(Boolean))await db.prepare(sql).run();
 assert.equal((await request('/accounts','GET',undefined,{secret:'incorrect'})).status,404);assert.equal((await request('/accounts','GET',undefined,{base:'https://social.iamjubayer.com'})).status,404);
 let accounts=await(await request('/accounts')).json();assert.deepEqual(accounts.accounts,[]);
 const payload={title:'Approved fixture',content:'Fixture caption',platforms:['facebook'],variants:[],mediaIds:[],accountIds:[],scheduledFor:null,timezone:'Asia/Dhaka'};
 const responses=await Promise.all([request('/drafts','POST',{sourceKey:'grow-fixture:one',payload}),request('/drafts','POST',{sourceKey:'grow-fixture:one',payload})]);
 const drafts=await Promise.all(responses.map(async response=>{assert.equal(response.status,200);return response.json();}));assert.equal(drafts[0].id,drafts[1].id);assert.match(drafts[0].id,/^grow_[a-f0-9]{64}$/);assert.equal((await db.prepare('SELECT count(*) AS n FROM posts').first()).n,1);assert.equal((await db.prepare('SELECT count(*) AS n FROM post_variants').first()).n,1);
 const retry=await(await request('/drafts','POST',{sourceKey:'grow-fixture:one',payload})).json();assert.equal(retry.id,drafts[0].id);assert.equal(retry.revision,0);
 const file='fixture-photo-bytes';const uploaded=await request('/uploads','POST',file,{headers:{'Content-Type':'image/png','Content-Length':String(file.length),'X-File-Name':'fixture.png'}});assert.equal(uploaded.status,201);const media=await uploaded.json();assert.equal(media.filename,'fixture.png');assert.equal(media.bytes,file.length);
 const changed=await(await request('/drafts','POST',{sourceKey:'grow-fixture:one',payload:{...payload,mediaIds:[media.id]}})).json();assert.notEqual(changed.id,drafts[0].id);assert.equal((await db.prepare('SELECT count(*) AS n FROM post_media WHERE post_id=?').bind(changed.id).first()).n,1);
 const status=await(await request('/posts/'+changed.id)).json();assert.equal(status.state,'draft');assert(!JSON.stringify(status).includes(secret));assert.equal((await request('/posts/'+changed.id+'/publish','POST',{payload})).status,400);
 assert.equal((await request('/posts/not-a-grow-post')).status,404);
 assert.equal((await request('/drafts','POST',{sourceKey:'bad',payload:{...payload,mediaIds:['foreign-media']}})).status,409);
 const login=await mf.dispatchFetch('https://social.iamjubayer.com/?growPost='+changed.id,{redirect:'manual'});assert.equal(login.status,303);assert.equal(login.headers.get('Location'),'/login?post='+changed.id);const html=await(await mf.dispatchFetch('https://social.iamjubayer.com/login?post='+changed.id)).text();assert(html.includes('/auth/login?post='+changed.id));
 console.log('GROW bridge: private authentication, concurrent draft deduplication, streamed media, scope checks and draft login handoff passed. No live posts sent.');
}finally{await mf.dispose();}
