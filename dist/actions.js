/* Shared, decorative action cues. Permissions and action handlers stay in their own modules. */
'use strict';
(() => {
  const paths = {
    plus:'M12 5v14M5 12h14', edit:'m16 3 5 5-12 12-6 1 1-6Z M14 5l5 5',
    save:'M5 3h12l4 4v14H3V3h2Z M7 3v6h10V3 M7 21v-8h10v8',
    check:'m5 12 4 4L19 6', trash:'M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7',
    close:'m6 6 12 12M18 6 6 18', search:'M21 21l-5-5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0',
    send:'m3 3 18 9-18 9 4-9Z M7 12h14', upload:'M12 16V3m-5 5 5-5 5 5M4 16v5h16v-5',
    download:'M12 3v13m-5-5 5 5 5-5M4 16v5h16v-5', copy:'M9 9h12v12H9Z M15 9V3H3v12h6',
    clock:'M12 8v5l3 2M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',
    refresh:'M20 8a9 9 0 0 0-16-2M4 3v5h5M4 16a9 9 0 0 0 16 2M20 21v-5h-5',
    eye:'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0',
    link:'M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-2 2M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l2-2',
    user:'M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0M4 21v-2a8 8 0 0 1 16 0v2M20 5v6m-3-3h6',
    money:'M3 5h18v14H3Z M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0M6 9v6M18 9v6',
    back:'m15 5-7 7 7 7', next:'m9 5 7 7-7 7', logout:'M9 3H3v18h6M9 12h12m-5-5 5 5-5 5',
    board:'M3 4h18v16H3ZM9 4v16M15 4v16', list:'M8 5h13M8 12h13M8 19h13M3 5h1M3 12h1M3 19h1',
    calendar:'M3 5h18v16H3ZM7 2v6M17 2v6M3 11h18', alert:'m12 3 10 18H2Z M12 9v5M12 17h.01'
  };
  const tones = ['create','edit','success','review','social','transfer','danger','neutral'];
  function cue(el) {
    const action=el.dataset.action||el.dataset.workAction||'', label=el.textContent.trim().replace(/^\+\s*/,''), status=el.dataset.status||el.dataset.stage||'';
    if (/^(Cancel|Close|Back)$/.test(label)) return ['neutral',label==='Back'?'back':'close'];
    if (action==='logout') return ['neutral','logout'];
    if (/delete|clear-samples|detach/.test(action)||/^(Delete|Remove|Reject|Cancel order|Returned|Cancelled)\b/i.test(label+' '+status)) return ['danger',/Reject|Cancelled/i.test(label+' '+status)?'close':'trash'];
    if (/restore/.test(action)) return ['review','refresh'];
    if (/invite-person|assign-person|assign-linked-work|link-person/.test(action)) return ['social','user'];
    if (action==='review-content'||/^Review\b/i.test(label)) return ['review','eye'];
    if (['Rejected','Cancelled','Returned'].includes(status)) return ['danger','close'];
    if (['Approved','Published','Done','Delivered','Confirmed'].includes(status)) return ['success','check'];
    if (['Scheduled','In review','Changes requested'].includes(status)||/^Plan publish$/.test(label)) return ['review',status==='Scheduled'?'calendar':'eye'];
    if (status==='Draft'||/^Start draft$/.test(label)) return ['edit','edit'];
    if (action==='edit') return [el.dataset.id?'edit':'create',el.dataset.id?'edit':'plus'];
    if (['op-new','client-new','quick-capture'].includes(action)||/^(New|Add|Create|Collect|Log|Generate|Detailed task|Monthly plan)\b/i.test(label)) return ['create','plus'];
    if (/publisher-confirm|publisher-publish|open-publisher/.test(action)||/Social|Publish|Send approved/i.test(label)) return ['social','send'];
    if (/^(Approve|Confirm published|Done|Completed|Delivered|Verified|Print-ready)\b/i.test(label+' '+status)) return ['success','check'];
    if (/^(Review|Request changes|Revision|Quality check|Blocked)\b/i.test(label+' '+status)||/task-reschedule/.test(action)) return ['review',/Tomorrow|Next week/.test(label)?'clock':'eye'];
    if (/payment/.test(action)||/payment|invoice balance/i.test(label)) return ['transfer','money'];
    if (/copy/.test(action)||/^Copy\b/i.test(label)) return ['transfer','copy'];
    if (/export|download/.test(action)||/^Export\b/i.test(label)) return ['transfer','download'];
    if (/import|upload/.test(action)||/^(Import|Upload)\b/i.test(label)) return ['transfer','upload'];
    if (/^Save\b/i.test(label)) return ['edit','save'];
    if (/^Edit\b/i.test(label)) return ['edit','edit'];
    if (/^(Search|Find)\b/i.test(label)||action==='search') return ['edit','search'];
    if (/refresh|reset/.test(action)) return ['neutral','refresh'];
    if (label==='Previous') return ['neutral','back'];
    if (label==='Next') return ['neutral','next'];
    if (action==='navigate') {
      const pages={planner:['edit','calendar'],tasks:['edit','board'],connections:['social','user'],content:['social','send'],finance:['transfer','money']};
      if(pages[el.dataset.page]) return pages[el.dataset.page];
    }
    if (/task-board|team-tasks/.test(action)) return ['edit','board'];
    if (/Today|planner|calendar/i.test(label)) return ['edit','calendar'];
    if (/^Approvals?\b/i.test(label)) return ['review','eye'];
    if (/^(Board|Pipeline)$/.test(label)) return ['edit','board'];
    if (label==='List') return ['edit','list'];
    if (/^(Open|Activate|Admin workspace)|workspace|client-overview/.test(label+' '+action)||el.matches('a')) return ['edit',el.matches('a')?'link':'next'];
    if (/People|Assign|team/i.test(label)) return ['social','user'];
    return ['neutral','eye'];
  }
  function decorate(el) {
    const [tone,name]=cue(el), fingerprint=tone+':'+name;
    if(el.dataset.actionVisual===fingerprint) return;
    el.dataset.actionVisual=fingerprint;
    el.classList.remove(...tones.map(t=>'action-'+t));
    el.classList.add('action-'+tone);
    let svg=el.querySelector('svg.action-icon');
    if(svg) svg.querySelector('path').setAttribute('d',paths[name]);
    else if(!el.querySelector('svg')) {
      svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
      svg.classList.add('action-icon');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('aria-hidden','true');svg.setAttribute('focusable','false');
      const path=document.createElementNS(svg.namespaceURI,'path');path.setAttribute('d',paths[name]);svg.append(path);el.prepend(svg);
    }
  }
  const selector='.btn,.search-button,.tabs button,.desk-shortcuts button';
  function scan(root) {
    if(root.nodeType!==1) return;
    if(root.matches(selector)) decorate(root);
    root.querySelectorAll(selector).forEach(decorate);
  }
  scan(document.documentElement);
  new MutationObserver(records=>{
    for(const record of records) {
      // Revisit changed labels (for example a retry) as well as newly opened dialogs.
      if(record.target.nodeType===1) {const button=record.target.closest(selector);if(button) decorate(button);}
      record.addedNodes.forEach(scan);
    }
  }).observe(document.body,{childList:true,subtree:true,characterData:true});
})();
