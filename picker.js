/**
 * CODE SCARPER TARGET EXTRACTOR v6.0.0
 * توسعه‌دهنده: Reza Zarnegar
 *
 * این فایل داخل صفحه وب اجرا می‌شود و مسئول انتخاب دستی Targetها،
 * ساخت CSS Selector و XPath، استخراج Context/Style/DOM و آماده‌سازی
 * اطلاعات مناسب برای Selenium، ChromeDriver و افزونه‌های مرورگر است.
 */

(() => {
  'use strict';
  const VERSION = '6.0.0';
  const UI_ATTR = 'data-csp-target-extractor-ui';
  const SELECT_ATTR = 'data-csp-target-extractor-id';
  const MAX_HTML = 32000;
  const MAX_SECTION_HTML = 70000;
  const MAX_RULES = 80;
  const MAX_SECTION_ELEMENTS = 260;

  if (window.__CSP_TARGET_EXTRACTOR_V6__) {
    window.__CSP_TARGET_EXTRACTOR_V6__.start?.();
    return;
  }

  const state = {
    active: false,
    hovered: null,
    selected: new Set(),
    host: null,
    shadow: null,
    hoverBox: null,
    selectedLayer: null,
    toolbar: null,
    countEl: null,
    infoEl: null,
    extractBtn: null,
    totalCount: 0,
    uid: 0
  };

  const text = v => String(v ?? '').replace(/\s+/g, ' ').trim();
  const clip = (v, n=1000) => { const s = text(v); return s.length > n ? s.slice(0,n) + '…' : s; };
  const isEl = v => v instanceof Element;
  const now = () => new Date().toISOString();
  const cssEsc = v => CSS.escape(String(v ?? ''));
  const dynamicId = v => !v || /^:r[\w-]*:$/.test(v) || /^mui-/i.test(v) || /^react-/i.test(v) || /^[a-f0-9]{12,}$/i.test(v) || /\d{5,}/.test(v);
  const isStableId = v => !!v && !dynamicId(v);
  const dynamicClass = c => !c || /^(rtl|ltr|css)-[a-z0-9_-]{4,}$/i.test(c) || /^[a-z]{1,4}-[a-z0-9]{5,}$/i.test(c) || /(^|-)\d{5,}($|-)/.test(c);
  const stableClassTokens = el => [...(el?.classList || [])].filter(c => !dynamicClass(c)).slice(0,5);
  const stableDataAttrs = el => [...(el?.attributes || [])].filter(a => /^data-(testid|test|qa|cy|automation|id)$/i.test(a.name) && a.value && a.value.length < 160);

  const SENSITIVE_RE = /password|passcode|passwd|secret|token|authorization|cookie|csrf|xsrf|api[-_ ]?key|private[-_ ]?key|رمز|گذرواژه|توکن|کلید خصوصی/i;
  const PII_RE = /national.?code|national.?id|card.?number|iban|sheba|mobile|phone|email|birth.?date|last.?login.?ip|(^|\s)ip(\s|$)|کد ملی|شماره کارت|شبا|موبایل|شماره همراه|ایمیل|تاریخ تولد/i;

  function xpathLiteral(s) {
    s = String(s ?? '');
    if (!s.includes("'")) return `'${s}'`;
    if (!s.includes('"')) return `"${s}"`;
    return 'concat(' + s.split("'").map((p,i)=>`${i ? `,"'",` : ''}'${p}'`).join('') + ')';
  }
  function absoluteXpath(el) {
    if (!el || el.nodeType !== 1 || el.getRootNode() instanceof ShadowRoot) return '';
    if (isStableId(el.id)) return `//*[@id=${xpathLiteral(el.id)}]`;
    const parts=[]; let cur=el;
    while (cur && cur.nodeType===1) {
      let i=1, sib=cur.previousElementSibling;
      while (sib) { if (sib.tagName===cur.tagName) i++; sib=sib.previousElementSibling; }
      parts.unshift(`${cur.tagName.toLowerCase()}[${i}]`);
      cur=cur.parentElement;
    }
    return '/' + parts.join('/');
  }
  function rootFor(el){ return el?.getRootNode?.() || document; }
  function queryCount(root, selector){ try { return root.querySelectorAll(selector).length; } catch { return 0; } }
  function xpathCount(expr){ try { return document.evaluate(`count(${expr})`,document,null,XPathResult.NUMBER_TYPE,null).numberValue || 0; } catch { return 0; } }

  function structuralCss(el) {
    if (!el || !isEl(el)) return '';
    const root = rootFor(el); const parts=[]; let cur=el;
    while (cur && isEl(cur) && cur !== document.documentElement) {
      if (isStableId(cur.id)) { parts.unshift(`#${cssEsc(cur.id)}`); break; }
      let p = cur.tagName.toLowerCase();
      const stable = stableClassTokens(cur).slice(0,2);
      if (stable.length) p += stable.map(c=>`.${cssEsc(c)}`).join('');
      const parent = cur.parentElement;
      if (parent) {
        const same = [...parent.children].filter(x=>x.tagName===cur.tagName);
        if (same.length>1) p += `:nth-of-type(${same.indexOf(cur)+1})`;
      }
      parts.unshift(p); cur=parent;
      const sel = parts.join(' > ');
      if (queryCount(root,sel)===1) return sel;
      if (parts.length>=8) break;
    }
    return parts.join(' > ');
  }

  function associatedLabel(el) {
    const aria = el.getAttribute('aria-label'); if (aria) return text(aria);
    const labelled = el.getAttribute('aria-labelledby');
    if (labelled) {
      const vals = labelled.split(/\s+/).map(id=>document.getElementById(id)?.innerText).filter(Boolean);
      if (vals.length) return text(vals.join(' '));
    }
    if (el.id) { try { const l=document.querySelector(`label[for="${cssEsc(el.id)}"]`); if (l) return text(l.innerText); } catch{} }
    const label=el.closest('label'); if (label) return text(label.innerText);
    const ph=el.getAttribute('placeholder'); if (ph) return text(ph);
    return '';
  }

  function iconAction(el) {
    const src=[el.getAttribute('aria-label'),el.getAttribute('title'),el.getAttribute('data-testid'),...
      [...el.querySelectorAll('svg')].flatMap(x=>[x.getAttribute('class'),x.getAttribute('data-testid'),x.getAttribute('aria-label')])].filter(Boolean).join(' ').toLowerCase();
    const map=[[/eye|view|visibility/,'View details'],[/edit|pencil/,'Edit'],[/trash|delete|remove/,'Delete'],[/copy|clipboard/,'Copy'],[/history|clock/,'History'],[/download/,'Download'],[/upload/,'Upload'],[/plus|add|create/,'Add'],[/chevron|arrow|expand|collapse|more/,'Toggle'],[/search/,'Search'],[/filter/,'Filter'],[/settings|gear|cog/,'Settings']];
    for (const [re,name] of map) if (re.test(src)) return name;
    return '';
  }

  function rowIdentity(el) {
    const tr=el.closest('tr'); if (!tr) return '';
    return [...tr.querySelectorAll(':scope > th,:scope > td')].map(c=>text(c.innerText)).filter(Boolean).slice(0,3).join(' | ').slice(0,220);
  }

  function semanticName(el) {
    if (!el) return '';
    const lab=associatedLabel(el); if (lab) return clip(lab,160);
    const title=el.getAttribute('title'); if (title) return clip(title,160);
    const icon=iconAction(el), row=rowIdentity(el); if (icon && row) return clip(`${icon} ${row}`,180); if (icon) return icon;
    const t=text(el.innerText || el.textContent); if (t && t.length<=180) return t;
    if (el.getAttribute('name')) return el.getAttribute('name');
    if (isStableId(el.id)) return el.id;
    const h=el.querySelector?.('h1,h2,h3,h4,h5,h6,[role="heading"]'); if (h && text(h.innerText).length<=150) return text(h.innerText);
    return `${el.tagName.toLowerCase()} target`;
  }

  function sensitiveContext(el) {
    if (!el) return false;
    const sig=[el.getAttribute('name'),el.id,el.getAttribute('placeholder'),el.getAttribute('aria-label'),el.getAttribute('type'),associatedLabel(el)].filter(Boolean).join(' ');
    if (el.getAttribute('type')==='password' || SENSITIVE_RE.test(sig) || PII_RE.test(sig)) return true;
    const tr=el.closest('tr'); if (tr) { const first=text(tr.querySelector('th,td')?.innerText); if (SENSITIVE_RE.test(first)||PII_RE.test(first)) return true; }
    return false;
  }
  function sanitizedValue(el) {
    if (sensitiveContext(el)) return '[REDACTED]';
    if (el instanceof HTMLInputElement) { if (['checkbox','radio'].includes(el.type)) return el.checked?'checked':'unchecked'; return el.value; }
    if (el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) return el.value;
    return clip(el.innerText || el.textContent,1500);
  }
  function sanitizeHtml(node,maxLen=MAX_HTML) {
    if (!node || !isEl(node)) return '';
    let clone; try { clone=node.cloneNode(true); } catch { return ''; }
    for (const e of [clone,...clone.querySelectorAll('*')]) {
      if (!(e instanceof Element)) continue;
      e.removeAttribute(UI_ATTR); e.removeAttribute(SELECT_ATTR);
      const sig=[e.getAttribute('name'),e.id,e.getAttribute('placeholder'),e.getAttribute('aria-label'),e.getAttribute('type')].filter(Boolean).join(' ');
      if (['INPUT','TEXTAREA'].includes(e.tagName) && (SENSITIVE_RE.test(sig)||PII_RE.test(sig)||e.getAttribute('type')==='password')) { e.setAttribute('value','[REDACTED]'); if ('value' in e) e.value='[REDACTED]'; }
      if (e.tagName==='TR') {
        const cells=[...e.querySelectorAll(':scope > th,:scope > td')], first=text(cells[0]?.textContent);
        if ((SENSITIVE_RE.test(first)||PII_RE.test(first)) && cells.length>1) for(let i=1;i<cells.length;i++) cells[i].textContent='[REDACTED]';
      }
    }
    let html=clone.outerHTML||'';
    html=html.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,'[REDACTED_EMAIL]')
      .replace(/\b09\d{9}\b/g,'[REDACTED_MOBILE]').replace(/\bIR\d{24}\b/gi,'[REDACTED_IBAN]').replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g,'[REDACTED_IP]');
    return html.length>maxLen ? html.slice(0,maxLen)+'…' : html;
  }

  function attrsOf(el) {
    const out={}; for(const a of [...el.attributes]) {
      if (a.name===SELECT_ATTR || a.name===UI_ATTR) continue;
      if ((/^value$/i.test(a.name)&&sensitiveContext(el)) || /authorization|token|secret|password/i.test(a.name)) out[a.name]='[REDACTED]';
      else out[a.name]=a.value.length>700?a.value.slice(0,700)+'…':a.value;
    } return out;
  }
  function visibleInfo(el){ const cs=getComputedStyle(el),r=el.getBoundingClientRect(); return {visible:cs.display!=='none'&&cs.visibility!=='hidden'&&cs.opacity!=='0'&&r.width>0&&r.height>0,display:cs.display,visibility:cs.visibility,opacity:cs.opacity,rect:{x:Math.round(r.x),y:Math.round(r.y),width:Math.round(r.width),height:Math.round(r.height)}}; }
  function computedStyleOf(el){ const cs=getComputedStyle(el); const keys=['display','position','zIndex','overflow','overflowX','overflowY','width','height','margin','padding','color','backgroundColor','fontFamily','fontSize','fontWeight','lineHeight','textAlign','border','borderRadius','boxShadow','cursor','pointerEvents']; return Object.fromEntries(keys.map(k=>[k,cs[k]])); }

  function matchedCssRules(el){
    const out=[];
    const walk=rules=>{ for(const r of [...(rules||[])]) { if(out.length>=MAX_RULES) return; try { if(r.selectorText && el.matches(r.selectorText)) out.push({selector:r.selectorText,cssText:r.style?.cssText||r.cssText||''}); else if(r.cssRules) walk(r.cssRules); } catch{} } };
    for(const sheet of [...document.styleSheets]) { if(out.length>=MAX_RULES) break; try { walk(sheet.cssRules); } catch{} }
    return out;
  }

  function isClickable(el){ if(!el)return false; const role=el.getAttribute('role'); return ['BUTTON','A','SUMMARY'].includes(el.tagName)||['button','tab','menuitem','option','combobox','switch','checkbox'].includes(role)||el.hasAttribute('onclick')||el.tabIndex>=0||getComputedStyle(el).cursor==='pointer'; }
  function kindOf(el){ const role=el.getAttribute('role'); if(role)return role; if(el.tagName==='INPUT')return `input:${el.getAttribute('type')||'text'}`; return ({SELECT:'select',TEXTAREA:'textarea',BUTTON:'button',A:'link',TABLE:'table',FORM:'form',IMG:'image'}[el.tagName]||el.tagName.toLowerCase()); }

  function findSection(el){
    if(!el)return null;
    const direct=el.closest('dialog,[role="dialog"],[role="tabpanel"],section,article,form,table,fieldset,[role="region"]');
    if(direct && direct!==document.body && direct!==document.documentElement)return direct;
    let cur=el,best=null;
    for(let i=0;cur&&i<8;i++,cur=cur.parentElement){
      if(!cur||cur===document.body||cur===document.documentElement)break;
      const cls=String(cur.className||''), h=cur.querySelector?.(':scope > h1,:scope > h2,:scope > h3,:scope > h4,:scope > h5,:scope > h6,:scope > div > h1,:scope > div > h2,:scope > div > h3,:scope > div > h4,:scope > div > h5,:scope > div > h6');
      const r=cur.getBoundingClientRect();
      if((h||/card|panel|section|content|container|paper/i.test(cls))&&r.width>100&&r.height>45&&r.height<innerHeight*5)best=cur;
      if(h)break;
    }
    return best||el.parentElement||el;
  }
  function headingOf(root){ if(!root)return''; const h=root.matches?.('h1,h2,h3,h4,h5,h6,[role="heading"]')?root:root.querySelector?.('h1,h2,h3,h4,h5,h6,[role="heading"]'); return h?clip(h.innerText||h.textContent,180):semanticName(root); }
  function sectionPath(el){
    const arr=[]; let cur=el;
    for(let i=0;cur&&i<8;i++,cur=cur.parentElement){ const h=cur.querySelector?.(':scope > h1,:scope > h2,:scope > h3,:scope > h4,:scope > h5,:scope > h6'); const t=text(h?.innerText); if(t && !arr.includes(t)) arr.unshift(t); }
    return arr.slice(-6);
  }

  function shadowChain(el){ const chain=[]; let cur=el; while(cur){ const root=cur.getRootNode?.(); if(!(root instanceof ShadowRoot))break; const host=root.host; chain.unshift({hostName:semanticName(host),hostSelector:bestCssSelector(host),hostTag:host.tagName.toLowerCase()}); cur=host; } return chain; }
  function bestCssSelector(el){
    if(!el||!isEl(el))return''; const root=rootFor(el);
    if(isStableId(el.id)){const s=`#${cssEsc(el.id)}`;if(queryCount(root,s)===1)return s;}
    for(const a of stableDataAttrs(el)){const s=`${el.tagName.toLowerCase()}[${a.name}="${cssEsc(a.value)}"]`;if(queryCount(root,s)===1)return s;}
    const name=el.getAttribute('name');if(name){const s=`${el.tagName.toLowerCase()}[name="${cssEsc(name)}"]`;if(queryCount(root,s)===1)return s;}
    const aria=el.getAttribute('aria-label');if(aria){const s=`${el.tagName.toLowerCase()}[aria-label="${cssEsc(aria)}"]`;if(queryCount(root,s)===1)return s;}
    return structuralCss(el);
  }

  function rowContextXpath(el){
    if(el.getRootNode() instanceof ShadowRoot)return''; const tr=el.closest('tr');if(!tr)return'';
    const cells=[...tr.querySelectorAll(':scope > th,:scope > td')], idCell=cells.map(c=>text(c.innerText)).find(t=>t&&t.length<=100&&!/actions?|عملیات/i.test(t)); if(!idCell)return'';
    const tag=el.tagName.toLowerCase(), candidates=[...tr.querySelectorAll(tag)], idx=candidates.indexOf(el)+1;
    return `//tr[.//*[self::td or self::th][contains(normalize-space(.), ${xpathLiteral(idCell)})]]//${tag}[${Math.max(1,idx)}]`;
  }
  function stableClassXpath(el){ const c=stableClassTokens(el)[0]; return c?`contains(concat(' ', normalize-space(@class), ' '), ${xpathLiteral(' '+c+' ')})`:''; }
  function descendantAnchorXpath(el){
    if(el.getRootNode() instanceof ShadowRoot)return'';
    const desc=[...el.querySelectorAll('[data-testid],[data-test],[data-qa],[data-cy],h1,h2,h3,h4,h5,h6,label,button,a')].slice(0,80);
    for(const d of desc){
      let anchor='';
      for(const a of stableDataAttrs(d)){ const xp=`//${d.tagName.toLowerCase()}[@${a.name}=${xpathLiteral(a.value)}]`; if(xpathCount(xp)===1){anchor=xp;break;} }
      const dt=text(d.innerText||d.textContent);
      if(!anchor && dt && dt.length<=120){const xp=`//${d.tagName.toLowerCase()}[normalize-space(.)=${xpathLiteral(dt)}]`;if(xpathCount(xp)===1)anchor=xp;}
      if(!anchor)continue;
      const cls=stableClassXpath(el), tag=el.tagName.toLowerCase();
      const xp=cls?`${anchor}/ancestor::${tag}[${cls}][1]`:`${anchor}/ancestor::${tag}[1]`;
      if(xpathCount(xp)===1)return xp;
    }
    return'';
  }
  function sectionRelativeXpath(el){
    if(el.getRootNode() instanceof ShadowRoot)return''; const sec=findSection(el); if(!sec||sec===el)return'';
    const h=sec.querySelector('h1,h2,h3,h4,h5,h6,[role="heading"]'), ht=text(h?.innerText); if(!ht||ht.length>140)return'';
    const hxp=`//${h.tagName.toLowerCase()}[normalize-space(.)=${xpathLiteral(ht)}]`; if(xpathCount(hxp)!==1)return'';
    const nm=semanticName(el), tag=el.tagName.toLowerCase();
    if(nm&&nm.length<=120&&['button','a','label','h1','h2','h3','h4','h5','h6'].includes(tag)) {
      const xp=`${hxp}/ancestor::*[self::section or self::article or self::div or self::form][1]//${tag}[normalize-space(.)=${xpathLiteral(nm)}]`; if(xpathCount(xp)===1)return xp;
    }
    return'';
  }

  function locatorsFor(el){
    const root=rootFor(el), isShadow=root instanceof ShadowRoot, list=[];
    const pushCss=(value,score,reason)=>{if(!value)return;const unique=queryCount(root,value)===1;if(!list.some(x=>x.type==='css'&&x.value===value))list.push({type:'css',value,score:score+(unique?5:-22),unique,reason});};
    const pushXp=(value,score,reason)=>{if(!value||isShadow)return;const c=xpathCount(value);if(!list.some(x=>x.type==='xpath'&&x.value===value))list.push({type:'xpath',value,score:score+(c===1?5:-22),unique:c===1,reason});};
    if(isStableId(el.id))pushCss(`#${cssEsc(el.id)}`,100,'stable-id');
    for(const a of stableDataAttrs(el))pushCss(`${el.tagName.toLowerCase()}[${a.name}="${cssEsc(a.value)}"]`,99,`stable-${a.name}`);
    const name=el.getAttribute('name'); if(name)pushCss(`${el.tagName.toLowerCase()}[name="${cssEsc(name)}"]`,94,'name-attribute');
    const aria=el.getAttribute('aria-label');if(aria)pushCss(`${el.tagName.toLowerCase()}[aria-label="${cssEsc(aria)}"]`,92,'aria-label');
    const ph=el.getAttribute('placeholder');if(ph&&/input|textarea/i.test(el.tagName))pushCss(`${el.tagName.toLowerCase()}[placeholder="${cssEsc(ph)}"]`,86,'placeholder');
    const href=el.getAttribute('href');if(href&&href!=='#')pushCss(`a[href="${cssEsc(href)}"]`,90,'href');
    pushCss(structuralCss(el),52,'structural-css-fallback');
    if(!isShadow){
      if(isStableId(el.id))pushXp(`//*[@id=${xpathLiteral(el.id)}]`,99,'stable-id-xpath');
      for(const a of stableDataAttrs(el))pushXp(`//${el.tagName.toLowerCase()}[@${a.name}=${xpathLiteral(a.value)}]`,98,`stable-${a.name}-xpath`);
      if(name)pushXp(`//${el.tagName.toLowerCase()}[@name=${xpathLiteral(name)}]`,93,'name-xpath');
      if(aria)pushXp(`//${el.tagName.toLowerCase()}[@aria-label=${xpathLiteral(aria)}]`,91,'aria-xpath');
      const nm=semanticName(el), tag=el.tagName.toLowerCase();
      if(nm&&nm.length<=120&&['button','a','summary','label','h1','h2','h3','h4','h5','h6'].includes(tag))pushXp(`//${tag}[normalize-space(.)=${xpathLiteral(nm)}]`,89,'visible-text');
      const row=rowContextXpath(el); if(row)pushXp(row,96,'table-row-context');
      const desc=descendantAnchorXpath(el); if(desc)pushXp(desc,95,'unique-descendant-anchor');
      const sec=sectionRelativeXpath(el); if(sec)pushXp(sec,93,'section-relative');
      pushXp(absoluteXpath(el),34,'absolute-xpath-last-resort');
    }
    list.sort((a,b)=>b.score-a.score);
    return {preferred:list[0]||null,alternatives:list,shadowChain:shadowChain(el),requiresShadowDom:isShadow||shadowChain(el).length>0};
  }

  function domAncestorChain(el){ const out=[];let cur=el;for(let i=0;cur&&i<10;i++,cur=cur.parentElement){out.unshift({tag:cur.tagName.toLowerCase(),id:isStableId(cur.id)?cur.id:'',classes:stableClassTokens(cur),name:semanticName(cur),selector:bestCssSelector(cur),xpath:absoluteXpath(cur)});}return out; }
  function formContext(el){ const f=el.closest('form'); if(!f)return null; return {action:f.action||'',method:(f.method||'get').toUpperCase(),enctype:f.enctype||'',selector:bestCssSelector(f),xpath:absoluteXpath(f),fields:[...f.querySelectorAll('input,select,textarea')].slice(0,100).map(x=>({name:x.name||associatedLabel(x)||semanticName(x),type:kindOf(x),value:sanitizedValue(x),selector:bestCssSelector(x),xpath:absoluteXpath(x)}))}; }
  function tableContext(el){ const tr=el.closest('tr'),table=el.closest('table'); if(!table)return null; const headers=[...table.querySelectorAll('thead th')].map(x=>text(x.innerText)); return {table:{selector:bestCssSelector(table),xpath:absoluteXpath(table)},row:tr?{identity:rowIdentity(el),cells:[...tr.querySelectorAll(':scope > th,:scope > td')].map((c,i)=>({index:i,text:sensitiveContext(c)?'[REDACTED]':clip(c.innerText,500)})),selector:bestCssSelector(tr),xpath:absoluteXpath(tr)}:null,headers}; }
  function extractTables(root){return [...root.querySelectorAll('table')].slice(0,20).map(table=>({selector:bestCssSelector(table),xpath:absoluteXpath(table),headers:[...table.querySelectorAll('thead th')].map(th=>text(th.innerText)),rows:[...table.querySelectorAll('tbody tr')].slice(0,120).map(tr=>{const cells=[...tr.querySelectorAll(':scope > th,:scope > td')],first=text(cells[0]?.innerText);return cells.map((c,i)=>(i>0&&(SENSITIVE_RE.test(first)||PII_RE.test(first)))?'[REDACTED]':clip(c.innerText,600));})}));}
  function extractSectionElements(root){
    const sel='h1,h2,h3,h4,h5,h6,label,input,textarea,select,button,a[href],summary,[role="button"],[role="tab"],[role="combobox"],[role="menuitem"],[role="option"],[aria-label],table';
    return [...root.querySelectorAll(sel)].filter(x=>!x.closest(`[${UI_ATTR}]`)).slice(0,MAX_SECTION_ELEMENTS).map(x=>{const l=locatorsFor(x);return {name:semanticName(x),tag:x.tagName.toLowerCase(),kind:kindOf(x),value:sanitizedValue(x),visible:visibleInfo(x).visible,clickable:isClickable(x),attributes:attrsOf(x),preferredLocator:l.preferred,fallbackLocators:l.alternatives.slice(1,6),selector:bestCssSelector(x),xpath:l.alternatives.find(z=>z.type==='xpath'&&z.unique)?.value||absoluteXpath(x)};});
  }

  function sectionSnapshot(el){ const sec=findSection(el); if(!sec)return null; const loc=locatorsFor(sec); return {name:headingOf(sec),tag:sec.tagName.toLowerCase(),selector:bestCssSelector(sec),xpath:loc.alternatives.find(x=>x.type==='xpath'&&x.unique)?.value||absoluteXpath(sec),locators:loc,html:sanitizeHtml(sec,MAX_SECTION_HTML),text:sensitiveContext(sec)?'[REDACTED]':clip(sec.innerText,8000),elements:extractSectionElements(sec),tables:extractTables(sec)}; }

  function automationInfo(el,loc){
    const p=loc.preferred; const clickable=isClickable(el); const wait=clickable?'element_to_be_clickable':'visibility_of_element_located';
    const by=p?.type==='xpath'?'By.XPATH':'By.CSS_SELECTOR', value=p?.value||'';
    const selenium = p ? `${clickable?'element':'element'} = WebDriverWait(driver, 10).until(EC.${wait}((${by}, ${JSON.stringify(value)})))${clickable?'\nelement.click()':''}` : '';
    const ext = p ? (p.type==='css' ? `const el = document.querySelector(${JSON.stringify(value)});` : `const el = document.evaluate(${JSON.stringify(value)}, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;`) : '';
    return {clickable,waitStrategy:{attached:true,visible:visibleInfo(el).visible,clickable,scrollIntoView:true},selenium:{preferredBy:p?.type||'',preferredValue:value,python:selenium},browserExtension:{preferredBy:p?.type||'',preferredValue:value,javascript:ext},interactionHints:{href:el.closest('a[href]')?.href||'',ariaHaspopup:el.getAttribute('aria-haspopup')||'',ariaExpanded:el.getAttribute('aria-expanded')||'',ariaControls:el.getAttribute('aria-controls')||'',type:el.getAttribute('type')||'',role:el.getAttribute('role')||''}};
  }

  function frameInfo(){return {isTopFrame:window===window.top,url:location.href,title:document.title,name:window.name||'',origin:location.origin};}
  function pageInfo(){
    return {url:location.href,title:document.title,origin:location.origin,pathname:location.pathname,search:location.search,hash:location.hash,referrer:document.referrer,charset:document.characterSet,lang:document.documentElement.lang||'',dir:document.documentElement.dir||getComputedStyle(document.documentElement).direction,viewport:{width:innerWidth,height:innerHeight,devicePixelRatio},userAgent:navigator.userAgent,resources:window===window.top?{scripts:[...document.scripts].map(s=>s.src).filter(Boolean).slice(0,200),stylesheets:[...document.querySelectorAll('link[rel="stylesheet"]')].map(x=>x.href).filter(Boolean).slice(0,100),performance:[...performance.getEntriesByType('resource')].slice(-300).map(r=>({name:r.name,initiatorType:r.initiatorType,duration:Math.round(r.duration),transferSize:r.transferSize||0}))}:undefined};
  }

  function targetSnapshot(el,index){
    const loc=locatorsFor(el), sec=sectionSnapshot(el), parent=el.parentElement;
    return {
      selectionIndex:index,
      selectionId:el.getAttribute(SELECT_ATTR)||'',
      name:semanticName(el),tag:el.tagName.toLowerCase(),kind:kindOf(el),
      text:sensitiveContext(el)?'[REDACTED]':clip(el.innerText||el.textContent,2500),value:sanitizedValue(el),
      clickable:isClickable(el),attributes:attrsOf(el),dataset:{...el.dataset},aria:Object.fromEntries([...el.attributes].filter(a=>a.name.startsWith('aria-')).map(a=>[a.name,a.value])),role:el.getAttribute('role')||'',
      visibility:visibleInfo(el),computedStyle:computedStyleOf(el),matchedCssRules:matchedCssRules(el),
      html:sanitizeHtml(el,MAX_HTML),parentHtml:parent?sanitizeHtml(parent,MAX_HTML):'',
      cssSelector:bestCssSelector(el),
      xpath:loc.alternatives.find(x=>x.type==='xpath'&&x.unique)?.value || absoluteXpath(el),
      dom:{structuralCss:structuralCss(el),absoluteXpath:absoluteXpath(el),ancestorChain:domAncestorChain(el),sectionPath:sectionPath(el),shadowChain:shadowChain(el)},
      locators:loc,
      context:{label:associatedLabel(el),sectionName:sec?.name||'',rowIdentity:rowIdentity(el),form:formContext(el),table:tableContext(el),section:sec},
      frame:frameInfo(),
      automation:automationInfo(el,loc),
      stability:{preferredLocatorScore:loc.preferred?.score??0,preferredUnique:!!loc.preferred?.unique,usesAbsoluteXpath:loc.preferred?.reason==='absolute-xpath-last-resort',dynamicFrameworkClasses:[...el.classList].filter(dynamicClass),warnings:[...(loc.preferred?.score<70?['Preferred locator is relatively weak; use fallbacks/context if DOM changes.']:[]),...(loc.preferred?.reason==='absolute-xpath-last-resort'?['Absolute XPath is a last resort and may break after layout changes.']:[])]}
    };
  }

  function ensureSelectedId(el){ if(!el.hasAttribute(SELECT_ATTR))el.setAttribute(SELECT_ATTR,`csp6-${Date.now()}-${++state.uid}`); return el.getAttribute(SELECT_ATTR); }
  function clearLocalSelection(){ for(const el of state.selected)el.removeAttribute(SELECT_ATTR); state.selected.clear(); renderSelected(); notifyCount(); }
  function selectOnly(el){ clearLocalSelection(); ensureSelectedId(el); state.selected.add(el); renderSelected(); notifyCount(); }
  function toggleSelect(el){ if(state.selected.has(el)){state.selected.delete(el);el.removeAttribute(SELECT_ATTR);} else {ensureSelectedId(el);state.selected.add(el);} renderSelected();notifyCount(); }
  async function notifyCount(){ const r=await chrome.runtime.sendMessage({type:'TP6_SELECTION_CHANGED',count:state.selected.size}).catch(()=>null); if(r?.total!=null){state.totalCount=r.total;renderToolbar();} }

  function buildUi(){
    if(state.host?.isConnected)return;
    const host=document.createElement('div'); host.setAttribute(UI_ATTR,'1'); host.style.cssText='all:initial;position:fixed;inset:0;z-index:2147483647;pointer-events:none;'; document.documentElement.appendChild(host); state.host=host;
    const sh=host.attachShadow({mode:'open'});state.shadow=sh;
    sh.innerHTML=`<style>*{box-sizing:border-box}.hover{position:fixed;display:none;border:2px solid #22c55e;background:rgba(34,197,94,.07);border-radius:6px;pointer-events:none;box-shadow:0 0 0 1px rgba(15,23,42,.18)}.selectedLayer{position:fixed;inset:0;pointer-events:none}.sel{position:fixed;border:2px solid #38bdf8;background:rgba(56,189,248,.08);border-radius:6px;box-shadow:0 0 0 1px rgba(15,23,42,.22)}.tag{position:absolute;top:-22px;left:-2px;background:#0f172a;color:white;font:600 11px/18px Inter,Arial,sans-serif;padding:1px 6px;border-radius:4px;white-space:nowrap;max-width:240px;overflow:hidden;text-overflow:ellipsis}.bar{position:fixed;left:50%;bottom:18px;transform:translateX(-50%);display:flex;align-items:center;gap:12px;min-width:520px;max-width:calc(100vw - 28px);padding:10px 12px;background:#0f172a;color:#e2e8f0;border:1px solid #334155;border-radius:12px;box-shadow:0 18px 55px rgba(0,0,0,.35);font:13px/1.4 Inter,Arial,sans-serif;pointer-events:auto}.meta{min-width:0;flex:1}.info{font-weight:700;color:white;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.hint{font-size:11px;color:#94a3b8;margin-top:2px}.count{display:inline-flex;align-items:center;justify-content:center;min-width:30px;height:30px;border-radius:999px;background:#1e293b;color:#7dd3fc;font-weight:800}.extract{border:0;border-radius:9px;padding:10px 16px;background:#22c55e;color:#052e16;font-weight:800;cursor:pointer;white-space:nowrap}.extract:disabled{opacity:.45;cursor:not-allowed}.toast{position:fixed;left:50%;bottom:84px;transform:translateX(-50%);background:#111827;color:white;padding:9px 13px;border-radius:8px;font:12px Inter,Arial,sans-serif;display:none;max-width:70vw;box-shadow:0 10px 30px rgba(0,0,0,.3)}</style><div class="selectedLayer"></div><div class="hover"></div>${window===window.top?'<div class="bar"><div class="count">0</div><div class="meta"><div class="info">Hover an element, then click to select it</div><div class="hint">Click = single select · Ctrl + Click = add/remove · Alt + ↑/↓ = parent/child · Esc = exit</div></div><button class="extract" disabled>Extract Selected</button></div><div class="toast"></div>':''}`;
    state.hoverBox=sh.querySelector('.hover');state.selectedLayer=sh.querySelector('.selectedLayer');state.toolbar=sh.querySelector('.bar');state.countEl=sh.querySelector('.count');state.infoEl=sh.querySelector('.info');state.extractBtn=sh.querySelector('.extract');
    state.extractBtn?.addEventListener('click',async e=>{e.preventDefault();e.stopPropagation();state.extractBtn.disabled=true;showToast('Building complete extraction bundle…');const r=await chrome.runtime.sendMessage({type:'TP6_EXPORT_ALL'}).catch(e=>({ok:false,error:String(e)}));if(r?.ok)showToast(`Downloaded ${r.count} target${r.count===1?'':'s'}.`,'ok');else showToast(r?.error||'Export failed.','err');renderToolbar();});
  }
  function renderToolbar(){ if(window!==window.top||!state.toolbar)return; const count=state.totalCount||state.selected.size; state.countEl.textContent=String(count); state.extractBtn.disabled=count<1; const h=state.hovered; state.infoEl.textContent=h?`${semanticName(h)} · ${h.tagName.toLowerCase()}`:(count?`${count} target${count===1?'':'s'} selected`:'Hover an element, then click to select it'); }
  function renderHover(){if(!state.hoverBox)return;const el=state.hovered;if(!state.active||!el||!el.isConnected||el.closest?.(`[${UI_ATTR}]`)){state.hoverBox.style.display='none';return;}const r=el.getBoundingClientRect();Object.assign(state.hoverBox.style,{display:'block',left:`${Math.max(0,r.left)}px`,top:`${Math.max(0,r.top)}px`,width:`${Math.max(1,r.width)}px`,height:`${Math.max(1,r.height)}px`});renderToolbar();}
  function renderSelected(){if(!state.selectedLayer)return;state.selectedLayer.textContent='';let i=0;for(const el of [...state.selected]){if(!el.isConnected){state.selected.delete(el);continue;}const r=el.getBoundingClientRect();const d=document.createElement('div');d.className='sel';Object.assign(d.style,{left:`${Math.max(0,r.left)}px`,top:`${Math.max(0,r.top)}px`,width:`${Math.max(1,r.width)}px`,height:`${Math.max(1,r.height)}px`});const t=document.createElement('div');t.className='tag';t.textContent=`${++i}. ${semanticName(el)}`;d.appendChild(t);state.selectedLayer.appendChild(d);}renderToolbar();}
  let toastTimer; function showToast(msg,type=''){if(window!==window.top)return;const t=state.shadow?.querySelector('.toast');if(!t)return;clearTimeout(toastTimer);t.textContent=msg;t.style.display='block';t.style.background=type==='err'?'#991b1b':type==='ok'?'#14532d':'#111827';toastTimer=setTimeout(()=>t.style.display='none',3000);}

  function eventElement(e){const path=e.composedPath?.()||[];return path.find(n=>n instanceof Element&&!n.hasAttribute?.(UI_ATTR)&&!n.closest?.(`[${UI_ATTR}]`))||(e.target instanceof Element?e.target:null);}
  function onMove(e){if(!state.active)return;if(state.host&&e.composedPath?.().includes(state.host))return;const el=eventElement(e);if(el&&el!==state.hovered){state.hovered=el;renderHover();}}
  async function onClick(e){if(!state.active)return;if(state.host&&e.composedPath?.().includes(state.host))return;const el=eventElement(e);if(!el)return;e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();state.hovered=el;if(e.ctrlKey||e.metaKey){toggleSelect(el);}else{await chrome.runtime.sendMessage({type:'TP6_CLEAR_OTHER_FRAMES'}).catch(()=>{});selectOnly(el);}renderHover();}
  function onKey(e){if(!state.active)return;const typing=/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName||'');if(e.key==='Escape'){e.preventDefault();stop();return;}if(typing||!e.altKey||!state.hovered)return;if(e.key==='ArrowUp'){e.preventDefault();const p=state.hovered.parentElement;if(p&&p!==document.body){state.hovered=p;renderHover();}}else if(e.key==='ArrowDown'){e.preventDefault();const c=[...state.hovered.children].find(x=>visibleInfo(x).visible);if(c){state.hovered=c;renderHover();}}}
  function onViewport(){if(state.active){renderHover();renderSelected();}}

  function start(){buildUi();if(state.active){state.host.style.display='block';renderToolbar();return;}state.active=true;state.host.style.display='block';document.addEventListener('mousemove',onMove,true);document.addEventListener('click',onClick,true);document.addEventListener('keydown',onKey,true);window.addEventListener('scroll',onViewport,true);window.addEventListener('resize',onViewport,true);notifyCount();renderToolbar();if(window===window.top)showToast('Target Extractor active. Click to select; Ctrl+Click for multi-select.','ok');}
  function stop(){state.active=false;document.removeEventListener('mousemove',onMove,true);document.removeEventListener('click',onClick,true);document.removeEventListener('keydown',onKey,true);window.removeEventListener('scroll',onViewport,true);window.removeEventListener('resize',onViewport,true);if(state.host)state.host.style.display='none';}
  function clearSelection(){clearLocalSelection();}
  function exportSelected(){ const targets=[...state.selected].filter(x=>x.isConnected).map((el,i)=>targetSnapshot(el,i+1)); return {page:pageInfo(),frame:frameInfo(),targets}; }

  chrome.runtime.onMessage.addListener((msg,sender,sendResponse)=>{if(msg?.type==='TP6_TOTAL_COUNT'){state.totalCount=Number(msg.count||0);renderToolbar();sendResponse({ok:true});}else if(msg?.type==='TP6_CLEAR_SELECTION'){clearSelection();sendResponse({ok:true});}});
  window.__CSP_TARGET_EXTRACTOR_V6__={version:VERSION,start,stop,clearSelection,exportSelected,state};
  start();
})();
