/**
 * i18n dictionary — PDF certificate sealing / security (Task 2-e).
 * Owned by the pdf-forms-security agent. Keys are referenced by
 * src/components/tools/pdf/PdfCertifyTool.tsx and src/lib/tools/pdf-certify.ts.
 *
 * Error keys (pdfErr*) are thrown as ToolError i18n keys by
 * src/lib/tools/pdf-certify.ts and translated via errMessage(err, t).
 */

export const en: Record<string, string> = {
  // Registry card labels (referenced by tools/registry.tsx)
  toolPdfCertify: 'Digital certificate seal',
  toolPdfCertifyDesc: 'Seal a PDF with your own certificate & verify integrity',

  // ── Seal mode ──
  pdfCertifyMode: 'Mode',
  pdfCertifySeal: 'Seal with certificate',
  pdfCertifyVerify: 'Verify a sealed PDF',
  pdfCertifyCN: 'Your name (Common Name)',
  pdfCertifyEmail: 'Email (optional)',
  pdfCertifyOrg: 'Organization (optional)',
  pdfCertifyDays: 'Valid for (days)',
  pdfCertifyPage: 'Seal page',
  pdfCertifyPageLast: 'Last page',
  pdfCertifyGenerate: 'Generate certificate & seal',
  pdfCertifyCertReady: 'Certificate ready — reusing it for further seals',
  pdfCertifyFingerprint: 'Fingerprint',
  pdfCertifyIncludeFiles: 'Include certificate files (.pem)',
  pdfCertifyKeyWarning:
    'Your certificate and private key stay on this device only. Keep the .omnisig.json file — that is what proves the document integrity later.',
  pdfCertifySealed: 'Sealed',

  // ── Verify mode ──
  pdfCertifyDropSig: 'Signature file (.omnisig.json)',
  pdfCertifyVerifyBtn: 'Verify integrity',
  pdfCertifyVerifyHint: 'Pick the original PDF and its .omnisig.json side-car file.',
  pdfCertifyValid: 'Signature valid',
  pdfCertifyInvalid: 'Signature INVALID',
  pdfCertifyUnchanged: 'Document unchanged since signing',
  pdfCertifyChanged: 'Document changed AFTER signing',
  pdfCertifySubject: 'Signed by',
  pdfCertifyTime: 'Signed at',

  // ── Errors (thrown by src/lib/tools/pdf-certify.ts) ──
  pdfErrCertName: 'Enter the name to put on the certificate',
  pdfErrBadSigJson: 'Not a valid OmniFile signature file (.omnisig.json)',
}

export const bn: Record<string, string> = {
  // রেজিস্ট্রি কার্ড লেবেল (tools/registry.tsx থেকে ব্যবহৃত)
  toolPdfCertify: 'ডিজিটাল সার্টিফিকেট সিল',
  toolPdfCertifyDesc: 'নিজের সার্টিফিকেট দিয়ে PDF সিল করুন ও অখণ্ডতা যাচাই করুন',

  // ── সিল মোড ──
  pdfCertifyMode: 'মোড',
  pdfCertifySeal: 'সার্টিফিকেট দিয়ে সিল',
  pdfCertifyVerify: 'সিল করা PDF যাচাই',
  pdfCertifyCN: 'আপনার নাম (Common Name)',
  pdfCertifyEmail: 'ইমেইল (ঐচ্ছিক)',
  pdfCertifyOrg: 'প্রতিষ্ঠান (ঐচ্ছিক)',
  pdfCertifyDays: 'বৈধতা (দিন)',
  pdfCertifyPage: 'সিলের পৃষ্ঠা',
  pdfCertifyPageLast: 'শেষ পৃষ্ঠা',
  pdfCertifyGenerate: 'সার্টিফিকেট বানিয়ে সিল করুন',
  pdfCertifyCertReady: 'সার্টিফিকেট তৈরি — পরের সিলেও এটিই ব্যবহৃত হবে',
  pdfCertifyFingerprint: 'ফিঙ্গারপ্রিন্ট',
  pdfCertifyIncludeFiles: 'সার্টিফিকেট ফাইলও রাখুন (.pem)',
  pdfCertifyKeyWarning:
    'সার্টিফিকেট ও প্রাইভেট কী শুধুই এই ডিভাইসে থাকে। .omnisig.json ফাইলটি সংরক্ষণ করে রাখুন — পরে ডকুমেন্টের অখণ্ডতা প্রমাণ করতে এটিই লাগবে।',
  pdfCertifySealed: 'সিল হয়েছে',

  // ── যাচাই মোড ──
  pdfCertifyDropSig: 'সিগনেচার ফাইল (.omnisig.json)',
  pdfCertifyVerifyBtn: 'অখণ্ডতা যাচাই করুন',
  pdfCertifyVerifyHint: 'মূল PDF এবং তার .omnisig.json ফাইলটি বাছুন।',
  pdfCertifyValid: 'সই সঠিক',
  pdfCertifyInvalid: 'সই সঠিক নয়',
  pdfCertifyUnchanged: 'সইয়ের পর থেকে ডকুমেন্ট অপরিবর্তিত',
  pdfCertifyChanged: 'সইয়ের পরে ডকুমেন্ট বদলে গেছে',
  pdfCertifySubject: 'সই করেছেন',
  pdfCertifyTime: 'সইয়ের সময়',

  // ── এরর (src/lib/tools/pdf-certify.ts থেকে থ্রো হয়) ──
  pdfErrCertName: 'সার্টিফিকেটে যে নাম বসবে সেটি লিখুন',
  pdfErrBadSigJson: 'এটি সঠিক OmniFile সিগনেচার ফাইল (.omnisig.json) নয়',
}
