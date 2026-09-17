# CODE SCARPER TARGET EXTRACTOR v6.0.0

A focused manual target extractor for building reliable Selenium/ChromeDriver automations and browser extensions.

## UX
1. Open any normal HTTP/HTTPS page.
2. Click the extension icon. The picker starts immediately; there is no popup.
3. Hover any DOM element to inspect it.
4. Click an element to select only that target.
5. Hold **Ctrl** (or Command on macOS) and click to add/remove multiple targets.
6. Click the single **Extract Selected** button in the bottom toolbar.
7. One JSON bundle is downloaded containing every selected target and its automation metadata.

Keyboard:
- `Alt + Up`: move hover target to parent.
- `Alt + Down`: move hover target to first visible child.
- `Esc`: exit picker mode.

## What is exported for every target
- Page URL/title/origin/path/query/hash and frame context.
- Target name, tag, kind, text/value, attributes, dataset and ARIA.
- Full sanitized target HTML and parent HTML.
- Structural CSS path, absolute XPath, ancestor chain and section path.
- Ranked locators with score, uniqueness and reason.
- Semantic locator strategies using stable id/data-testid/name/aria, visible text, table row identity, section heading and unique descendant anchors.
- Shadow DOM host chain and iframe/frame metadata.
- Visibility, rectangle, computed CSS and matched CSS rules.
- Nearest section snapshot including section HTML, tables and important descendant controls/fields with their own locators.
- Form context and table/row context.
- Selenium wait/click/read blueprint and browser-extension JavaScript locator blueprint.
- Stability warnings when a locator is weak or falls back to absolute XPath.

## Multi-select output
All Ctrl-selected targets are exported into one bundle. Each item has its own locator/context. A single selected target uses its semantic name in the downloaded filename; multiple targets use `MULTI-N`.

## Privacy
The exporter sanitizes common secrets and PII from values/HTML, including passwords, auth tokens, API keys, cookies, mobile/phone, email, national identifiers, card numbers, IBAN/Sheba and IP addresses.

## Browser limitations
Protected browser pages (`chrome://`, Chrome Web Store, etc.) cannot be inspected. Closed Shadow DOM cannot be traversed. Canvas-rendered internals are not DOM elements. Cross-origin iframe targets are extracted frame-by-frame through Chrome extension injection where Chrome allows access.


## Developer

**Reza Zarnegar**
