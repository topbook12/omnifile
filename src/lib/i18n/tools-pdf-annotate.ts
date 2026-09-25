/**
 * i18n dictionary — PDF annotate + redact tools (Task 2-d).
 * Owned by the pdf-annotate agent. Keys are referenced by
 * src/components/tools/pdf/PdfAnnotateTool.tsx,
 * src/components/tools/pdf/PdfRedactTool.tsx and tools/registry.tsx.
 *
 * Error keys (pdfErr*) are thrown by src/lib/tools/pdf-annotate-edit.ts as
 * ToolError i18n keys and translated via errMessage(err, t).
 * pdfErrCorrupt / pdfErrEncrypted already live in tools-pdf.ts (shared).
 */

export const en: Record<string, string> = {
  // Registry card labels (referenced by tools/registry.tsx)
  toolPdfAnnotate: 'Annotate PDF',
  toolPdfAnnotateDesc: 'Highlight, underline, draw shapes, notes, text boxes & stamps',
  toolPdfRedact: 'Redact PDF',
  toolPdfRedactDesc: 'Permanently black out sensitive text and areas',

  // ── Errors (thrown by the lib) ──
  pdfErrNoAnnotations: 'Nothing to save yet — add at least one annotation first',
  pdfErrNoBoxes: 'Draw at least one redaction box first',

  // ── Annotate: tool palette ──
  pdfAnnToolSelect: 'Select / move',
  pdfAnnToolHighlight: 'Highlight',
  pdfAnnToolUnderline: 'Underline',
  pdfAnnToolStrike: 'Strikethrough',
  pdfAnnToolRect: 'Rectangle',
  pdfAnnToolEllipse: 'Ellipse',
  pdfAnnToolLine: 'Line',
  pdfAnnToolArrow: 'Arrow',
  pdfAnnToolPencil: 'Free draw',
  pdfAnnToolTextbox: 'Text box',
  pdfAnnToolNote: 'Sticky note',
  pdfAnnToolStamp: 'Stamp',

  // ── Annotate: contextual controls ──
  pdfAnnColor: 'Colour',
  pdfAnnCustom: 'Custom colour',
  pdfAnnStroke: 'Stroke width',
  pdfAnnFontSize: 'Font size',
  pdfAnnFill: 'Fill shape',
  pdfAnnStampText: 'Stamp text',
  pdfAnnStampEmpty: 'Type the stamp text first',

  // ── Annotate: text editor popover ──
  pdfAnnTextboxPh: 'Type the text for this box…',
  pdfAnnNotePh: 'Type the note text…',
  pdfAnnAdd: 'Add',

  // ── Annotate: actions & hints ──
  pdfAnnDeleteSel: 'Delete selected',
  pdfAnnClearPage: 'Clear page marks',
  pdfAnnMarksPage: '{n} mark(s) on this page',
  pdfAnnTotal: '{n} annotation(s) total',
  pdfAnnHint: 'Pick a tool and mark up the page — everything is burned into the PDF when you save.',
  pdfAnnSelectHint: 'Tap a mark to select it, drag to move it. Press Delete to remove.',
  pdfAnnDragHint: 'Drag on the page to place it.',
  pdfAnnTapStampHint: 'Tap on the page to place the stamp.',
  pdfAnnTextboxHint: 'Drag a box on the page, then type the text.',

  // ── Redact ──
  pdfRedactHint: 'Drag solid boxes over the text and areas you want gone — the original PDF keeps every other page untouched.',
  pdfRedactDragHint: 'Drag over the text you want to remove.',
  pdfRedactBoxColor: 'Box colour',
  pdfRedactBlack: 'Black',
  pdfRedactWhite: 'White',
  pdfRedactBoxesPage: '{n} box(es) on this page',
  pdfRedactTotal: '{n} box(es) total',
  pdfRedactUndo: 'Undo last box',
  pdfRedactClearPage: 'Clear page boxes',
  pdfRedactWarning:
    'Redaction is permanent. Pages with boxes are rebuilt as images — the text underneath the boxes is destroyed beyond recovery and page text stops being selectable. Pages without boxes keep their original quality.',
  pdfRedactProgress: 'Redacting page {n} of {total}',
}

export const bn: Record<string, string> = {
  // Registry card labels (referenced by tools/registry.tsx)
  toolPdfAnnotate: 'PDF-এ মার্কআপ (Annotate)',
  toolPdfAnnotateDesc: 'হাইলাইট, আন্ডারলাইন, শেপ, নোট, টেক্সট বক্স ও স্ট্যাম্প যোগ করুন',
  toolPdfRedact: 'PDF কালো করুন (Redact)',
  toolPdfRedactDesc: 'সংবেদনশীল লেখা বা অংশ স্থায়ীভাবে কালো করে লুকিয়ে ফেলুন',

  // ── এরর (লাইব থেকে থ্রো হয়) ──
  pdfErrNoAnnotations: 'এখনো সেভ করার কিছু নেই — আগে অন্তত একটি মার্ক যোগ করুন',
  pdfErrNoBoxes: 'আগে অন্তত একটি বাক্স আঁকুন',

  // ── এনোটেট: টুল প্যালেট ──
  pdfAnnToolSelect: 'নির্বাচন / সরানো',
  pdfAnnToolHighlight: 'হাইলাইট',
  pdfAnnToolUnderline: 'আন্ডারলাইন',
  pdfAnnToolStrike: 'স্ট্রাইকথ্রু',
  pdfAnnToolRect: 'আয়ত',
  pdfAnnToolEllipse: 'উপবৃত্ত',
  pdfAnnToolLine: 'রেখা',
  pdfAnnToolArrow: 'তীর',
  pdfAnnToolPencil: 'হাতে আঁকা',
  pdfAnnToolTextbox: 'টেক্সট বক্স',
  pdfAnnToolNote: 'স্টিকি নোট',
  pdfAnnToolStamp: 'স্ট্যাম্প',

  // ── এনোটেট: প্রাসঙ্গিক নিয়ন্ত্রণ ──
  pdfAnnColor: 'রং',
  pdfAnnCustom: 'নিজের পছন্দের রং',
  pdfAnnStroke: 'রেখার বেধ',
  pdfAnnFontSize: 'লেখার সাইজ',
  pdfAnnFill: 'শেপ ভরাট করুন',
  pdfAnnStampText: 'স্ট্যাম্পের লেখা',
  pdfAnnStampEmpty: 'আগে স্ট্যাম্পের লেখা লিখুন',

  // ── এনোটেট: লেখা সম্পাদনা পপওভার ──
  pdfAnnTextboxPh: 'এই বাক্সের লেখা টাইপ করুন…',
  pdfAnnNotePh: 'নোটের লেখা টাইপ করুন…',
  pdfAnnAdd: 'যোগ করুন',

  // ── এনোটেট: অ্যাকশন ও নির্দেশনা ──
  pdfAnnDeleteSel: 'নির্বাচিত মার্ক মুছুন',
  pdfAnnClearPage: 'পৃষ্ঠার মার্ক মুছুন',
  pdfAnnMarksPage: 'এই পৃষ্ঠায় {n}টি মার্ক',
  pdfAnnTotal: 'মোট {n}টি মার্ক',
  pdfAnnHint: 'টুল বেছে নিয়ে পৃষ্ঠায় মার্ক করুন — সেভ করার সময় সবকিছু PDF-এ বসে যাবে।',
  pdfAnnSelectHint: 'মার্কে চাপ দিয়ে নির্বাচন করুন, টেনে সরান। মুছতে Delete চাপুন।',
  pdfAnnDragHint: 'পৃষ্ঠায় টেনে ছেড়ে দিন।',
  pdfAnnTapStampHint: 'স্ট্যাম্প বসাতে পৃষ্ঠায় চাপ দিন।',
  pdfAnnTextboxHint: 'পৃষ্ঠায় টেনে একটি বাক্স আঁকুন, তারপর লেখা টাইপ করুন।',

  // ── রিড্যাক্ট ──
  pdfRedactHint: 'যে লেখা বা অংশ সরাতে চান তার উপর টেনে বাক্স আঁকুন — বাক্স নেই এমন পৃষ্ঠা আগের মতোই থাকবে।',
  pdfRedactDragHint: 'যে লেখা মুছে ফেলতে চান তার উপর দিয়ে টেনে বাক্স আঁকুন।',
  pdfRedactBoxColor: 'বাক্সের রং',
  pdfRedactBlack: 'কালো',
  pdfRedactWhite: 'সাদা',
  pdfRedactBoxesPage: 'এই পৃষ্ঠায় {n}টি বাক্স',
  pdfRedactTotal: 'মোট {n}টি বাক্স',
  pdfRedactUndo: 'শেষ বাক্স বাদ দিন',
  pdfRedactClearPage: 'এই পৃষ্ঠার বাক্স মুছুন',
  pdfRedactWarning:
    'রিড্যাকশন স্থায়ী। বাক্স আঁকা পৃষ্ঠাগুলো ছবি হিসেবে নতুন করে তৈরি হয় — বাক্সের নিচের লেখা চিরতরে ধ্বংস হয়ে যায় এবং পৃষ্ঠার লেখা আর সিলেক্ট করা যায় না। বাক্স নেই এমন পৃষ্ঠা আগের মানেই থাকে।',
  pdfRedactProgress: 'রিড্যাক্ট হচ্ছে পৃষ্ঠা {n} / {total}',
}
