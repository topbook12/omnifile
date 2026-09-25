/**
 * i18n dictionary — core PDF editing tools (Task 2-a).
 * Owned by the pdf-edit agent. Keys are referenced by
 * src/components/tools/pdf/PdfTextTool.tsx, PdfImageStampTool.tsx,
 * PdfHyperlinkTool.tsx, PdfWatermarkTool.tsx and src/components/tools/registry.tsx.
 *
 * KEEP the toolPdfAddText/toolPdfAddImage/toolPdfHyperlink/toolPdfWatermark
 * (+ Desc) keys below — the registry references them.
 *
 * Error keys (pdfErr*) are thrown by src/lib/tools/pdf-edit.ts as ToolError
 * i18n keys and translated via errMessage(err, t). Shared error keys that
 * already exist in tools-pdf.ts (pdfErrCorrupt, pdfErrEncrypted,
 * pdfErrWrongPassword, pdfErrNoImage, pdfErrBadRanges, pdfPageN) are reused —
 * NOT redeclared here.
 */

export const en: Record<string, string> = {
  // Registry card labels (referenced by tools/registry.tsx)
  toolPdfAddText: 'Add text to PDF',
  toolPdfAddTextDesc: 'Place new text with font, size & color on any page',
  toolPdfAddImage: 'Add image to PDF',
  toolPdfAddImageDesc: 'Insert, resize, rotate & crop images onto pages',
  toolPdfHyperlink: 'Add hyperlinks',
  toolPdfHyperlinkDesc: 'Link text areas to URLs or other pages',
  toolPdfWatermark: 'Watermark PDF',
  toolPdfWatermarkDesc: 'Add text/logo watermarks or cover unwanted marks',

  // ── Errors thrown by pdf-edit.ts (shared ones live in tools-pdf.ts) ──
  pdfErrNoEdits: 'Nothing to place yet — add at least one item first',
  pdfErrBadUrl: 'Enter a valid link, e.g. https://example.com',
  pdfErrBadLinkTarget: 'The target page is outside this document',
  pdfErrNoWatermarkText: 'Type the watermark text first',

  // ── Text tool ──
  pdfEditText: 'Text',
  pdfEditTextPlaceholder: 'Type the text to place on the page…',
  pdfEditFont: 'Font',
  pdfEditFontHelv: 'Helvetica',
  pdfEditFontHelvBold: 'Helvetica Bold',
  pdfEditFontTimes: 'Times Roman',
  pdfEditFontTimesBold: 'Times Bold',
  pdfEditFontCourier: 'Courier',
  pdfEditFontCourierOblique: 'Courier Oblique',
  pdfEditTextHint: 'Tap on the page to place the text block there',
  pdfEditColor: 'Colour',
  pdfEditSize: 'Font size',
  pdfEditNoText: 'Type some text first',
  pdfEditBlocks: 'Text blocks',
  pdfEditBlockEmpty: 'empty block',
  pdfEditDone: 'Text added',

  // ── Image stamp tool ──
  pdfStampPick: 'Image to place',
  pdfStampPickFirst: 'Choose an image first',
  pdfStampCrop: 'Crop image',
  pdfStampCropLeft: 'Crop left',
  pdfStampCropRight: 'Crop right',
  pdfStampCropTop: 'Crop top',
  pdfStampCropBottom: 'Crop bottom',
  pdfStampCropPreview: 'Crop preview',
  pdfStampWidth: 'Width (% of page)',
  pdfStampRotation: 'Rotation',
  pdfStampRot0: '0° — upright',
  pdfStampRot90: '90° — right',
  pdfStampRot180: '180° — upside down',
  pdfStampRot270: '270° — left',
  pdfStampOpacity: 'Opacity',
  pdfStampHint: 'Tap on the page to place the image there (the tap point is the centre)',
  pdfStampPlacements: 'Placed images',
  pdfStampDone: 'Images placed',

  // ── Hyperlink tool ──
  pdfLinkMode: 'Link type',
  pdfLinkExternal: 'Web address (URL)',
  pdfLinkInternal: 'Another page in this PDF',
  pdfLinkUrl: 'URL',
  pdfLinkTarget: 'Target page',
  pdfLinkTargetHint: 'Clicking the link jumps to this page',
  pdfLinkBorder: 'Show a visible border',
  pdfLinkDragHint: 'Drag a rectangle on the page to mark the clickable area',
  pdfLinkList: 'Links',
  pdfLinkToPage: 'To page {n}',
  pdfLinkDone: 'Links added',

  // ── Watermark tool ──
  pdfWmMode: 'Mode',
  pdfWmAdd: 'Add watermark',
  pdfWmRemove: 'Cover unwanted marks',
  pdfWmSource: 'Watermark type',
  pdfWmText: 'Text',
  pdfWmImage: 'Image / logo',
  pdfWmContent: 'Watermark text',
  pdfWmContentPlaceholder: 'e.g. CONFIDENTIAL',
  pdfWmFontSize: 'Font size',
  pdfWmAuto: '0 = auto-fit to the page',
  pdfWmAutoShort: 'Auto',
  pdfWmColor: 'Colour',
  pdfWmOpacity: 'Opacity',
  pdfWmRotation: 'Rotation',
  pdfWmLayout: 'Layout',
  pdfWmCenter: 'Centre',
  pdfWmTile: 'Tile (grid)',
  pdfWmTop: 'Top',
  pdfWmBottom: 'Bottom',
  pdfWmImagePick: 'Logo image',
  pdfWmImageWidth: 'Logo width (% of page)',
  pdfWmPickFirst: 'Choose a logo image first',
  pdfWmPages: 'Pages',
  pdfWmAll: 'All pages',
  pdfWmRanges: 'Selected ranges',
  pdfWmRangesLabel: 'Page ranges',
  pdfWmRangesHint: 'Example: 1-3, 5, 8- (without an end number it runs to the last page)',
  pdfWmDone: 'Watermark added',

  // ── Watermark tool: remove (cover) mode ──
  pdfCoverColor: 'Cover colour',
  pdfCoverDepth: 'How deep to erase',
  pdfCoverSurface: 'Cover — fast',
  pdfCoverDeep: 'Erase — deep',
  pdfCoverSurfaceHint: 'Paints an opaque box over the mark. Fast, but the text underneath remains selectable.',
  pdfCoverDeepHint: 'Re-renders the page as an image — whatever is under the boxes is permanently destroyed.',
  pdfCoverDragHint: 'Drag a box over each mark you want to hide',
  pdfCoverBoxes: 'Cover boxes',
  pdfCoverDone: 'Marks covered',

  // ── Shared within the editing tools ──
  pdfEditUndoLast: 'Undo last',
  pdfEditClearAll: 'Clear all',
  pdfEditPreviewNote: 'The preview is a rendering — open the downloaded file to check the final result.',
}

export const bn: Record<string, string> = {
  // Registry card labels (referenced by tools/registry.tsx)
  toolPdfAddText: 'PDF-এ লেখা যোগ করুন',
  toolPdfAddTextDesc: 'যেকোনো পৃষ্ঠায় ফন্ট, সাইজ ও রঙসহ নতুন লেখা বসান',
  toolPdfAddImage: 'PDF-এ ছবি যোগ করুন',
  toolPdfAddImageDesc: 'পৃষ্ঠার ওপর ছবি বসান — সাইজ, ঘোরানো ও ক্রপ করার সুবিধাসহ',
  toolPdfHyperlink: 'হাইপারলিংক যোগ করুন',
  toolPdfHyperlinkDesc: 'লেখার অংশকে ওয়েবসাইট বা অন্য পৃষ্ঠার সাথে লিংক করুন',
  toolPdfWatermark: 'ওয়াটারমার্ক',
  toolPdfWatermarkDesc: 'লেখা বা লোগোর ওয়াটারমার্ক দিন, অবাঞ্ছিত দাগ ঢেকে দিন',

  // ── pdf-edit.ts থেকে থ্রো হওয়া এরর (শেয়ারডগুলো tools-pdf.ts-এ আছে) ──
  pdfErrNoEdits: 'এখনো কিছু বসানো হয়নি — আগে অন্তত একটি বসিয়ে নিন',
  pdfErrBadUrl: 'সঠিক লিংক লিখুন, যেমন https://example.com',
  pdfErrBadLinkTarget: 'লক্ষ্য পৃষ্ঠাটি এই ডকুমেন্টের বাইরে',
  pdfErrNoWatermarkText: 'আগে ওয়াটারমার্কের লেখাটি লিখুন',

  // ── লেখা যোগ করার টুল ──
  pdfEditText: 'লেখা',
  pdfEditTextPlaceholder: 'পৃষ্ঠায় বসানোর লেখাটি লিখুন…',
  pdfEditFont: 'ফন্ট',
  pdfEditFontHelv: 'Helvetica',
  pdfEditFontHelvBold: 'Helvetica Bold',
  pdfEditFontTimes: 'Times Roman',
  pdfEditFontTimesBold: 'Times Bold',
  pdfEditFontCourier: 'Courier',
  pdfEditFontCourierOblique: 'Courier Oblique',
  pdfEditTextHint: 'লেখাটি বসাতে পৃষ্ঠার ওপর চাপ দিন',
  pdfEditColor: 'রঙ',
  pdfEditSize: 'ফন্ট সাইজ',
  pdfEditNoText: 'আগে কিছু লেখা লিখুন',
  pdfEditBlocks: 'লেখার ব্লক',
  pdfEditBlockEmpty: 'খালি ব্লক',
  pdfEditDone: 'লেখা যোগ হয়েছে',

  // ── ছবি বসানোর টুল ──
  pdfStampPick: 'বসানোর ছবি',
  pdfStampPickFirst: 'আগে একটি ছবি বাছুন',
  pdfStampCrop: 'ছবি ক্রপ',
  pdfStampCropLeft: 'বাঁ দিকে ক্রপ',
  pdfStampCropRight: 'ডান দিকে ক্রপ',
  pdfStampCropTop: 'ওপরে ক্রপ',
  pdfStampCropBottom: 'নিচে ক্রপ',
  pdfStampCropPreview: 'ক্রপ প্রিভিউ',
  pdfStampWidth: 'প্রস্থ (পৃষ্ঠার %)',
  pdfStampRotation: 'ঘোরানো',
  pdfStampRot0: '0° — সোজা',
  pdfStampRot90: '90° — ডানে',
  pdfStampRot180: '180° — উল্টো',
  pdfStampRot270: '270° — বাঁয়ে',
  pdfStampOpacity: 'অস্বচ্ছতা',
  pdfStampHint: 'ছবিটি বসাতে পৃষ্ঠার ওপর চাপ দিন (চাপ দেওয়া জায়গাটিই ছবির কেন্দ্র)',
  pdfStampPlacements: 'বসানো ছবি',
  pdfStampDone: 'ছবি বসানো হয়েছে',

  // ── হাইপারলিংক টুল ──
  pdfLinkMode: 'লিংকের ধরন',
  pdfLinkExternal: 'ওয়েব ঠিকানা (URL)',
  pdfLinkInternal: 'এই PDF-এর অন্য পৃষ্ঠা',
  pdfLinkUrl: 'URL',
  pdfLinkTarget: 'লক্ষ্য পৃষ্ঠা',
  pdfLinkTargetHint: 'লিংকে চাপ দিলে এই পৃষ্ঠায় যাবে',
  pdfLinkBorder: 'দৃশ্যমান বর্ডার দেখান',
  pdfLinkDragHint: 'ক্লিক করার জায়গাটি চিহ্নিত করতে পৃষ্ঠায় টেনে একটি বাক্স আঁকুন',
  pdfLinkList: 'লিংক',
  pdfLinkToPage: 'পৃষ্ঠা {n}-এ যায়',
  pdfLinkDone: 'লিংক যোগ হয়েছে',

  // ── ওয়াটারমার্ক টুল ──
  pdfWmMode: 'মোড',
  pdfWmAdd: 'ওয়াটারমার্ক যোগ করুন',
  pdfWmRemove: 'অবাঞ্ছিত দাগ ঢাকুন',
  pdfWmSource: 'ওয়াটারমার্কের ধরন',
  pdfWmText: 'লেখা',
  pdfWmImage: 'ছবি / লোগো',
  pdfWmContent: 'ওয়াটারমার্কের লেখা',
  pdfWmContentPlaceholder: 'যেমন: গোপনীয়',
  pdfWmFontSize: 'ফন্ট সাইজ',
  pdfWmAuto: '0 = পৃষ্ঠা অনুযায়ী অটো ফিট',
  pdfWmAutoShort: 'অটো',
  pdfWmColor: 'রঙ',
  pdfWmOpacity: 'অস্বচ্ছতা',
  pdfWmRotation: 'ঘোরানো',
  pdfWmLayout: 'বিন্যাস',
  pdfWmCenter: 'মাঝখানে',
  pdfWmTile: 'গ্রিডে সারিবদ্ধ',
  pdfWmTop: 'ওপরে',
  pdfWmBottom: 'নিচে',
  pdfWmImagePick: 'লোগোর ছবি',
  pdfWmImageWidth: 'লোগোর প্রস্থ (পৃষ্ঠার %)',
  pdfWmPickFirst: 'আগে লোগোর ছবি বাছুন',
  pdfWmPages: 'পৃষ্ঠা',
  pdfWmAll: 'সব পৃষ্ঠা',
  pdfWmRanges: 'নির্বাচিত রেঞ্জ',
  pdfWmRangesLabel: 'পৃষ্ঠার রেঞ্জ',
  pdfWmRangesHint: 'উদাহরণ: 1-3, 5, 8- (শেষ সংখ্যা না দিলে শেষ পৃষ্ঠা পর্যন্ত)',
  pdfWmDone: 'ওয়াটারমার্ক যোগ হয়েছে',

  // ── ওয়াটারমার্ক টুল: দাগ ঢাকার মোড ──
  pdfCoverColor: 'ঢাকার রঙ',
  pdfCoverDepth: 'কত গভীরে মুছবেন',
  pdfCoverSurface: 'ঢাকুন — দ্রুত',
  pdfCoverDeep: 'মুছুন — গভীর',
  pdfCoverSurfaceHint: 'দাগের ওপর অস্বচ্ছ বাক্স এঁকে ঢেকে দেয়। দ্রুত, তবে নিচের লেখা সিলেক্ট করা যায়।',
  pdfCoverDeepHint: 'পৃষ্ঠাটি ছবি হিসেবে নতুন করে তৈরি হয় — বাক্সের নিচের বিষয়বস্তু স্থায়ীভাবে মুছে যায়।',
  pdfCoverDragHint: 'যে দাগগুলো লুকাতে চান, প্রতিটির ওপর টেনে বাক্স আঁকুন',
  pdfCoverBoxes: 'ঢাকা বাক্স',
  pdfCoverDone: 'দাগ ঢাকা হয়েছে',

  // ── এডিটিং টুলগুলোর শেয়ারড ──
  pdfEditUndoLast: 'শেষটা বাতিল',
  pdfEditClearAll: 'সব মুছুন',
  pdfEditPreviewNote: 'প্রিভিউ শুধু দেখার জন্য — চূড়ান্ত ফল দেখতে ডাউনলোড করা ফাইলটি খুলুন।',
}
