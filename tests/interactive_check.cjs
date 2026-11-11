/* Interaction logic checks; live permissions are covered by cloud.test.js. */
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const handlers={},elements=new Map(),calls=[];
function element(){return{innerHTML:'',open:false,disabled:false,value:'',dataset:{},classList:{add(){},remove(){},toggle(){}},showModal(){this.open=true;},close(){this.open=false;},insertAdjacentHTML(_,html){this.innerHTML+=html;},querySelector(){return null;},scrollIntoView(){}};}
const document={querySelector(s){if(!elements.has(s))elements.set(s,element());return elements.get(s);},querySelectorAll(){return[];},addEventListener(type,cb){(handlers[type]||=[]).push(cb);}};
const context=vm.createContext({document,console,location:{hash:''},window:{addEventListener(){},scrollTo(){}},localStorage:{getItem(){return null;},setItem(){}},setTimeout,clearTimeout,Date,Intl,URL,Blob});
for(const file of ['app','operations','connections','interactive'])vm.runInContext(fs.readFileSync('dist/'+file+'.js','utf8').replace(/bootDesk\(\);\s*$/,'').replace(/boot\(\);\s*$/,''),context);
const schema=JSON.parse(fs.readFileSync('src/schema.json')),data={};for(const e of Object.keys(schema.fields))data[e]=[];
data.settings={owner:'Jubayer'};data.activity=[];data.businesses=[{id:'artbit',name:'Artbit Studio',color:'#123456'},{id:'qfs',name:'QFS',color:'#333333'}];data.clients=[{id:'client-a',name:'Client Alpha',business_id:'artbit'}];data.people=[{id:'designer',name:'Designer',status:'Active'},{id:'inactive',name:'Paused',status:'Paused'}];data.business_people=[{id:'member-a',business_id:'artbit',person_id:'designer',status:'Active'},{id:'member-q',business_id:'qfs',person_id:'inactive',status:'Active'}];
data.tasks=[{id:'t1',title:'Review launch',notes:'Caption brief',business_id:'artbit',client_id:'client-a',assignee_id:'designer',status:'Open',priority:'High',due:'2026-10-06',origin:'GROW',recurrence:'None'},{id:'t2',title:'Research buyer',business_id:'qfs',status:'Blocked',priority:'Low',due:'2026-10-04',origin:'GROW',recurrence:'None'},{id:'t3',title:'Personal review',business_id:'',status:'Done',priority:'Medium',due:'2026-10-06',origin:'GROW',recurrence:'None'},{id:'t4',title:'External snapshot',business_id:'artbit',status:'Open',priority:'Medium',due:'2026-10-09',origin:'Imported'}];
data.content=[{id:'c1',title:'Post plan',business_id:'artbit',date:'2026-10-07',status:'Approved'},{id:'c2',title:'Already published',business_id:'artbit',date:'2026-10-07',status:'Published'}];data.invoices=[{id:'i1',title:'Paid invoice',business_id:'artbit',due:'2026-10-07',amount:500,paid:500},{id:'i2',title:'Unpaid invoice',business_id:'artbit',due:'2026-10-07',amount:500,paid:0}];data.productions=[{id:'p1',title:'Delivered film',business_id:'artbit',due:'2026-10-07',status:'Delivered'}];context.fixture=data;context.mockCall=(...args)=>calls.push(args);
vm.runInContext(`store=fixture;serverToday='2026-10-06';scope='';api=async(path,method,payload)=>{mockCall(path,method,payload);};`,context);
const read=code=>JSON.parse(vm.runInContext(`JSON.stringify(${code})`,context));
assert.deepEqual(read('visibleTasks().map(t=>t.id)'),['t1','t3','t4','t2']);
vm.runInContext(`taskPerson='designer';`,context);assert.deepEqual(read('visibleTasks().map(t=>t.id)'),['t1']);
vm.runInContext(`taskPerson='owner';taskFilter='open';`,context);assert.deepEqual(read('visibleTasks().map(t=>t.id)'),['t4','t2']);
vm.runInContext(`taskPerson='';taskFilter='today';`,context);assert.deepEqual(read('visibleTasks().map(t=>t.id)'),['t1','t2']);
vm.runInContext(`taskFilter='all';taskQuery='caption';`,context);assert.deepEqual(read('visibleTasks().map(t=>t.id)'),['t1']);
vm.runInContext(`taskQuery='';scope='artbit';`,context);assert.deepEqual(read('visibleTasks().map(t=>t.id)'),['t1','t4']);
assert.deepEqual(read('agendaItems().map(a=>a.id)'),['t1','c1','i2','t4']);
assert.equal(vm.runInContext("dialNumber('+৮৮০ (১৭) ১২৩৪-৫৬৭৮')",context),'+8801712345678');
assert.equal(vm.runInContext("dialNumber('javascript:alert(123456789)')",context),'');
vm.runInContext(`
  store.clients[0].phone='+880 (17) 1234-5678';
  store.invoices.push({id:'wallet-i',title:'Client invoice',business_id:'artbit',client_id:'client-a',date:'2026-10-01',due:'2026-10-04',amount:10000,paid:3500});
  store.invoices.push({id:'foreign-i',title:'Other business',business_id:'qfs',client_id:'client-a',date:'2026-10-01',due:'2026-10-04',amount:400000,paid:0});
  store.transactions.push({id:'wallet-t',title:'Received',kind:'Income',business_id:'artbit',client_id:'client-a',invoice_id:'wallet-i',date:'2026-10-05',amount:3500});
`,context);
assert.deepEqual(read("visibleDirectoryClients(all('clients'),'১৭ ১২৩৪').map(c=>c.id)"),['client-a']);
assert.deepEqual(read("(({billed,paid,outstanding,overdue,payments})=>({billed,paid,outstanding,overdue,payments:payments.length}))(clientBilling(store.clients[0]))"),{billed:10000,paid:3500,outstanding:6500,overdue:6500,payments:1});
vm.runInContext("openClientWallet('client-a')",context);
assert.match(elements.get('#editor').innerHTML,/Payment history · 1/);
assert.doesNotMatch(elements.get('#editor').innerHTML,/Other business/);
vm.runInContext(`
  store.leads.push(
    {id:'artbit-lead',name:'Studio prospect',business_id:'artbit',stage:'Qualified',phone:'+1 (202) 555-0120'},
    {id:'qfs-lead',name:'Sourcing prospect',business_id:'qfs',stage:'Lead',phone:'+1 (202) 555-0130'}
  );
  clientDirectoryView='leads';scope='';
`,context);
assert.deepEqual(read("visibleDirectoryLeads(all('leads'),'555-0130').map(l=>l.id)"),['qfs-lead']);
assert.deepEqual(read("visibleDirectoryLeads(all('leads'),'','Qualified').map(l=>l.id)"),['artbit-lead']);
assert.match(vm.runInContext('clientsPage()',context),/Sourcing prospect/);
vm.runInContext("scope='artbit'",context);
assert.doesNotMatch(vm.runInContext('clientsPage()',context),/Sourcing prospect/);
vm.runInContext("clientDirectoryView='clients';scope='artbit'",context);
vm.runInContext(`selectedTasks.add('t2');selectedTasks.add('t1');tasksPage();`,context);assert.deepEqual(read('[...selectedTasks]'),['t1']);
elements.get('#quick-business')||document.querySelector('#quick-business');elements.get('#quick-business').value='artbit';vm.runInContext('updateQuickRefs()',context);assert(elements.get('#quick-person').innerHTML.includes('designer'));assert(!elements.get('#quick-person').innerHTML.includes('inactive'));
elements.get('#quick-business').value='qfs';vm.runInContext('updateQuickRefs()',context);assert(!elements.get('#quick-person').innerHTML.includes('designer'));assert(!elements.get('#quick-person').innerHTML.includes('inactive'));assert(!elements.get('#quick-client').innerHTML.includes('client-a'));
vm.runInContext(`store.tasks[0].title='<img src=x onerror=bad()> ';`,context);assert(vm.runInContext('taskCard(store.tasks[0])',context).includes('&lt;img'));assert(!vm.runInContext('taskCard(store.tasks[0])',context).includes('<img'));
(async()=>{await vm.runInContext(`moveTask('t1','In progress')`,context);assert.equal(calls.length,1);assert.equal(calls[0][0],'tasks/t1');assert.equal(calls[0][2].status,'In progress');await assert.rejects(vm.runInContext(`moveTask('t4','Done')`,context),/Imported/);await assert.rejects(vm.runInContext(`moveTask('t1','Invalid')`,context),/valid/);await vm.runInContext(`moveTask('t1','Open')`,context);assert.equal(calls.length,1);console.log('PASS: task scope/person/client search, due and priority ordering, completed agenda exclusions, visible bulk selection, active-business assignment options, safe rendering, native status writes and imported/no-op guards.');})().catch(error=>{console.error(error);process.exitCode=1;});
