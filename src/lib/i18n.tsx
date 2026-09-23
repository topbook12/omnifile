'use client'

/**
 * Lightweight i18n — Bengali (default) + English.
 * t(key) → string (falls back to the key itself if missing)
 * tf(key, {n: 5}) → interpolates {n} placeholders.
 */
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'

export type Lang = 'bn' | 'en'

const STORAGE_KEY = 'omnifile-lang'

const en: Record<string, string> = {
  appName: 'OmniFile',
  tagline: 'All-in-One File Viewer & Editor',

  // Header / common actions
  openFiles: 'Open files',
  search: 'Search',
  searchPlaceholder: 'Search files by name…',
  install: 'Install app',
  installTitle: 'Install OmniFile',
  installDesc: 'Install this app on your device to use it full-screen and offline.',
  installIos: 'On iPhone/iPad: tap the Share button, then choose “Add to Home Screen”.',
  installSteps:
    'Chrome/Edge (Android & desktop): use the Install button or the ⋮ menu → “Install app”.',
  installed: 'Installed',
  cancel: 'Cancel',
  delete: 'Delete',
  rename: 'Rename',
  open: 'Open',
  download: 'Download',
  back: 'Back',
  save: 'Save',
  close: 'Close',
  reset: 'Reset',
  apply: 'Apply',
  done: 'Done',
  loading: 'Loading…',

  // Library
  dropHere: 'Drop files here or tap to open',
  dropHint: 'Everything stays on your device — nothing is uploaded.',
  supportedFormats: 'PDF • Word • Excel • CSV • Images • Text • Video • Audio',
  myFiles: 'My files',
  filesCount: '{n} file(s)',
  noFilesYet: 'No files yet',
  noFilesHint: 'Open a file above or drag & drop it here to get started.',
  noResults: 'Nothing found',
  noResultsHint: 'Try a different name or search term.',
  filterAll: 'All',
  filterPdf: 'PDF',
  filterImage: 'Images',
  filterText: 'Text',
  filterSheets: 'Sheets',
  filterDocs: 'Docs',
  filterMedia: 'Media',
  storageUsed: '{used} of {quota} used',

  // File kinds
  kindPdf: 'PDF',
  kindImage: 'Image',
  kindText: 'Text',
  kindMarkdown: 'Markdown',
  kindCsv: 'CSV',
  kindExcel: 'Spreadsheet',
  kindDocs: 'Document',
  kindVideo: 'Video',
  kindAudio: 'Audio',
  kindOther: 'File',

  // Dialogs
  deleteConfirmTitle: 'Delete this file?',
  deleteConfirmDesc: '“{name}” will be permanently removed from this device. This cannot be undone.',
  renameTitle: 'Rename file',
  namePlaceholder: 'File name',

  // Viewer common
  unsupportedTitle: 'This file type is not supported yet',
  unsupportedDesc:
    '“{ext}” files cannot be opened or edited here yet. You can still download or delete the file.',
  noPreview: 'No preview available',
  dirtyIndicator: 'Unsaved changes',
  dirtyCloseTitle: 'Unsaved changes',
  dirtyCloseDesc: 'You have unsaved edits. Leave anyway?',
  dirtyCloseLeave: 'Discard & leave',
  dirtyCloseStay: 'Keep editing',
  readOnly: 'Read-only',

  // PDF
  pdfPage: 'Page {page} of {total}',
  pdfPrev: 'Previous page',
  pdfNext: 'Next page',
  pdfZoomIn: 'Zoom in',
  pdfZoomOut: 'Zoom out',
  pdfFit: 'Fit width',
  pdfHint: 'Swipe left/right to change pages',

  // Text / Markdown editor
  editTab: 'Edit',
  previewTab: 'Preview',
  chars: '{n} characters',
  lines: '{n} lines',

  // Image editor
  imgRotateLeft: 'Rotate left',
  imgRotateRight: 'Rotate right',
  imgFlipH: 'Flip horizontal',
  imgFlipV: 'Flip vertical',
  imgCrop: 'Crop',
  imgCropHint: 'Drag on the image to select an area',
  imgCropApply: 'Crop',
  imgResize: 'Resize',
  imgResizeTitle: 'Resize image',
  imgWidth: 'Width',
  imgHeight: 'Height',
  imgKeepAspect: 'Keep aspect ratio',
  imgFilters: 'Filters',
  imgBrightness: 'Brightness',
  imgContrast: 'Contrast',
  imgSaturation: 'Saturation',
  imgGrayscale: 'Grayscale',
  imgSepia: 'Sepia',
  imgBlur: 'Blur',
  imgPresets: 'Presets',
  imgPresetNone: 'Original',
  imgPresetBW: 'Mono',
  imgPresetSepia: 'Vintage',
  imgPresetVivid: 'Vivid',
  imgPresetCool: 'Cool',
  imgPresetWarm: 'Warm',
  imgUndo: 'Undo',
  imgProcessing: 'Processing…',

  // Sheets
  csvSheets: 'Sheets',
  csvAddRow: 'Add row',
  csvAddCol: 'Add column',
  csvDelRow: 'Delete row',
  csvDelCol: 'Delete column',
  csvRows: '{n} rows',
  csvCols: '{n} columns',
  csvLoadMore: 'Load {n} more rows',
  csvEditHint: 'Tap any cell to edit',

  // DOCX / Media
  docxNote: 'Documents open in read-only view',
  mediaHint: 'Media player',

  // Toasts & errors
  tFilesAdded: '{n} file(s) added',
  tFileDeleted: 'File deleted',
  tRenamed: 'File renamed',
  tSaved: 'Saved to your library',
  tDownloadStarted: 'Download started',
  tSaveFailed: 'Could not save the file',
  tOpenFailed: 'Could not open this file',
  errGeneric: 'Something went wrong. Please try again.',
  statusOnline: 'Online',
  offlineBadge: 'Offline — still working',
  localFirstNote: '100% local — your files stay on your device, never on a server.',
  persistedNote: 'Persistent storage active',
}

const bn: Record<string, string> = {
  appName: 'OmniFile',
  tagline: 'সব-ইন-ওয়ান ফাইল ভিউয়ার ও এডিটর',

  openFiles: 'ফাইল খুলুন',
  search: 'খুঁজুন',
  searchPlaceholder: 'নাম দিয়ে ফাইল খুঁজুন…',
  install: 'অ্যাপ ইনস্টল',
  installTitle: 'OmniFile ইনস্টল করুন',
  installDesc: 'ডিভাইসে ইনস্টল করে ফুল-স্ক্রিনে ও অফলাইনে ব্যবহার করুন।',
  installIos: 'iPhone/iPad-এ: Share বোতামে চাপ দিয়ে “Add to Home Screen” নির্বাচন করুন।',
  installSteps: 'Chrome/Edge (Android ও ডেস্কটপ): ইনস্টল বোতাম বা ⋮ মেনু → “Install app” ব্যবহার করুন।',
  installed: 'ইনস্টল হয়েছে',
  cancel: 'বাতিল',
  delete: 'মুছুন',
  rename: 'নাম পরিবর্তন',
  open: 'খুলুন',
  download: 'ডাউনলোড',
  back: 'ফিরে যান',
  save: 'সেভ',
  close: 'বন্ধ',
  reset: 'রিসেট',
  apply: 'প্রয়োগ',
  done: 'সম্পন্ন',
  loading: 'লোড হচ্ছে…',

  dropHere: 'ফাইল টেনে আনুন বা চাপ দিয়ে খুলুন',
  dropHint: 'সবকিছু আপনার ডিভাইসেই থাকে — কিছুই আপলোড হয় না।',
  supportedFormats: 'PDF • Word • Excel • CSV • ছবি • টেক্সট • ভিডিও • অডিও',
  myFiles: 'আমার ফাইল',
  filesCount: '{n}টি ফাইল',
  noFilesYet: 'এখনো কোনো ফাইল নেই',
  noFilesHint: 'উপরে ফাইল খুলুন বা এখানে টেনে এনে ছেড়ে দিন।',
  noResults: 'কিছু পাওয়া যায়নি',
  noResultsHint: 'অন্য নাম বা শব্দ দিয়ে খুঁজে দেখুন।',
  filterAll: 'সব',
  filterPdf: 'PDF',
  filterImage: 'ছবি',
  filterText: 'টেক্সট',
  filterSheets: 'শিট',
  filterDocs: 'ডকুমেন্ট',
  filterMedia: 'মিডিয়া',
  storageUsed: '{used} / {quota} ব্যবহৃত',

  kindPdf: 'PDF',
  kindImage: 'छবি',
  kindText: 'টেক্সট',
  kindMarkdown: 'মার্কডাউন',
  kindCsv: 'CSV',
  kindExcel: 'স্প্রেডশিট',
  kindDocs: 'ডকুমেন্ট',
  kindVideo: 'ভিডিও',
  kindAudio: 'অডিও',
  kindOther: 'ফাইল',

  deleteConfirmTitle: 'ফাইলটি মুছে ফেলবেন?',
  deleteConfirmDesc: '“{name}” এই ডিভাইস থেকে স্থায়ীভাবে মুছে যাবে। এটি আর ফেরানো যাবে না।',
  renameTitle: 'ফাইলের নাম পরিবর্তন',
  namePlaceholder: 'ফাইলের নাম',

  unsupportedTitle: 'এই ফাইল ফরম্যাটটি এখনো সাপোর্টেড নয়',
  unsupportedDesc:
    '“{ext}” ফরম্যাটের ফাইল এখনো দেখা বা এডিট করা যায় না। তবে ফাইলটি ডাউনলোড করে রাখতে পারবেন।',
  noPreview: 'প্রিভিউ নেই',
  dirtyIndicator: 'অসেভ করা পরিবর্তন',
  dirtyCloseTitle: 'অসেভ করা পরিবর্তন আছে',
  dirtyCloseDesc: 'আপনার এডিট করা পরিবর্তনগুলো এখনো সেভ হয়নি। তবুও বেরিয়ে যাবেন?',
  dirtyCloseLeave: 'বাদ দিয়ে বেরিয়ে যান',
  dirtyCloseStay: 'এডিট চালিয়ে যান',
  readOnly: 'শুধু পড়ার জন্য',

  pdfPage: 'পৃষ্ঠা {page} / {total}',
  pdfPrev: 'আগের পৃষ্ঠা',
  pdfNext: 'পরের পৃষ্ঠা',
  pdfZoomIn: 'জুম ইন',
  pdfZoomOut: 'জুম আউট',
  pdfFit: 'স্ক্রিনে ফিট',
  pdfHint: 'পৃষ্ঠা বদলাতে বাঁয়ে/ডানে সোয়াইপ করুন',

  editTab: 'এডিট',
  previewTab: 'প্রিভিউ',
  chars: '{n} অক্ষর',
  lines: '{n} লাইন',

  imgRotateLeft: 'বাঁয়ে ঘোরান',
  imgRotateRight: 'ডানে ঘোরান',
  imgFlipH: 'আনুভূমিক ফ্লিপ',
  imgFlipV: 'উল্লম্ব ফ্লিপ',
  imgCrop: 'ক্রপ',
  imgCropHint: 'ছবিতে আঙুল টেনে অংশ বেছে নিন',
  imgCropApply: 'ক্রপ করুন',
  imgResize: 'রিসাইজ',
  imgResizeTitle: 'ছবির মাপ বদলান',
  imgWidth: 'প্রস্থ',
  imgHeight: 'উচ্চতা',
  imgKeepAspect: 'অনুপাত ঠিক রাখুন',
  imgFilters: 'ফিল্টার',
  imgBrightness: 'উজ্জ্বলতা',
  imgContrast: 'কনট্রাস্ট',
  imgSaturation: 'স্যাচুরেশন',
  imgGrayscale: 'সাদা-কালো',
  imgSepia: 'সেপিয়া',
  imgBlur: 'ব্লার',
  imgPresets: 'প্রিসেট',
  imgPresetNone: 'স্বাভাবিক',
  imgPresetBW: 'মনোক্রোম',
  imgPresetSepia: 'ভিনটেজ',
  imgPresetVivid: 'উজ্জ্বল',
  imgPresetCool: 'শীতল',
  imgPresetWarm: 'উষ্ণ',
  imgUndo: 'পূর্বাবস্থা',
  imgProcessing: 'প্রসেস হচ্ছে…',

  csvSheets: 'শিট',
  csvAddRow: 'নতুন রো',
  csvAddCol: 'নতুন কলাম',
  csvDelRow: 'রো মুছুন',
  csvDelCol: 'কলাম মুছুন',
  csvRows: '{n} রো',
  csvCols: '{n} কলাম',
  csvLoadMore: 'আরও {n} রো দেখুন',
  csvEditHint: 'যেকোনো সেলে চাপ দিয়ে এডিট করুন',

  docxNote: 'ডকুমেন্ট শুধু পড়ার জন্য খোলে',
  mediaHint: 'মিডিয়া প্লেয়ার',

  tFilesAdded: '{n}টি ফাইল যোগ হয়েছে',
  tFileDeleted: 'ফাইল মুছে ফেলা হয়েছে',
  tRenamed: 'নাম পরিবর্তন হয়েছে',
  tSaved: 'আপনার লাইব্রেরিতে সেভ হয়েছে',
  tDownloadStarted: 'ডাউনলোড শুরু হয়েছে',
  tSaveFailed: 'ফাইল সেভ করা যায়নি',
  tOpenFailed: 'ফাইলটি খোলা যায়নি',
  errGeneric: 'কিছু একটা সমস্যা হয়েছে। আবার চেষ্টা করুন।',
  statusOnline: 'অনলাইন',
  offlineBadge: 'অফলাইন — স্বাভাবিক চলছে',
  localFirstNote: '১০০% লোকাল — ফাইল শুধু আপনার ডিভাইসেই থাকে, কোনো সার্ভারে যায় না।',
  persistedNote: 'স্থায়ী স্টোরেজ সক্রিয়',
}

const DICTS: Record<Lang, Record<string, string>> = { en, bn }

interface I18nContextValue {
  lang: Lang
  setLang: (l: Lang) => void
  t: (key: string) => string
  tf: (key: string, params: Record<string, string | number>) => string
}

const I18nContext = createContext<I18nContextValue | null>(null)

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>('bn')

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY) as Lang | null
      // One-time mount sync from localStorage (legit effect usage → lint exemption)
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (saved === 'bn' || saved === 'en') setLangState(saved)
      else if (navigator.language?.toLowerCase().startsWith('en')) setLangState('en')
    } catch {
      /* ignore */
    }
  }, [])

  const setLang = useCallback((l: Lang) => {
    setLangState(l)
    try {
      window.localStorage.setItem(STORAGE_KEY, l)
    } catch {
      /* ignore */
    }
  }, [])

  const t = useCallback(
    (key: string) => DICTS[lang][key] ?? DICTS.en[key] ?? key,
    [lang]
  )

  const tf = useCallback(
    (key: string, params: Record<string, string | number>) =>
      (DICTS[lang][key] ?? DICTS.en[key] ?? key).replace(/\{(\w+)\}/g, (_, k: string) =>
        params[k] !== undefined ? String(params[k]) : `{${k}}`
      ),
    [lang]
  )

  return (
    <I18nContext.Provider value={{ lang, setLang, t, tf }}>{children}</I18nContext.Provider>
  )
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext)
  if (!ctx) throw new Error('useI18n must be used inside <I18nProvider>')
  return ctx
}
