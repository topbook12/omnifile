/**
 * Pure logic for the PDF form tools (Task 2-e) — 100% client-side.
 *
 *  - listFormFields  → read every AcroForm field (name / type / value / options)
 *  - extractFormRows → the same data as a CSV string (RFC-quoted cells)
 *  - rowsToXlsx      → the same data as an Excel workbook Blob
 *  - buildForm       → turn drag-drawn rectangles into real fillable fields
 *
 * Uses the @cantoo/pdf-lib fork (form classes verified in its .d.ts):
 *   PDFTextField / PDFCheckBox / PDFRadioGroup / PDFDropdown /
 *   PDFOptionList / PDFButton / PDFSignature — all extend PDFField.
 *   addToPage signatures:
 *     text/checkbox/dropdown/optionlist: addToPage(page, { x, y, width, height })
 *     radio:  addOptionToPage(option, page, { x, y, width, height })
 *     button: addToPage(label, page, { x, y, width, height })
 *
 * ERROR CONTRACT: expected failures are thrown as ToolError carrying an i18n
 * key (pdfErr*, defined in src/lib/i18n/tools-pdf-forms.ts); panels call
 * errMessage(err, t).
 */

import {
  PDFButton,
  PDFCheckBox,
  PDFDocument,
  PDFDropdown,
  PDFOptionList,
  PDFRadioGroup,
  PDFSignature,
  PDFTextField,
} from '@cantoo/pdf-lib'
import * as XLSX from 'xlsx'

import { ToolError } from '@/lib/tools/pdf-tools-advanced'

/** A form field as shown in the extract table / CSV / XLSX. */
export interface FormFieldInfo {
  name: string
  type: 'text' | 'checkbox' | 'radio' | 'dropdown' | 'button' | 'optionlist' | 'signature'
  /** Current value: text content, '✓' for checked boxes, selected option(s)… */
  value: string
  /** Choice fields only: the available options. */
  options?: string[]
}

/** One drag-drawn rectangle that should become a form field. */
export interface FormPlacement {
  id: string
  /** 0-based page index. */
  pageIndex: number
  kind: 'text' | 'multiline' | 'checkbox' | 'radio' | 'dropdown' | 'button'
  /** Fully qualified field name (radio = the shared GROUP name). */
  name: string
  /** Rectangle in PDF points, y measured from the page BOTTOM. */
  rect: { x: number; y: number; w: number; h: number }
  /** dropdown: the option list; radio: [optionValue] for this placement. */
  options?: string[]
  /** Prefilled value (text) / checked state ('true') / selected option. */
  initialValue?: string
  /** Push-button caption. */
  label?: string
}

/* -------------------------------------------------------------------------- */
/*                             document loading                               */
/* -------------------------------------------------------------------------- */

/** Classify a raw pdf-lib load failure (same rules as pdf-tools-advanced). */
function loadFormErr(err: unknown): ToolError {
  const e = err as { name?: string; message?: string }
  if (e?.name === 'EncryptedPDFError' || /encrypt/i.test(e?.message ?? '')) {
    return new ToolError('pdfErrEncrypted')
  }
  if (/password/i.test(e?.message ?? '')) return new ToolError('pdfErrWrongPassword')
  return new ToolError('pdfErrCorrupt')
}

/**
 * Load a PDF for form work. Encrypted (no password) → pdfErrEncrypted,
 * wrong/missing password on a locked file → pdfErrWrongPassword,
 * anything else → pdfErrCorrupt.
 */
export async function loadPdfDoc(file: File | Blob): Promise<PDFDocument> {
  try {
    return await PDFDocument.load(new Uint8Array(await file.arrayBuffer()))
  } catch (err) {
    throw loadFormErr(err)
  }
}

/* -------------------------------------------------------------------------- */
/*                            1. read form fields                             */
/* -------------------------------------------------------------------------- */

/** Read every AcroForm field of the document, in the reader's field order. */
export async function listFormFields(file: File): Promise<FormFieldInfo[]> {
  const doc = await loadPdfDoc(file)
  const form = doc.getForm()
  const out: FormFieldInfo[] = []

  for (const field of form.getFields()) {
    if (field instanceof PDFTextField) {
      out.push({ name: field.getName(), type: 'text', value: field.getText() ?? '' })
    } else if (field instanceof PDFCheckBox) {
      out.push({ name: field.getName(), type: 'checkbox', value: field.isChecked() ? '✓' : '' })
    } else if (field instanceof PDFRadioGroup) {
      out.push({ name: field.getName(), type: 'radio', value: field.getSelected() ?? '' })
    } else if (field instanceof PDFDropdown) {
      out.push({
        name: field.getName(),
        type: 'dropdown',
        value: field.getSelected().join(', '),
        options: field.getOptions(),
      })
    } else if (field instanceof PDFOptionList) {
      out.push({
        name: field.getName(),
        type: 'optionlist',
        value: field.getSelected().join(', '),
        options: field.getOptions(),
      })
    } else if (field instanceof PDFButton) {
      out.push({ name: field.getName(), type: 'button', value: '' })
    } else if (field instanceof PDFSignature) {
      out.push({ name: field.getName(), type: 'signature', value: '' })
    }
    // Unknown PDFField subclasses are skipped rather than mislabelled.
  }
  return out
}

/** Escape one CSV cell: quote when it contains a comma, quote or newline. */
function csvCell(value: string): string {
  return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value
}

/**
 * Extract all fields and build a CSV (one row per field, headers
 * Name/Type/Value, RFC 4180 quoting so commas/quotes/newlines survive).
 * Throws pdfErrNoFormFields when the document has no AcroForm fields.
 */
export async function extractFormRows(
  file: File
): Promise<{ fields: FormFieldInfo[]; csv: string }> {
  const fields = await listFormFields(file)
  if (fields.length === 0) throw new ToolError('pdfErrNoFormFields')

  const lines = ['Name,Type,Value']
  for (const f of fields) {
    lines.push([csvCell(f.name), csvCell(f.type), csvCell(f.value)].join(','))
  }
  return { fields, csv: lines.join('\r\n') + '\r\n' }
}

/**
 * Build an .xlsx workbook from the extracted fields:
 * one sheet with the columns Name / Type / Value / Options (" | " joined).
 */
export async function rowsToXlsx(fields: FormFieldInfo[]): Promise<Blob> {
  const aoa: string[][] = [['Name', 'Type', 'Value', 'Options']]
  for (const f of fields) {
    aoa.push([f.name, f.type, f.value, (f.options ?? []).join(' | ')])
  }
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), 'Form fields')
  const bytes = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
  return new Blob([bytes], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
}

/* -------------------------------------------------------------------------- */
/*                              2. build fields                               */
/* -------------------------------------------------------------------------- */

/**
 * Appearance fonts are WinAnsi (Helvetica) — characters outside Latin-1
 * (e.g. Bengali) cannot be drawn into the field appearance and would make
 * pdf-lib throw at save time. They are replaced with '?' so the file always
 * saves; the field itself stays fully fillable in any PDF reader.
 */
function winAnsiSafe(text: string): string {
  return Array.from(text)
    .map((ch) => {
      const c = ch.codePointAt(0) ?? 63
      if (ch === '\n' || ch === '\r' || ch === '\t') return ch
      if ((c >= 32 && c <= 126) || (c >= 160 && c <= 255)) return ch
      return '?'
    })
    .join('')
}

/** Clamp a placement rectangle so it stays inside the page (min 1pt size). */
function clampRect(
  rect: { x: number; y: number; w: number; h: number },
  pageW: number,
  pageH: number
): { x: number; y: number; width: number; height: number } {
  const width = Math.min(Math.max(1, rect.w), Math.max(1, pageW - 2))
  const height = Math.min(Math.max(1, rect.h), Math.max(1, pageH - 2))
  const x = Math.min(Math.max(0, rect.x), Math.max(0, pageW - width))
  const y = Math.min(Math.max(0, rect.y), Math.max(0, pageH - height))
  return { x, y, width, height }
}

/**
 * Turn placements into real, fillable AcroForm fields on the existing pages.
 *
 *  - text/multiline → PDFTextField (enableMultiline, setText)
 *  - checkbox       → PDFCheckBox (check())
 *  - radio          → ONE PDFRadioGroup per name (deduped across placements),
 *                     addOptionToPage per rectangle — identical (group, value)
 *                     pairs are merged to keep the PDF valid
 *  - dropdown       → PDFDropdown (addOptions, select)
 *  - button         → PDFButton (addToPage(label, page, …))
 *
 * A duplicate field name throws pdfErrDuplicateField carrying the name.
 */
export async function buildForm(file: File, fields: FormPlacement[]): Promise<Blob> {
  if (fields.length === 0) throw new ToolError('pdfErrNoFields')

  const doc = await loadPdfDoc(file)
  const form = doc.getForm()

  // Radio groups must be created exactly once per GROUP name.
  const radioGroups = new Map<string, PDFRadioGroup>()
  // Already-registered (radioGroup, optionValue) pairs — duplicates skipped.
  const radioValues = new Map<string, Set<string>>()

  for (const f of fields) {
    const name = f.name.trim()
    if (!name) throw new ToolError('pdfErrFieldName')

    const pageCount = doc.getPageCount()
    const page = doc.getPage(Math.min(Math.max(0, f.pageIndex), pageCount - 1))
    const { width: pageW, height: pageH } = page.getSize()
    const bounds = clampRect(f.rect, pageW, pageH)

    // Radio placements intentionally share a group name → only check
    // duplicates for the non-radio kinds.
    if (f.kind !== 'radio' && form.getFieldMaybe(name)) {
      throw new ToolError('pdfErrDuplicateField', name)
    }

    switch (f.kind) {
      case 'text':
      case 'multiline': {
        const field = form.createTextField(name)
        if (f.kind === 'multiline') field.enableMultiline()
        const initial = f.initialValue?.trim()
        if (initial) field.setText(winAnsiSafe(initial))
        field.addToPage(page, bounds)
        break
      }

      case 'checkbox': {
        const field = form.createCheckBox(name)
        if ((f.initialValue ?? '').trim().toLowerCase() === 'true') field.check()
        field.addToPage(page, bounds)
        break
      }

      case 'radio': {
        let group = radioGroups.get(name)
        if (!group) {
          if (form.getFieldMaybe(name)) throw new ToolError('pdfErrDuplicateField', name)
          group = form.createRadioGroup(name)
          radioGroups.set(name, group)
          radioValues.set(name, new Set())
        }
        const optionValue = winAnsiSafe((f.options?.[0] ?? f.initialValue ?? '').trim())
        if (!optionValue) continue
        const seen = radioValues.get(name)!
        if (seen.has(optionValue)) continue // same export value twice → skip
        seen.add(optionValue)
        group.addOptionToPage(optionValue, page, bounds)
        break
      }

      case 'dropdown': {
        const field = form.createDropdown(name)
        const options = (f.options ?? [])
          .map((o) => winAnsiSafe(o.trim()))
          .filter(Boolean)
        if (options.length === 0) throw new ToolError('pdfErrFieldOptions', name)
        field.addOptions(options)
        const initial = winAnsiSafe((f.initialValue ?? '').trim())
        if (initial && options.includes(initial)) field.select(initial)
        field.addToPage(page, bounds)
        break
      }

      case 'button': {
        const field = form.createButton(name)
        const label = winAnsiSafe((f.label ?? name).trim()) || name
        field.addToPage(label, page, bounds)
        break
      }
    }
  }

  const bytes = await doc.save()
  return new Blob([bytes], { type: 'application/pdf' })
}
