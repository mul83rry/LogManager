# ردیاب زمان و لاگ — Edge Time Tracker (v4.0)

اکستنشن مرورگر Microsoft Edge برای پیگیری زمان کار روی پروژه‌ها، با معماری
**Sharded Cloud File**: داده‌ها به‌صورت فایل‌های JSON هفتگی و مجزا برای هر دستگاه
روی فضای ابری کاربر (OneDrive) ذخیره می‌شوند تا تداخل داده در استفاده هم‌زمان از
چند دستگاه به‌طور کامل از بین برود.

> فرمت نام فایل: `[DeviceID]_W[WeekNumber]_Y[Year].json`
> مثال: `a1b2c3d4_W02_Y1403.json` یا `Laptop-Ali_W02_Y1403.json`

---

## نصب و اجرا (Load Unpacked)

1. مخزن را clone کنید. (آیکن‌ها از قبل ساخته شده‌اند؛ برای ساخت دوباره:
   `npm run icons`.)
2. در Edge به `edge://extensions` بروید و **Developer mode** را روشن کنید.
3. روی **Load unpacked** بزنید و پوشه‌ی ریشه‌ی پروژه را انتخاب کنید.
4. آیکن اکستنشن را به نوار ابزار سنجاق کنید. کلیک روی آیکن، **Popup** و
   کلیک (در مرورگرهای پشتیبان) **Side Panel** را باز می‌کند.

اکستنشن بلافاصله و بدون هیچ تنظیماتی کار می‌کند: به‌صورت پیش‌فرض از محل ذخیره‌سازی
**محلی** (شبیه‌ساز کلاد روی `chrome.storage.local`) استفاده می‌شود. برای سینک واقعی
چند‌دستگاهی، در تنظیمات OneDrive را فعال کنید (پایین‌تر).

---

## رابط کاربری

- **Popup** (`src/popup/`): دسترسی سریع — فقط فایل هفته‌ی جاریِ همین دستگاه را
  می‌خواند، تایمرهای فعال را با زمان زنده نشان می‌دهد، و امکان ساخت تسک/ساب‌تسک و
  شروع/توقف تایمر را می‌دهد.
- **Side Panel / داشبورد** (`src/sidepanel/`): فیلتر تاریخ (این هفته / هفته گذشته /
  ۳۰ روز اخیر / بازه دلخواه)، گزارش جامع چند‌دستگاهی، و خروجی متنی قابل کپی/دانلود.
- **تنظیمات** (`src/options/`): نام دلخواه دستگاه، انتخاب محل ذخیره‌سازی و اتصال به
  OneDrive.

---

## اتصال به OneDrive

ذخیره‌سازی روی OneDrive از Microsoft Graph و فولدر اختصاصی برنامه
(`/Apps/EdgeTimeTracker/`) استفاده می‌کند. احراز هویت با جریان
Authorization-Code + PKCE (بدون client secret) انجام می‌شود.

1. در [Azure Portal](https://portal.azure.com) یک **App registration** بسازید.
2. در بخش **Authentication** یک Redirect URI از نوع **SPA** اضافه کنید. مقدار آن
   در صفحه‌ی تنظیمات اکستنشن نمایش داده می‌شود (خروجی
   `chrome.identity.getRedirectURL()`).
3. مجوزِ Delegated زیر را اضافه کنید: `Files.ReadWrite.AppFolder`.
4. **Client ID** را کپی و در تنظیمات اکستنشن وارد کنید، سپس **OneDrive** را به‌عنوان
   محل ذخیره‌سازی انتخاب و **اتصال** را بزنید.

---

## معماری

```
manifest.json                 ← تعریف اکستنشن MV3
src/
  background/service-worker.js ← موتور تایمر، rollover هفتگی، روتر پیام‌ها
  lib/
    jalali.js                  ← تقویم جلالی + شماره‌ی هفته (مبنا: شنبه)
    model.js                   ← ساختار فایل/تسک/ساب‌تسک/لاگ (خالص)
    aggregate.js               ← ادغام چند‌فایلی + جفت‌سازی start/stop (خالص)
    format.js                  ← قالب‌بندی تاریخ/مدت + خروجی متنی (خالص)
    device.js                  ← شناسه‌ی دستگاه و نام دلخواه
    repository.js              ← لایه‌ی Sharded: نام‌گذاری فایل، خواندن/نوشتن، گزارش
    cloud/
      provider.js              ← انتخاب provider بر اساس تنظیمات
      local-provider.js        ← شبیه‌ساز کلاد روی chrome.storage (پیش‌فرض)
      onedrive-provider.js     ← Microsoft Graph + PKCE
  popup/  sidepanel/  options/ ← صفحات UI (فارسی، RTL)
  ui/                          ← helperهای مشترک UI
scripts/generate-icons.mjs     ← سازنده‌ی آیکن PNG (بدون وابستگی)
test/                          ← تست‌های واحد و یکپارچه (node:test)
```

لایه‌ی **Provider** تنها بخشی است که با کلاد سروکار دارد؛ بقیه‌ی کد فقط با مفهوم
«پوشه‌ای از فایل‌های JSON نام‌دار» کار می‌کند. به همین دلیل تعویض محل ذخیره‌سازی
(محلی ↔ OneDrive) هیچ تغییری در منطق بالادست ایجاد نمی‌کند.

### مدل داده (محتوای هر فایل هفتگی)

```json
{
  "device_id": "a1b2c3d4",
  "week_number": 2,
  "year": 1403,
  "last_updated": "2024-10-25T14:30:00Z",
  "tasks": [
    {
      "id": "t1",
      "title": "توسعه فرانت‌اند",
      "subtasks": [
        {
          "id": "s1",
          "title": "کد زدن هدر",
          "logs": [
            { "type": "system_start", "timestamp": "2024-10-25T14:30:00Z", "duration_seconds": 0 },
            { "type": "system_stop",  "timestamp": "2024-10-25T15:00:00Z", "duration_seconds": 1800 }
          ]
        }
      ]
    }
  ]
}
```

---

## نگاشت نیازمندی‌های PRD به کد

| نیازمندی | پیاده‌سازی |
| --- | --- |
| §۲ شناسه‌ی دستگاه با `crypto.randomUUID()` | `src/lib/device.js` |
| §۲ فرمت نام فایل `[ID]_W..._Y...` | `weekFileName` در `src/lib/jalali.js` |
| §۳.۱ ایجاد خودکار فایل هفته‌ی جدید | `ensureCurrentWeekFile` + آلارم `rollover` در service worker |
| §۳.۱ خواندن هوشمند (فقط فایل‌های بازه) | `getReportForWeeks` / `weeksBetween` در `repository.js` |
| §۳.۲ تسک/ساب‌تسک و توارث زمان | `repository.js` + `aggregateReport` (بازه‌ی تسک از ساب‌تسک‌ها) |
| §۳.۲ تایمر در پس‌زمینه | `service-worker.js` (`startTimer`/`stopTimer`) |
| §۳.۳ لاگ خودکار start/stop با مدت | `appendLog` + نوع لاگ‌های `system_start`/`system_stop` |
| §۳.۴ فیلتر تاریخ و خروجی متنی | `sidepanel/` + `buildTextExport` در `format.js` |
| §۴.۱ بدون تداخل (فایل اختصاصی هر دستگاه) | prefix دستگاه در نام فایل |
| §۴.۲ ادغام چند‌دستگاهی + مرتب‌سازی بر اساس timestamp | `mergeWeekFiles` در `aggregate.js` |
| §۴.۳ تغییر نام در اواسط هفته | `renameTask` (در فایل هفته‌ی جاری اعمال می‌شود) |
| §۴.۴ عبور تایمر از مرز هفته | `appendLog` بر اساس timestamp فایل مقصد را انتخاب می‌کند |

---

## تست

```bash
npm test        # اجرای کل تست‌ها (node:test، بدون وابستگی)
```

تست‌ها شامل تبدیل تقویم جلالی و شماره‌ی هفته، ادغام چند‌دستگاهی، عبور از مرز هفته،
تغییر نام در اواسط هفته، و یک سناریوی end-to-end از طریق provider محلی هستند.
این موارد دقیقاً سناریوهای تست §۷ سند PRD را پوشش می‌دهند.
