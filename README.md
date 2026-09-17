# CODE SCARPER TARGET EXTRACTOR v6.0.0

افزونه‌ای برای انتخاب دستی المان‌های مهم صفحه و استخراج اطلاعات لازم برای ساخت اتوماسیون با **Selenium / ChromeDriver** و توسعه **Chrome Extension**.

## توسعه‌دهنده

**Reza Zarnegar**

## کاربرد افزونه

این ابزار روی صفحه وب فعال می‌شود و اجازه می‌دهد یک یا چند المان DOM را انتخاب کنید. سپس برای Targetهای انتخاب‌شده یک فایل JSON کامل شامل Locatorها، اطلاعات DOM، Context و نمونه‌های آماده برای اتوماسیون تولید می‌کند.

## روش استفاده

1. یک صفحه معمولی `HTTP/HTTPS` را باز کنید.
2. روی آیکون افزونه کلیک کنید؛ Picker مستقیماً فعال می‌شود و Popup جداگانه‌ای ندارد.
3. با بردن ماوس روی المان‌ها، Target فعلی Highlight می‌شود.
4. با **Click** فقط همان المان انتخاب می‌شود.
5. با **Ctrl + Click** می‌توانید چند Target را اضافه یا حذف کنید.
6. از نوار پایین صفحه روی **Extract Selected** بزنید.
7. یک فایل JSON شامل اطلاعات تمام Targetهای انتخاب‌شده دانلود می‌شود.

### میانبرهای صفحه‌کلید

- `Alt + ↑` : رفتن به المان والد
- `Alt + ↓` : رفتن به اولین فرزند قابل مشاهده
- `Esc` : خروج از حالت Picker

## اطلاعاتی که برای هر Target استخراج می‌شود

- URL، عنوان صفحه، Origin، Path، Query و Hash
- اطلاعات Frame / Iframe
- نام، Tag، Kind، متن و Value المان
- Attributeها، Dataset و ARIA
- HTML پاک‌سازی‌شده Target و Parent
- CSS Selector و XPath
- Locatorهای رتبه‌بندی‌شده بر اساس پایداری و یکتا بودن
- Locatorهای معنایی بر پایه `id`، `data-testid`، `name`، `aria-label`، متن، Row، Section و Heading
- مسیر DOM، Ancestor Chain و Section Path
- Shadow DOM Host Chain
- Visibility، ابعاد المان، Computed Style و CSS Ruleهای Match‌شده
- Context مربوط به Form، Table و Row
- Snapshot نزدیک‌ترین Section به همراه کنترل‌ها و جدول‌های مهم
- Blueprint آماده برای Selenium و JavaScript افزونه مرورگر
- هشدار در صورت ضعیف بودن Locator یا استفاده از Absolute XPath

## انتخاب چندگانه

اگر چند Target را با `Ctrl + Click` انتخاب کنید، همه آن‌ها در یک Bundle ذخیره می‌شوند. هر Target Locator، Context و اطلاعات مستقل خودش را دارد.

## حریم خصوصی

قبل از Export، مقادیر حساس رایج تا حد امکان پاک‌سازی می‌شوند؛ از جمله:

- Password / Passcode
- Token و API Key
- Cookie و Authorization
- ایمیل و شماره موبایل
- کد ملی
- شماره کارت
- IBAN / شبا
- IP

مقادیر حساس با عبارت‌هایی مانند `[REDACTED]` جایگزین می‌شوند.

## محدودیت‌های مرورگر

صفحات محافظت‌شده مانند `chrome://` و Chrome Web Store قابل تزریق و بررسی نیستند. محتوای Closed Shadow DOM قابل پیمایش نیست و عناصر رسم‌شده داخل Canvas نیز DOM Element محسوب نمی‌شوند.

## فایل‌های اصلی پروژه

- `manifest.json` تنظیمات افزونه
- `background.js` مدیریت اجرای Picker، Frameها و دانلود JSON
- `picker.js` رابط انتخاب Target و موتور استخراج Locator/Context
- `offscreen.html` سند Offscreen موردنیاز برای ساخت Blob دانلود
- `offscreen.js` ساخت و آزادسازی Blob URL
- `logo.png` آیکون اصلی افزونه در روت پروژه

---

**Developer: Reza Zarnegar**
