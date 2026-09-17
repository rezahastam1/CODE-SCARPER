/**
 * CODE SCARPER TARGET EXTRACTOR v6.0.0
 * توسعه‌دهنده: Reza Zarnegar
 *
 * این فایل در Offscreen Document اجرا می‌شود و Blob URL لازم برای
 * دانلود فایل JSON را می‌سازد و پس از پایان دانلود آن را آزاد می‌کند.
 */

const urls = new Set();
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.target !== 'offscreen') return;
  if (msg.type === 'MAKE_JSON_BLOB_URL') {
    try {
      const blob = new Blob([msg.text || ''], {type:'application/json;charset=utf-8'});
      const url = URL.createObjectURL(blob); urls.add(url);
      sendResponse({ok:true, url});
    } catch (e) { sendResponse({ok:false, error:e?.message || String(e)}); }
    return;
  }
  if (msg.type === 'REVOKE_BLOB_URL') {
    try { if (urls.has(msg.url)) { URL.revokeObjectURL(msg.url); urls.delete(msg.url); } } catch (_) {}
    sendResponse({ok:true});
  }
});
