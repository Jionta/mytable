import {publisherFields,publisherLocked} from './publisher.js';
export const collaborationEntities=['people','business_people','business_links'];
export class AccessError extends Error {name="AccessError";status=403;}
const fail=(db,text)=>{throw new db.ValidationError(text);};
export function activeBusinesses(db,personId){
 const person=db.rows('people').find(p=>p.id===personId);
 return person?.status==='Active'?new Set(db.rows('business_people').filter(m=>m.person_id===personId&&m.status==='Active').map(m=>m.business_id)):new Set();
}
export function validateCollaboration(db,entity,out,old,restoring){
 if(entity==='people'&&out.email){
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(out.email)||out.email.length>254)fail(db,'Enter a valid collaborator email.');
  out.email=out.email.toLowerCase();
  if(!restoring&&db.rows('people').some(p=>p.id!==old?.id&&p.email===out.email))fail(db,'This email belongs to another person.');
  if(old&&out.email!==old.email&&db.sql.exec('SELECT person_id FROM member_accounts WHERE person_id=?',old.id).toArray().length)fail(db,'Keep the signed-in member email unchanged. Pause this person and create a separate profile for a new email.');
 }
 if(entity==='business_people'&&!restoring&&db.rows(entity).some(m=>m.id!==old?.id&&m.business_id===out.business_id&&m.person_id===out.person_id))fail(db,'This person is already linked to this business. Edit their existing membership.');
 if(out.assignee_id&&!restoring){
  const person=db.one('people',out.assignee_id);
  if((!old||old.assignee_id!==out.assignee_id||old.business_id!==out.business_id)&&(person.status!=='Active'||(out.business_id&&!activeBusinesses(db,out.assignee_id).has(out.business_id))))fail(db,'Add this active person to the business before assigning work.');
  if(!out.business_id)fail(db,'Collaborator assignments require a business. Personal work stays with you.');
  if('owner'in out)out.owner=person.name;
 }
 if(old?.assignee_id&&!out.assignee_id&&'owner'in out&&out.owner===old.owner)out.owner=JSON.parse(db.sql.exec("SELECT value FROM settings WHERE key='owner'").toArray()[0]?.value||'"Jubayer"');
 if(entity==='content'&&!restoring){
  for(const key of publisherFields)if(out[key]!== (old?.[key]||''))fail(db,'Publisher details are updated through the Social publishing actions.');
  if(publisherLocked.includes(old?.publisher_state)&&['title','copy','channel','business_id','client_id','status'].some(k=>out[k]!==old[k]))fail(db,'This content has been sent for publishing. Check its result in Social before changing it.');
 }
}
export function memberSnapshot(db,personId){
 const allowed=activeBusinesses(db,personId),person=db.one('people',personId);
 const tasks=db.rows('tasks').filter(t=>t.assignee_id===personId&&allowed.has(t.business_id)&&t.origin==='GROW');
 const taskIds=new Set(tasks.map(t=>t.id)),businessIds=new Set(tasks.map(t=>t.business_id)),clientIds=new Set(tasks.map(t=>t.client_id));
 const contentIds=new Set(tasks.map(t=>t.content_id)),linkIds=new Set(tasks.map(t=>t.business_link_id));
 return {person:{id:person.id,name:person.name,email:person.email},businesses:db.rows('businesses').filter(b=>allowed.has(b.id)).map(b=>({id:b.id,name:b.name,color:b.color})),clients:db.rows('clients').filter(c=>clientIds.has(c.id)).map(c=>({id:c.id,name:c.name})),tasks,task_steps:db.rows('task_steps').filter(s=>taskIds.has(s.task_id)),content:db.rows('content').filter(c=>contentIds.has(c.id)&&allowed.has(c.business_id)).map(c=>({id:c.id,title:c.title,copy:c.copy,channel:c.channel,format:c.format,asset_url:c.asset_url})),business_links:db.rows('business_links').filter(l=>linkIds.has(l.id)&&allowed.has(l.business_id)).map(l=>({id:l.id,title:l.title,url:l.url}))};
}
export function authorizeMember(db,personId,method,path,data){
 if(!data||typeof data!=='object'||Array.isArray(data))fail(db,'Send a valid task update.');
 const parts=path.split('/').filter(Boolean),entity=parts[1],id=parts[2],allowed=activeBusinesses(db,personId);
 if(!allowed.size)throw new AccessError('You have no active business access.');
 function assigned(taskId){const task=db.one('tasks',taskId);if(task.assignee_id!==personId||!allowed.has(task.business_id)||task.origin!=='GROW')throw new AccessError('This work is not assigned to you.');return task;}
 if(parts.length===3&&entity==='tasks'&&method==='PATCH'){
  assigned(id);if(Object.keys(data).some(k=>!['status','progress_note'].includes(k)))throw new AccessError('You can update task status and your progress note only.');return data;
 }
 if(entity==='task_steps'&&[2,3].includes(parts.length)){
  const old=id?db.one(entity,id):null,task=assigned(old?.task_id||data.task_id);
  if(Object.keys(data).some(k=>!['title','completed','task_id'].includes(k))|| (old&&data.task_id&&data.task_id!==old.task_id))throw new AccessError('Checklist work must stay with the assigned task.');
  if((method==='POST'&&!id)||(method==='PATCH'&&id))return {...data,business_id:task.business_id};
  if(method==='DELETE'&&id)return {};
 }
 throw new AccessError('This part of GROW is available to the owner only.');
}
export function migrateCollaboration(db){
 if(db.sql.exec("SELECT value FROM meta WHERE key='collaboration'").toArray().length)return;
 for(const entity of Object.keys(db.fields))for(const record of db.rows(entity)){
  for(const[key,type]of Object.entries(db.fields[entity]))if(record[key]===undefined)record[key]=type==='bool'?false:['money','int'].includes(type)?0:'';
  db.put(entity,record);
 }
 db.sql.exec("INSERT INTO meta(key,value) VALUES('collaboration','1')");
}
