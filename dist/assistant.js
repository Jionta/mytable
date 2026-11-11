'use strict';

function assistantOverview() {
  const businesses=store.businesses||[];
  const adminLinks=(store.business_links||[]).filter(l=>l.kind==='Admin');
  return card('Business connections', `<div class="card-body"><p>Open your website dashboards from here. Add the actual admin URL for each site; GROW does not store its password.</p>
    <div class="assistant-sites section-gap">${businesses.map(b=>{
      const links=adminLinks.filter(l=>l.business_id===b.id);
      return `<section class="assistant-site"><h3>${esc(b.name)}</h3>
        <div class="actions">${b.website?safeLink(b.website,'Visit website','btn secondary compact'):''}
        ${links.map(l=>safeLink(l.url,l.title,'btn secondary compact')).join('')}
        ${btn('Add dashboard','assistant-add-dashboard',`data-id="${esc(b.id)}"`,'secondary compact')}</div>
        <p class="muted small">${links.length?'Opens separately · uses the site’s own sign-in':'No dashboard link added'}</p></section>`;
    }).join('')}</div></div>`,btn('Open assistant','assistant-open'),'section-gap');
}

const offlineAiPage=aiPage;
aiPage=function(){
  const html=offlineAiPage();
  return workspaceRole==='owner'&&cloudMode?`${html}${card('AI daily priorities','<p class="card-body muted">Preview a Bengali brief based on current tasks. If the AI API is unavailable, GROW still shows the task summary.</p>',btn('Preview daily brief','assistant-brief'),'section-gap')}`:html;
};

function assistantPanel(status,body) {
  const ready=(label,connected)=>`<div><dt>${label}</dt><dd>${badge(connected?'Configured':'Setup needed',connected?'good':'warn')}</dd></div>`;
  body.innerHTML=`<dl class="key-value assistant-status">
    ${ready('Telegram',status.telegram)}${ready('AI API',status.ai)}${ready('Local social bot',status.bot)}
    <div><dt>Daily brief · Dhaka</dt><dd>${String(status.hour).padStart(2,'0')}:00</dd></div>
    <div><dt>Last Telegram delivery</dt><dd>${status.lastBrief?esc(status.lastBrief.day+' · '+status.lastBrief.result):'No delivery yet'}</dd></div>
  </dl>
  <div class="actions section-gap">${btn('Preview daily brief','assistant-brief','','primary')}</div>
  <p class="notice">In Telegram, use /today for task codes, /businesses for business codes, and /update to record progress. The local bot can submit drafts for ${Number(status.bot)||0} configured businesses. Publish approved posts via Content → Social.</p>
  <h3>Suggested replies</h3>
  ${status.replies.length?status.replies.map(r=>`<section class="assistant-reply section-gap">
    <p class="eyebrow">${esc(bname(r.business_id))} · ${esc(r.channel)} · ${r.kind==='message_reply'?'Message':'Comment'} · ${esc(r.day)}</p>
    <h3>${esc(r.title)}</h3><p class="brief">${esc(r.copy)}</p>
    <div class="actions">${safeLink(r.source,'Open conversation','btn secondary compact')}${btn('Copy reply','assistant-copy','','secondary compact')}${btn('Dismiss suggestion','assistant-dismiss',`data-id="${esc(r.id)}"`,'secondary compact')}</div>
  </section>`).join(''):'<p class="notice">No reply drafts waiting for review.</p>'}`;
}

async function openAssistant() {
  openDialog(`${dialogHead('Work assistant','Telegram updates, AI brief, and the local social bot.')}<div class="dialog-body" data-assistant-panel aria-live="polite"><p>Loading connections…</p></div><div class="dialog-actions">${btn('Close','close')}</div>`);
  const body=$('[data-assistant-panel]');
  try {const status=await api('assistant');if(body.isConnected)assistantPanel(status,body);}
  catch(error){if(body.isConnected)body.textContent=error.message;}
}
async function previewAssistant() {
  openDialog(`${dialogHead('Preview daily brief','Only previews the message. Nothing is sent to Telegram.')}<div class="dialog-body" data-assistant-brief aria-live="polite"><p>Preparing the brief…</p></div><div class="dialog-actions">${btn('Back to assistant','assistant-open')}${btn('Close','close')}</div>`);
  const body=$('[data-assistant-brief]');
  try {
    const result=await api('assistant/brief','POST',{});
    if(body.isConnected)body.innerHTML=`<p class="notice">${result.ai==='generated'?'AI priorities included.':result.ai==='unavailable'?'AI unavailable · showing saved task data.':'Showing saved task data.'}</p><p class="brief">${esc(result.text)}</p>`;
  } catch(error){if(body.isConnected)body.textContent=error.message;}
}

document.addEventListener('click',async e=>{
  const el=e.target.closest?.('[data-action^="assistant-"]');
  if(!el||workspaceRole!=='owner'||!cloudMode)return;
  const action=el.dataset.action;
  try{
    if(action==='assistant-open')await openAssistant();
    if(action==='assistant-brief')await previewAssistant();
    if(action==='assistant-add-dashboard')openEditor('business_links','',{business_id:el.dataset.id,kind:'Admin'});
    if(action==='assistant-copy'){await navigator.clipboard.writeText(el.closest('.assistant-reply').querySelector('.brief').textContent);toast('Reply copied.');}
    if(action==='assistant-dismiss'){
      el.disabled=true;
      await api('assistant/replies/'+encodeURIComponent(el.dataset.id),'DELETE');
      if(el.isConnected)await openAssistant();
      toast('Suggestion dismissed.');
    }
  }catch(error){toast(error.message,true);}
  finally{if(el.isConnected)el.disabled=false;}
});
