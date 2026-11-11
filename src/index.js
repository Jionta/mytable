import {aiReady,briefHour,makeBrief,ownerMessage,sendDailyBrief,socialBusinessIds,telegramReady,telegramReply} from './assistant.js';
import {socialRequest} from './publisher.js';
import { GrowWorkspace, today, ValidationError } from './workspace.js';
export { GrowWorkspace };

const encoder = new TextEncoder();
const MAX_BODY = 4 * 1024 * 1024;
const COOKIE = '__Host-grow_session';
const publicAssets = new Set(['/actions.js', '/styles.css', '/favicon.svg', '/login.css', '/login.js', '/join.js']);
const securityHeaders = {
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Strict-Transport-Security': 'max-age=31536000',
  'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
};
const json = (payload, status = 200, headers = {}) => Response.json(payload, { status, headers: { ...securityHeaders, ...headers } });
function secure(response) {
  const result = new Response(response.body, response);
  for (const [key, value] of Object.entries(securityHeaders)) result.headers.set(key, value);
  return result;
}
const redirect = path => new Response(null, { status: 303, headers: { ...securityHeaders, Location: path } });
const hex = bytes => Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('');
const digest = async value => hex(await crypto.subtle.digest('SHA-256', encoder.encode(value)));
async function equal(a, b) {
  const hashes = await Promise.all([a, b].map(value => crypto.subtle.digest('SHA-256', encoder.encode(value))));
  return crypto.subtle.timingSafeEqual(hashes[0], hashes[1]);
}
async function readJSON(request, limit = MAX_BODY) {
  const length = Number(request.headers.get('Content-Length') || 0);
  if (length > limit) throw new Error('Request is too large.');
  if (!request.headers.get('Content-Type')?.toLowerCase().startsWith('application/json')) throw new Error('Send application/json.');
  const reader = request.body?.getReader();
  if (!reader) return {};
  let size = 0;
  const chunks = [];
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) { await reader.cancel(); throw new Error('Request is too large.'); }
    chunks.push(value);
  }
  const buffer = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { buffer.set(chunk, offset); offset += chunk.byteLength; }
  try { return JSON.parse(new TextDecoder().decode(buffer) || '{}'); } catch { throw new Error('Choose valid JSON.'); }
}
async function verifyPassword(password, stored) {
  const [salt, expected] = stored.split('$');
  if (!/^[a-f0-9]{32}$/.test(salt || '') || !/^[a-f0-9]{64}$/.test(expected || '')) return false;
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  const result = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: encoder.encode(salt), iterations: 100000 }, key, 256);
  return equal(hex(result), expected);
}

async function hashPassword(password) {
  const salt = hex(crypto.getRandomValues(new Uint8Array(16)));
  const key = await crypto.subtle.importKey('raw',encoder.encode(password),'PBKDF2',false,['deriveBits']);
  return salt+'$'+hex(await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt:encoder.encode(salt),iterations:100000},key,256));
}
export default {
  async scheduled(controller, env) {
    if(!env.GROW_PASSWORD_HASH)return;
    try {await sendDailyBrief(env,env.WORKSPACE.getByName(env.WORKSPACE_ID),new Date(controller.scheduledTime));}
    catch (error) {console.error(JSON.stringify({event:'daily_brief_failed',kind:error.name}));}
  },
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    try {
      if (!env.GROW_PASSWORD_HASH) return json({ error: 'Workspace sign-in has not been configured.' }, 503);
      const workspace = env.WORKSPACE.getByName(env.WORKSPACE_ID);
      // These two integrations authenticate independently; browser endpoints still require Origin and session checks.
      if(path==='/integrations/telegram') {
        if(request.method!=='POST')return json({error:'Method not allowed.'},405);
        if(!telegramReady(env))return json({error:'Telegram is not configured.'},503);
        if(!(await equal(request.headers.get('X-Telegram-Bot-Api-Secret-Token')||'',env.GROW_TELEGRAM_WEBHOOK_SECRET)))return json({error:'Unauthorized webhook.'},403);
        let update;
        try {update=await readJSON(request,24*1024);} catch(error){return json({error:error.message},400);}
        const owner=env.GROW_TELEGRAM_OWNER_ID, message=ownerMessage(update,owner);
        if(!message)return json({ok:true});
        let reply;
        try {reply=await workspace.acceptAssistantUpdate(update.update_id,message.slice(0,4096));}
        catch(error){if(error.name!=='ValidationError')throw error;reply='সেভ হয়নি: '+error.message;}
        return json(reply?telegramReply(owner,reply):{ok:true});
      }
      if(path==='/integrations/social-bot') {
        if(!['GET','POST'].includes(request.method))return json({error:'Method not allowed.'},405);
        const allowed=socialBusinessIds(env);
        if((env.GROW_SOCIAL_BOT_TOKEN||'').length<32||!allowed.length)return json({error:'The local bot is not configured.'},503);
        if(!(await equal(request.headers.get('Authorization')||'','Bearer '+env.GROW_SOCIAL_BOT_TOKEN)))return json({error:'Unauthorized bot.'},403);
        if(request.method==='GET')return json({businesses:await workspace.socialBotBusinesses(allowed),mode:'draft_only',daily_limit_per_business:12});
        let draft;
        try {draft=await readJSON(request,24*1024);} catch(error){return json({error:error.message},400);}
        return json(await workspace.submitAssistantDraft(allowed,draft),201);
      }
      const cookie = request.headers.get('Cookie')?.split(';').map(item => item.trim()).find(item => item.startsWith(COOKIE + '='))?.slice(COOKIE.length + 1) || '';
      // Bind sessions to the credential version so a password reset signs everyone out.
      const tokenHash = cookie ? await digest(cookie + '\0' + env.GROW_PASSWORD_HASH) : '';
      const session = cookie ? await workspace.getSession(tokenHash) : null;
      const mutation = !['GET', 'HEAD'].includes(request.method);
      if (mutation && request.headers.get('Origin') !== url.origin) return json({ error: 'Cross-origin saves are not allowed.' }, 403);
      if (path === '/api/login' && request.method === 'POST') {
        const ipHash = await digest(request.headers.get('CF-Connecting-IP') || 'local-test');
        if (!(await workspace.reserveLogin(ipHash))) return json({ error: 'Too many sign-in attempts. Try again in 15 minutes.' }, 429, { 'Retry-After': '900' });
        let data;
        try { data = await readJSON(request); } catch (error) { return json({ error: error.message }, 400); }
        const credential = typeof data?.email==='string' && data.email.trim() ? await workspace.memberCredential(data.email.trim().toLowerCase()) : {password_hash:env.GROW_PASSWORD_HASH,person_id:''};
        if (!credential || typeof data?.password !== 'string' || !data.password || data.password.length > 1024 || !(await verifyPassword(data.password, credential.password_hash))) return json({ error: 'The email or password is incorrect.' }, 401);
        const token = hex(crypto.getRandomValues(new Uint8Array(32)));
        await workspace.createSession(await digest(token + '\0' + env.GROW_PASSWORD_HASH), ipHash, credential.person_id);
        return json({ ok: true, redirect:credential.person_id&&(await workspace.accessContext(credential.person_id)).role==='collaborator'?'/work':'/' }, 200, { 'Set-Cookie': `${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=604800` });
      }
      if ((path === '/api/invite-info' || path === '/api/activate') && request.method==='POST') {
        const ipHash=await digest(request.headers.get('CF-Connecting-IP')||'local-test');
        if (!(await workspace.reserveLogin(ipHash)))return json({error:'Too many attempts. Try again in 15 minutes.'},429);
        const data=await readJSON(request);
        if(!/^[a-f0-9]{64}$/.test(data?.token||''))return json({error:'This invitation is invalid.'},400);
        if(path==='/api/invite-info')return json(await workspace.inviteInfo(await digest(data.token)));
        if(typeof data.password!=='string'||data.password.length<12||data.password.length>1024)return json({error:'Choose a password with at least 12 characters.'},400);
        return json(await workspace.activateInvite(await digest(data.token),await hashPassword(data.password)));
      }
      if (path==='/join'||path==='/join.html')return secure(await env.ASSETS.fetch(new Request(new URL('/join',url),request)));
      if (path === '/login'  || path === '/login.html') {
        if (session) return redirect(session.person_id&&(await workspace.accessContext(session.person_id)).role==='collaborator'?'/work':'/');
        // Static Assets serves .html files at extensionless URLs. Fetch the
        // canonical path to avoid redirecting /login.html back to /login.
        return secure(await env.ASSETS.fetch(new Request(new URL('/login', url), request)));
      }
      if (publicAssets.has(path) && ['GET', 'HEAD'].includes(request.method)) return secure(await env.ASSETS.fetch(request));
      if (!session) return path.startsWith('/api/') ? json({ error: 'Sign in to open your workspace.' }, 401) : redirect('/login');
      if (path === '/api/logout' && request.method === 'POST') {
        if (!(await equal(request.headers.get('X-Grow-Token') || '', session.csrf))) return json({ error: 'Refresh GROW before saving.' }, 403);
        await workspace.deleteSession(tokenHash);
        return json({ ok: true }, 200, { 'Set-Cookie': `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0` });
      }
      const access=await workspace.accessContext(session.person_id||'');
      if (path.startsWith('/api/')) {
        if (request.method === 'GET') {
          if(path==='/api/social/accounts'&&access.role!=='collaborator'){const allowed=session.person_id?new Set(await workspace.accountIds(session.person_id)):null;const response=await socialRequest(env,'/accounts');return json(allowed?{accounts:response.accounts.filter(a=>allowed.has(a.id))}:response);}
          if (path === '/api/assistant' && !session.person_id) return json({
            ...await workspace.assistantStatus(),telegram:telegramReady(env),ai:aiReady(env),
            hour:briefHour(env),bot:(env.GROW_SOCIAL_BOT_TOKEN||'').length>=32?(await workspace.socialBotBusinesses(socialBusinessIds(env))).length:0,
          });
          if (path === '/api/health') return json({ ok: true, version: 4, deployment: 'cloud' });
          if (path === '/api/state') return json({...await workspace.stateFor(session.person_id||''),csrf:session.csrf,version:4,today:today(),deployment:'cloud'});
          if(path==='/api/my-work')return json({role:access.role,data:session.person_id?await workspace.memberState(session.person_id):null,csrf:session.csrf,today:today()});
          if (path === '/api/backup' && !session.person_id) return json({ grow_version: 4, exported_at: new Date().toISOString(), data: await workspace.snapshot() }, 200, { 'Content-Disposition': `attachment; filename="grow-backup-${today()}.json"` });
          return json({ error: 'Endpoint not found or not available to your account.' }, session.person_id?403:404);
        }
        if (!['POST', 'PATCH', 'DELETE'].includes(request.method)) return json({ error: 'Method not allowed.' }, 405);
        if (!(await equal(request.headers.get('X-Grow-Token') || '', session.csrf))) return json({ error: 'Refresh GROW before saving.' }, 403);
        if(path==='/api/assistant/brief'&&request.method==='POST'&&!session.person_id)
          return json(await makeBrief(env,await workspace.assistantBrief(today())));
        const dismiss=/^\/api\/assistant\/replies\/([a-f0-9-]{36})$/.exec(path);
        if(dismiss&&request.method==='DELETE'&&!session.person_id){
          await workspace.dismissAssistantReply(dismiss[1]);return json({ok:true});
        }
        if(path.startsWith('/api/assistant'))return json({error:'The owner manages integrations.'},403);
        const publishingMatch=/^\/api\/content\/([^/]+)\/social\/(upload|draft|publish|status|detach)$/.exec(path);
        if(publishingMatch){
          if(access.role==='collaborator')return json({error:'Publishing is available to the owner or assigned business admins only.'},403);
          const [,id,action]=publishingMatch;
          if(request.method!=='POST')return json({error:'Method not allowed.'},405);
          if(action==='upload'){
            await workspace.uploadAllowed(id,session.person_id||'');
            const size=Number(request.headers.get('X-File-Size')),type=request.headers.get('Content-Type');
            if(!Number.isSafeInteger(size)||size<1||size>50*1024*1024)return json({error:'Choose a file up to 50 MB.'},400);
            if(!env.SOCIAL||!env.GROW_SOCIAL_BRIDGE_SECRET)return json({error:'Social is not connected.'},503);
            const headers={'X-Grow-Bridge':env.GROW_SOCIAL_BRIDGE_SECRET,'Content-Type':type||'application/octet-stream','Content-Length':String(size),'X-File-Name':request.headers.get('X-File-Name')||''};
            const response=await env.SOCIAL.fetch('https://grow-bridge.internal/internal/grow/uploads',{method:'POST',headers,body:request.body,signal:AbortSignal.timeout(60000)});
            const media=await response.json();if(!response.ok)return json(media,response.status);
            return json({record:await workspace.addMedia(id,media,session.person_id||'')},201);
          }
          const data=await readJSON(request);
          return json(action==='detach'?{record:await workspace.removeMedia(id,data.mediaId,session.person_id||'')}:await workspace.publishing(id,action,data,session.person_id||''));
        }
        let data;
        try { data = await readJSON(request); } catch (error) { return json({ error: error.message }, 400); }
        const inviteMatch=/^\/api\/people\/([^/]+)\/invite$/.exec(path);
        if(inviteMatch&&!session.person_id&&request.method==='POST'){
          const token=hex(crypto.getRandomValues(new Uint8Array(32)));
          return json({...await workspace.createInvite(inviteMatch[1],await digest(token)),url:url.origin+'/join#'+token});
        }
        const result = await workspace.mutate(request.method, path, data,session.person_id||'');
        return json(result.payload, result.status);
      }
      if (mutation) return json({ error: 'Method not allowed.' }, 405);
      if(session.person_id&&access.role==='collaborator'){
        if(!['/work','/work.html','/member.js'].includes(path))return redirect('/work');
        return secure(await env.ASSETS.fetch(path==='/work.html'?new Request(new URL('/work',url),request):request));
      }
      return secure(await env.ASSETS.fetch(request));
    } catch (error) {
      if(error.name==='AccessError')return json({error:error.message},403);
      if(error.name==='ValidationError'||error instanceof ValidationError)return json({error:error.message},400);
      console.error(JSON.stringify({ event: 'request_failed', path, kind: error.name }));
      return json({ error: 'GROW could not complete this request. Please try again.' }, 500);
    }
  },
};
