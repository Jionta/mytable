/* Browser-independent template checks. No claim of visual/browser QA. */
const fs=require('fs'),vm=require('vm'),assert=require('assert');
const elements=new Map();
function element(){return {innerHTML:'',textContent:'',className:'',classList:{remove(){},add(){},toggle(){}},open:false,showModal(){this.open=true;},close(){this.open=false;},querySelector(){return {disabled:false}},scrollIntoView(){},select(){}};}
const document={querySelector(s){if(!elements.has(s))elements.set(s,element());return elements.get(s);},addEventListener(){},modelContext:undefined};
let source=fs.readFileSync('dist/app.js','utf8').replace(/boot\(\);\s*$/,'');
const state=process.argv[2]?JSON.parse(fs.readFileSync(process.argv[2],'utf8')):{data:JSON.parse(fs.readFileSync('src/seed-template.json','utf8')),today:'2026-10-05',csrf:'test'};
const schema=JSON.parse(fs.readFileSync('src/schema.json','utf8'));
for(const [entity,fields]of Object.entries(schema.fields)){
 state.data[entity]||=[];
 for(const record of state.data[entity])for(const [key,type]of Object.entries(fields))if(record[key]===undefined)record[key]=type==='bool'?false:['money','int'].includes(type)?0:type.startsWith('enum:')?type.slice(5).split(',')[0]:'';
}
state.data.settings||={owner:'Jubayer',workspace_name:'GROW'};state.data.activity||=[];
const context=vm.createContext({document,console,window:{addEventListener(){},scrollTo(){}},location:{hash:''},setTimeout,clearTimeout,URL,Blob,Intl,Date});
vm.runInContext(source,context);
vm.runInContext(fs.readFileSync('dist/operations.js','utf8').replace(/boot\(\);\s*$/,''),context);
context.seedState=state;
vm.runInContext('store=seedState.data; serverToday=seedState.today; csrf=seedState.csrf;',context);
const pages=['artbit','merch','qfs','video','media','travel','home','today','businesses','clients','projects','tasks','marketing','content','sales','finance','resources','automations','reports','ai','settings'];
for(const scope of ['',...state.data.businesses.map(b=>b.id)]){
 for(const page of pages){
   vm.runInContext(`scope=${JSON.stringify(scope)};page=${JSON.stringify(page)};render();`,context);
   const html=elements.get('#app').innerHTML;
   assert(html.includes('<h1>'),`${scope}/${page}: no heading`);
   assert(!html.includes('>undefined<'),`${scope}/${page}: undefined text`);
   assert(!html.includes('NaN'),`${scope}/${page}: invalid number`);
 }
}
for(const view of ['board','approvals','calendar','list']) vm.runInContext(`scope='';page='content';contentView='${view}';render();`,context);
for(const view of ['ledger','invoices','business']) vm.runInContext(`scope='';page='finance';financeView='${view}';render();`,context);
vm.runInContext(`store.content[0].title='<img src=x onerror=alert(1)>'; page='content';contentView='list';render();`,context);
assert(elements.get('#app').innerHTML.includes('&lt;img'));
assert(!elements.get('#app').innerHTML.includes('<img src=x'));
vm.runInContext(`scope='';openEditor('content');openEditor('invoices');openPayment('i1');`,context);
assert(elements.get('#editor').innerHTML.includes('Record invoice payment'));
for(const [group,views,page]of [['artbitTab',['overview','accounts','delivery','campaigns','reports'],'artbit'],['merchTab',['overview','designs','products','printing','orders','website'],'merch'],['qfsTab',['pipeline','research','followups'],'qfs'],['videoTab',['productions','tasks','website'],'video'],['mediaTab',['articles','tasks','website'],'media'],['travelTab',['trips','partners','requests','website'],'travel'],['taskView',['board','list'],'tasks']])for(const view of views)vm.runInContext(`${group}=${JSON.stringify(view)};page=${JSON.stringify(page)};render();`,context);
for(const entity of Object.keys(schema.fields).filter(e=>!['task_steps'].includes(e)))vm.runInContext(`openEditor(${JSON.stringify(entity)},'',{business_id:'artbit'});`,context);
vm.runInContext(`scope='artbit';page='content';contentClient='nahar';render();`,context);
assert(!elements.get('#app').innerHTML.includes('A motorsport weekend'));
assert.deepEqual(JSON.parse(vm.runInContext(`JSON.stringify(parseCSV('name,notes\\nBuyer,"a,b"'))`,context)),[{name:'Buyer',notes:'a,b'}]);
console.log(`PASS: ${pages.length*(state.data.businesses.length+1)} page/workspace renders, all operation tabs and record editors, content escaping and CSV parsing.`);
