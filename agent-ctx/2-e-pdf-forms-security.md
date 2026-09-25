# Task 2-e — pdf-forms-security agent — Work Record

## Task
Forms & security tools for the OmniFile PDF suite:
1. Extend protect/unlock with algorithm choice + reader permissions (scoped edits).
2. Form builder → real fillable AcroForm fields via drag-drawn rectangles.
3. Form data extractor → table + CSV/XLSX export.
4. Local-first e-sign workflow tracker (localStorage, privacy-safe).
5. Digital certificate seal (node-forge) + integrity verification.

## Files created
- src/lib/tools/pdf-forms.ts — listFormFields / extractFormRows / rowsToXlsx / buildForm
- src/lib/tools/pdf-certify.ts — generateCertificate / hashPdf / signHash / verifySignature / sealPdf / parseOmnisig / verifySeal
- src/lib/i18n/tools-pdf-forms.ts — en+bn (builder, extract, e-sign flow, pdfErr*)
- src/lib/i18n/tools-pdf-security.ts — en+bn (certify, pdfErr*)
- src/components/tools/pdf/PdfFormBuilderTool.tsx
- src/components/tools/pdf/PdfFormExtractTool.tsx
- src/components/tools/pdf/PdfEsignFlowTool.tsx
- src/components/tools/pdf/PdfCertifyTool.tsx

## Scoped edits (only the 3 allowed)
- src/lib/tools/pdf-tools-advanced.ts — ProtectPdfOptions: + algorithm ('AES-256'|'AES-128'), + permissions {printing, copying, modifying, annotating, fillForms}; protectPdf maps fillForms → fork's `fillingForms`, normalises with `=== true`, forwards only supported fields.
- src/components/tools/pdf/PdfProtectTool.tsx — algorithm RadioGroup (AES-256 default) + 5 permission checkboxes (default ON) in protect mode; pass-through.
- src/lib/i18n/tools-pdf.ts — appended 9 keys (pdfProtectAlgo, pdfProtectAes256/128, pdfProtectPerms, pdfPerm*) at the very end of en AND bn; nothing else touched.

## @cantoo/pdf-lib API findings (verified in node_modules .d.ts)
- PDFDocument.encrypt(options: SecurityOptions); SecurityOptions = { ownerPassword?, userPassword?, permissions?: UserPermissions, algorithm?: 'AES-256'|'AES-128'|'RC4-128'|'RC4-40', allowWeakCryptography? }.
- UserPermissions (actual fields): printing (boolean | 'lowResolution' | 'highResolution'), modifying, copying, annotating, fillingForms, contentAccessibility, documentAssembly. Truthy grants (bits OR-ed in getPermissionsR2/R3); omitted = denied.
- addToPage signatures:
  - PDFTextField / PDFCheckBox / PDFDropdown / PDFOptionList: addToPage(page, { x, y, width, height, font? })
  - PDFRadioGroup: addOptionToPage(option: string, page, { x, y, width, height })
  - PDFButton: addToPage(text: string, page, { x, y, width, height }) — label comes FIRST.
- Field value APIs: PDFTextField.setText(string|undefined)/enableMultiline(); PDFCheckBox.check()/isChecked(); PDFDropdown.addOptions(string|string[])/getSelected(): string[]; PDFRadioGroup.getSelected(): string|undefined.
- All 7 field classes extend PDFField directly and are exported from the package root → instanceof checks are safe in any order.

## Deliberate deviations (documented in code)
- signHash(hashHex, keyPem, certPem): certPem parameter added — the contract return object requires certPem + fingerprint, which cannot be derived from the private key alone.
- FormFieldInfo.type includes 'signature' (PDFSignature instances returned by getFields()) in addition to the 6 contract types, so extract/export don't mislabel them.
- Seal block uses a white backing fill (opacity .85) under the required rgb(0.6,0,0) stroke for readability; signature still covers the ORIGINAL file hash only.

## Verification
- bunx eslint (all 11 files) → 0 problems.
- bunx tsc --noEmit → no errors in task files (only pre-existing skills/ errors remain).
- dev.log compiles clean.

## Risks / notes for orchestrator
- Registry wiring needed (orchestrator-owned registry.tsx + i18n.tsx merge of tools-pdf-forms / tools-pdf-security namespaces).
- WinAnsi appearance font: non-Latin default values / option values / button labels are sanitised to '?' so save never throws (fields remain fillable); UI hints included.
- Rotated pages (/Rotate ≠ 0): fields/seal drawn in unrotated user space (same caveat as existing signPdf).
- RSA-2048 keygen blocks the tab ~1–3 s; certificate is cached in component state to amortise.
- crypto.subtle requires secure context — forge SHA-256 fallback included.
- e-sign requests persist in localStorage 'omnifile.esign.requests'; PDF bytes are never persisted.
