// i18n: two-language support (fa / en).
//
// Usage in a page:
//   import { initI18n, t } from '../lib/i18n.js';
//   await initI18n();          // fills data-i18n elements, sets html dir/lang
//   someEl.textContent = t('noTasks');
//
// When the user changes language in settings the page reloads automatically
// because each page listens to chrome.storage.onChanged.

const LANG_KEY = 'lang';
export const LANGS = { FA: 'fa', EN: 'en' };

// All user-visible strings in one place.
const STRINGS = {
  fa: {
    dir: 'rtl',
    // popup
    appName: 'ردیاب زمان',
    openDashboard: 'باز کردن داشبورد',
    weekLabel: (w, y) => `هفته ${w} / ${y}`,
    deviceLine: (p) => `دستگاه: ${p}`,
    newTaskPlaceholder: 'نام تسک جدید…',
    addTask: '+ تسک',
    noTasks: 'هنوز تسکی نساخته‌اید.\nاز فرم پایین شروع کنید.',
    // side panel
    tabTasks: 'تسک‌ها',
    tabReport: 'گزارش',
    settingsBtn: 'تنظیمات',
    filterTitle: 'فیلتر تاریخ',
    thisWeek: 'این هفته',
    lastWeek: 'هفته گذشته',
    last30: '۳۰ روز اخیر',
    fromLabel: 'از',
    toLabel: 'تا',
    applyFilter: 'اعمال',
    reportTitle: 'گزارش',
    totalLabel: (d) => `کل: ${d}`,
    noReport: 'برای این بازه گزارشی وجود ندارد.',
    textOutput: 'خروجی متنی',
    noRangeData: '— داده‌ای برای این بازه نیست —',
    copyBtn: 'کپی',
    copied: 'کپی شد!',
    downloadBtn: 'دانلود',
    // tasks (shared renderer)
    newSubtaskPlaceholder: 'نام ساب‌تسک…',
    editTitleHint: 'کلیک برای ویرایش نام',
    startTimerTitle: 'شروع',
    stopTimerTitle: 'توقف',
    addSubtaskTitle: 'ساب‌تسک جدید',
    saveTitle: 'ذخیره',
    cancelTitle: 'لغو',
    deleteTask: 'حذف تسک',
    deleteSubtask: 'حذف ساب‌تسک',
    confirmDelete: 'حذف شود؟',
    yes: 'بله',
    no: 'خیر',
    addDescription: 'افزودن توضیحات',
    descriptionPlaceholder: 'توضیحات اختیاری...',
    noRange: 'بدون بازه کامل',
    // options
    settingsTitle: 'تنظیمات',
    deviceSection: 'دستگاه',
    deviceIdLabel: 'شناسه',
    deviceLabelLabel: 'نام دلخواه دستگاه',
    deviceLabelPlaceholder: 'Laptop-Ali',
    filePreviewLabel: 'نام فایل هفته جاری',
    saveLabelBtn: 'ذخیره',
    cloudSection: 'اتصال به کلاد',
    providerLabel: 'محل ذخیره‌سازی',
    providerLocal: 'محلی (بدون نیاز به تنظیم)',
    providerOneDrive: 'OneDrive',
    clientIdLabel: 'شناسه کلاینت (Client ID)',
    redirectUriLabel: 'Redirect URI — در Azure ثبت کنید:',
    saveProviderBtn: 'ذخیره تنظیمات',
    connectBtn: 'اتصال به OneDrive',
    disconnectBtn: 'قطع اتصال',
    statusConnected: 'متصل',
    statusLocal: 'محلی',
    statusOffline: 'قطع',
    langSection: 'زبان',
    langLabel: 'زبان رابط کاربری',
    langFa: 'فارسی',
    langEn: 'English',
    msgLabelSaved: 'نام دستگاه ذخیره شد.',
    msgCloudSaved: 'تنظیمات کلاد ذخیره شد.',
    msgConnecting: 'در حال اتصال...',
    msgConnected: 'با موفقیت متصل شد.',
    msgDisconnected: 'اتصال قطع شد.',
    msgLangSaved: 'زبان تغییر کرد.',
  },
  en: {
    dir: 'ltr',
    appName: 'Time Tracker',
    openDashboard: 'Open Dashboard',
    weekLabel: (w, y) => `Week ${w} / ${y}`,
    deviceLine: (p) => `Device: ${p}`,
    newTaskPlaceholder: 'New task name…',
    addTask: '+ Task',
    noTasks: 'No tasks yet.\nUse the form below to get started.',
    tabTasks: 'Tasks',
    tabReport: 'Report',
    settingsBtn: 'Settings',
    filterTitle: 'Date Filter',
    thisWeek: 'This Week',
    lastWeek: 'Last Week',
    last30: 'Last 30 Days',
    fromLabel: 'From',
    toLabel: 'To',
    applyFilter: 'Apply',
    reportTitle: 'Report',
    totalLabel: (d) => `Total: ${d}`,
    noReport: 'No data for this date range.',
    textOutput: 'Text Export',
    noRangeData: '— No data for this range —',
    copyBtn: 'Copy',
    copied: 'Copied!',
    downloadBtn: 'Download',
    newSubtaskPlaceholder: 'New subtask name…',
    editTitleHint: 'Click to rename',
    startTimerTitle: 'Start',
    stopTimerTitle: 'Stop',
    addSubtaskTitle: 'New subtask',
    saveTitle: 'Save',
    cancelTitle: 'Cancel',
    deleteTask: 'Delete Task',
    deleteSubtask: 'Delete Subtask',
    confirmDelete: 'Delete?',
    yes: 'Yes',
    no: 'No',
    addDescription: 'Add description',
    descriptionPlaceholder: 'Optional description…',
    noRange: 'No complete range',
    settingsTitle: 'Settings',
    deviceSection: 'Device',
    deviceIdLabel: 'ID',
    deviceLabelLabel: 'Custom device name',
    deviceLabelPlaceholder: 'Laptop-Ali',
    filePreviewLabel: 'Current week file',
    saveLabelBtn: 'Save',
    cloudSection: 'Cloud Connection',
    providerLabel: 'Storage',
    providerLocal: 'Local (no setup required)',
    providerOneDrive: 'OneDrive',
    clientIdLabel: 'Client ID (Azure)',
    redirectUriLabel: 'Redirect URI — register in Azure:',
    saveProviderBtn: 'Save Settings',
    connectBtn: 'Connect to OneDrive',
    disconnectBtn: 'Disconnect',
    statusConnected: 'Connected',
    statusLocal: 'Local',
    statusOffline: 'Disconnected',
    langSection: 'Language',
    langLabel: 'Interface language',
    langFa: 'فارسی',
    langEn: 'English',
    msgLabelSaved: 'Device name saved.',
    msgCloudSaved: 'Cloud settings saved.',
    msgConnecting: 'Connecting…',
    msgConnected: 'Connected successfully.',
    msgDisconnected: 'Disconnected.',
    msgLangSaved: 'Language updated.',
  },
};

// Cached strings for the current page load. Set by initI18n().
let _s = STRINGS.fa;

export async function getLang() {
  const { [LANG_KEY]: lang } = await chrome.storage.local.get(LANG_KEY);
  return lang || LANGS.FA;
}

export async function setLang(lang) {
  await chrome.storage.local.set({ [LANG_KEY]: lang });
  // Storage change event fires on all open pages → they reload themselves.
}

/** Returns the cached string for key (or the key itself as fallback). */
export function t(key) {
  const v = _s[key];
  return typeof v === 'string' ? v : key;
}

/** Returns the full cached strings object (for template functions like weekLabel). */
export function s() {
  return _s;
}

/**
 * Call once per page before rendering. Sets html[dir/lang], fills
 * [data-i18n] elements, returns the strings object.
 */
export async function initI18n() {
  const lang = await getLang();
  _s = STRINGS[lang] || STRINGS.fa;
  const html = document.documentElement;
  html.setAttribute('dir', _s.dir);
  html.setAttribute('lang', lang);

  // Fill static text nodes.
  document.querySelectorAll('[data-i18n]').forEach((el) => {
    const key = el.dataset.i18n;
    const val = _s[key];
    if (typeof val === 'string') el.textContent = val;
  });
  // Fill placeholder attributes.
  document.querySelectorAll('[data-i18n-ph]').forEach((el) => {
    const val = _s[el.dataset.i18nPh];
    if (typeof val === 'string') el.placeholder = val;
  });
  // Fill title attributes.
  document.querySelectorAll('[data-i18n-title]').forEach((el) => {
    const val = _s[el.dataset.i18nTitle];
    if (typeof val === 'string') el.title = val;
  });

  return _s;
}

/** Wire up automatic reload when lang changes. Call once per page. */
export function watchLang() {
  if (typeof chrome === 'undefined' || !chrome.storage) return;
  chrome.storage.onChanged.addListener((changes) => {
    if (changes[LANG_KEY]) window.location.reload();
  });
}
