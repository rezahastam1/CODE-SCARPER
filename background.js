/**
 * CODE SCARPER TARGET EXTRACTOR v6.0.0
 * توسعه‌دهنده: Reza Zarnegar
 *
 * این فایل Service Worker اصلی افزونه است.
 * وظایف آن شامل اجرای Picker در تمام Frameها، نگهداری تعداد انتخاب‌ها،
 * ساخت Bundle نهایی و دانلود خروجی JSON از طریق Offscreen Document است.
 */

const VERSION = '6.0.0';
const blobUrls = new Map();
const frameCounts = new Map();

function cleanText(v){ return String(v ?? '').replace(/\s+/g,' ').trim(); }
function safePart(v, fallback='item') {
  const s = cleanText(v).replace(/[\\/:*?"<>|\u0000-\u001f]/g,'-').replace(/\.+$/g,'').trim();
  return (s || fallback).slice(0,120);
}
function hostOf(url){ try { return safePart(new URL(url).hostname,'site'); } catch { return 'site'; } }
function pageSlug(url){
  try {
    const u = new URL(url); const p = u.pathname.replace(/^\/+|\/+$/g,'').replace(/\//g,'-') || 'home';
    const q = u.searchParams.toString(); return safePart(p + (q ? '-' + q : ''), 'page').slice(0,160);
  } catch { return 'page'; }
}
function stamp(){ return new Date().toISOString().replace(/[-:]/g,'').replace(/\.\d{3}Z$/,'Z').replace('T','-'); }

async function ensureOffscreen(){
  const url = chrome.runtime.getURL('offscreen.html');
  if (chrome.runtime.getContexts) {
    const c = await chrome.runtime.getContexts({contextTypes:['OFFSCREEN_DOCUMENT'], documentUrls:[url]});
    if (c.length) return;
  }
  try { await chrome.offscreen.createDocument({url:'offscreen.html', reasons:['BLOBS'], justification:'Create JSON downloads for extracted automation targets.'}); }
  catch(e){ if (!String(e?.message||e).includes('Only a single offscreen')) throw e; }
}
async function downloadJson(data, filename){
  await ensureOffscreen();
  const made = await chrome.runtime.sendMessage({target:'offscreen', type:'MAKE_JSON_BLOB_URL', text:JSON.stringify(data,null,2)});
  if (!made?.ok) throw new Error(made?.error || 'Could not create download blob.');
  const id = await chrome.downloads.download({url:made.url, filename, conflictAction:'uniquify', saveAs:false});
  blobUrls.set(id,made.url); return id;
}
chrome.downloads.onChanged.addListener(delta => {
  if (!delta.id || !delta.state || !['complete','interrupted'].includes(delta.state.current)) return;
  const url = blobUrls.get(delta.id); if (!url) return;
  blobUrls.delete(delta.id);
  chrome.runtime.sendMessage({target:'offscreen',type:'REVOKE_BLOB_URL',url}).catch(()=>{});
});

async function startPicker(tab){
  if (!tab?.id || !/^https?:/i.test(tab.url || '')) throw new Error('Open a normal HTTP/HTTPS page first.');
  frameCounts.set(tab.id,new Map());
  await chrome.scripting.executeScript({target:{tabId:tab.id,allFrames:true},files:['picker.js']});
  await chrome.action.setBadgeBackgroundColor({tabId:tab.id,color:'#0f172a'});
  await chrome.action.setBadgeText({tabId:tab.id,text:'0'});
}

chrome.action.onClicked.addListener(tab => startPicker(tab).catch(async e => {
  if (tab?.id) { await chrome.action.setBadgeBackgroundColor({tabId:tab.id,color:'#b91c1c'}); await chrome.action.setBadgeText({tabId:tab.id,text:'!'}); }
}));

chrome.tabs.onRemoved.addListener(tabId => frameCounts.delete(tabId));

chrome.runtime.onMessage.addListener((msg,sender,sendResponse) => {
  (async()=>{
    if (msg?.type === 'TP6_SELECTION_CHANGED') {
      const tabId = sender.tab?.id; if (tabId == null) return {ok:false};
      let m = frameCounts.get(tabId); if (!m) { m = new Map(); frameCounts.set(tabId,m); }
      m.set(sender.frameId ?? 0, Number(msg.count || 0));
      const total = [...m.values()].reduce((a,b)=>a+b,0);
      await chrome.action.setBadgeText({tabId,text:total ? String(Math.min(total,99)) : '0'});
      try { await chrome.tabs.sendMessage(tabId,{type:'TP6_TOTAL_COUNT',count:total},{frameId:0}); } catch(_) {}
      return {ok:true,total};
    }
    if (msg?.type === 'TP6_CLEAR_OTHER_FRAMES') {
      const tabId = sender.tab?.id; if (tabId == null) return {ok:false};
      const current = sender.frameId ?? 0;
      const m = frameCounts.get(tabId) || new Map();
      for (const frameId of [...m.keys()]) {
        if (frameId === current) continue;
        try { await chrome.tabs.sendMessage(tabId,{type:'TP6_CLEAR_SELECTION'},{frameId}); } catch(_) {}
        m.set(frameId,0);
      }
      frameCounts.set(tabId,m);
      return {ok:true};
    }
    if (msg?.type === 'TP6_EXPORT_ALL') {
      const tabId = sender.tab?.id; if (tabId == null) throw new Error('Active tab not found.');
      const results = await chrome.scripting.executeScript({
        target:{tabId,allFrames:true},
        func:()=>window.__CSP_TARGET_EXTRACTOR_V6__?.exportSelected?.() || null
      });
      const allFragments = results.map(r=>r.result).filter(r=>r && Array.isArray(r.targets));
      const fragments = allFragments.filter(r=>r.targets.length);
      const targets = fragments.flatMap(f=>f.targets);
      if (!targets.length) throw new Error('No targets selected. Click an element, or Ctrl+Click multiple elements first.');
      const top = allFragments.find(f=>f.frame?.isTopFrame) || fragments[0];
      const page = top?.page || fragments[0].page;
      const bundle = {
        format:'CODE-SCARPER-TARGET-EXTRACT-BUNDLE', version:VERSION,
        exportedAt:new Date().toISOString(),
        purpose:'Complete manually-selected automation targets for Selenium/ChromeDriver/browser-extension implementation.',
        page,
        selection:{count:targets.length,multi:targets.length>1},
        targets,
        frames:fragments.map(f=>({frame:f.frame,selectedCount:f.targets.length})),
        usageNotes:{
          locatorPolicy:'Prefer the highest-scored unique semantic locator. Keep ranked fallbacks. Avoid dynamic framework classes and absolute XPath unless no better locator exists.',
          selenium:'Use target.automation.selenium and target.locators. For iframes/shadow DOM, follow target.frame and target.locators.shadowChain first.',
          extension:'Use target.automation.browserExtension and target.locators. Re-resolve elements at runtime; do not cache DOM nodes across re-renders.'
        }
      };
      const oneName = targets.length===1 ? safePart(targets[0].name,'target') : `MULTI-${targets.length}`;
      const filename = `CODE-SCARPER-TARGET-EXTRACTOR/${hostOf(page.url)}/${pageSlug(page.url)}/EXTRACT-${oneName}-${stamp()}.json`;
      const downloadId = await downloadJson(bundle,filename);
      return {ok:true,filename,downloadId,count:targets.length};
    }
    return undefined;
  })().then(r=>sendResponse(r)).catch(e=>sendResponse({ok:false,error:e?.message||String(e)}));
  return true;
});
