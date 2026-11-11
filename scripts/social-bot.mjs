/* Local-bot adapter: prints JSON so an existing bot can invoke it. */
const token=process.env.GROW_SOCIAL_BOT_TOKEN||'';
const action=process.argv[2];
if(token.length<32||!['businesses','submit'].includes(action)){
  console.error('Use businesses or submit with GROW_SOCIAL_BOT_TOKEN in your local environment.');
  process.exit(1);
}
try {
  let body;
  if(action==='submit'){
    const chunks=[];
    let bytes=0;
    for await(const chunk of process.stdin){
      bytes+=chunk.length;
      if(bytes>24*1024)throw new Error('Draft exceeds 24 KB.');
      chunks.push(chunk);
    }
    body=Buffer.concat(chunks).toString('utf8');
    JSON.parse(body);
  }
  const response=await fetch('https://os.iamjubayer.com/integrations/social-bot',{
    method:action==='submit'?'POST':'GET',
    headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body,
    signal:AbortSignal.timeout(15000),redirect:'error',
  });
  if(!response.ok)throw new Error('GROW rejected the request (HTTP '+response.status+'). Check bot scope and draft fields.');
  console.log(JSON.stringify(await response.json()));
} catch {console.error('GROW bridge request failed. Check the bot token, business scope, and draft JSON.');process.exitCode=1;}
