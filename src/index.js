import { GrowWorkspace, today } from './workspace.js';
export { GrowWorkspace };

const encoder = new TextEncoder();
const MAX_BODY = 4 * 1024 * 1024;
const COOKIE = '__Host-grow_session';
const publicAssets = new Set(['/styles.css', '/favicon.svg', '/login.css', '/login.js']);
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
async function readJSON(request) {
  const length = Number(request.headers.get('Content-Length') || 0);
  if (length > MAX_BODY) throw new Error('File is too large (4 MB maximum).');
  if (!request.headers.get('Content-Type')?.toLowerCase().startsWith('application/json')) throw new Error('Send application/json.');
  const reader = request.body?.getReader();
  if (!reader) return {};
  let size = 0;
  const chunks = [];
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BODY) { await reader.cancel(); throw new Error('File is too large (4 MB maximum).'); }
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

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    try {
      if (!env.GROW_PASSWORD_HASH) return json({ error: 'Workspace sign-in has not been configured.' }, 503);
      const workspace = env.WORKSPACE.getByName(env.WORKSPACE_ID);
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
        if (typeof data?.password !== 'string' || !data.password || data.password.length > 1024 || !(await verifyPassword(data.password, env.GROW_PASSWORD_HASH))) return json({ error: 'The password is incorrect.' }, 401);
        const token = hex(crypto.getRandomValues(new Uint8Array(32)));
        await workspace.createSession(await digest(token + '\0' + env.GROW_PASSWORD_HASH), ipHash);
        return json({ ok: true }, 200, { 'Set-Cookie': `${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=604800` });
      }
      if (path === '/login' || path === '/login.html') {
        if (session) return redirect('/');
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
      if (path.startsWith('/api/')) {
        if (request.method === 'GET') {
          if (path === '/api/health') return json({ ok: true, version: 2, deployment: 'cloud' });
          if (path === '/api/state') return json({ data: await workspace.snapshot(), csrf: session.csrf, version: 2, today: today(), deployment: 'cloud' });
          if (path === '/api/backup') return json({ grow_version: 2, exported_at: new Date().toISOString(), data: await workspace.snapshot() }, 200, { 'Content-Disposition': `attachment; filename="grow-backup-${today()}.json"` });
          return json({ error: 'Endpoint not found.' }, 404);
        }
        if (!['POST', 'PATCH', 'DELETE'].includes(request.method)) return json({ error: 'Method not allowed.' }, 405);
        if (!(await equal(request.headers.get('X-Grow-Token') || '', session.csrf))) return json({ error: 'Refresh GROW before saving.' }, 403);
        let data;
        try { data = await readJSON(request); } catch (error) { return json({ error: error.message }, 400); }
        const result = await workspace.mutate(request.method, path, data);
        return json(result.payload, result.status);
      }
      if (mutation) return json({ error: 'Method not allowed.' }, 405);
      return secure(await env.ASSETS.fetch(request));
    } catch (error) {
      console.error(JSON.stringify({ event: 'request_failed', path, error: error.message }));
      return json({ error: 'GROW could not complete this request. Please try again.' }, 500);
    }
  },
};
