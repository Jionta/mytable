'use strict';
// The server decides all permissions. These controls make those boundaries
// visible and keep the admin interface focused on the assigned businesses.
const roleNavigation=NAV.map(item=>[...item]);
configs.business_people.fields.push(select('access_level','Access role',['Assigned member','Business admin'],true));
const roleRefresh=refresh;
refresh=async function(){
 await roleRefresh();
 if(workspaceRole==='business_admin'){
  const ids=new Set(store.businesses.map(b=>b.id));
  const permitted=roleNavigation.filter(([p])=>{
   if(['settings','reports','today'].includes(p))return false;
   if(p==='media')return ['cnmotos','alabama','jubayer'].some(id=>ids.has(id));
   if(['artbit','merch','qfs','video','travel'].includes(p))return Object.entries(operationPages).some(([id,hub])=>hub===p&&ids.has(id));
   return true;
  });
  NAV.splice(0,NAV.length,...permitted);
  if(scope&&!ids.has(scope))scope='';
  if(!NAV.some(([id])=>id===page))page='home';
 }else NAV.splice(0,NAV.length,...roleNavigation);
};
const roleEditor=openEditor;
openEditor=function(entity,id='',defaults={}){
 if(workspaceRole==='business_admin'&&['people','business_people','reviews'].includes(entity)){toast('The owner manages account profiles and access roles.',true);return;}
 if(workspaceRole==='business_admin'&&!id&&entity!=='businesses')defaults={...defaults,business_id:defaults.business_id||scope||store.businesses[0]?.id||''};
 if(workspaceRole==='business_admin'&&entity==='businesses'&&!id){toast('The owner creates business workspaces.',true);return;}
 roleEditor(entity,id,defaults);
 if(workspaceRole==='business_admin'&&entity==='businesses')$('#editor [data-action="delete-record"]')?.remove();
 if(entity==='people'&&!id&&workspaceRole==='owner'){
  const body=$('#editor .dialog-body');
  body.insertAdjacentHTML('beforeend',`<fieldset class="person-access-fields"><legend>Business access</legend><p class="notice">Choose their business and permission now. Add more business memberships later.</p><div class="form-grid section-gap"><div class="form-row"><label for="person-business">Business</label><select id="person-business" name="person_business">${option('','Add a business later',scope)}${store.businesses.map(b=>option(b.id,b.name,scope)).join('')}</select></div><div class="form-row"><label for="person-access">Access role</label><select id="person-access" name="person_access">${option('Assigned member','Assigned member · own tasks only','Assigned member')}${option('Business admin','Business admin · full business access','Assigned member')}</select></div><div class="form-row wide"><label for="person-responsibility">Responsibilities / job title</label><input id="person-responsibility" name="person_responsibility" value="Collaborator" maxlength="1000"></div></div><p class="notice">Business Admin can create, edit and remove business records, assign work, manage clients, content and billing, and edit the business profile. Business creation/deletion and workspace account permissions stay with you.</p></fieldset>`);
 }
};
const roleField=formField;
formField=function(f,record,entity){
 const html=roleField(f,record,entity);
 if(workspaceRole==='business_admin'&&f.type==='business')return html.replace(/<option value=""[^>]*>.*?<\/option>/,'');
 return html;
};
const roleSaveRecord=saveRecord;
saveRecord=async function(form){
 if(form.dataset.entity!=='people'||form.dataset.id||workspaceRole!=='owner')return roleSaveRecord(form);
 const accessForm=new FormData(form);
 if(!accessForm.get('person_business')){if(accessForm.get('person_access')==='Business admin')return formError(new Error('Choose the business for this admin role.'));return roleSaveRecord(form);}
 const raw=new FormData(form),person={};
 for(const f of configs.people.fields)person[f.key]=String(raw.get(f.key)||'');
 const button=form.querySelector('button[type="submit"]');button.disabled=true;
 try{await api('people-with-access','POST',{person,membership:{business_id:raw.get('person_business'),role:String(raw.get('person_responsibility')||'Collaborator'),access_level:raw.get('person_access'),status:'Active'}});await refresh();$('#editor').close();render();toast('Person and business access saved. Create their invitation when ready.');}catch(error){formError(error);}finally{button.disabled=false;}
};
const roleConnections=connectionsPage;
connectionsPage=function(){
 if(workspaceRole==='owner')return roleConnections();
 const links=all('business_links'),members=all('business_people');
 return heading('People & links','Assign work to the people linked to your business. The owner manages accounts and access roles.',newOperation('business_links','Add business link',scope))+`<div class="connection-grid">${store.people.filter(p=>!scope||members.some(m=>m.person_id===p.id)).map(p=>`<section class="card connection-person"><h2>${esc(p.name)}</h2><p class="muted">${esc(p.email||'')}${p.phone?' · '+esc(p.phone):''}</p>${members.filter(m=>m.person_id===p.id).map(m=>`<div class="list-row"><div class="grow"><strong>${esc(bname(m.business_id))}</strong><p>${esc(m.role)} · ${esc(m.access_level||'Assigned member')} · ${esc(m.status)}</p></div>${p.status==='Active'&&m.status==='Active'?btn('Assign task','assign-person',`data-person="${esc(p.id)}" data-business="${esc(m.business_id)}"`,'secondary compact'):''}</div>`).join('')}</section>`).join('')||empty('No linked people yet','The owner can add your business collaborators.')}</div><div class="section-gap">${card('Business links',opRows('business_links',links,[['Link',l=>safeLink(l.url,l.title)],['Business',l=>esc(bname(l.business_id))],['Type',l=>esc(l.kind)]]),newOperation('business_links','Add link',scope))}</div>`;
};
const roleQuickCapture=quickCapture;
quickCapture=function(date=today()){
 const previous=scope;
 if(workspaceRole==='business_admin'&&!scope)scope=store.businesses[0]?.id||'';
 roleQuickCapture(date);
 scope=previous;
 if(workspaceRole==='business_admin')$('#quick-business option[value=""]')?.remove();
};
const roleHome=homePage;
homePage=function(){const html=roleHome();return workspaceRole==='business_admin'?html.replace('Welcome back, '+esc(store.settings.owner)+'.','Welcome back, '+esc(workspaceAccess.person?.name||'Admin')+'.').replace('My open work','Unassigned work').replace('My next actions','Unassigned business work').replace('My task board','Unassigned tasks'):html;};
const roleRender=render;
render=function(){
 roleRender();
 if(workspaceRole==='business_admin'){
  for(const el of document.querySelectorAll('[data-page="settings"],[data-action="import-tasks"],a[href="/api/backup"],[data-action="edit"][data-entity="businesses"]:not([data-id]),[data-action="edit"][data-entity="reviews"]'))el.remove();
  const pageEl=$('.page');pageEl.insertAdjacentHTML('afterbegin',`<div class="role-banner"><span>${badge('Business admin')} ${esc(store.businesses.map(b=>b.name).join(' · '))}</span><a class="btn secondary compact" href="/work">My assigned work</a></div>`);
  const avatar=$('.topbar .avatar');if(avatar){avatar.textContent=initials(workspaceAccess.person?.name||'Admin');avatar.title=workspaceAccess.person?.name||'Admin';}
  $('#task-filter option[value="personal"]')?.remove();
  for(const card of document.querySelectorAll('.page > .three-column.section-gap > .card')){const link=card.querySelector('[data-action="navigate"]');if(link&&!NAV.some(([id])=>id===link.dataset.page))card.remove();}
  for(const control of document.querySelectorAll('[data-action="navigate"]'))if(!NAV.some(([id])=>id===control.dataset.page))control.remove();
  const personSelect=$('#task-person option[value="owner"]');if(personSelect)personSelect.textContent='Unassigned work';
  // Public Social contains the owner's entire account. Admins use the scoped
  // GROW publishing controls instead of opening that separate owner account.
  for(const link of document.querySelectorAll('a[href^="https://social.iamjubayer.com"]'))link.remove();
 }
};
const rolePublisher=openPublisher;
openPublisher=async function(id){await rolePublisher(id);if(workspaceRole==='business_admin'){for(const link of document.querySelectorAll('#editor a[href^="https://social.iamjubayer.com"]'))link.remove();const body=$('#editor .dialog-body');body.insertAdjacentHTML('afterbegin','<p class="info">Only destinations linked to your businesses by the owner appear here. Use GROW to send and publish approved content. Ask the owner to connect another destination.</p>');}};
bootDesk();
