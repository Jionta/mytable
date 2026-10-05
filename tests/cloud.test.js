import { env } from 'cloudflare:workers';
import { runInDurableObject } from 'cloudflare:test';
import { describe, it, expect, beforeEach } from 'vitest';
import worker from '../src/index.js';

const ORIGIN = 'https://os.iamjubayer.com';
let bindings, cookie, csrf;
async function request(path, method = 'GET', data, options = {}) {
  const headers = {};
  if (cookie && options.auth !== false) headers.Cookie = cookie;
  if (method !== 'GET') {
    headers.Origin = options.origin || ORIGIN;
    headers['Content-Type'] = 'application/json';
    if (csrf && options.csrf !== false) headers['X-Grow-Token'] = csrf;
  }
  return worker.fetch(new Request(ORIGIN + path, { method, headers, body: data === undefined ? undefined : JSON.stringify(data) }), bindings);
}
async function signIn() {
  const response = await request('/api/login', 'POST', { password: 'test-only-password' });
  expect(response.status).toBe(200);
  expect(response.headers.get('Set-Cookie')).toContain('HttpOnly; Secure; SameSite=Strict');
  cookie = response.headers.get('Set-Cookie').split(';')[0];
  const state = await (await request('/api/state')).json(); csrf = state.csrf;
  return state.data;
}
async function state() { return (await (await request('/api/state')).json()).data; }
async function create(entity, data) {
  const response = await request('/api/' + entity, 'POST', data);
  const result = await response.json(); expect(response.status, JSON.stringify(result)).toBe(200);
  return result.record;
}
beforeEach(() => { bindings = { ...env, WORKSPACE_ID: 'test-' + crypto.randomUUID() }; cookie = ''; csrf = ''; });

describe('GROW cloud workflows', () => {
  it('requires sign-in for records, backup, and app, and invalidates sign-out', async () => {
    expect((await request('/')).status).toBe(303);
    const loginPage = await request('/login');
    expect(loginPage.status).toBe(200);
    expect(await loginPage.text()).toContain('Workspace password');
    expect((await request('/styles.css')).status).toBe(200);
    expect((await request('/api/state')).status).toBe(401);
    expect((await request('/api/backup')).status).toBe(401);
    const data = await signIn(); expect(data.businesses).toHaveLength(8);
    expect((await request('/api/settings', 'PATCH', { owner: 'Changed' }, { csrf: false })).status).toBe(403);
    expect((await request('/api/settings', 'PATCH', { owner: 'Changed' }, { origin: 'https://example.com' })).status).toBe(403);
    expect((await request('/api/logout', 'POST', {})).status).toBe(200);
    expect((await request('/api/state')).status).toBe(401);
  });
  it('fails closed without a configured password and throttles guessing', async () => {
    expect((await worker.fetch(new Request(ORIGIN), { ...bindings, GROW_PASSWORD_HASH: '' })).status).toBe(503);
    for (let i = 0; i < 8; i++) expect((await request('/api/login', 'POST', { password: 'wrong' })).status).toBe(401);
    expect((await request('/api/login', 'POST', { password: 'test-only-password' })).status).toBe(429);
  });
  it('preserves the approval workflow and protects approved and published copy', async () => {
    await signIn();
    const content = await create('content', { title: 'Real draft', business_id: 'vidzones', channel: 'Instagram', format: 'Post', status: 'Draft', copy: 'Original' });
    const path = '/api/content/' + content.id;
    expect((await request(path, 'PATCH', { status: 'Published' })).status).toBe(400);
    for (const status of ['In review', 'Approved']) expect((await request(path, 'PATCH', { status })).status).toBe(200);
    expect((await request(path, 'PATCH', { copy: 'Unreviewed change' })).status).toBe(400);
    expect((await request(path, 'PATCH', { status: 'Scheduled' })).status).toBe(400);
    expect((await request(path, 'PATCH', { status: 'Scheduled', date: '2026-10-05' })).status).toBe(200);
    expect((await request(path, 'PATCH', { status: 'Published' })).status).toBe(200);
    expect((await request(path, 'PATCH', { status: 'Draft' })).status).toBe(400);
  });
  it('commits invoice and income together and rejects concurrent overpayment', async () => {
    await signIn();
    const invoice = await create('invoices', { title: 'Real invoice', business_id: 'artbit', amount: 10000, date: '2026-10-01', due: '2026-10-10' });
    const path = '/api/invoices/' + invoice.id;
    expect((await request(path, 'PATCH', { paid: 100 })).status).toBe(400);
    const results = await Promise.all([1, 2].map(() => request(path + '/payment', 'POST', { amount: 7000, date: '2026-10-05' })));
    expect(results.map(response => response.status).sort()).toEqual([200, 400]);
    const saved = await state();
    const payments = saved.transactions.filter(record => record.invoice_id === invoice.id);
    expect(payments).toHaveLength(1); expect(payments[0].amount).toBe(7000);
    expect(saved.invoices.find(record => record.id === invoice.id).paid).toBe(7000);
    expect((await request('/api/transactions/' + payments[0].id, 'DELETE', {})).status).toBe(400);
    expect((await request(path, 'DELETE', {})).status).toBe(400);
    expect((await request(path, 'PATCH', { business_id: 'qfs' })).status).toBe(400);
  });
  it('updates imported tasks by external ID and rolls back invalid batches', async () => {
    await signIn();
    const task = { external_id: 'real-1', title: 'External task', business_id: 'artbit', status: 'Open' };
    expect((await request('/api/import-tasks', 'POST', { tasks: [task] })).status).toBe(200);
    const first = (await state()).tasks[0]; expect(first.priority).toBe('Medium');
    expect((await request('/api/import-tasks', 'POST', { tasks: [{ ...task, status: 'Done' }] })).status).toBe(200);
    const updated = (await state()).tasks[0]; expect(updated.id).toBe(first.id); expect(updated.created_at).toBe(first.created_at); expect(updated.status).toBe('Done');
    expect((await request('/api/import-tasks', 'POST', { tasks: [{ ...task, external_id: 'valid' }, { ...task, external_id: 'invalid', business_id: 'missing' }] })).status).toBe(400);
    expect((await state()).tasks).toHaveLength(1);
    expect((await request('/api/tasks/' + first.id, 'PATCH', { status: 'Open' })).status).toBe(400);
  });
  it('validates restores before replacing data, retains real work when clearing samples', async () => {
    await signIn();
    const content = await create('content', { title: 'Keep my work', business_id: 'artbit', client_id: 'nahar', channel: 'Facebook', format: 'Post', status: 'Draft' });
    const backup = await (await request('/api/backup')).json();
    const original = await state();
    const invalid = structuredClone(backup); invalid.data.content[0].business_id = 'missing';
    expect((await request('/api/restore', 'POST', invalid)).status).toBe(400);
    expect(await state()).toEqual(original);
    const invalidFinance = structuredClone(backup); invalidFinance.data.invoices[0].paid = 100;
    expect((await request('/api/restore', 'POST', invalidFinance)).status).toBe(400);
    expect(await state()).toEqual(original);
    expect((await request('/api/clear-samples', 'POST', {})).status).toBe(200);
    const cleared = await state(); expect(cleared.businesses).toHaveLength(8); expect(cleared.content).toHaveLength(1);
    expect(cleared.content[0].id).toBe(content.id); expect(cleared.content[0].client_id).toBe(''); expect(cleared.transactions).toHaveLength(0);
    expect((await request('/api/restore', 'POST', backup)).status).toBe(200);
    const restored = await state(); expect(restored.content).toEqual(backup.data.content); expect(restored.transactions).toEqual(backup.data.transactions);
  });
  it('rejects invalid dates, noninteger money, and mismatched business-client links', async () => {
    await signIn();
    const client = await create('clients', { name: 'Real client', business_id: 'artbit', status: 'Active', fee: 100000 });
    expect((await request('/api/clients/' + client.id, 'PATCH', { fee: 12.5 })).status).toBe(400);
    expect((await request('/api/projects', 'POST', { title: 'Wrong client', business_id: 'qfs', client_id: client.id, status: 'Planned' })).status).toBe(400);
    expect((await request('/api/transactions', 'POST', { title: 'Invalid date', business_id: 'artbit', kind: 'Income', amount: 100, date: '2026-02-30' })).status).toBe(400);
    expect((await request('/api/businesses/' + client.business_id, 'DELETE', {})).status).toBe(400);
  });
  it('separates workspace storage and session identities', async () => {
    await signIn();
    const client = await create('clients', { name: 'Private client', business_id: 'artbit', status: 'Active' });
    const other = env.WORKSPACE.getByName('separate-' + crypto.randomUUID());
    expect((await other.snapshot()).clients.some(record => record.id === client.id)).toBe(false);
    const secondBindings = { ...bindings, WORKSPACE_ID: 'separate-' + crypto.randomUUID() };
    expect((await worker.fetch(new Request(ORIGIN + '/api/state', { headers: { Cookie: cookie } }), secondBindings)).status).toBe(401);
  });
  it('expires sessions and revokes them after a password change', async () => {
    await signIn();
    const rotated = { ...bindings, GROW_PASSWORD_HASH: '00112233445566778899aabbccddeeff$' + 'f'.repeat(64) };
    expect((await worker.fetch(new Request(ORIGIN + '/api/state', { headers: { Cookie: cookie } }), rotated)).status).toBe(401);
    const stub = env.WORKSPACE.getByName(bindings.WORKSPACE_ID);
    await runInDurableObject(stub, (_instance, context) => {
      context.storage.sql.exec('UPDATE sessions SET expires=0');
    });
    expect((await request('/api/state')).status).toBe(401);
  });
});
