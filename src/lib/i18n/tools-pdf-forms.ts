/**
 * i18n dictionary — PDF form tools (Task 2-e).
 * Owned by the pdf-forms-security agent. Keys are referenced by
 * src/components/tools/pdf/PdfFormBuilderTool.tsx, PdfFormExtractTool.tsx,
 * PdfEsignFlowTool.tsx and src/lib/tools/pdf-forms.ts.
 *
 * Error keys (pdfErr*) are thrown as ToolError i18n keys by
 * src/lib/tools/pdf-forms.ts and translated via errMessage(err, t).
 */

export const en: Record<string, string> = {
  // Registry card labels (referenced by tools/registry.tsx)
  toolPdfFormBuilder: 'Form builder',
  toolPdfFormFillable: 'Add text fields, checkboxes, radio groups, dropdowns & buttons',
  toolPdfFormExtract: 'Form data extractor',
  toolPdfFormExtractDesc: 'Read filled form fields into CSV or Excel',
  toolPdfEsignFlow: 'E-sign workflow',
  toolPdfEsignFlowDesc: 'Track multi-step signing requests on this device',

  // ── Form builder ──
  pdfFormPalette: 'Field type',
  pdfFormKindText: 'Text field',
  pdfFormKindMultiline: 'Multiline text',
  pdfFormKindCheckbox: 'Checkbox',
  pdfFormKindRadio: 'Radio option',
  pdfFormKindDropdown: 'Dropdown',
  pdfFormKindButton: 'Push button',
  pdfFormFieldName: 'Field name',
  pdfFormFieldNameHint: 'Unique name for the PDF, e.g. full_name',
  pdfFormRadioGroup: 'Radio group name',
  pdfFormRadioValue: 'Option value',
  pdfFormOptions: 'Options (comma separated)',
  pdfFormBtnLabel: 'Button label',
  pdfFormDefaultValue: 'Default value',
  pdfFormLatinHint:
    'Field appearances use a Latin font — non-Latin characters in default values, option values and labels are shown as "?". The fields themselves stay fully fillable.',
  pdfFormDragHint: 'Drag a rectangle on the page to place this field (min. 8 pt)',
  pdfFormPlacements: 'Placed fields',
  pdfFormNoPlacements: 'No fields yet — draw a rectangle on the page preview.',
  pdfFormRemove: 'Remove field',
  pdfFormBuildDone: 'Form fields added',
  pdfFormNote:
    'The rectangles become real fillable AcroForm fields — open the result in any PDF reader and type straight into them.',

  // ── Field type labels (extract table) ──
  pdfFormTypeText: 'Text field',
  pdfFormTypeCheckbox: 'Checkbox',
  pdfFormTypeRadio: 'Radio group',
  pdfFormTypeDropdown: 'Dropdown',
  pdfFormTypeButton: 'Button',
  pdfFormTypeOptionlist: 'Option list',
  pdfFormTypeSignature: 'Signature field',

  // ── Form data extractor ──
  pdfFormColName: 'Name',
  pdfFormColType: 'Type',
  pdfFormColValue: 'Value',
  pdfFormColOptions: 'Options',
  pdfFormDownloadCsv: 'Download CSV',
  pdfFormDownloadXlsx: 'Download Excel',

  // ── E-sign workflow ──
  pdfEsignNew: 'New signing request',
  pdfEsignFileName: 'Document name',
  pdfEsignPickName: 'Pick a PDF to fill the name',
  pdfEsignSigners: 'Signers',
  pdfEsignSignerName: 'Signer name',
  pdfEsignAddSigner: 'Add signer',
  pdfEsignNote: 'Note (optional)',
  pdfEsignSave: 'Save request',
  pdfEsignSaved: 'Request saved',
  pdfEsignEmpty:
    'No signing requests yet — create one to keep track of who has already signed.',
  pdfEsignStatusDraft: 'Draft',
  pdfEsignStatusInProgress: 'In progress',
  pdfEsignStatusCompleted: 'Completed',
  pdfEsignPending: 'Pending',
  pdfEsignSigned: 'Signed',
  pdfEsignSignNow: 'Sign now',
  pdfEsignMarkSigned: 'Mark signed',
  pdfEsignSignerFile: 'Pick the PDF to sign',
  pdfEsignDone: 'Signed — download started',
  pdfEsignAllSigned: 'All signers done — request completed',
  pdfEsignProgress: '{done}/{total} signed',
  pdfEsignPrivacy:
    'Only the request details are stored on this device — the PDF itself is never saved.',
  pdfEsignRequireFile: 'Pick the PDF to sign first',
  pdfEsignRequireName: 'Give the document a name first',
  pdfEsignRequireSigner: 'Add at least one signer',

  // ── Errors (thrown by src/lib/tools/pdf-forms.ts) ──
  pdfErrDuplicateField: 'A field with this name already exists',
  pdfErrNoFormFields: 'This PDF has no fillable form fields',
  pdfErrNoFields: 'Draw at least one field on the page first',
  pdfErrFieldName: 'Every field needs a name',
  pdfErrFieldOptions: 'Add at least one option for this field',
}

export const bn: Record<string, string> = {
  // রেজিস্ট্রি কার্ড লেবেল (tools/registry.tsx থেকে ব্যবহৃত)
  toolPdfFormBuilder: 'ফর্ম বিল্ডার',
  toolPdfFormFillable: 'টেক্সট ফিল্ড, চেকবক্স, রেডিও গ্রুপ, ড্রপডাউন ও বাটন যোগ করুন',
  toolPdfFormExtract: 'ফর্ম ডেটা এক্সট্র্যাক্টর',
  toolPdfFormExtractDesc: 'পূরণ করা ফর্ম ফিল্ডগুলো CSV বা এক্সেলে তুলুন',
  toolPdfEsignFlow: 'ই-সাইন ওয়ার্কফ্লো',
  toolPdfEsignFlowDesc: 'এই ডিভাইসে ধাপে ধাপে সইয়ের অনুরোধ ট্র্যাক করুন',

  // ── ফর্ম বিল্ডার ──
  pdfFormPalette: 'ফিল্ডের ধরন',
  pdfFormKindText: 'টেক্সট ফিল্ড',
  pdfFormKindMultiline: 'মাল্টিলাইন টেক্সট',
  pdfFormKindCheckbox: 'চেকবক্স',
  pdfFormKindRadio: 'রেডিও অপশন',
  pdfFormKindDropdown: 'ড্রপডাউন',
  pdfFormKindButton: 'বাটন',
  pdfFormFieldName: 'ফিল্ডের নাম',
  pdfFormFieldNameHint: 'PDF-এর জন্য ইউনিক নাম, যেমন full_name',
  pdfFormRadioGroup: 'রেডিও গ্রুপের নাম',
  pdfFormRadioValue: 'অপশনের মান',
  pdfFormOptions: 'অপশনসমূহ (কমা দিয়ে আলাদা করুন)',
  pdfFormBtnLabel: 'বাটনের লেখা',
  pdfFormDefaultValue: 'ডিফল্ট মান',
  pdfFormLatinHint:
    'ফিল্ডের চেহারা ল্যাটিন ফন্টে আঁকা হয় — ডিফল্ট মান, অপশন ও লেবেলের বাংলা বা অন্য অ-ল্যাটিন অক্ষর "?" হয়ে যাবে। ফিল্ডগুলো নিজে সম্পূর্ণ ফিলযোগ্য থাকবে।',
  pdfFormDragHint: 'এই ফিল্ডটি বসাতে পৃষ্ঠায় টেনে একটি আয়ত আঁকুন (সর্বনিম্ন ৮ pt)',
  pdfFormPlacements: 'বসানো ফিল্ড',
  pdfFormNoPlacements: 'এখনো কোনো ফিল্ড নেই — পৃষ্ঠার প্রিভিউতে টেনে আয়ত আঁকুন।',
  pdfFormRemove: 'ফিল্ড সরান',
  pdfFormBuildDone: 'ফর্ম ফিল্ড যোগ হয়েছে',
  pdfFormNote:
    'আয়তগুলো সত্যিকারের ফিলযোগ্য AcroForm ফিল্ড হয়ে যাবে — ফলাফল যেকোনো PDF রিডারে খুলে সরাসরি টাইপ করা যাবে।',

  // ── ফিল্ডের ধরন (টেবিল) ──
  pdfFormTypeText: 'টেক্সট ফিল্ড',
  pdfFormTypeCheckbox: 'চেকবক্স',
  pdfFormTypeRadio: 'রেডিও গ্রুপ',
  pdfFormTypeDropdown: 'ড্রপডাউন',
  pdfFormTypeButton: 'বাটন',
  pdfFormTypeOptionlist: 'অপশন তালিকা',
  pdfFormTypeSignature: 'সই ফিল্ড',

  // ── ফর্ম ডেটা এক্সট্র্যাক্টর ──
  pdfFormColName: 'নাম',
  pdfFormColType: 'ধরন',
  pdfFormColValue: 'মান',
  pdfFormColOptions: 'অপশন',
  pdfFormDownloadCsv: 'CSV ডাউনলোড',
  pdfFormDownloadXlsx: 'এক্সেল ডাউনলোড',

  // ── ই-সাইন ওয়ার্কফ্লো ──
  pdfEsignNew: 'নতুন সইয়ের অনুরোধ',
  pdfEsignFileName: 'ডকুমেন্টের নাম',
  pdfEsignPickName: 'নাম বসাতে একটি PDF বাছুন',
  pdfEsignSigners: 'সইকারী',
  pdfEsignSignerName: 'সইকারীর নাম',
  pdfEsignAddSigner: 'সইকারী যোগ করুন',
  pdfEsignNote: 'নোট (ঐচ্ছিক)',
  pdfEsignSave: 'অনুরোধ সংরক্ষণ করুন',
  pdfEsignSaved: 'অনুরোধ সংরক্ষিত',
  pdfEsignEmpty: 'এখনো কোনো সইয়ের অনুরোধ নেই — কে সই করেছে তা রাখতে একটি তৈরি করুন।',
  pdfEsignStatusDraft: 'খসড়া',
  pdfEsignStatusInProgress: 'চলমান',
  pdfEsignStatusCompleted: 'সম্পন্ন',
  pdfEsignPending: 'বাকি',
  pdfEsignSigned: 'সই হয়েছে',
  pdfEsignSignNow: 'এখনই সই করুন',
  pdfEsignMarkSigned: 'সই হিসেবে চিহ্নিত করুন',
  pdfEsignSignerFile: 'সই করার PDF বাছুন',
  pdfEsignDone: 'সই হয়েছে — ডাউনলোড শুরু হয়েছে',
  pdfEsignAllSigned: 'সবাই সই করেছে — অনুরোধ সম্পন্ন',
  pdfEsignProgress: '{total} জনের {done} জন সই করেছেন',
  pdfEsignPrivacy:
    'এই ডিভাইসে শুধু অনুরোধের বিবরণ সংরক্ষিত হয় — PDF ফাইলটি কখনোই সেভ হয় না।',
  pdfEsignRequireFile: 'আগে সই করার PDF বাছুন',
  pdfEsignRequireName: 'আগে ডকুমেন্টের নাম দিন',
  pdfEsignRequireSigner: 'অন্তত একজন সইকারী যোগ করুন',

  // ── এরর (src/lib/tools/pdf-forms.ts থেকে থ্রো হয়) ──
  pdfErrDuplicateField: 'এই নামের ফিল্ড আগেই আছে',
  pdfErrNoFormFields: 'এই PDF-এ কোনো ফিলযোগ্য ফর্ম ফিল্ড নেই',
  pdfErrNoFields: 'আগে পৃষ্ঠায় অন্তত একটি ফিল্ড এঁকে নিন',
  pdfErrFieldName: 'প্রতিটি ফিল্ডের একটি নাম দরকার',
  pdfErrFieldOptions: 'এই ফিল্ডের জন্য অন্তত একটি অপশন দিন',
}
