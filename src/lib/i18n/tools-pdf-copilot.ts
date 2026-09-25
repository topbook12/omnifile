/**
 * i18n dictionary — AI PDF Copilot + Share & cloud sync (Task 2-f).
 * Owned by the pdf-ai agent. Keys are referenced by
 * src/components/tools/pdf/PdfCopilotTool.tsx, PdfCloudTool.tsx and
 * src/components/tools/registry.tsx.
 *
 * Error keys (pdfErr*) are thrown by src/lib/tools/pdf-copilot.ts or the
 * panels as ToolError i18n keys and translated via errMessage(err, t).
 */

export const en: Record<string, string> = {
  // Registry card labels (referenced by tools/registry.tsx)
  toolPdfCopilot: 'AI Copilot for PDF',
  toolPdfCopilotDesc: 'Summarize, translate and chat with your document (your own Gemini key)',
  toolPdfCloud: 'Share & cloud sync',
  toolPdfCloudDesc: 'Share, export bundles, upload via your own Drive/Dropbox token',

  // ── AI Copilot panel ──
  pdfCopPages: '{n} pages',
  pdfCopChars: '{n} characters',
  pdfCopReady: 'Ready',
  pdfErrNoText: 'No readable text found in this PDF — if it is a scan, run the OCR tool first',
  pdfCopTabSum: 'Summarize',
  pdfCopTabTranslate: 'Translate',
  pdfCopTabChat: 'Chat',
  pdfCopMode: 'Summary style',
  pdfCopModeBrief: 'Brief',
  pdfCopModeDetailed: 'Detailed',
  pdfCopModeBullets: 'Bullet points',
  pdfCopOutLang: 'Output language',
  pdfCopLangAuto: 'Document language',
  pdfCopLangBn: 'Bangla',
  pdfCopLangEn: 'English',
  pdfCopRunSummary: 'Summarize',
  pdfCopSummarizing: 'Summarizing…',
  pdfCopTarget: 'Translate to',
  pdfCopTargetBn: 'Bangla',
  pdfCopTargetEn: 'English',
  pdfCopTargetAr: 'Arabic',
  pdfCopTargetHi: 'Hindi',
  pdfCopTargetEs: 'Spanish',
  pdfCopTargetFr: 'French',
  pdfCopRunTranslate: 'Translate',
  pdfCopTranslating: 'Translating…',
  pdfCopTranslateChunk: 'Chunk {done} of {total}',
  pdfCopResult: 'Result',
  pdfCopChatPlaceholder: 'Ask something about the document…',
  pdfCopChatSend: 'Send',
  pdfCopChatClear: 'Clear chat',
  pdfCopChatThinking: 'Thinking…',
  pdfCopChatYou: 'You',
  pdfCopChatAi: 'AI',
  pdfCopChatEmpty: 'Ask anything about the document — answers come only from its own pages.',

  // ── Share & cloud sync panel ──
  pdfCloudShareTitle: 'Share',
  pdfCloudShareDesc: 'Send the PDF straight to any app on this device.',
  pdfCloudShare: 'Share',
  pdfCloudShareUnsupported:
    'Direct sharing is not supported on this browser — download the file and share it manually.',
  pdfCloudShared: 'Shared successfully',
  pdfCloudPickFirst: 'Pick a PDF above to enable the actions below.',
  pdfCloudBundleTitle: 'Portable bundle',
  pdfCloudBundleHint:
    'A .omnibundle wraps the PDF with a small metadata file — handy for backups or moving between devices.',
  pdfCloudExportBundle: 'Export bundle',
  pdfCloudImportBundle: 'Import bundle',
  pdfErrBundleBad: 'This file is not a valid OmniFile bundle',
  pdfCloudImportDone: 'Bundle imported — save the PDF from the results below',
  pdfCloudCloudTitle: 'Cloud sync (your own token)',
  pdfCloudProvider: 'Provider',
  pdfCloudDrive: 'Google Drive',
  pdfCloudDropbox: 'Dropbox',
  pdfCloudToken: 'Access token',
  pdfCloudTokenPlaceholder: 'Paste your access token…',
  pdfCloudSaveToken: 'Remember on this device',
  pdfCloudTokenHelpDrive:
    'Create an OAuth access token with the drive.file scope (Google Cloud Console or the OAuth 2.0 Playground).',
  pdfCloudTokenHelpDropbox:
    'Create an app access token at dropbox.com/developers — give the app files.content.write permission.',
  pdfCloudUpload: 'Upload',
  pdfCloudList: 'List recent',
  pdfCloudUploaded: 'Uploaded to {provider}',
  pdfCloudFileId: 'Uploaded file ID',
  pdfCloudNothing: 'No files found',
  pdfCloudPrivacyNote:
    'Requests go straight from your browser to the provider — we never see your token or your files.',
  pdfErrCloudAuth: 'The provider rejected the token — make sure it is valid and has the required permission',
  pdfErrCloudRate: 'Too many requests — wait a moment and try again',
  pdfErrCloudNetwork: 'Could not reach the provider — check your connection',
  pdfErrCloudNoToken: 'Enter your access token first',
}

export const bn: Record<string, string> = {
  // রেজিস্ট্রি কার্ড লেবেল (tools/registry.tsx থেকে ব্যবহৃত)
  toolPdfCopilot: 'PDF-এর জন্য AI কপাইলট',
  toolPdfCopilotDesc: 'ডকুমেন্টের সারাংশ, অনুবাদ ও প্রশ্নোত্তর করুন (নিজের Gemini key ব্যবহার হয়)',
  toolPdfCloud: 'শেয়ার ও ক্লাউড সিঙ্ক',
  toolPdfCloudDesc: 'শেয়ার, বান্ডেল এক্সপোর্ট এবং নিজের Drive/Dropbox token দিয়ে আপলোড',

  // ── AI কপাইলট প্যানেল ──
  pdfCopPages: '{n}টি পৃষ্ঠা',
  pdfCopChars: '{n}টি অক্ষর',
  pdfCopReady: 'প্রস্তুত',
  pdfErrNoText: 'এই PDF-এ পড়ার মতো কোনো লেখা পাওয়া যায়নি — স্ক্যান করা হলে আগে OCR টুল চালান',
  pdfCopTabSum: 'সারাংশ',
  pdfCopTabTranslate: 'অনুবাদ',
  pdfCopTabChat: 'চ্যাট',
  pdfCopMode: 'সারাংশের ধরন',
  pdfCopModeBrief: 'সংক্ষিপ্ত',
  pdfCopModeDetailed: 'বিস্তারিত',
  pdfCopModeBullets: 'বুলেট পয়েন্ট',
  pdfCopOutLang: 'আউটপুট ভাষা',
  pdfCopLangAuto: 'ডকুমেন্টের ভাষা',
  pdfCopLangBn: 'বাংলা',
  pdfCopLangEn: 'ইংরেজি',
  pdfCopRunSummary: 'সারাংশ করুন',
  pdfCopSummarizing: 'সারাংশ তৈরি হচ্ছে…',
  pdfCopTarget: 'যে ভাষায় অনুবাদ হবে',
  pdfCopTargetBn: 'বাংলা',
  pdfCopTargetEn: 'ইংরেজি',
  pdfCopTargetAr: 'আরবি',
  pdfCopTargetHi: 'হিন্দি',
  pdfCopTargetEs: 'স্প্যানিশ',
  pdfCopTargetFr: 'ফরাসি',
  pdfCopRunTranslate: 'অনুবাদ করুন',
  pdfCopTranslating: 'অনুবাদ হচ্ছে…',
  pdfCopTranslateChunk: '{total} অংশের {done}টি সম্পন্ন',
  pdfCopResult: 'ফলাফল',
  pdfCopChatPlaceholder: 'ডকুমেন্ট সম্পর্কে প্রশ্ন লিখুন…',
  pdfCopChatSend: 'পাঠান',
  pdfCopChatClear: 'চ্যাট মুছুন',
  pdfCopChatThinking: 'ভাবছে…',
  pdfCopChatYou: 'আপনি',
  pdfCopChatAi: 'AI',
  pdfCopChatEmpty: 'ডকুমেন্ট নিয়ে যা খুশি জিজ্ঞেস করুন — উত্তর আসবে শুধু এর নিজের পৃষ্ঠা থেকে।',

  // ── শেয়ার ও ক্লাউড সিঙ্ক প্যানেল ──
  pdfCloudShareTitle: 'শেয়ার',
  pdfCloudShareDesc: 'PDF-টি সরাসরি এই ডিভাইসের যেকোনো অ্যাপে পাঠান।',
  pdfCloudShare: 'শেয়ার',
  pdfCloudShareUnsupported:
    'এই ব্রাউজারে সরাসরি শেয়ার করা যায় না — ফাইলটি ডাউনলোড করে নিজে শেয়ার করুন।',
  pdfCloudShared: 'শেয়ার সম্পন্ন হয়েছে',
  pdfCloudPickFirst: 'নিচের অ্যাকশনগুলো চালু করতে উপরে একটি PDF বাছুন।',
  pdfCloudBundleTitle: 'পোর্টেবল বান্ডেল',
  pdfCloudBundleHint:
    '.omnibundle ফাইলে PDF-এর সাথে ছোট একটি মেটাডেটা থাকে — ব্যাকআপ বা অন্য ডিভাইসে নেওয়ার জন্য সুবিধাজনক।',
  pdfCloudExportBundle: 'বান্ডেল এক্সপোর্ট',
  pdfCloudImportBundle: 'বান্ডেল ইমপোর্ট',
  pdfErrBundleBad: 'এটি সঠিক OmniFile বান্ডেল নয়',
  pdfCloudImportDone: 'বান্ডেল ইমপোর্ট হয়েছে — নিচের ফলাফল থেকে PDF সেভ করুন',
  pdfCloudCloudTitle: 'ক্লাউড সিঙ্ক (নিজের token)',
  pdfCloudProvider: 'প্রোভাইডার',
  pdfCloudDrive: 'Google Drive',
  pdfCloudDropbox: 'Dropbox',
  pdfCloudToken: 'অ্যাক্সেস token',
  pdfCloudTokenPlaceholder: 'আপনার অ্যাক্সেস token পেস্ট করুন…',
  pdfCloudSaveToken: 'এই ডিভাইসে মনে রাখুন',
  pdfCloudTokenHelpDrive:
    'drive.file স্কোপসহ OAuth অ্যাক্সেস token তৈরি করুন (Google Cloud Console বা OAuth 2.0 Playground)।',
  pdfCloudTokenHelpDropbox:
    'dropbox.com/developers-এ অ্যাপ বানিয়ে App access token নিন — অ্যাপে files.content.write অনুমতি দিন।',
  pdfCloudUpload: 'আপলোড',
  pdfCloudList: 'সাম্প্রতিক ফাইল',
  pdfCloudUploaded: '{provider}-এ আপলোড হয়েছে',
  pdfCloudFileId: 'আপলোড হওয়া ফাইলের ID',
  pdfCloudNothing: 'কোনো ফাইল পাওয়া যায়নি',
  pdfCloudPrivacyNote:
    'রিকোয়েস্ট সরাসরি আপনার ব্রাউজার থেকে প্রোভাইডারে যায় — আপনার token বা ফাইল আমরা কখনোই দেখি না।',
  pdfErrCloudAuth: 'token গ্রহণ করা হয়নি — token টি সঠিক কি না ও প্রয়োজনীয় অনুমতি আছে কি না দেখুন',
  pdfErrCloudRate: 'অনেক বেশি রিকোয়েস্ট হয়ে গেছে — একটু পরে চেষ্টা করুন',
  pdfErrCloudNetwork: 'প্রোভাইডারে পৌঁছানো যায়নি — ইন্টারনেট সংযোগ দেখুন',
  pdfErrCloudNoToken: 'আগে আপনার অ্যাক্সেস token লিখুন',
}
