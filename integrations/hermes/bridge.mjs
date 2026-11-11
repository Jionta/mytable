import {fileURLToPath} from 'node:url';

import {McpServer} from '@modelcontextprotocol/server';
import {StdioServerTransport} from '@modelcontextprotocol/server/stdio';
import * as z from 'zod/v4';

const endpoint='https://os.iamjubayer.com/integrations/social-bot';
const business='artbit';
const text=value=>({content:[{type:'text',text:JSON.stringify(value)}]});
const error=message=>({isError:true,content:[{type:'text',text:message}]});
const dayInDhaka=now=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Dhaka',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);

export function createPilot({token=process.env.GROW_SOCIAL_BOT_TOKEN,fetcher=fetch,clock=()=>new Date()}={}) {
  const server=new McpServer({name:'grow-artbit-pilot',version:'1.0.0'});
  async function bridge(method,body) {
    if(typeof token!=='string'||token.length<32)throw new Error('GROW pilot token has not been configured.');
    const response=await fetcher(endpoint,{
      method,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},
      body:body===undefined?undefined:JSON.stringify(body),redirect:'error',signal:AbortSignal.timeout(15000),
    }).catch(()=>{throw new Error('GROW could not be reached.');});
    if(!response.ok)throw new Error('GROW bridge returned HTTP '+response.status+'.');
    return response.json();
  }
  server.registerTool('pilot_brief',{
    description:'Check the GROW connection and get the approved scope for the Artbit Studio Facebook draft pilot.',
    inputSchema:{},annotations:{readOnlyHint:true,openWorldHint:false},
  },async()=>{
    try {
      const data=await bridge('GET');
      if(data.mode!=='draft_only'||data.businesses?.length!==1||data.businesses[0].id!==business)
        return error('GROW is not restricted to the Artbit pilot. No draft will be submitted.');
      return text({business:'Artbit Studio',platform:'Facebook',day:dayInDhaka(clock()),mode:'draft_only',daily_post_limit:1,
        facts:['Artbit Studio is a social media services business.','The intended audience is business owners who want clearer social content.'],
        instruction:'Suggest one practical organic social-media idea for a small business, in natural Bengali. Do not invent offers, client names, metrics, events, or testimonials. An owner reviews the draft before publishing.'});
    } catch(e){return error(e.message);}
  });
  server.registerTool('submit_post_draft',{
    description:'Save a text-only Facebook post draft to Artbit Studio in GROW. One draft per Dhaka day. Does not publish.',
    inputSchema:{title:z.string().trim().min(1).max(160),copy:z.string().trim().min(1).max(1500)},
    annotations:{readOnlyHint:false,destructiveHint:false,idempotentHint:true,openWorldHint:false},
  },async({title,copy})=>{
    try{
      const scope=await bridge('GET');
      if(scope.mode!=='draft_only'||scope.businesses?.length!==1||scope.businesses[0].id!==business)
        return error('GROW is not restricted to the Artbit pilot. No draft was submitted.');
      const result=await bridge('POST',{
        business_id:business,external_id:'hermes-artbit-facebook-'+dayInDhaka(clock()),
        kind:'post',channel:'Facebook',format:'Post',title,copy,
      });
      return text({record_id:result.record_id,duplicate:result.duplicate,status:'Draft',published:false});
    }catch(e){return error(e.message);}
  });
  return server;
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){
  await createPilot().connect(new StdioServerTransport());
}
