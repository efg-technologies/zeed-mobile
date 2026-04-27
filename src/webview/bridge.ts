// Pure helpers for building JS snippets to inject into the WebView.
// No RN imports — testable in node.

/** Safely escape a JS string literal for interpolation inside injected JS. */
export function escapeJs(s: string): string {
  return JSON.stringify(String(s ?? ''));
}

/** Build the JS to click an element by visible label (SPA-safe). Mirrors
 * the desktop Zeed click_by_label tool. Returns a self-contained IIFE that
 * resolves to a string: 'clicked: [role] "label" score=N' | 'NO_MATCH: …'. */
export function buildClickByLabelJs(label: string, role?: string): string {
  const L = escapeJs(label);
  const R = escapeJs((role || '').toLowerCase());
  return `(function(){
  var target = ${L}.toLowerCase();
  var wantRole = ${R};
  var selectors = ['button','a[href]','[role="button"]','[role="link"]','[role="menuitem"]','[role="tab"]','input[type="submit"]','input[type="button"]','summary','[onclick]'];
  var all = [];
  selectors.forEach(function(s){ try { document.querySelectorAll(s).forEach(function(el){ all.push(el); }); } catch(e){} });
  function textOf(el){ var t = (el.getAttribute('aria-label')||'').trim(); if(!t) t=(el.innerText||el.textContent||'').replace(/\\s+/g,' ').trim(); if(!t) t=(el.getAttribute('title')||'').trim(); if(!t) t=(el.getAttribute('alt')||el.value||'').trim(); return t; }
  function visible(el){ var r=el.getBoundingClientRect(); if(r.width<2||r.height<2) return false; var s=getComputedStyle(el); if(s.visibility==='hidden'||s.display==='none'||Number(s.opacity)<0.1) return false; return true; }
  function roleOf(el){ var tag=el.tagName.toLowerCase(); var r=(el.getAttribute('role')||'').toLowerCase(); if(r) return r; if(tag==='button'||tag==='summary') return 'button'; if(tag==='a') return 'link'; if(tag==='input'){ var t=(el.getAttribute('type')||'').toLowerCase(); return t==='submit'||t==='button'?'button':t; } return tag; }
  var best=null,bestScore=-1;
  all.forEach(function(el){
    if(!visible(el)) return;
    if(wantRole && roleOf(el)!==wantRole) return;
    var txt=textOf(el).toLowerCase();
    if(!txt) return;
    var score=0;
    if(txt===target) score=100;
    else if(txt.indexOf(target)!==-1) score=70-(txt.length-target.length);
    else { var words=target.split(/\\s+/).filter(function(w){return w.length>1;}); var hits=0; words.forEach(function(w){ if(txt.indexOf(w)!==-1) hits++; }); if(words.length&&hits===words.length) score=40; else if(hits>=Math.ceil(words.length*0.6)) score=25; }
    if(score>bestScore){ bestScore=score; best=el; }
  });
  if(!best||bestScore<20){ var candidates=all.filter(visible).slice(0,20).map(function(el){ return '['+roleOf(el)+'] "'+textOf(el).slice(0,60)+'"'; }); return 'NO_MATCH for label='+${L}+'. Visible candidates:\\n  '+candidates.join('\\n  '); }
  best.scrollIntoView({block:'center'});
  best.click();
  return 'clicked: ['+roleOf(best)+'] "'+textOf(best).slice(0,80)+'" score='+bestScore;
})()`;
}

/** Build JS to click by CSS selector. */
export function buildClickBySelectorJs(selector: string): string {
  const S = escapeJs(selector);
  return `(function(){
  try{
    var el=document.querySelector(${S});
    if(!el) return 'NOT_FOUND for selector='+${S};
    el.scrollIntoView({block:'center'});
    el.click();
    var label=(el.innerText||el.textContent||el.value||'').replace(/\\s+/g,' ').trim().slice(0,80);
    return 'clicked: '+label;
  } catch(e){ return 'click_by_selector error: '+(e&&e.message?e.message:String(e)); }
})()`;
}

/** Build JS that reads the page and POSTS an observation back to RN via
 * window.ReactNativeWebView.postMessage. The App-side onMessage handler
 * expects { type:'read_page', url, title, text, interactives }.
 *
 * Defers the read until the document is past 'loading' AND body has
 * children. SPAs (e.g. dash.cloudflare.com) mount content after the
 * initial parse, so a synchronous read on a still-booting bundle would
 * postMessage an empty payload — or, if invoked before the page bridge
 * is set up, never postMessage at all and trigger the App-side timeout.
 * Polls up to ~10s; after that, fires a final read so the agent at
 * least gets *something* (likely empty) instead of a hard timeout. */
export function buildReadPageJs(interactiveOnly = false): string {
  const IO = interactiveOnly ? 'true' : 'false';
  return `(function(){
  var interactiveOnly=${IO};
  function ready(){
    if(document.readyState==='loading') return false;
    if(!document.body || document.body.childElementCount===0) return false;
    return true;
  }
  function run(){
    try {
      function textOf(el){
        var t=(el.getAttribute('aria-label')||'').trim();
        if(!t) t=(el.innerText||el.textContent||'').replace(/\\s+/g,' ').trim();
        if(!t) t=(el.getAttribute('title')||el.getAttribute('alt')||el.value||'').trim();
        return t.slice(0,120);
      }
      function roleOf(el){
        var r=(el.getAttribute('role')||'').toLowerCase(); if(r) return r;
        var tag=el.tagName.toLowerCase();
        if(tag==='a') return 'link';
        if(tag==='button'||tag==='summary') return 'button';
        if(tag==='input'){ var t=(el.getAttribute('type')||'').toLowerCase(); return t==='submit'||t==='button'?'button':(t||'input'); }
        return tag;
      }
      var selectors='a[href],button,[role="button"],[role="link"],input,select,textarea,summary';
      var inters=[];
      document.querySelectorAll(selectors).forEach(function(el,i){
        if(inters.length>=80) return;
        el.setAttribute('data-zeed-ref',String(i));
        var label=textOf(el);
        if(!label) return;
        inters.push({ref:String(i),role:roleOf(el),label:label});
      });
      var text='';
      if(!interactiveOnly){
        var main=document.querySelector('main,article,body');
        text=((main&&(main.innerText||main.textContent))||'').replace(/\\s+/g,' ').slice(0,4000);
      }
      var payload={
        type:'read_page',
        url:location.href,
        title:(document.title||'').slice(0,200),
        text:text,
        interactives:inters
      };
      window.ReactNativeWebView.postMessage(JSON.stringify(payload));
    } catch(e) {
      try {
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type:'read_page',url:location.href,title:'',text:'',interactives:[],
          error:(e&&e.message?e.message:String(e))
        }));
      } catch(_) {}
    }
  }
  if(ready()){ run(); }
  else {
    var attempts=0;
    var iv=setInterval(function(){
      attempts++;
      if(ready() || attempts>=40){ clearInterval(iv); run(); }
    }, 250);
  }
  true;
})();`;
}
