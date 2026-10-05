export const newEntities = ['retainers','campaigns','client_reports','designs','products','batches','orders','order_items','website_work','lead_activities','task_steps','productions','articles','travel_partners','trips','bookings'];
export const businessProfiles = {
  artbit: { kind: 'Social media agency', website: 'https://artbit.studio/', focus: 'Strategy, content production, social media management and campaigns for multiple client accounts.', channels: 'Facebook, Instagram, LinkedIn', target: 'Brands needing a managed creative and digital team', pillars: 'Client strategy, Graphic content, Reels, Premium video, Campaigns, Community, Reporting', goal: 'Deliver each client’s agreed monthly work, maintain approvals and collect retainers.' },
  qfs: { kind: 'Sourcing & lead development', website: 'https://quality1stservice.com/', focus: 'Build a verified buyer pipeline through company research, contact collection, qualification and follow-up.', channels: 'LinkedIn, Email, Website', target: 'Garment buyers, importers and sourcing decision makers', pillars: 'Buyer research, Verified contacts, Product fit, Follow-ups, Sourcing opportunities', goal: 'Collect qualified leads with a source, clear next action and follow-up date.' },
  biggan: { kind: 'Merchandise partnership', focus: 'Jubayer’s responsibilities: T-shirt designs, printing, order collection, fulfillment and website management.', channels: 'Facebook, Instagram, Website', target: 'Biggan PiC community and science-inspired merchandise buyers', pillars: 'Design handoff, Print-ready files, SKU variants, Production, Orders, Website updates', goal: 'Move each design through printing and each customer order through delivery.' },
  vidzones: { kind: 'Video production studio', website: 'https://vidzones.com/', focus: 'Manage video briefs, scripts, production assets, revisions and final delivery.', channels: 'Instagram, LinkedIn, YouTube Shorts', target: 'Brands, agencies and businesses commissioning video', pillars: 'Creative briefs, Scripts, Production, Editing, Revisions, Delivery', goal: 'Complete client video work and turn delivered projects into portfolio content.' },
  cnmotos: { kind: 'Motorsport editorial', website: 'https://www.cnmotos.com/', focus: 'Motorsport guides, news and event coverage with source verification and social repurposing.', channels: 'Website, Facebook, X, Instagram', target: 'Motorsport readers across racing disciplines', pillars: 'Formula 1, MotoGP, WRC, NASCAR, Racing guides, Event coverage', goal: 'Maintain a verified editorial pipeline and repurpose approved stories for social channels.' },
  alabama: { kind: 'Football editorial', website: 'https://alabamafootball.org/', focus: 'Independent Alabama football reporting, analysis, recruiting and historical coverage.', channels: 'Website, Facebook, X, Instagram', target: 'Crimson Tide, Auburn and Alabama football followers', pillars: 'Crimson Tide, Auburn, SEC, Recruiting, High school, NFL alumni, History', goal: 'Prepare sourced coverage and keep website and social publishing work organized.' },
  ghuraghuri: { kind: 'Travel marketplace', website: 'https://ghuraghuribd.com/', focus: 'A Bangladesh travel marketplace connecting travelers with agencies and guides through trip listings and booking requests.', target: 'Travelers, travel agencies and tour guides in Bangladesh', pillars: 'Partner onboarding, Trip listings, Itineraries, Booking requests, Guide communication', goal: 'Keep trip listings current and move each traveler request to the right partner.' },
};
export const packages = {
  Build: { fee: 3500000, graphics: 10, reels: 4, premium: 1 },
  Scale: { fee: 9900000, graphics: 20, reels: 8, premium: 4 },
  Partner: { fee: 19900000, graphics: 20, reels: 8, premium: 4 },
};
const orderTransitions = { New:['Confirmed','Cancelled'], Confirmed:['Printing','Packed','Cancelled'], Printing:['Packed','Cancelled'], Packed:['Shipped','Confirmed','Cancelled'], Shipped:['Delivered','Returned'], Delivered:['Returned'], Returned:[], Cancelled:['New'] };
const stockStatuses = new Set(['Packed','Shipped','Delivered','Returned']);
const lockedOrders = new Set(['Packed','Shipped','Delivered','Returned']);
const fail = (db, message) => { throw new db.ValidationError(message); };
export function orderTotal(db, order) {
  return db.rows('order_items').filter(item => item.order_id === order.id).reduce((sum,item)=>sum+item.quantity*item.unit_price,0) + order.shipping - order.discount;
}
export function stock(db, productId, excludingOrder = '') {
  const produced = db.rows('batches').filter(batch => batch.product_id === productId && batch.status === 'Ready').reduce((sum,batch)=>sum+batch.quantity,0);
  const orders = new Set(db.rows('orders').filter(order => order.id !== excludingOrder && stockStatuses.has(order.status)).map(order=>order.id));
  const used = db.rows('order_items').filter(item => item.product_id === productId && orders.has(item.order_id)).reduce((sum,item)=>sum+item.quantity,0);
  return produced - used;
}
export function validateOperations(db, entity, out, old, restoring) {
  if (entity === 'tasks') {
    if (!restoring && out.origin !== 'GROW') fail(db,'Imported task snapshots cannot be edited here. Create a GROW task instead.');
    if (!restoring && out.external_id) fail(db,'Use task import for external tasks.');
    out.completed_at = out.status === 'Done' ? (out.completed_at || old?.completed_at || new Date().toISOString()) : '';
    if (!restoring && old?.status !== 'Done' && out.status === 'Done' && db.rows('task_steps').some(step=>step.task_id===old?.id&&!step.completed)) fail(db,'Complete the checklist before finishing this task.');
  }
  if (['retainers','campaigns','client_reports'].includes(entity) && out.business_id !== 'artbit') fail(db,'Artbit client operations must belong to Artbit Studio.');
  if (entity === 'retainers' && out.graphics + out.reels + out.premium > 100) fail(db,'A monthly plan supports up to 100 content deliverables.');
  if (entity === 'leads' && out.score > 100) fail(db,'Lead fit score must be between 0 and 100.');
  if (entity === 'trips' && out.end_date < out.start_date) fail(db,'Trip end date cannot precede its start date.');
  if (entity === 'bookings' && out.quantity < 1) fail(db,'A booking request needs at least one traveler.');
  if (entity === 'campaigns' && out.start_date && out.end_date && out.end_date < out.start_date) fail(db,'Campaign end date cannot precede its start date.');
  if (['batches','order_items'].includes(entity) && (out.quantity < 1 || out.quantity > 100000)) fail(db,'Quantity must be between 1 and 100,000.');
  if (entity === 'order_items' && !Number.isSafeInteger(out.quantity*out.unit_price)) fail(db,'Order line total is too large.');
  if (entity === 'products' && !restoring && db.rows('products').some(product=>product.id!==old?.id && product.business_id===out.business_id && product.sku.toLowerCase()===out.sku.toLowerCase())) fail(db,'This SKU already exists in this business.');
  if (restoring) return;
  for (const [key,type] of Object.entries(db.fields[entity])) {
    if (!type.startsWith('ref:') || !out[key] || ['business_id','client_id'].includes(key)) continue;
    const target = type.slice(4).replace(/\?$/,'');
    const linked = db.one(target,out[key]);
    if ('business_id' in linked && linked.business_id !== out.business_id) fail(db,'The linked '+target.replaceAll('_',' ')+' record belongs to another business.');
    if (linked.client_id && out.client_id && linked.client_id !== out.client_id) fail(db,'The linked record belongs to another client.');
    if (key === 'design_id' && out.status === 'Active' && !['Approved','Print-ready'].includes(linked.status)) fail(db,'Approve the design before activating its product.');
  }
  if (entity === 'batches') {
    const product = db.one('products',out.product_id);
    if (product.design_id && ['Printing','Quality check','Ready'].includes(out.status) && db.one('designs',product.design_id).status !== 'Print-ready') fail(db,'Set the design to Print-ready before printing.');
    if (old?.status === 'Ready' && ['business_id','product_id','quantity','status'].some(key=>old[key]!==out[key])) fail(db,'Received stock is retained. Create a separate batch for additional production.');
  }
  if (entity === 'designs' && out.status === 'Print-ready' && !out.print_url) fail(db,'Add the final print file URL before marking a design Print-ready.');
  if (entity === 'order_items') {
    const order = db.one('orders',out.order_id);
    if (order.invoice_id || lockedOrders.has(order.status)) fail(db,'Order items are protected after invoicing or packing.');
    if (old) { const previous=db.one('orders',old.order_id); if(previous.invoice_id||lockedOrders.has(previous.status)) fail(db,'An invoiced or packed order line cannot be moved.'); }
  }
  if (entity === 'task_steps') {
    if (db.one('tasks',out.task_id).origin === 'Imported') fail(db,'Imported task snapshots cannot have an editable checklist.');
    if (out.completed === false && db.one('tasks',out.task_id).status === 'Done') fail(db,'Reopen the task before adding unfinished checklist work.');
  }
  if (entity === 'invoices') {
    if (old && ['order_id','retainer_id'].some(key=>old[key]!==out[key])) fail(db,'Invoice associations are retained.');
    if (out.order_id) {
      const order=db.one('orders',out.order_id);
      if (order.invoice_id && order.invoice_id!==old?.id) fail(db,'This order already has an invoice.');
      if (['New','Cancelled','Returned'].includes(order.status)) fail(db,'Confirm the order before invoicing.');
      if (out.amount!==orderTotal(db,order)) fail(db,'Order invoice amount must match its items, shipping and discount.');
    }
    if (out.retainer_id && db.rows('invoices').some(item=>item.id!==old?.id&&item.retainer_id===out.retainer_id)) fail(db,'This monthly plan already has an invoice.');
  }
  if (entity === 'orders') {
    if (out.invoice_id !== (old?.invoice_id || '')) fail(db,'Create the order invoice with the invoice action.');
    if (old?.invoice_id && ['business_id','buyer','shipping','discount'].some(key=>out[key]!==old[key])) fail(db,'Invoiced order pricing and buyer details are protected.');
    if (!old && out.status !== 'New') fail(db,'Collect a new order before moving it through fulfillment.');
    if (old && old.status !== out.status && !orderTransitions[old.status].includes(out.status)) fail(db,'This order status change is not allowed.');
    if (old && old.status !== out.status && ['Confirmed','Printing','Packed','Shipped','Delivered'].includes(out.status)) {
      const items = db.rows('order_items').filter(item=>item.order_id===old.id);
      if (!items.length) fail(db,'Add at least one product to this order first.');
      if (out.status === 'Packed') {
        const needed = new Map();
        for (const item of items) needed.set(item.product_id,(needed.get(item.product_id)||0)+item.quantity);
        for (const [id,quantity] of needed) if (quantity > stock(db,id,old.id)) fail(db,'Not enough received stock to pack this order. Finish its production batch first.');
      }
    }
  }
  if (entity === 'productions' && ['Production','Review','Revision','Delivered'].includes(out.status) && !out.direction_approved) fail(db,'Approve the creative direction before production starts.');
  if (entity === 'productions' && out.status === 'Delivered' && !out.final_url) fail(db,'Add the final delivery URL before marking a video Delivered.');
  if (entity === 'articles' && ['Ready','Published'].includes(out.status) && (!out.source_verified || !out.source_url || !out.summary)) fail(db,'Add a source and summary, then verify the source before approving this story.');
  if (entity === 'articles' && out.status === 'Published' && !out.published_url) fail(db,'Add the published article URL before confirming publication.');
  if (entity === 'bookings' && out.status === 'Confirmed') {
    const trip=db.one('trips',out.trip_id);
    const booked=db.rows('bookings').filter(item=>item.id!==old?.id&&item.trip_id===trip.id&&item.status==='Confirmed').reduce((sum,item)=>sum+item.quantity,0);
    if(trip.seats && booked+out.quantity>trip.seats)fail(db,'This request exceeds the trip’s remaining capacity.');
  }
  if (entity === 'trips' && out.seats && db.rows('bookings').filter(item=>item.trip_id===old?.id&&item.status==='Confirmed').reduce((sum,item)=>sum+item.quantity,0)>out.seats)fail(db,'Trip capacity cannot be below already confirmed travelers.');
}
export function deleteOperations(db, entity, old) {
  if (entity === 'batches' && old.status === 'Ready') fail(db,'Received production batches are retained to protect stock records.');
  if (entity === 'orders' && (old.invoice_id || lockedOrders.has(old.status))) fail(db,'Invoiced or fulfilled orders are retained.');
  if (entity === 'order_items') {
    const order = db.one('orders',old.order_id);
    if (order.invoice_id || lockedOrders.has(order.status)) fail(db,'Order items are protected after invoicing or packing.');
  }
  if (entity === 'tasks' && old.origin === 'Imported') fail(db,'Imported task snapshots are retained. Update them through import.');
  if (entity === 'tasks') for (const step of db.rows('task_steps').filter(step=>step.task_id===old.id)) db.sql.exec('DELETE FROM records WHERE entity=? AND id=?','task_steps',step.id);
}
export function afterSave(db, entity, record, old) {
  if (entity === 'invoices' && record.order_id) { const order=db.one('orders',record.order_id); order.invoice_id=record.id; db.put('orders',order); }
  if (entity === 'lead_activities' && record.next_date) {
    const lead = db.one('leads',record.lead_id); lead.next_date = record.next_date; lead.updated_at = new Date().toISOString(); db.put('leads',lead);
  }
  if (entity === 'tasks' && record.status === 'Done' && old?.status !== 'Done' && record.recurrence !== 'None') {
    const base = record.due && record.due >= db.today() ? record.due : db.today();
    const date = new Date(base+'T12:00:00Z');
    if (record.recurrence === 'Monthly') {
      const day = date.getUTCDate(); date.setUTCDate(1); date.setUTCMonth(date.getUTCMonth()+1);
      date.setUTCDate(Math.min(day,new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth()+1,0)).getUTCDate()));
    } else date.setUTCDate(date.getUTCDate()+(record.recurrence==='Daily'?1:7));
    const nextDue=date.toISOString().slice(0,10);
    if(db.rows('tasks').some(task=>task.repeat_of===record.id&&task.due===nextDue))return;
    const next = db.validate('tasks',{...record,status:'Open',due:nextDue,completed_at:'',repeat_of:record.id}); db.put('tasks',next);
    for (const step of db.rows('task_steps').filter(step=>step.task_id===record.id)) db.put('task_steps',db.validate('task_steps',{...step,task_id:next.id,completed:false}));
    db.audit('Repeated','tasks',next.id,next.title);
  }
}
export function migratePersonalOS(db) {
  if (db.sql.exec("SELECT value FROM meta WHERE key='personal_os'").toArray().length) return;
  for (const entity of Object.keys(db.fields)) for (const old of db.rows(entity)) {
    const input = {...old};
    if (entity === 'tasks') input.origin = old.external_id ? 'Imported' : 'GROW';
    const normalized = db.validate(entity,input,null,true);
    Object.assign(normalized,{id:old.id,created_at:old.created_at,updated_at:old.updated_at,demo:old.demo});
    if (old.invoice_id) normalized.invoice_id=old.invoice_id;
    db.put(entity,normalized);
  }
  for (const [id,profile] of Object.entries(businessProfiles)) {
    const old = db.rows('businesses').find(item=>item.id===id);
    if (old) db.put('businesses',{...old,...profile});
  }
  db.sql.exec("INSERT INTO meta(key,value) VALUES('personal_os','2')");
}
export function operationsMutation(db, method, path, data) {
  const parts = path.split('/').filter(Boolean);
  if (method !== 'POST') return null;
  if (parts.length === 4 && parts[1] === 'retainers') {
    const retainer = db.one('retainers',parts[2]);
    if (retainer.status !== 'Active') fail(db,'Activate this monthly retainer first.');
    if (parts[3] === 'generate') {
      const client = db.one('clients',retainer.client_id);
      const existing = db.rows('content').filter(item=>item.retainer_id===retainer.id);
      let count = 0;
      for (const [kind,target,format] of [['Graphic',retainer.graphics,'Post'],['Regular reel',retainer.reels,'Reel'],['Premium video',retainer.premium,'Video']]) {
        const current = existing.filter(item=>item.delivery_kind===kind).length;
        for (let i=current;i<target;i++) {
          const content = db.validate('content',{title:`${client.name} · ${retainer.month} · ${kind} ${i+1}`,business_id:'artbit',client_id:client.id,retainer_id:retainer.id,delivery_kind:kind,channel:'Facebook',format,status:'Draft',owner:'Jubayer',notes:'Monthly production slot. Add the creative brief, copy and asset before review.'});
          db.put('content',content);
          const task=db.validate('tasks',{title:'Produce '+content.title,business_id:'artbit',client_id:client.id,content_id:content.id,retainer_id:retainer.id,status:'Open',priority:'Medium',category:'Production',owner:'Jubayer',notes:retainer.objective}); db.put('tasks',task); count++;
        }
      }
      db.audit('Generated plan','retainers',retainer.id,`${count} content slots and tasks`); return {count};
    }
    if (parts[3] === 'invoice') {
      const existing = db.rows('invoices').find(invoice=>invoice.retainer_id===retainer.id);
      if (existing) return existing;
      const date=db.today(), due=data.due||date;
      const invoice=db.validate('invoices',{title:retainer.title+' · service fee',business_id:'artbit',client_id:retainer.client_id,retainer_id:retainer.id,amount:retainer.fee,date,due,notes:'Service fee only. Advertising budget is managed separately.'}); db.put('invoices',invoice); db.audit('Created invoice','retainers',retainer.id,invoice.title); return invoice;
    }
  }
  if (parts.length===4 && parts[1]==='orders' && parts[3]==='invoice') {
    const order=db.one('orders',parts[2]);
    if(order.invoice_id)return db.one('invoices',order.invoice_id);
    if(['New','Cancelled','Returned'].includes(order.status))fail(db,'Confirm the order before creating its invoice.');
    const amount=orderTotal(db,order);
    if(!Number.isSafeInteger(amount)||amount<=0)fail(db,'Add valid products and pricing before invoicing.');
    const invoice=db.validate('invoices',{title:order.title+' · '+order.buyer,business_id:order.business_id,order_id:order.id,amount,date:db.today(),due:data.due||db.today(),notes:'Merchandise order invoice, including shipping and discount.'});
    db.put('invoices',invoice);order.invoice_id=invoice.id;db.put('orders',order);db.audit('Created invoice','orders',order.id,invoice.title);return invoice;
  }
  if(path==='/api/import-leads'){
    if(!Array.isArray(data.leads)||data.leads.length>1000)fail(db,'Choose up to 1,000 leads in a leads array.');
    let count=0,duplicates=0;
    const identity=lead=>[lead.business_id,lead.email.trim().toLowerCase()|| (lead.website?new URL(lead.website).hostname.replace(/^www\./,''):lead.name.trim().toLowerCase())].join('|');
    const seen=new Set(db.rows('leads').map(identity));
    for(const raw of data.leads){
      const record=db.validate('leads',{business_id:'qfs',stage:'Lead',...raw});
      if(seen.has(identity(record))){duplicates++;continue;}
      seen.add(identity(record));db.put('leads',record);count++;
    }
    db.audit('Imported','leads','',`${count} leads; ${duplicates} duplicates skipped`);return {count,duplicates};
  }
  if(parts.length===4 && parts[1]==='articles' && parts[3]==='repurpose') {
    const article=db.one('articles',parts[2]);
    if(!['Ready','Published'].includes(article.status)||!article.source_verified||!article.source_url||!article.summary)fail(db,'Approve a sourced story before creating its social pack.');
    const existing=new Set(db.rows('content').filter(item=>item.article_id===article.id).map(item=>item.channel));
    let count=0;
    for(const channel of ['Facebook','X','Instagram','LinkedIn','Website']){
      if(existing.has(channel))continue;
      const content=db.validate('content',{title:article.title+' · '+channel,business_id:article.business_id,article_id:article.id,channel,format:channel==='Instagram'?'Carousel':'Post',status:'Draft',copy:article.title+'\n\n'+article.summary+'\n\nRead more: '+(article.published_url||article.source_url),notes:'Source-based draft. Review platform length, factual claims and visual before publishing.'});db.put('content',content);count++;
    }
    db.audit('Created social pack','articles',article.id,count+' drafts');return {count};
  }
  if(parts.length===4 && parts[1]==='productions' && parts[3]==='checklist') {
    const production=db.one('productions',parts[2]);
    const existing=new Set(db.rows('tasks').filter(task=>task.production_id===production.id).map(task=>task.title));
    let count=0;
    for(const step of ['Confirm brief and assets','Approve concept, script and storyboard','Produce first cut','Review brand consistency and usage rights','Complete revisions','Export and deliver agreed formats']){
      const title=production.title+' · '+step;
      if(existing.has(title))continue;
      const task=db.validate('tasks',{title,business_id:production.business_id,client_id:production.client_id,project_id:production.project_id,production_id:production.id,status:'Open',category:'Production',priority:'Medium',owner:'Jubayer',due:production.due});db.put('tasks',task);count++;
    }
    db.audit('Created checklist','productions',production.id,count+' tasks');return {count};
  }
  return null;
}
