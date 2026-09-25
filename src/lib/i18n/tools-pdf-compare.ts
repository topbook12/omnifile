/**
 * i18n dictionary — Compare PDF versions (Task 2-f).
 * Owned by the pdf-ai agent. Keys are referenced by
 * src/components/tools/pdf/PdfCompareTool.tsx and
 * src/components/tools/registry.tsx.
 *
 * Error keys (pdfErr*) are thrown by src/lib/tools/pdf-compare.ts as
 * ToolError i18n keys and translated via errMessage(err, t).
 */

export const en: Record<string, string> = {
  // Registry card labels (referenced by tools/registry.tsx)
  toolPdfCompare: 'Compare PDF versions',
  toolPdfCompareDesc: 'Spot every added or removed word between two files',

  // ── Compare panel ──
  pdfCmpA: 'Original',
  pdfCmpB: 'Revised',
  pdfCmpRun: 'Compare',
  pdfCmpReading: 'Reading both documents…',
  pdfErrDiffTooLarge:
    'These documents are too large to compare word by word — try smaller files',
  pdfCmpAdded: '+{n} added',
  pdfCmpRemoved: '−{n} removed',
  pdfCmpSame: '{n} unchanged',
  pdfCmpNoDiff: 'No differences found — both documents match word for word.',
  pdfCmpTabInline: 'Inline view',
  pdfCmpTabReport: 'Report',
  pdfCmpReportHint:
    'Download the full diff as a standalone HTML report — it opens in any browser.',
  pdfCmpLegend:
    'Green = added in the revised file · red strikethrough = removed from the original.',
}

export const bn: Record<string, string> = {
  // রেজিস্ট্রি কার্ড লেবেল (tools/registry.tsx থেকে ব্যবহৃত)
  toolPdfCompare: 'PDF সংস্করণ তুলনা',
  toolPdfCompareDesc: 'দুটি ফাইলের মধ্যে যোগ বা বাদ পড়া প্রতিটি শব্দ খুঁজে দেখান',

  // ── তুলনা প্যানেল ──
  pdfCmpA: 'মূল ফাইল',
  pdfCmpB: 'সংশোধিত ফাইল',
  pdfCmpRun: 'তুলনা করুন',
  pdfCmpReading: 'দুটি ডকুমেন্ট পড়া হচ্ছে…',
  pdfErrDiffTooLarge:
    'ডকুমেন্ট দুটি শব্দ ধরে তুলনা করার জন্য অনেক বড় — ছোট ফাইল দিয়ে চেষ্টা করুন',
  pdfCmpAdded: '+{n} যোগ হয়েছে',
  pdfCmpRemoved: '−{n} বাদ গেছে',
  pdfCmpSame: '{n}টি অপরিবর্তিত',
  pdfCmpNoDiff: 'কোনো পার্থক্য পাওয়া যায়নি — দুটি ডকুমেন্ট শব্দে শব্দে এক।',
  pdfCmpTabInline: 'ইনলাইন ভিউ',
  pdfCmpTabReport: 'রিপোর্ট',
  pdfCmpReportHint:
    'পুরো ডিফটি একটি স্বতন্ত্র HTML রিপোর্ট হিসেবে ডাউনলোড করুন — যেকোনো ব্রাউজারে খোলে।',
  pdfCmpLegend:
    'সবুজ = সংশোধিত ফাইলে নতুন · লাল কাটা = মূল ফাইল থেকে বাদ।',
}
