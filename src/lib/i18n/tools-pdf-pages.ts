/**
 * i18n dictionary — PDF page-management tools (Task 2-b).
 * Owned by the pdf-pages agent. Keys are referenced by
 * src/components/tools/pdf/PdfOrganizerTool|PdfExtractCropTool|PdfRotateTool|
 * PdfHeaderFooterTool|PdfBatesTool.tsx and src/components/tools/registry.tsx.
 *
 * The orchestrator merges `en` / `bn` into DICTS (src/lib/i18n.tsx).
 * Shared keys already defined in tools-pdf.ts / tools-core.ts (toolRun,
 * toolProcessing, pdfErrCorrupt, pdfErrEncrypted, pdfErrWrongPassword,
 * pdfErrBadRanges, pdfPageN, pdfSplitRangesHint…) are REUSED, not redefined.
 */

export const en: Record<string, string> = {
  // Registry card labels (referenced by tools/registry.tsx)
  toolPdfOrganizer: 'Page organizer',
  toolPdfOrganizerDesc: 'Drag & drop to reorder, rotate, delete or insert pages',
  toolPdfExtract: 'Extract & crop pages',
  toolPdfExtractDesc: 'Pull selected pages into a new PDF and crop margins',
  toolPdfRotate: 'Rotate pages',
  toolPdfRotateDesc: 'Turn all or selected pages by 90/180/270 degrees',
  toolPdfHeaderFooter: 'Header, footer & page numbers',
  toolPdfHeaderFooterDesc: 'Add running headers, page numbers and document metadata',
  toolPdfBates: 'Bates numbering',
  toolPdfBatesDesc: 'Unique serial numbers for legal documents',

  // ── Shared errors + notes (thrown by src/lib/tools/pdf-pages.ts) ──
  pdfErrNoPages: 'No pages selected — the output would be empty',
  pdfErrBadCrop: 'Crop margins are too large for this page',
  pdfFontLatinHint:
    'PDF standard fonts cover Latin text — any other character is replaced with “?”',
  pdfPagesThumbCap: 'Large document — only the first {n} pages are shown.',

  // ── Organizer ──
  pdfOrgRendering: 'Rendering thumbnails…',
  pdfOrgCount: '{n} pages',
  pdfOrgHint: 'Drag cards to reorder. Buttons: rotate, remove, insert a blank page.',
  pdfOrgReset: 'Reset',
  pdfOrgAddBlankEnd: 'Add blank page',
  pdfOrgSave: 'Save organized PDF',
  pdfOrgBlank: 'Blank',
  pdfOrgRotate: 'Rotate page',
  pdfOrgDelete: 'Remove page',
  pdfOrgInsert: 'Insert blank page here',

  // ── Extract & crop ──
  pdfExtractSelectHint: 'Tap pages to select them',
  pdfExtractAll: 'Select all',
  pdfExtractNone: 'Clear',
  pdfExtractSelected: '{n} selected',
  pdfExtractCrop: 'Crop margins (pt)',
  pdfCropTop: 'Top',
  pdfCropRight: 'Right',
  pdfCropBottom: 'Bottom',
  pdfCropLeft: 'Left',
  pdfExtractCropHint: 'Trimmed inward from each page edge. PDF points: 72 pt = 1 inch.',
  pdfExtractSave: 'Save extracted PDF',

  // ── Rotate ──
  pdfRotScope: 'Pages',
  pdfRotAll: 'All pages',
  pdfRotRanges: 'Selected ranges',
  pdfRotRangesLabel: 'Page ranges',
  pdfRotAngle: 'Rotation',
  pdfRot90cw: '90° clockwise',
  pdfRot90ccw: '90° counter-clockwise',
  pdfRot180: '180°',

  // ── Header, footer & page numbers ──
  pdfHfBand: 'Header & footer',
  pdfHfHeader: 'Header',
  pdfHfFooter: 'Footer',
  pdfHfLeft: 'Left',
  pdfHfCenter: 'Center',
  pdfHfRight: 'Right',
  pdfHfPlaceholderHint:
    'Placeholders: {n} page number · {total} total pages · {title} document title · {date} today',
  pdfHfFontSize: 'Font size',
  pdfHfColor: 'Color',
  pdfHfMargin: 'Margin (pt)',
  pdfHfStart: 'Page numbers start at',
  pdfHfSkipFirst: 'Skip the first page',
  pdfHfPreview: 'Preview',
  pdfHfMeta: 'Document metadata',
  pdfHfMetaTitle: 'Title',
  pdfHfMetaAuthor: 'Author',
  pdfHfMetaSubject: 'Subject',
  pdfHfMetaKeywords: 'Keywords',
  pdfHfKeywordsHint: 'Separate multiple keywords with commas',
  pdfHfRun: 'Apply to PDF',

  // ── Bates numbering ──
  pdfBatesPrefix: 'Prefix',
  pdfBatesSuffix: 'Suffix',
  pdfBatesStart: 'Start number',
  pdfBatesPadding: 'Number digits',
  pdfBatesPosition: 'Position',
  pdfBatesPosBR: 'Bottom right',
  pdfBatesPosBC: 'Bottom center',
  pdfBatesPosBL: 'Bottom left',
  pdfBatesPosTR: 'Top right',
  pdfBatesPosTC: 'Top center',
  pdfBatesPosTL: 'Top left',
  pdfBatesFontSize: 'Font size',
  pdfBatesColor: 'Color',
  pdfBatesMargin: 'Margin (pt)',
  pdfBatesPreview: 'Preview',
  pdfBatesRun: 'Stamp Bates numbers',
}

export const bn: Record<string, string> = {
  // Registry card labels (referenced by tools/registry.tsx)
  toolPdfOrganizer: 'পেজ সাজানো (Organizer)',
  toolPdfOrganizerDesc: 'ড্র্যাগ করে পৃষ্ঠা সাজান, ঘোরান, মুছুন বা নতুন পৃষ্ঠা বসান',
  toolPdfExtract: 'পৃষ্ঠা বাছাই ও ক্রপ',
  toolPdfExtractDesc: 'বাছাই করা পৃষ্ঠাগুলো নতুন PDF-এ আনুন ও মার্জিন ক্রপ করুন',
  toolPdfRotate: 'পৃষ্ঠা ঘোরান (Rotate)',
  toolPdfRotateDesc: 'সব বা নির্দিষ্ট পৃষ্ঠা ৯০/১৮০/২৭০ ডিগ্রি ঘোরান',
  toolPdfHeaderFooter: 'হেডার, ফুটার ও পেজ নম্বর',
  toolPdfHeaderFooterDesc: 'হেডার, পেজ নম্বর ও ডকুমেন্ট মেটাডেটা যোগ করুন',
  toolPdfBates: 'বেটস নম্বরিং (Bates)',
  toolPdfBatesDesc: 'আইনি ডকুমেন্টের জন্য ইউনিক সিরিয়াল নম্বর',

  // ── শেয়ারড এরর + নোট (src/lib/tools/pdf-pages.ts থেকে থ্রো হয়) ──
  pdfErrNoPages: 'কোনো পৃষ্ঠা বাছাই করা হয়নি — ফলাফল খালি হতো',
  pdfErrBadCrop: 'ক্রপ মার্জিন পৃষ্ঠার আকারের চেয়ে বড় হয়ে গেছে',
  pdfFontLatinHint:
    'PDF-এর স্ট্যান্ডার্ড ফন্টে শুধু ইংরেজি (Latin) অক্ষর আছে — বাকি অক্ষর “?” হিসেবে বসবে',
  pdfPagesThumbCap: 'বড় ডকুমেন্ট — প্রথম {n}টি পৃষ্ঠা দেখানো হয়েছে।',

  // ── অর্গানাইজার ──
  pdfOrgRendering: 'থাম্বনেইল তৈরি হচ্ছে…',
  pdfOrgCount: '{n}টি পৃষ্ঠা',
  pdfOrgHint: 'কার্ড ড্র্যাগ করে ক্রম বদলান। বোতাম: ঘোরান, বাদ দিন, খালি পৃষ্ঠা বসান।',
  pdfOrgReset: 'রিসেট',
  pdfOrgAddBlankEnd: 'খালি পৃষ্ঠা যোগ করুন',
  pdfOrgSave: 'সাজানো PDF সেভ করুন',
  pdfOrgBlank: 'খালি',
  pdfOrgRotate: 'পৃষ্ঠা ঘোরান',
  pdfOrgDelete: 'পৃষ্ঠা বাদ দিন',
  pdfOrgInsert: 'এখানে খালি পৃষ্ঠা বসান',

  // ── বাছাই ও ক্রপ ──
  pdfExtractSelectHint: 'বাছাই করতে পৃষ্ঠায় চাপ দিন',
  pdfExtractAll: 'সব বাছাই',
  pdfExtractNone: 'বাছাই মুছুন',
  pdfExtractSelected: '{n}টি বাছাই করা হয়েছে',
  pdfExtractCrop: 'ক্রপ মার্জিন (পয়েন্ট)',
  pdfCropTop: 'উপর',
  pdfCropRight: 'ডান',
  pdfCropBottom: 'নিচ',
  pdfCropLeft: 'বাম',
  pdfExtractCropHint: 'প্রতিটি পৃষ্ঠার কিনারা থেকে ভেতরের দিকে কাটা হবে। ৭২ পয়েন্ট = ১ ইঞ্চি।',
  pdfExtractSave: 'বাছাই করা PDF সেভ করুন',

  // ── ঘোরানো ──
  pdfRotScope: 'পৃষ্ঠা',
  pdfRotAll: 'সব পৃষ্ঠা',
  pdfRotRanges: 'নির্দিষ্ট রেঞ্জ',
  pdfRotRangesLabel: 'পৃষ্ঠার রেঞ্জ',
  pdfRotAngle: 'ঘোরানোর পরিমাণ',
  pdfRot90cw: '৯০° ঘড়ির কাঁটার দিকে',
  pdfRot90ccw: '৯০° ঘড়ির কাঁটার উল্টো দিকে',
  pdfRot180: '১৮০°',

  // ── হেডার, ফুটার ও পেজ নম্বর ──
  pdfHfBand: 'হেডার ও ফুটার',
  pdfHfHeader: 'হেডার',
  pdfHfFooter: 'ফুটার',
  pdfHfLeft: 'বামে',
  pdfHfCenter: 'মাঝে',
  pdfHfRight: 'ডানে',
  pdfHfPlaceholderHint:
    'প্লেসহোল্ডার: {n} পৃষ্ঠার নম্বর · {total} মোট পৃষ্ঠা · {title} ডকুমেন্টের শিরোনাম · {date} আজকের তারিখ',
  pdfHfFontSize: 'ফন্ট সাইজ',
  pdfHfColor: 'রং',
  pdfHfMargin: 'মার্জিন (পয়েন্ট)',
  pdfHfStart: 'পেজ নম্বর শুরু হবে',
  pdfHfSkipFirst: 'প্রথম পৃষ্ঠা বাদ দিন',
  pdfHfPreview: 'প্রিভিউ',
  pdfHfMeta: 'ডকুমেন্ট মেটাডেটা',
  pdfHfMetaTitle: 'শিরোনাম',
  pdfHfMetaAuthor: 'লেখক',
  pdfHfMetaSubject: 'বিষয়',
  pdfHfMetaKeywords: 'কীওয়ার্ড',
  pdfHfKeywordsHint: 'একাধিক কীওয়ার্ড কমা দিয়ে আলাদা করুন',
  pdfHfRun: 'PDF-এ প্রয়োগ করুন',

  // ── বেটস নম্বরিং ──
  pdfBatesPrefix: 'প্রিফিক্স',
  pdfBatesSuffix: 'সাফিক্স',
  pdfBatesStart: 'শুরুর নম্বর',
  pdfBatesPadding: 'সংখ্যার ঘর',
  pdfBatesPosition: 'অবস্থান',
  pdfBatesPosBR: 'নিচে ডানে',
  pdfBatesPosBC: 'নিচে মাঝে',
  pdfBatesPosBL: 'নিচে বামে',
  pdfBatesPosTR: 'উপরে ডানে',
  pdfBatesPosTC: 'উপরে মাঝে',
  pdfBatesPosTL: 'উপরে বামে',
  pdfBatesFontSize: 'ফন্ট সাইজ',
  pdfBatesColor: 'রং',
  pdfBatesMargin: 'মার্জিন (পয়েন্ট)',
  pdfBatesPreview: 'প্রিভিউ',
  pdfBatesRun: 'বেটস নম্বর বসান',
}
