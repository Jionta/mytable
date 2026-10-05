/* Browser-independent template checks. No claim of visual/browser QA. */
const fs=require('fs'),vm=require('vm'),assert=require('assert');
const elements=new Map();
function element(){return {innerHTML:'',textContent:'',className:'',classList:{remove(){},add(){},toggle(){}},open:false,showModal(){this.open=true;},close(){this.open=false;},querySelector(){return {disabled:false}},scrollIntoView(){},select(){}};}
const document={querySelector(s){if(!elements.has(s))elements.set(s,element());return elements.get(s);},addEventListener(){},modelContext:undefined};
let source=fs.readFileSync('dist/app.js','utf8').replace(/boot\(\);\s*$/,'');
const state=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
const context=vm.createContext({document,console,window:{addEventListener(){},scrollTo(){}},location:{hash:''},setTimeout,clearTimeout,URL,Blob,Intl,Date});
vm.runInContext(source,context);
context.seedState=state;
vm.runInContext('store=seedState.data; serverToday=seedState.today; csrf=seedState.csrf;',context);
const pages=['home','today','businesses','clients','projects','tasks','marketing','content','sales','finance','resources','automations','reports','ai','settings'];
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
console.log('PASS: 135 module/workspace renders, content and finance views, escaped content, and editor/payment templates. Browser visual QA was not available.');
