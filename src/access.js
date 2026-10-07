import {AccessError,activeBusinesses,authorizeMember} from './collaboration.js';

export const ASSIGNED_MEMBER='Assigned member';
export const BUSINESS_ADMIN='Business admin';
const deny=message=>{throw new AccessError(message);};

export function adminBusinesses(db,personId){
 const active=activeBusinesses(db,personId);
 return new Set(db.rows('business_people').filter(m=>m.person_id===personId&&m.access_level===BUSINESS_ADMIN&&active.has(m.business_id)&&m.status==='Active').map(m=>m.business_id));
}
export function accessContext(db,personId){
 if(!personId)return {role:'owner',business_ids:db.rows('businesses').map(b=>b.id)};
 const person=db.rows('people').find(p=>p.id===personId),businessIds=[...adminBusinesses(db,personId)];
 return {role:businessIds.length?'business_admin':'collaborator',business_ids:businessIds,person:{id:personId,name:person?.name||'',email:person?.email||''}};
}
function scopedRecord(db,entity,id,allowed){
 const record=db.rows(entity).find(r=>r.id===id);
 if(!record||!allowed.has(entity==='businesses'?record.id:record.business_id))deny('You can manage records in your assigned admin businesses only.');
 return record;
}
export function publisherAccountIds(db,personId){
 const allowed=adminBusinesses(db,personId),ids=new Set();
 for(const b of db.rows('businesses'))if(allowed.has(b.id)&&b.publisher_account_id)ids.add(b.publisher_account_id);
 for(const c of db.rows('clients'))if(allowed.has(c.business_id)&&c.publisher_account_id)ids.add(c.publisher_account_id);
 for(const c of db.rows('content'))if(allowed.has(c.business_id))for(const id of JSON.parse(c.publisher_account_ids||'[]'))ids.add(id);
 return [...ids];
}
export function authorizePublisher(db,personId,id,accountIds){
 if(!personId)return;
 const content=scopedRecord(db,'content',id,adminBusinesses(db,personId));
 const permitted=new Set(publisherAccountIds(db,personId)),ids=accountIds??JSON.parse(content.publisher_account_ids||'[]');
 if(!Array.isArray(ids)||ids.some(id=>!permitted.has(id)))deny('The owner must link this Social destination to your business first.');
}
export function adminSnapshot(db,personId){
 const allowed=adminBusinesses(db,personId);
 if(!allowed.size)deny('Your business admin access is no longer active.');
 const data=Object.fromEntries(Object.keys(db.fields).map(entity=>[entity,db.rows(entity).filter(r=>entity==='businesses'?allowed.has(r.id):allowed.has(r.business_id))]));
 // People are shared accounts. Return only business-visible contact details,
 // without their private owner notes or memberships in other businesses.
 const peopleIds=new Set(data.business_people.map(m=>m.person_id));
 data.people=db.rows('people').filter(p=>peopleIds.has(p.id)).map(p=>({id:p.id,name:p.name,email:p.email,phone:p.phone,status:p.status,profile_url:p.profile_url}));
 data.business_people=data.business_people.map(({notes,...membership})=>membership);
 const settings=Object.fromEntries(db.sql.exec('SELECT key,value FROM settings').toArray().map(r=>[r.key,JSON.parse(r.value)]));
 data.settings={owner:settings.owner||'Jubayer',workspace_name:settings.workspace_name||'GROW',currency:'BDT',review_days:settings.review_days||'Sunday and Thursday',task_manager_url:''};
 data.activity=db.sql.exec('SELECT * FROM activity ORDER BY at DESC LIMIT 60').toArray().filter(a=>(data[a.entity]||[]).some(r=>r.id===a.record_id)&&!['people','business_people'].includes(a.entity));
 return data;
}
export function authorizeAccess(db,personId,method,path,data){
 const allowed=adminBusinesses(db,personId);
 if(!allowed.size)return authorizeMember(db,personId,method,path,data);
 if(!data||typeof data!=='object'||Array.isArray(data))throw new db.ValidationError('Send a valid record update.');
 const parts=path.split('/').filter(Boolean),entity=parts[1],id=parts[2];
 if(parts[0]!=='api')deny('This action is unavailable.');
 if(path==='/api/import-leads'&&method==='POST'){
  if(!Array.isArray(data.leads))throw new db.ValidationError('Choose a leads array.');
  for(const lead of data.leads)if(!allowed.has(lead?.business_id||'qfs'))deny('Import leads into your assigned admin businesses only.');
  return data;
 }
 if(!db.fields[entity]||['people','business_people','reviews'].includes(entity))deny('Workspace accounts, access roles, backups and settings are managed by the owner.');
 // A hybrid account can still update its own assigned tasks in another
 // business, using exactly the limited collaborator permissions.
 const old=id?db.rows(entity).find(r=>r.id===id):null;
 if(old&&!allowed.has(entity==='businesses'?old.id:old.business_id)&&(entity==='tasks'||entity==='task_steps'))return authorizeMember(db,personId,method,path,data);
 if(entity==='businesses'&&method!=='PATCH')deny('Only the owner can create or delete a business.');
 if(id)scopedRecord(db,entity,id,allowed);
 if(parts.length===4){
  const operations={retainers:['generate','invoice'],orders:['invoice'],articles:['repurpose'],productions:['checklist'],invoices:['payment']};
  if(method!=='POST'||!operations[entity]?.includes(parts[3]))deny('This business action is unavailable.');
  return data;
 }
 if(![2,3].includes(parts.length))deny('This business action is unavailable.');
 if(entity==='businesses'){
  if(Object.hasOwn(data,'publisher_account_id')&&data.publisher_account_id&&!publisherAccountIds(db,personId).includes(data.publisher_account_id))deny('The owner must link this Social destination first.');
  return data;
 }
 const targetBusiness=data.business_id??old?.business_id??(entity==='task_steps'?(db.rows('tasks').find(t=>t.id===data.task_id)?.business_id):undefined);
 if(!allowed.has(targetBusiness))deny('Keep this record inside your assigned admin business.');
 if(Object.keys(data).some(key=>!Object.hasOwn(db.fields[entity],key)))deny('Use the editable fields for this business record.');
 // Check references before validation so guessed foreign IDs do not reveal
 // whether a record exists, and shared records cannot cross the boundary.
 for(const[key,type]of Object.entries(db.fields[entity])){
  if(!type.startsWith('ref:')||!data[key]||key==='business_id')continue;
  const linkedEntity=type.slice(4).replace(/\?$/,''),linked=db.rows(linkedEntity).find(r=>r.id===data[key]);
  if(linkedEntity==='people'){
   if(!linked||!db.rows('business_people').some(m=>m.person_id===linked.id&&m.business_id===targetBusiness))deny('Assign a person who belongs to this business.');
  }else if(!linked||linked.business_id!==targetBusiness)deny('Link records from this business only.');
 }
 if(Object.hasOwn(data,'publisher_account_id')&&data.publisher_account_id&&!publisherAccountIds(db,personId).includes(data.publisher_account_id))deny('The owner must link this Social destination first.');
 return entity==='task_steps'?{...data,business_id:targetBusiness}:data;
}
export function migrateAccessRoles(db){
 if(db.sql.exec("SELECT value FROM meta WHERE key='access_roles'").toArray().length)return;
 for(const membership of db.rows('business_people')){membership.access_level=ASSIGNED_MEMBER;db.put('business_people',membership);}
 db.sql.exec("INSERT INTO meta(key,value) VALUES('access_roles','1')");
}
