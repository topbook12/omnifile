/**
 * Pure logic for "Compare PDF versions" (Task 2-f) — 100% on-device diff.
 *
 * Pipeline: pdf.js text extraction (panel) → word-level LCS diff (here) →
 * inline segments for the UI and/or a standalone HTML report.
 *
 * Design notes
 *  - Tokens are whitespace-split words. For COMPARISON only, tokens are
 *    normalized (NFC, lowercase, punctuation stripped) so "Cat," == "cat".
 *    The DISPLAYED text always keeps the original wording.
 *  - Common prefix/suffix is trimmed before the DP; the LCS itself runs on
 *    a flat typed-array matrix (Uint16 — LCS length always fits because the
 *    caller caps the token counts) and backtracks to emit segments.
 *  - Oversized inputs fall back to a line-level diff (≤ 4000 lines total),
 *    and beyond that a ToolError('pdfErrDiffTooLarge') is thrown.
 *
 * ERROR CONTRACT: same as pdf-tools-advanced.ts (ToolError with i18n key).
 */

import { ToolError } from '@/lib/tools/pdf-tools-advanced'

export type DiffType = 'same' | 'add' | 'del'

/** One contiguous run of same/diff tokens (separators included in `text`). */
export interface DiffSegment {
  type: DiffType
  text: string
}

export interface DiffOutcome {
  segments: DiffSegment[]
  /** Tokens (or lines, in line-level mode) present only in B. */
  added: number
  /** Tokens (or lines, in line-level mode) present only in A. */
  removed: number
}

/** Guard so the DP matrix never exceeds ~80 MB (Uint16 cells). */
const MAX_DP_CELLS = 40_000_000
/** Line-level fallback cap: total lines across both documents. */
const LINE_CAP = 4000

/* ------------------------------- normalization ------------------------------ */

/** NFC-normalize and collapse every whitespace run into a single space. */
export function normalizeForDiff(text: string): string {
  return text.normalize('NFC').replace(/\s+/g, ' ')
}

/** Comparison key of a word: lowercase, punctuation stripped. */
function normToken(token: string): string {
  const stripped = token.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '')
  return stripped || token.toLowerCase()
}

/** Comparison key of a whole line (for the line-level fallback). */
function normLine(line: string): string {
  return normToken(normalizeForDiff(line).trim())
}

function tokenize(text: string): string[] {
  return normalizeForDiff(text)
    .trim()
    .split(' ')
    .filter(Boolean)
}

/* ------------------------------- LCS machinery ------------------------------ */

type Op = { type: DiffType; text: string }

/**
 * Longest-common-subsequence diff of two token lists → raw ops.
 * Returns null when the DP would be too large for the typed-array budget.
 */
function lcsOps(
  a: string[],
  normA: string[],
  b: string[],
  normB: string[]
): Op[] | null {
  const n = a.length
  const m = b.length
  if (n === 0) return b.map((text) => ({ type: 'add' as const, text }))
  if (m === 0) return a.map((text) => ({ type: 'del' as const, text }))
  if (Math.min(n, m) > 65_535) return null // would not fit Uint16 counters
  if ((n + 1) * (m + 1) > MAX_DP_CELLS) return null

  // dp[i * w + j] = LCS length of a[0..i) vs b[0..j)
  const w = m + 1
  const dp = new Uint16Array((n + 1) * w)
  for (let i = 1; i <= n; i++) {
    const row = i * w
    const prev = row - w
    const na = normA[i - 1]!
    for (let j = 1; j <= m; j++) {
      dp[row + j] =
        na === normB[j - 1]!
          ? dp[prev + j - 1]! + 1
          : Math.max(dp[prev + j]!, dp[row + j - 1]!)
    }
  }

  // Walk the matrix backwards, emitting ops (then reverse to chronological).
  const ops: Op[] = []
  let i = n
  let j = m
  while (i > 0 && j > 0) {
    if (normA[i - 1] === normB[j - 1]) {
      ops.push({ type: 'same', text: a[i - 1]! })
      i--
      j--
    } else if (dp[(i - 1) * w + j]! >= dp[i * w + j - 1]!) {
      ops.push({ type: 'del', text: a[i - 1]! })
      i--
    } else {
      ops.push({ type: 'add', text: b[j - 1]! })
      j--
    }
  }
  while (i > 0) {
    ops.push({ type: 'del', text: a[i - 1]! })
    i--
  }
  while (j > 0) {
    ops.push({ type: 'add', text: b[j - 1]! })
    j--
  }
  ops.reverse()
  return ops
}

/**
 * Group a chronological op stream into segments. Consecutive ops of the
 * same type merge into one segment; the separators that originally sat
 * between groups are re-attached to the end of every segment but the last,
 * so callers can simply concatenate all segment texts.
 */
function groupOps(ops: Op[], joiner: string): DiffSegment[] {
  const segments: DiffSegment[] = []
  for (const op of ops) {
    const last = segments[segments.length - 1]
    if (last && last.type === op.type) {
      last.text += joiner + op.text
    } else {
      segments.push({ type: op.type, text: op.text })
    }
  }
  for (let k = 0; k < segments.length - 1; k++) {
    segments[k]!.text += joiner
  }
  return segments
}

/**
 * Trim the common prefix/suffix, run LCS on the middle only and assemble
 * the full segment list. Returns null when the DP is out of budget.
 */
function diffTokenLists(
  a: string[],
  b: string[],
  normOf: (token: string) => string,
  joiner: string
): DiffSegment[] | null {
  const common = Math.min(a.length, b.length)

  let start = 0
  while (start < common && normOf(a[start]!) === normOf(b[start]!)) start++

  let endA = a.length
  let endB = b.length
  while (endA > start && endB > start && normOf(a[endA - 1]!) === normOf(b[endB - 1]!)) {
    endA--
    endB--
  }

  const midA = a.slice(start, endA)
  const midB = b.slice(start, endB)
  const midOps = lcsOps(midA, midA.map(normOf), midB, midB.map(normOf))
  if (!midOps) return null

  const ops: Op[] = []
  for (let k = 0; k < start; k++) ops.push({ type: 'same', text: a[k]! })
  ops.push(...midOps)
  // The trimmed tails match one-to-one (by comparison key), so emit them
  // as 'same' ops using A's original wording.
  for (let k = endA; k < a.length; k++) ops.push({ type: 'same', text: a[k]! })

  return groupOps(ops, joiner)
}

function toOutcome(segments: DiffSegment[]): DiffOutcome {
  let added = 0
  let removed = 0
  for (const seg of segments) {
    const count = seg.text.split(/\s+/).filter(Boolean).length
    if (seg.type === 'add') added += count
    else if (seg.type === 'del') removed += count
  }
  return { segments, added, removed }
}

/* ---------------------------------- diff ----------------------------------- */

/**
 * Word-level diff between two document texts.
 * Falls back to a line-level diff when the combined word count exceeds
 * `cap`; throws ToolError('pdfErrDiffTooLarge') when even lines are too many.
 */
export function diffWords(aText: string, bText: string, cap = 12_000): DiffOutcome {
  const a = tokenize(aText)
  const b = tokenize(bText)

  if (a.length + b.length <= cap) {
    const segments = diffTokenLists(a, b, normToken, ' ')
    if (segments) return toOutcome(segments)
  }

  // Line-level fallback — keeps line content verbatim for display.
  const aLines = aText.split('\n')
  const bLines = bText.split('\n')
  if (aLines.length + bLines.length > LINE_CAP) {
    throw new ToolError('pdfErrDiffTooLarge')
  }
  const segments = diffTokenLists(aLines, bLines, normLine, '\n')
  if (!segments) throw new ToolError('pdfErrDiffTooLarge')
  return toOutcome(segments)
}

/* -------------------------------- HTML report ------------------------------- */

export interface DiffHtmlMeta {
  nameA: string
  nameB: string
  added: number
  removed: number
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * Render the diff as a standalone HTML document (UTF-8, dir=auto, inline
 * CSS): deletions in red strikethrough, additions in green, with a legend
 * and counts header. Opens correctly in any browser when double-clicked.
 */
export function diffToHtml(segments: DiffSegment[], meta: DiffHtmlMeta): string {
  const body = segments
    .map((seg) => {
      const text = escapeHtml(seg.text)
      if (seg.type === 'add') return `<ins>${text}</ins>`
      if (seg.type === 'del') return `<del>${text}</del>`
      return text
    })
    .join('')

  return `<!doctype html>
<html lang="en" dir="auto">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Diff — ${escapeHtml(meta.nameA)} vs ${escapeHtml(meta.nameB)}</title>
<style>
  :root { color-scheme: light dark; }
  body {
    margin: 0;
    padding: 24px 16px 48px;
    font-family: system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans Bengali", sans-serif;
    font-size: 15px;
    line-height: 1.8;
    background: #fafafa;
    color: #1c1917;
  }
  main { max-width: 900px; margin: 0 auto; }
  h1 { font-size: 1.15rem; margin: 0 0 4px; }
  .meta { color: #57534e; font-size: 0.85rem; margin: 0 0 12px; }
  .counts { display: flex; flex-wrap: wrap; gap: 8px; margin: 0 0 12px; font-size: 0.8rem; }
  .counts span { padding: 3px 10px; border-radius: 999px; background: #e7e5e4; }
  .counts .add { background: #dcfce7; color: #166534; }
  .counts .del { background: #fee2e2; color: #991b1b; }
  .legend { font-size: 0.78rem; color: #57534e; margin: 0 0 16px; }
  .doc {
    white-space: pre-wrap;
    overflow-wrap: break-word;
    background: #ffffff;
    border: 1px solid #e7e5e4;
    border-radius: 12px;
    padding: 16px;
  }
  ins { background: #bbf7d0; color: #14532d; text-decoration: none; border-radius: 3px; padding: 0 2px; }
  del { background: #fecaca; color: #7f1d1d; text-decoration: line-through; border-radius: 3px; padding: 0 2px; }
  @media (prefers-color-scheme: dark) {
    body { background: #12100e; color: #e7e5e4; }
    .meta, .legend { color: #a8a29e; }
    .counts span { background: #292524; }
    .counts .add { background: #14532d; color: #bbf7d0; }
    .counts .del { background: #7f1d1d; color: #fecaca; }
    .doc { background: #1c1917; border-color: #292524; }
    ins { background: #052e16; color: #86efac; }
    del { background: #450a0a; color: #fca5a5; }
  }
</style>
</head>
<body>
<main>
  <h1>Document diff</h1>
  <p class="meta">${escapeHtml(meta.nameA)} → ${escapeHtml(meta.nameB)}</p>
  <div class="counts">
    <span class="add">+${meta.added} added</span>
    <span class="del">−${meta.removed} removed</span>
  </div>
  <p class="legend">Green = added in the revised file · red strikethrough = removed from the original.</p>
  <div class="doc">${body}</div>
</main>
</body>
</html>
`
}
