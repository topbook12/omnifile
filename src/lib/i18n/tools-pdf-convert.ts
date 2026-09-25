/**
 * i18n dictionary — PDF conversion tools (Task 2-c).
 * Owned by the pdf-convert agent. Keys are referenced by
 * src/components/tools/pdf/{PdfToExcelTool,PdfToPptTool,PdfToHtmlTool,
 * TextToPdfTool,PdfScannerTool}.tsx and (later) tools/registry.tsx.
 *
 * Error keys (pdfErr*) are thrown by src/lib/tools/pdf-convert.ts as
 * ToolError i18n keys and translated via errMessage(err, t).
 * `pdfPageN` (shared "Page {n}") lives in tools-pdf.ts and is reused here.
 */

export const en: Record<string, string> = {
  // Registry card labels (referenced by tools/registry.tsx)
  toolPdfToExcel: 'PDF to Excel',
  toolPdfToExcelDesc: 'Convert PDF tables & text into an .xlsx workbook',
  toolPdfToPpt: 'PDF to PowerPoint',
  toolPdfToPptDesc: 'Turn each page into a full-slide .pptx deck',
  toolPdfToHtml: 'PDF to HTML',
  toolPdfToHtmlDesc: 'Export the document text as a standalone web page',
  toolTextToPdf: 'Text to PDF',
  toolTextToPdfDesc: 'Turn pasted text or .txt/.md files into a PDF (Bengali supported)',
  toolPdfScanner: 'Camera scanner',
  toolPdfScannerDesc: 'Capture documents with the camera and build a PDF',

  // ── Errors (thrown by the lib / scanner panel) ──
  pdfErrNoText: 'No text found in this PDF — scanned PDFs need the OCR tool first',
  pdfErrEmptyText: 'Paste or load some text first',
  pdfErrTextTooLong: 'This text is too long — the result would exceed 200 pages',
  pdfErrCamera: 'Could not start the camera — check the browser permission',
  pdfErrCameraSecure:
    'The camera needs a secure connection (https) — iOS Safari and most browsers block it on http',
  pdfErrMaxShots: 'You can capture at most 30 pages',

  // ── PDF → Excel ──
  pdfXlsxHint:
    'Best-effort conversion: text lines and simple tables are detected by layout heuristics — complex layouts may need manual cleanup in Excel.',

  // ── PDF → PowerPoint ──
  pdfPptResolution: 'Slide image resolution',
  pdfPptScale1: '1× — smaller file',
  pdfPptScale2: '2× — sharp (recommended)',
  pdfPptCap: 'Large documents: only the first 50 pages are converted.',

  // ── PDF → HTML ──
  pdfHtmlHint:
    'The export is one self-contained .html file (no external resources) — the text stays selectable and searchable.',

  // ── Text → PDF ──
  pdfT2pInput: 'Text source',
  pdfT2pPaste: 'Paste text',
  pdfT2pFile: 'Open a file',
  pdfT2pPlaceholder: 'Type or paste your text here…',
  pdfT2pFileLoaded: 'File loaded into the editor below',
  pdfT2pFileReadFail: 'Could not read this file as text',
  pdfT2pPageSize: 'Page size',
  pdfT2pA4: 'A4',
  pdfT2pLetter: 'Letter',
  pdfT2pMode: 'Rendering',
  pdfT2pImage: 'Image — full Unicode (Bengali supported)',
  pdfT2pImageHint:
    'Text is drawn as a picture — looks identical on every device but is not selectable.',
  pdfT2pText: 'Selectable text — Latin only',
  pdfT2pTextHint:
    'Real text you can select and search. Non-Latin characters (e.g. Bengali) become “?”.',
  pdfT2pFontSize: 'Font size',
  pdfT2pTitle: 'Title (optional)',
  pdfT2pTitlePlaceholder: 'Document title…',

  // ── Camera scanner ──
  pdfScanStart: 'Start camera',
  pdfScanStop: 'Stop camera',
  pdfScanShutter: 'Capture page',
  pdfScanFilter: 'Filter',
  pdfScanFilterNone: 'Original',
  pdfScanFilterGray: 'Grayscale',
  pdfScanFilterBw: 'Black & white',
  pdfScanCount: '{n} page(s) captured',
  pdfScanDelete: 'Delete this page',
  pdfScanMoveLeft: 'Move left',
  pdfScanMoveRight: 'Move right',
  pdfScanHint:
    'Hold the camera flat over the document — the filter is applied the moment you capture.',
  pdfScanPageSize: 'PDF page size',
  pdfScanFit: 'Match photo',
  pdfScanA4: 'A4 portrait',
  pdfScanBuild: 'Build PDF',
  pdfScanDone: 'PDF built from {n} photo(s)',
}

export const bn: Record<string, string> = {
  // Registry card labels (referenced by tools/registry.tsx)
  toolPdfToExcel: 'PDF থেকে এক্সেল',
  toolPdfToExcelDesc: 'PDF-এর টেবিল ও লেখা .xlsx ওয়ার্কবুকে রূপান্তর করুন',
  toolPdfToPpt: 'PDF থেকে পাওয়ারপয়েন্ট',
  toolPdfToPptDesc: 'প্রতিটি পৃষ্ঠা পূর্ণ-স্লাইড .pptx প্রেজেন্টেশনে বদলে ফেলুন',
  toolPdfToHtml: 'PDF থেকে HTML',
  toolPdfToHtmlDesc: 'ডকুমেন্টের লেখা একটি স্বয়ংসম্পূর্ণ ওয়েব পেজ হিসেবে এক্সপোর্ট করুন',
  toolTextToPdf: 'লেখা থেকে PDF',
  toolTextToPdfDesc: 'পেস্ট করা লেখা বা .txt/.md ফাইল PDF-এ বদলান (বাংলা সাপোর্টেড)',
  toolPdfScanner: 'ক্যামেরা স্ক্যানার',
  toolPdfScannerDesc: 'ক্যামেরা দিয়ে ডকুমেন্ট তুলে একটি PDF বানান',

  // ── এরর (লাইব / স্ক্যানার প্যানেল থেকে থ্রো হয়) ──
  pdfErrNoText: 'এই PDF-এ কোনো লেখা পাওয়া যায়নি — স্ক্যান করা PDF-এর জন্য আগে OCR টুল ব্যবহার করুন',
  pdfErrEmptyText: 'আগে কিছু লেখা লিখুন বা ফাইল থেকে নিন',
  pdfErrTextTooLong: 'লেখাটি খুব বড় — ফলাফল ২০০ পৃষ্ঠার বেশি হয়ে যাবে',
  pdfErrCamera: 'ক্যামেরা চালু করা যায়নি — ব্রাউজারের অনুমতি চেক করুন',
  pdfErrCameraSecure:
    'ক্যামেরার জন্য নিরাপদ (https) সংযোগ দরকার — iOS Safari-সহ বেশিরভাগ ব্রাউজার http-তে ক্যামেরা ব্লক করে',
  pdfErrMaxShots: 'সর্বোচ্চ ৩০টি পৃষ্ঠা তোলা যাবে',

  // ── PDF → এক্সেল ──
  pdfXlsxHint:
    'সেরা-প্রচেষ্টা রূপান্তর: সাধারণ টেবিল ও লেখা লেআউট-হিউরিস্টিক দিয়ে শনাক্ত হয় — জটিল লেআউট Excel-এ ম্যানুয়ালি ঠিক করতে হতে পারে।',

  // ── PDF → পাওয়ারপয়েন্ট ──
  pdfPptResolution: 'স্লাইডের ছবির রেজোলিউশন',
  pdfPptScale1: '1× — ছোট ফাইল',
  pdfPptScale2: '2× — স্পষ্ট (প্রস্তাবিত)',
  pdfPptCap: 'বড় ডকুমেন্ট: প্রথম ৫০ পৃষ্ঠা পর্যন্ত রূপান্তর হবে।',

  // ── PDF → HTML ──
  pdfHtmlHint:
    'এক্সপোর্টটি একটি স্বয়ংসম্পূর্ণ .html ফাইল (কোনো এক্সটার্নাল রিসোর্স নেই) — লেখা সিলেক্ট ও সার্চ করা যাবে।',

  // ── লেখা → PDF ──
  pdfT2pInput: 'লেখার উৎস',
  pdfT2pPaste: 'লেখা লিখুন',
  pdfT2pFile: 'ফাইল খুলুন',
  pdfT2pPlaceholder: 'এখানে আপনার লেখা টাইপ বা পেস্ট করুন…',
  pdfT2pFileLoaded: 'ফাইলের লেখা নিচের এডিটরে নেওয়া হয়েছে',
  pdfT2pFileReadFail: 'ফাইলটি লেখা হিসেবে পড়া যায়নি',
  pdfT2pPageSize: 'পৃষ্ঠার সাইজ',
  pdfT2pA4: 'A4',
  pdfT2pLetter: 'Letter',
  pdfT2pMode: 'রেন্ডারিং',
  pdfT2pImage: 'ছবি — সম্পূর্ণ ইউনিকোড (বাংলা সাপোর্টেড)',
  pdfT2pImageHint:
    'লেখা ছবি হিসেবে আঁকা হয় — সব ডিভাইসে একই রকম দেখায় তবে সিলেক্ট করা যায় না।',
  pdfT2pText: 'সিলেক্টেবল লেখা — শুধু ল্যাটিন',
  pdfT2pTextHint:
    'সিলেক্ট ও সার্চ করা যায় এমন আসল লেখা। ল্যাটিন নয় এমন অক্ষর (যেমন বাংলা) “?” হয়ে যায়।',
  pdfT2pFontSize: 'ফন্ট সাইজ',
  pdfT2pTitle: 'শিরোনাম (ঐচ্ছিক)',
  pdfT2pTitlePlaceholder: 'ডকুমেন্টের শিরোনাম…',

  // ── ক্যামেরা স্ক্যানার ──
  pdfScanStart: 'ক্যামেরা চালু করুন',
  pdfScanStop: 'ক্যামেরা বন্ধ করুন',
  pdfScanShutter: 'পৃষ্ঠা তুলুন',
  pdfScanFilter: 'ফিল্টার',
  pdfScanFilterNone: 'আসল',
  pdfScanFilterGray: 'ধূসর',
  pdfScanFilterBw: 'সাদা-কালো',
  pdfScanCount: '{n}টি পৃষ্ঠা তোলা হয়েছে',
  pdfScanDelete: 'এই পৃষ্ঠাটি মুছুন',
  pdfScanMoveLeft: 'বাঁয়ে সরান',
  pdfScanMoveRight: 'ডানে সরান',
  pdfScanHint:
    'ক্যামেরাটি ডকুমেন্টের উপর সোজা রাখুন — ছবি তোলার মুহূর্তেই ফিল্টার বসে যাবে।',
  pdfScanPageSize: 'PDF পৃষ্ঠার সাইজ',
  pdfScanFit: 'ছবির সমান',
  pdfScanA4: 'A4 পোর্ট্রেট',
  pdfScanBuild: 'PDF বানান',
  pdfScanDone: '{n}টি ছবি থেকে PDF তৈরি হয়েছে',
}
