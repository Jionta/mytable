import assert from 'node:assert/strict';
import {test} from 'node:test';
import {Client,InMemoryTransport} from '@modelcontextprotocol/client';
import {createPilot} from './bridge.mjs';

const token='x'.repeat(40);
const clock=()=>new Date('2026-11-12T20:00:00Z'); // 02:00 on Nov 13 in Dhaka.
const okScope={mode:'draft_only',businesses:[{id:'artbit'}]};
async function run(fetcher,check){
  const server=createPilot({token,fetcher,clock});
  const [clientTransport,serverTransport]=InMemoryTransport.createLinkedPair();
  const client=new Client({name:'pilot-test',version:'1'});
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  try {await check(client);} finally{await client.close();await server.close();}
}
const decode=result=>JSON.parse(result.content[0].text);
test('only the two pilot tools exist and the draft is fixed to Artbit, Facebook and the Dhaka date',async()=>{
  const calls=[];
  await run(async(url,opts)=>{
    assert.equal(url,'https://os.iamjubayer.com/integrations/social-bot');
    assert.equal(opts.headers.Authorization,'Bearer '+token);
    if(opts.method==='GET')return Response.json(okScope);
    calls.push(JSON.parse(opts.body));
    return Response.json({record_id:'draft-1',duplicate:calls.length>1});
  },async client=>{
    assert.deepEqual((await client.listTools()).tools.map(t=>t.name).sort(),['pilot_brief','submit_post_draft']);
    assert.equal(decode(await client.callTool({name:'pilot_brief',arguments:{}})).day,'2026-11-13');
    const args={name:'submit_post_draft',arguments:{title:'Plan your content',copy:'Draft caption'}};
    assert.deepEqual(decode(await client.callTool(args)),{record_id:'draft-1',duplicate:false,status:'Draft',published:false});
    assert.equal(decode(await client.callTool(args)).duplicate,true);
    assert.equal(calls.length,2);
    assert.deepEqual(calls[0],{business_id:'artbit',external_id:'hermes-artbit-facebook-2026-11-13',kind:'post',channel:'Facebook',format:'Post',title:'Plan your content',copy:'Draft caption'});
    assert.deepEqual(calls[1],calls[0]);
  });
});
test('never submits if the server grants broader scope',async()=>{
  await run(async(url,opts)=>{
    assert.equal(opts.method,'GET');
    return Response.json({mode:'draft_only',businesses:[{id:'artbit'},{id:'vidzones'}]});
  },async client=>{
    const result=await client.callTool({name:'submit_post_draft',arguments:{title:'Pilot',copy:'Draft'}});
    assert.equal(result.isError,true);
    assert.match(result.content[0].text,/not restricted/);
  });
});
