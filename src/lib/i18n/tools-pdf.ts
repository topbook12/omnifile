/**
 * i18n dictionary — PDF tools (Task 4-b).
 * Owned by the pdf-tools agent. Keys are referenced by
 * src/components/tools/pdf/* and src/components/tools/registry.tsx.
 *
 * KEEP the toolTitle/toolTitleDesc keys below — the registry references them.
 *
 * Error keys (pdfErr*, pdfToWordNoText) are thrown by
 * src/lib/tools/pdf-tools-advanced.ts as ToolError i18n keys and translated
 * via errMessage(err, t). See the ERROR CONTRACT comment in that lib.
 */

export const en: Record<string, string> = {
  // Registry card labels (referenced by tools/registry.tsx)
  toolPdfMerge: 'Merge PDF',
  toolPdfMergeDesc: 'Combine several PDFs into one document',
  toolPdfSplit: 'Split PDF',
  toolPdfSplitDesc: 'Split every N pages, custom ranges or one page each',
  toolPdfCompress: 'PDF compressor',
  toolPdfCompressDesc: 'Shrink large PDFs for email with quality control',
  toolImagesToPdf: 'Images to PDF',
  toolImagesToPdfDesc: 'Turn JPG/PNG photos into a single PDF document',
  toolPdfToJpg: 'PDF to JPG',
  toolPdfToJpgDesc: 'Export every page as JPG or PNG images',
  toolPdfToWord: 'PDF to Word',
  toolPdfToWordDesc: 'Extract the text into an editable .docx file',
  toolPdfOcr: 'OCR — text from image/PDF',
  toolPdfOcrDesc: 'Read text from photos & scans (Bengali supported)',
  toolPdfSign: 'E-sign PDF',
  toolPdfSignDesc: 'Draw a signature and place it on any page',
  toolPdfProtect: 'Protect / unlock PDF',
  toolPdfProtectDesc: 'Add or remove a password (AES-256 encryption)',

  // ── Shared: result names + generic errors (thrown by the lib) ──
  pdfPageN: 'Page {n}',
  pdfErrCorrupt: 'This file is not a valid PDF',
  pdfErrEncrypted: 'This PDF is password-protected — remove the password first (Protect / unlock tool)',
  pdfErrAlreadyProtected: 'This PDF already has a password — unlock it first',
  pdfErrWrongPassword: 'Wrong password',
  pdfErrShortPassword: 'Password must be at least 4 characters',
  pdfErrBadRanges: 'Invalid page ranges — try something like 1-3, 5, 8-',
  pdfErrEveryN: 'Pages per file must be between 2 and 100',
  pdfErrNeedTwo: 'Select at least two PDFs',
  pdfErrNoImage: 'Could not read this image',
  pdfToWordNoText: 'No text layer found — this PDF is probably scanned; use the OCR tool instead',

  // ── Merge ──
  pdfMergeOrderHint:
    'Files are merged top to bottom in the order shown — remove and re-add them to change the order.',

  // ── Split ──
  pdfSplitMode: 'Split mode',
  pdfSplitEvery: 'Every N pages',
  pdfSplitRanges: 'Custom ranges',
  pdfSplitSingle: 'One page per file',
  pdfSplitEveryLabel: 'Pages per file',
  pdfSplitRangesLabel: 'Page ranges',
  pdfSplitRangesHint: 'Example: 1-3, 5, 8- (without an end number it runs to the last page)',

  // ── Compress ──
  pdfCompressPreset: 'Quality',
  pdfCompressSmall: 'Small file',
  pdfCompressBalanced: 'Balanced',
  pdfCompressHigh: 'High quality',
  pdfCompressHint: 'Pages are re-built as images — they look identical but text is no longer selectable.',
  pdfCompressUnchanged: 'Could not make it smaller — kept the original file',

  // ── Images → PDF ──
  pdfI2pPageSize: 'Page size',
  pdfI2pFit: 'Match image',
  pdfI2pA4: 'A4',
  pdfI2pLetter: 'Letter',
  pdfI2pMargin: 'Margin (mm)',

  // ── PDF → JPG ──
  pdfJpgFormat: 'Image format',
  pdfJpgScale: 'Resolution',
  pdfJpgScale1: '1× — screen',
  pdfJpgScale2: '2× — sharp',
  pdfJpgScale3: '3× — print',
  pdfJpgCap: 'Large documents: only the first 100 pages are converted.',

  // ── PDF → Word / TXT ──
  pdfWordFormat: 'Output format',
  pdfWordDocx: 'Word document (.docx)',
  pdfWordTxt: 'Plain text (.txt)',

  // ── OCR ──
  pdfOcrEngine: 'Engine',
  pdfOcrLanguage: 'Text language',
  pdfOcrLangAuto: 'Auto detect',
  pdfOcrLangBn: 'Bengali',
  pdfOcrLangEn: 'English',
  pdfOcrLangBnEn: 'Bengali + English',
  pdfOcrTessHint: 'The first run downloads the language data (~15–45 MB). After that it works offline.',
  pdfOcrHasText: 'This PDF already has a text layer — extracted the text directly.',
  pdfOcrMaxPages: 'For scanned PDFs only the first 10 pages are read.',
  pdfOcrExtracted: 'Extracted text',
  pdfOcrDownloadTxt: 'Download .txt',

  // ── E-sign ──
  pdfSignDraw: 'Draw signature',
  pdfSignClear: 'Clear',
  pdfSignUse: 'Use this signature',
  pdfSignPlaceHint: 'Then tap on the page where the signature should go.',
  pdfSignWidth: 'Signature width',
  pdfSignNoSig: 'Draw your signature first',
  pdfSignNoPlace: 'Tap on the page to choose the signature position',

  // ── Protect / unlock ──
  pdfProtectMode: 'Mode',
  pdfProtectAdd: 'Protect with a password',
  pdfProtectRemove: 'Remove password (unlock)',
  pdfProtectPassword: 'Password',
  pdfProtectConfirm: 'Confirm password',
  pdfProtectMismatch: 'Passwords do not match',
  pdfProtectUnlockHint: 'Enter the password currently set on the PDF.',
  pdfProtectNote: 'AES-256 encryption — the file never leaves your device.',
  pdfProtectDone: 'Password set',
  pdfUnlockDone: 'Password removed',

  // ── Protect: strength + permissions (Task 2-e) ──
  pdfProtectAlgo: 'Encryption strength',
  pdfProtectAes256: 'AES-256 (strongest)',
  pdfProtectAes128: 'AES-128',
  pdfProtectPerms: 'Permissions (owner password applies)',
  pdfPermPrinting: 'Allow printing',
  pdfPermCopying: 'Allow copying text',
  pdfPermModifying: 'Allow editing',
  pdfPermAnnotating: 'Allow comments & annotations',
  pdfPermFillForms: 'Allow filling forms',
}

export const bn: Record<string, string> = {
  // Registry card labels (referenced by tools/registry.tsx)
  toolPdfMerge: 'PDF জোড়া (Merge)',
  toolPdfMergeDesc: 'একাধিক PDF একসাথে এক ডকুমেন্টে জোড়া দিন',
  toolPdfSplit: 'PDF ভাগ (Split)',
  toolPdfSplitDesc: 'প্রতি N পৃষ্ঠায়, কাস্টম রেঞ্জ বা প্রতি পৃষ্ঠা আলাদা করুন',
  toolPdfCompress: 'PDF কম্প্রেসার',
  toolPdfCompressDesc: 'ইমেইলের জন্য বড় PDF ছোট করুন, কোয়ালিটি নিয়ন্ত্রণসহ',
  toolImagesToPdf: 'ছবি থেকে PDF',
  toolImagesToPdfDesc: 'JPG/PNG ছবিগুলো এক PDF ডকুমেন্টে রূপান্তর করুন',
  toolPdfToJpg: 'PDF থেকে JPG',
  toolPdfToJpgDesc: 'প্রতিটি পৃষ্ঠা JPG বা PNG ছবি হিসেবে বের করুন',
  toolPdfToWord: 'PDF থেকে Word',
  toolPdfToWordDesc: 'লেখাগুলো এডিটেবল .docx ফাইলে বের করুন',
  toolPdfOcr: 'OCR — ছবি/PDF থেকে লেখা',
  toolPdfOcrDesc: 'ছবি ও স্ক্যান থেকে লেখা তুলুন (বাংলা সাপোর্টেড)',
  toolPdfSign: 'PDF-এ সই (E-sign)',
  toolPdfSignDesc: 'সই এঁকে যেকোনো পৃষ্ঠায় বসান',
  toolPdfProtect: 'PDF লক / আনলক',
  toolPdfProtectDesc: 'পাসওয়ার্ড যোগ বা সরান (AES-256 এনক্রিপশন)',

  // ── শেয়ারড: ফলাফলের নাম + কমন এরর (লাইব থেকে থ্রো হয়) ──
  pdfPageN: 'পৃষ্ঠা {n}',
  pdfErrCorrupt: 'এটি সঠিক PDF ফাইল নয়',
  pdfErrEncrypted: 'এই PDF পাসওয়ার্ড দিয়ে লক করা — আগে "PDF লক / আনলক" টুল দিয়ে পাসওয়ার্ড সরান',
  pdfErrAlreadyProtected: 'এই PDF-এ ইতিমধ্যে পাসওয়ার্ড আছে — আগে আনলক করুন',
  pdfErrWrongPassword: 'পাসওয়ার্ড সঠিক নয়',
  pdfErrShortPassword: 'পাসওয়ার্ড কমপক্ষে ৪ অক্ষরের হতে হবে',
  pdfErrBadRanges: 'পৃষ্ঠার রেঞ্জ সঠিক নয় — যেমন লিখুন: 1-3, 5, 8-',
  pdfErrEveryN: 'প্রতি ফাইলে পৃষ্ঠা সংখ্যা ২ থেকে ১০০-এর মধ্যে হতে হবে',
  pdfErrNeedTwo: 'কমপক্ষে দুটি PDF বাছুন',
  pdfErrNoImage: 'এই ছবিটি পড়া যায়নি',
  pdfToWordNoText: 'কোনো লেখা পাওয়া যায়নি — এটি সম্ভবত স্ক্যান করা PDF; OCR টুল ব্যবহার করুন',

  // ── মার্জ ──
  pdfMergeOrderHint:
    'ফাইলগুলো উপর থেকে নিচে দেখানো ক্রমেই জোড়া হয় — ক্রম বদলাতে ফাইল সরিয়ে আবার যোগ করুন।',

  // ── স্প্লিট ──
  pdfSplitMode: 'ভাগ করার ধরন',
  pdfSplitEvery: 'প্রতি N পৃষ্ঠা পর পর',
  pdfSplitRanges: 'নির্দিষ্ট রেঞ্জ',
  pdfSplitSingle: 'প্রতি পৃষ্ঠা আলাদা ফাইল',
  pdfSplitEveryLabel: 'প্রতি ফাইলে পৃষ্ঠা',
  pdfSplitRangesLabel: 'পৃষ্ঠার রেঞ্জ',
  pdfSplitRangesHint: 'উদাহরণ: 1-3, 5, 8- (শেষ সংখ্যা না দিলে শেষ পৃষ্ঠা পর্যন্ত)',

  // ── কম্প্রেস ──
  pdfCompressPreset: 'কোয়ালিটি',
  pdfCompressSmall: 'ছোট ফাইল',
  pdfCompressBalanced: 'মাঝামাঝি',
  pdfCompressHigh: 'উচ্চ মান',
  pdfCompressHint: 'পৃষ্ঠাগুলো ছবি হিসেবে নতুন করে তৈরি হয় — দেখতে একই লাগে তবে লেখা আর সিলেক্ট করা যায় না।',
  pdfCompressUnchanged: 'আর ছোট করা যায়নি — মূল ফাইলই রাখা হয়েছে',

  // ── ছবি → PDF ──
  pdfI2pPageSize: 'পৃষ্ঠার সাইজ',
  pdfI2pFit: 'ছবির সমান',
  pdfI2pA4: 'A4',
  pdfI2pLetter: 'Letter',
  pdfI2pMargin: 'মার্জিন (মিমি)',

  // ── PDF → JPG ──
  pdfJpgFormat: 'ছবির ফরম্যাট',
  pdfJpgScale: 'রেজোলিউশন',
  pdfJpgScale1: '1× — স্ক্রিন',
  pdfJpgScale2: '2× — স্পষ্ট',
  pdfJpgScale3: '3× — প্রিন্ট',
  pdfJpgCap: 'বড় ডকুমেন্ট: প্রথম ১০০ পৃষ্ঠা পর্যন্ত রূপান্তর হবে।',

  // ── PDF → Word / TXT ──
  pdfWordFormat: 'আউটপুট ফরম্যাট',
  pdfWordDocx: 'ওয়ার্ড ডকুমেন্ট (.docx)',
  pdfWordTxt: 'সাধারণ টেক্সট (.txt)',

  // ── OCR ──
  pdfOcrEngine: 'ইঞ্জিন',
  pdfOcrLanguage: 'লেখার ভাষা',
  pdfOcrLangAuto: 'অটো ডিটেক্ট',
  pdfOcrLangBn: 'বাংলা',
  pdfOcrLangEn: 'ইংরেজি',
  pdfOcrLangBnEn: 'বাংলা + ইংরেজি',
  pdfOcrTessHint: 'প্রথমবার ভাষার ডেটা নামতে হয় (~১৫–৪৫ মেগাবাইট)। এরপর অফলাইনেও চলে।',
  pdfOcrHasText: 'এই PDF-এ ইতিমধ্যে লেখার লেয়ার আছে — সরাসরি লেখা তোলা হয়েছে।',
  pdfOcrMaxPages: 'স্ক্যান করা PDF-এ প্রথম ১০ পৃষ্ঠা পর্যন্ত পড়া হয়।',
  pdfOcrExtracted: 'তোলা লেখা',
  pdfOcrDownloadTxt: '.txt ডাউনলোড',

  // ── সই ──
  pdfSignDraw: 'সই আঁকুন',
  pdfSignClear: 'মুছে ফেলুন',
  pdfSignUse: 'এই সইটি ব্যবহার করুন',
  pdfSignPlaceHint: 'এরপর পৃষ্ঠায় যেখানে সই বসবে সেখানে চাপ দিন।',
  pdfSignWidth: 'সইয়ের প্রস্থ',
  pdfSignNoSig: 'আগে সই এঁকে নিন',
  pdfSignNoPlace: 'সই বসানোর জায়গা বাছতে পৃষ্ঠায় চাপ দিন',

  // ── লক / আনলক ──
  pdfProtectMode: 'মোড',
  pdfProtectAdd: 'পাসওয়ার্ড দিয়ে লক করুন',
  pdfProtectRemove: 'পাসওয়ার্ড সরান (আনলক)',
  pdfProtectPassword: 'পাসওয়ার্ড',
  pdfProtectConfirm: 'পাসওয়ার্ড আবার লিখুন',
  pdfProtectMismatch: 'দুটি পাসওয়ার্ড এক নয়',
  pdfProtectUnlockHint: 'PDF-এ বর্তমানে যে পাসওয়ার্ড আছে সেটি লিখুন।',
  pdfProtectNote: 'AES-256 এনক্রিপশন — ফাইল কখনোই আপনার ডিভাইসের বাইরে যায় না।',
  pdfProtectDone: 'পাসওয়ার্ড সেট হয়েছে',
  pdfUnlockDone: 'পাসওয়ার্ড সরানো হয়েছে',

  // ── লক: স্ট্রেংথ ও অনুমতি (Task 2-e) ──
  pdfProtectAlgo: 'এনক্রিপশন স্ট্রেংথ',
  pdfProtectAes256: 'AES-256 (সর্বোচ্চ নিরাপদ)',
  pdfProtectAes128: 'AES-128',
  pdfProtectPerms: 'অনুমতিসমূহ (ওনার পাসওয়ার্ড প্রযোজ্য)',
  pdfPermPrinting: 'প্রিন্ট অনুমতি',
  pdfPermCopying: 'টেক্সট কপি অনুমতি',
  pdfPermModifying: 'এডিট অনুমতি',
  pdfPermAnnotating: 'মন্তব্য ও অ্যানোটেশন অনুমতি',
  pdfPermFillForms: 'ফর্ম পূরণ অনুমতি',
}
