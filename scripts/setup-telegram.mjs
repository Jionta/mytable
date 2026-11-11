/* Run on the owner's computer with node --env-file=.env.telegram. */
import { timingSafeEqual } from 'node:crypto';

const target='https://os.iamjubayer.com/integrations/telegram';
const token=process.env.GROW_TELEGRAM_TOKEN||'';
const action=process.argv[2];
if (!/^\d+:[a-zA-Z0-9_-]{20,}$/.test(token)||!['discover','register','status'].includes(action)) {
  console.error('Use discover, register, or status with a valid Telegram token in your local environment.');
  process.exit(1);
}
async function call(method,body={}){
  try {
    const response=await fetch('https://api.telegram.org/bot'+token+'/'+method,{
      method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),
      signal:AbortSignal.timeout(12000),redirect:'error',
    });
    const json=await response.json();
    if(!response.ok||!json.ok)throw new Error();
    return json.result;
  } catch {throw new Error('Telegram '+method+' failed. Check your bot configuration.');}
}
try {
  const info=await call('getWebhookInfo');
  if(action==='status'){
    console.log(info.url===target?'GROW webhook registered.':info.url?'A different webhook is registered.':'No webhook registered.');
    console.log('Pending Telegram updates:',info.pending_update_count);
  } else if(action==='discover'){
    const nonce=process.env.GROW_TELEGRAM_PAIR_CODE||'';
    if(info.url)throw new Error('Use a new dedicated bot. An existing webhook will not be removed.');
    if(!/^[a-zA-Z0-9_-]{24,}$/.test(nonce))throw new Error('Set a random GROW_TELEGRAM_PAIR_CODE of at least 24 characters.');
    const expected=Buffer.from('/pair '+nonce);
    const matches=new Set((await call('getUpdates',{allowed_updates:['message'],limit:100})).map(u=>u.message).filter(m=>{
      const text=Buffer.from(m?.text||'');
      return m?.chat?.type==='private'&&m.chat.id===m.from?.id&&!m.from.is_bot&&
        text.length===expected.length&&timingSafeEqual(text,expected);
    }).map(m=>m.chat.id));
    if(matches.size!==1)throw new Error('Send /pair followed by the pairing code to the bot in a private chat, then try again.');
    console.log('GROW_TELEGRAM_OWNER_ID='+[...matches][0]);
  } else {
    const secret=process.env.GROW_TELEGRAM_WEBHOOK_SECRET||'', owner=process.env.GROW_TELEGRAM_OWNER_ID||'';
    if(info.url&&info.url!==target)throw new Error('This bot has another webhook. Use a dedicated GROW bot.');
    if(!/^[a-zA-Z0-9_-]{32,256}$/.test(secret)||!/^[1-9]\d{0,15}$/.test(owner))throw new Error('Set the webhook secret and verified owner ID in the local environment first.');
    await call('setWebhook',{url:target,secret_token:secret,allowed_updates:['message'],max_connections:1});
    console.log('GROW webhook registered. Send /start to the bot from the paired account.');
  }
} catch(error){console.error(error.message);process.exitCode=1;}
