import { env } from 'cloudflare:workers';
import { runInDurableObject } from 'cloudflare:test';
import { describe, it, expect, beforeEach } from 'vitest';
import worker from '../src/index.js';
import {migratePersonalOS} from '../src/operations.js';

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

describe('Personal business operations',()=>{
  it('manages personal tasks, checklists, recurrence and deletion without external IDs',async()=>{
    await signIn();
    const task=await create('tasks',{title:'Monthly review',status:'Open',recurrence:'Monthly',due:'2027-01-31'});
    const step=await create('task_steps',{title:'Review numbers',task_id:task.id});
    expect((await request('/api/tasks/'+task.id,'PATCH',{status:'Done'})).status).toBe(400);
    expect((await request('/api/task_steps/'+step.id,'PATCH',{completed:true})).status).toBe(200);
    expect((await request('/api/tasks/'+task.id,'PATCH',{status:'Done'})).status).toBe(200);
    const saved=await state(),next=saved.tasks.find(t=>t.id!==task.id&&t.title===task.title);
    expect(next.due).toBe('2027-02-28');expect(next.business_id).toBe('');expect(next.origin).toBe('GROW');
    expect(saved.task_steps.find(s=>s.task_id===next.id).completed).toBe(false);
    expect((await request('/api/tasks/'+task.id,'PATCH',{status:'Done'})).status).toBe(200);
    expect((await state()).tasks).toHaveLength(2);
    await request('/api/tasks/'+task.id,'PATCH',{status:'Open'});await request('/api/tasks/'+task.id,'PATCH',{status:'Done'});expect((await state()).tasks).toHaveLength(2);
    expect((await request('/api/tasks/'+next.id,'DELETE',{})).status).toBe(200);
    expect((await state()).task_steps.some(s=>s.task_id===next.id)).toBe(false);
    const backup=await(await request('/api/backup')).json();
    expect(backup.grow_version).toBe(2);
    expect((await request('/api/restore','POST',backup)).status).toBe(200);
    expect((await state()).tasks).toEqual(backup.data.tasks);
  });
  it('generates scoped monthly client deliverables and one service invoice',async()=>{
    await signIn();
    const client=await create('clients',{name:'Test agency client',business_id:'artbit',status:'Active'});
    const plan=await create('retainers',{title:'October delivery',business_id:'artbit',client_id:client.id,month:'2026-10',status:'Active',graphics:2,reels:1,premium:1,fee:3500000,ads_budget:1000000});
    const generate='/api/retainers/'+plan.id+'/generate';
    expect((await(await request(generate,'POST',{})).json()).record.count).toBe(4);
    expect((await(await request(generate,'POST',{})).json()).record.count).toBe(0);
    const saved=await state();expect(saved.content.filter(c=>c.retainer_id===plan.id)).toHaveLength(4);expect(saved.tasks.filter(t=>t.retainer_id===plan.id)).toHaveLength(4);
    expect(saved.tasks.filter(t=>t.retainer_id===plan.id).every(t=>t.client_id===client.id&&t.content_id&&t.origin==='GROW')).toBe(true);
    const path='/api/retainers/'+plan.id+'/invoice';
    const first=(await(await request(path,'POST',{})).json()).record,second=(await(await request(path,'POST',{})).json()).record;
    expect(second.id).toBe(first.id);expect(first.amount).toBe(3500000);
    expect((await request('/api/retainers/'+plan.id,'PATCH',{business_id:'qfs'})).status).toBe(400);
    const other=await create('clients',{name:'Other client',business_id:'artbit',status:'Active'});
    expect((await request('/api/campaigns','POST',{title:'Mismatch',business_id:'artbit',client_id:other.id,retainer_id:plan.id})).status).toBe(400);
    expect((await request('/api/clients/'+client.id,'PATCH',{business_id:'qfs'})).status).toBe(400);
  });
  it('requires print files, allocates real stock, protects order pricing and invoice links',async()=>{
    await signIn();
    const design=await create('designs',{title:'Test science print',business_id:'biggan',status:'Approved'});
    expect((await request('/api/designs/'+design.id,'PATCH',{status:'Print-ready'})).status).toBe(400);
    const product=await create('products',{name:'Science tee',business_id:'biggan',design_id:design.id,sku:'SCI-L-BLK',size:'L',status:'Active',price:50000});
    expect((await request('/api/products','POST',{name:'Duplicate',business_id:'biggan',sku:'sci-l-blk',size:'L'})).status).toBe(400);
    const batch=await create('batches',{title:'First print',business_id:'biggan',product_id:product.id,quantity:3,status:'Planned'});
    expect((await request('/api/batches/'+batch.id,'PATCH',{status:'Ready'})).status).toBe(400);
    expect((await request('/api/designs/'+design.id,'PATCH',{status:'Print-ready',print_url:'https://example.com/print.pdf'})).status).toBe(200);
    const order=await create('orders',{title:'Test order',business_id:'biggan',buyer:'Test buyer',phone:'01000000000',status:'New',date:'2026-10-05',shipping:10000,discount:5000});
    const item=await create('order_items',{title:'L black',business_id:'biggan',order_id:order.id,product_id:product.id,quantity:2,unit_price:50000});
    expect((await request('/api/orders/'+order.id,'PATCH',{status:'Confirmed'})).status).toBe(200);
    expect((await request('/api/orders/'+order.id,'PATCH',{status:'Packed'})).status).toBe(400);
    expect((await request('/api/batches/'+batch.id,'PATCH',{status:'Ready'})).status).toBe(200);
    expect((await request('/api/orders/'+order.id,'PATCH',{status:'Packed'})).status).toBe(200);
    expect((await request('/api/order_items/'+item.id,'PATCH',{quantity:3})).status).toBe(400);
    expect((await request('/api/batches/'+batch.id,'PATCH',{quantity:4})).status).toBe(400);
    const invoice=(await(await request('/api/orders/'+order.id+'/invoice','POST',{})).json()).record;
    expect(invoice.amount).toBe(105000);expect(invoice.order_id).toBe(order.id);
    expect((await request('/api/invoices/'+invoice.id,'PATCH',{amount:106000})).status).toBe(400);
    expect((await request('/api/orders/'+order.id,'PATCH',{shipping:0})).status).toBe(400);
    const second=await create('orders',{title:'Second order',business_id:'biggan',buyer:'Test two',phone:'01000000000',status:'New',date:'2026-10-05'});
    await create('order_items',{title:'L black',business_id:'biggan',order_id:second.id,product_id:product.id,quantity:2,unit_price:50000});
    await request('/api/orders/'+second.id,'PATCH',{status:'Confirmed'});
    expect((await request('/api/orders/'+second.id,'PATCH',{status:'Packed'})).status).toBe(400);
    const backup=await(await request('/api/backup')).json();
    expect((await request('/api/restore','POST',backup)).status).toBe(200);
    const broken=structuredClone(backup);broken.data.order_items.find(i=>i.id===item.id).unit_price++;
    expect((await request('/api/restore','POST',broken)).status).toBe(400);
    expect((await state()).orders.find(o=>o.id===order.id).invoice_id).toBe(invoice.id);
  });
  it('imports and deduplicates buyer research atomically and logs follow-ups',async()=>{
    await signIn();const raw={name:'Test buyer',website:'https://example.com/',country:'Italy',product_interest:'Denim'};
    const result=(await(await request('/api/import-leads','POST',{leads:[raw,raw]})).json()).record;expect(result).toEqual({count:1,duplicates:1});
    const lead=(await state()).leads.find(l=>l.name===raw.name);expect(lead.business_id).toBe('qfs');
    expect((await request('/api/import-leads','POST',{leads:[{name:'Valid first'},{name:'Broken',website:'javascript:alert(1)'}]})).status).toBe(400);
    expect((await state()).leads.some(l=>l.name==='Valid first')).toBe(false);
    await create('lead_activities',{title:'Find buying contact',type:'Research',business_id:'qfs',lead_id:lead.id,date:'2026-10-05',next_date:'2026-10-10',outcome:'Research in progress'});
    expect((await state()).leads.find(l=>l.id===lead.id).next_date).toBe('2026-10-10');
    expect((await request('/api/leads/'+lead.id,'PATCH',{score:101})).status).toBe(400);
  });
  it('requires video direction and final assets and generates a repeatable work checklist',async()=>{
    await signIn();const video=await create('productions',{title:'Product video',business_id:'vidzones',status:'Brief'});
    expect((await request('/api/productions/'+video.id,'PATCH',{status:'Production'})).status).toBe(400);
    expect((await request('/api/productions/'+video.id,'PATCH',{status:'Production',direction_approved:true})).status).toBe(200);
    expect((await request('/api/productions/'+video.id,'PATCH',{status:'Delivered'})).status).toBe(400);
    expect((await request('/api/productions/'+video.id,'PATCH',{status:'Delivered',final_url:'https://example.com/final'})).status).toBe(200);
    const path='/api/productions/'+video.id+'/checklist';expect((await(await request(path,'POST',{})).json()).record.count).toBe(6);expect((await(await request(path,'POST',{})).json()).record.count).toBe(0);
  });
  it('gates editorial social packs on verification and retains scoped drafts',async()=>{
    await signIn();const article=await create('articles',{title:'Race guide',business_id:'cnmotos',status:'Draft'});
    const path='/api/articles/'+article.id;
    expect((await request(path,'PATCH',{status:'Ready'})).status).toBe(400);
    expect((await request(path,'PATCH',{status:'Ready',source_verified:true,source_url:'https://example.com/rules',summary:'Verified summary'})).status).toBe(200);
    expect((await(await request(path+'/repurpose','POST',{})).json()).record.count).toBe(5);
    expect((await(await request(path+'/repurpose','POST',{})).json()).record.count).toBe(0);
    expect((await state()).content.filter(c=>c.article_id===article.id).every(c=>c.status==='Draft'&&c.business_id==='cnmotos')).toBe(true);
    expect((await request(path,'PATCH',{status:'Published'})).status).toBe(400);
  });
  it('enforces travel capacity and business links, and protects expanded backup restores',async()=>{
    await signIn();const partner=await create('travel_partners',{name:'Test guide',business_id:'ghuraghuri',type:'Guide',status:'New'});
    const trip=await create('trips',{title:'Test trip',business_id:'ghuraghuri',partner_id:partner.id,destination:'Sylhet',status:'Draft',start_date:'2026-11-01',end_date:'2026-11-03',seats:3});
    const input={title:'Request',business_id:'ghuraghuri',trip_id:trip.id,contact:'Traveler',phone:'01000000000',quantity:2,status:'Confirmed',date:'2026-10-05'};
    await create('bookings',input);expect((await request('/api/bookings','POST',input)).status).toBe(400);
    expect((await request('/api/trips/'+trip.id,'PATCH',{seats:1})).status).toBe(400);
    expect((await request('/api/bookings','POST',{...input,business_id:'biggan'})).status).toBe(400);
    const backup=await(await request('/api/backup')).json();backup.grow_version=1;
    expect((await request('/api/restore','POST',backup)).status).toBe(400);
  });
});


it('normalizes a prior workspace without changing IDs, money or existing task ownership',async()=>{
  await signIn();
  const stub=env.WORKSPACE.getByName(bindings.WORKSPACE_ID);
  await runInDurableObject(stub,(db,context)=>{
    context.storage.transactionSync(()=>{
      const client=db.one('clients','nahar');delete client.website;delete client.services;db.put('clients',client);
      db.put('tasks',{id:'prior-task',external_id:'source-1',title:'Prior task',business_id:'artbit',client_id:'',status:'Open',priority:'High',due:'',url:'',created_at:'2026-01-01T00:00:00.000Z',updated_at:'2026-01-01T00:00:00.000Z',demo:false});
      db.sql.exec("DELETE FROM meta WHERE key='personal_os'");migratePersonalOS(db);
    });
  });
  const saved=await state();expect(saved.clients.find(c=>c.id==='nahar').services).toBe('');
  const prior=saved.tasks.find(t=>t.id==='prior-task');expect(prior.origin).toBe('Imported');expect(prior.created_at).toBe('2026-01-01T00:00:00.000Z');
  expect(saved.invoices.find(i=>i.id==='i1').amount).toBe(2000000);
  expect(saved.businesses.find(b=>b.id==='artbit').website).toBe('https://artbit.studio/');
});
