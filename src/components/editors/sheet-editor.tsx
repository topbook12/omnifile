'use client'

/**
 * CSV / Excel sheet editor — Task 2-d.
 * SheetJS parsing, Excel-like editable grid with sticky headers, per-sheet
 * edit memory (edits survive sheet switches), row/column operations and
 * save back into the local library. 100% client-side.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import * as XLSX from 'xlsx'
import { toast } from 'sonner'
import { Columns3, FileSpreadsheet, Plus, Save, SquareMinus, Trash2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { getExt } from '@/lib/file-types'
import { useI18n } from '@/lib/i18n'
import type { ViewerEditorProps } from '@/lib/viewer-types'
import { cn } from '@/lib/utils'

/* ------------------------------------------------------------------ */
/* Constants & pure helpers                                            */
/* ------------------------------------------------------------------ */

const MAX_RENDER_COLS = 80
const INITIAL_VISIBLE_ROWS = 100
const LOAD_MORE_STEP = 200

const NUMERIC_RE = /^[+-]?\d+(\.\d+)?$/

interface CellPos {
  r: number
  c: number
}

type Status = 'parsing' | 'ready' | 'error'

/** Excel-style column label: 0 → A, 25 → Z, 26 → AA … */
function colLabel(i: number): string {
  let s = ''
  let n = i
  while (n >= 0) {
    s = String.fromCharCode(65 + (n % 26)) + s
    n = Math.floor(n / 26) - 1
  }
  return s
}

/** Read a worksheet into a raw AOA (array of rows with unknown cell values). */
function rowsFromSheet(ws?: XLSX.WorkSheet | null): unknown[][] {
  if (!ws) return []
  try {
    return XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '', raw: true })
  } catch {
    return []
  }
}

/** Raw AOA → uniform string[][], trailing all-empty rows/cols trimmed (min 1×1). */
function normalizeMatrix(raw: unknown[][]): string[][] {
  let grid = (Array.isArray(raw) ? raw : []).map((row) =>
    Array.isArray(row) ? row.map((v) => String(v ?? '')) : ['']
  )
  if (grid.length === 0) grid = [['']]
  const width = grid.reduce((m, r) => Math.max(m, r.length), 1)
  grid = grid.map((r) => {
    const out = r.slice()
    while (out.length < width) out.push('')
    return out
  })
  while (grid.length > 1 && grid[grid.length - 1].every((cell) => cell === '')) grid.pop()
  if (width > 1) {
    let w = width
    while (w > 1) {
      let empty = true
      for (const row of grid) {
        if (row[w - 1] !== '') {
          empty = false
          break
        }
      }
      if (!empty) break
      w--
    }
    if (w < width) grid = grid.map((r) => r.slice(0, w))
  }
  return grid
}

function cloneMatrix(m: string[][]): string[][] {
  return m.map((r) => r.slice())
}

function matricesEqual(a: string[][], b: string[][]): boolean {
  if (a === b) return true
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    const ra = a[i]
    const rb = b[i]
    if (ra === rb) continue
    if (ra.length !== rb.length) return false
    for (let j = 0; j < ra.length; j++) {
      if (ra[j] !== rb[j]) return false
    }
  }
  return true
}

/** '' stays '', numeric-looking strings (length < 16) become numbers, else string. */
function coerceCell(v: string): string | number {
  if (v === '') return ''
  if (v.length < 16 && NUMERIC_RE.test(v)) return Number(v)
  return v
}

function matrixToAoa(rows: string[][]): (string | number)[][] {
  return rows.map((row) => row.map(coerceCell))
}

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */

export default function SheetEditor({
  file,
  blob,
  dirty,
  onDirtyChange,
  onSave,
}: ViewerEditorProps) {
  const { t, tf } = useI18n()

  const [status, setStatus] = useState<Status>('parsing')
  const [sheetNames, setSheetNames] = useState<string[]>([])
  const [activeSheet, setActiveSheet] = useState(0)
  const [rows, setRows] = useState<string[][]>([])
  const [visibleRows, setVisibleRows] = useState(INITIAL_VISIBLE_ROWS)
  const [active, setActive] = useState<CellPos | null>(null)
  const [editing, setEditing] = useState<CellPos | null>(null)
  const [saving, setSaving] = useState(false)

  /* Mutable session state lives in refs so callbacks stay stable. */
  const wbRef = useRef<XLSX.WorkBook | null>(null)
  const rowsRef = useRef<string[][]>([])
  const widthRef = useRef(1)
  const sheetNamesRef = useRef<string[]>([])
  const activeNameRef = useRef('')
  const activeIndexRef = useRef(0)
  const activeRef = useRef<CellPos | null>(null)
  const editingRef = useRef<CellPos | null>(null)
  /** Sheet name → last persisted matrix (written on sheet switch / save). */
  const editsRef = useRef<Map<string, string[][]>>(new Map())
  /** Sheet name → matrix as parsed from the original blob (dirty baseline). */
  const originalsRef = useRef<Map<string, string[][]>>(new Map())
  /** Sheets touched since the last parse / save. */
  const mutatedRef = useRef<Set<string>>(new Set())
  const cancelEditRef = useRef(false)
  const savingRef = useRef(false)

  /* --- state appliers: keep refs in sync alongside React state --- */
  const applyRows = useCallback((next: string[][]) => {
    rowsRef.current = next
    const w = next[0]?.length ?? 0
    if (w > 0) widthRef.current = w
    setRows(next)
  }, [])

  const applyActive = useCallback((next: CellPos | null) => {
    activeRef.current = next
    setActive(next)
  }, [])

  const applyEditing = useCallback((next: CellPos | null) => {
    editingRef.current = next
    setEditing(next)
  }, [])

  const currentWidth = useCallback(() => {
    const w = rowsRef.current[0]?.length ?? 0
    return w || widthRef.current || 1
  }, [])

  /* --- dirty = any sheet matrix differs from its original snapshot --- */
  const recomputeDirty = useCallback(() => {
    const curName = activeNameRef.current
    const orig = curName ? originalsRef.current.get(curName) : undefined
    let d = orig ? !matricesEqual(rowsRef.current, orig) : mutatedRef.current.size > 0
    if (!d) {
      for (const [name, edited] of editsRef.current) {
        if (name === curName) continue
        const other = originalsRef.current.get(name)
        if (!other || !matricesEqual(edited, other)) {
          d = true
          break
        }
      }
    }
    onDirtyChange(d)
  }, [onDirtyChange])

  const markMutated = useCallback(() => {
    if (activeNameRef.current) mutatedRef.current.add(activeNameRef.current)
    recomputeDirty()
  }, [recomputeDirty])

  /* --- parse whenever the blob changes --- */
  useEffect(() => {
    let cancelled = false
    setStatus('parsing')
    const run = async () => {
      try {
        // csv/tsv must be decoded as UTF-8 text: SheetJS's byte sniffing
        // mis-reads non-BOM UTF-8 (e.g. Bengali) as cp1252. Binary workbooks
        // go through the plain ArrayBuffer path.
        const ext = getExt(file.name)
        const delimited = ext === 'csv' || ext === 'tsv'
        const wb = delimited
          ? XLSX.read((await blob.text()).replace(/^\uFEFF/, ''), { type: 'string' })
          : XLSX.read(await blob.arrayBuffer(), { type: 'array' })
        if (cancelled) return
        wbRef.current = wb
        editsRef.current = new Map()
        originalsRef.current = new Map()
        mutatedRef.current = new Set()
        const names = [...wb.SheetNames]
        sheetNamesRef.current = names
        activeIndexRef.current = 0
        const first = names[0] ?? ''
        activeNameRef.current = first
        const grid = first
          ? normalizeMatrix(rowsFromSheet(wb.Sheets[first]))
          : [['']]
        if (first) originalsRef.current.set(first, cloneMatrix(grid))
        rowsRef.current = grid
        const w = grid[0]?.length ?? 0
        if (w > 0) widthRef.current = w
        activeRef.current = null
        editingRef.current = null
        setRows(grid)
        setSheetNames(names)
        setActiveSheet(0)
        setVisibleRows(INITIAL_VISIBLE_ROWS)
        setActive(null)
        setEditing(null)
        onDirtyChange(false)
        setStatus('ready')
      } catch {
        if (!cancelled) setStatus('error')
      }
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [blob, file.name, onDirtyChange])

  /* --- cell editing --- */
  const setCellValue = useCallback(
    (r: number, c: number, value: string) => {
      const cur = rowsRef.current
      if (!cur[r] || cur[r][c] === value) return
      const next = cur.map((row, i) => (i === r ? row.slice() : row))
      next[r][c] = value
      applyRows(next)
      markMutated()
    },
    [applyRows, markMutated]
  )

  /** Commit on Enter: also move the active cell one row down. */
  const commitEnter = useCallback(
    (r: number, c: number, value: string) => {
      setCellValue(r, c, value)
      applyEditing(null)
      const len = rowsRef.current.length
      if (len === 0) {
        applyActive(null)
        return
      }
      const nr = Math.min(r + 1, len - 1)
      const w = rowsRef.current[nr]?.length ?? 1
      applyActive({ r: nr, c: Math.min(c, w - 1) })
    },
    [applyActive, applyEditing, setCellValue]
  )

  /* --- sheet switching: edits are kept per sheet in editsRef --- */
  const switchSheet = useCallback(
    (idx: number) => {
      const names = sheetNamesRef.current
      if (idx < 0 || idx >= names.length || idx === activeIndexRef.current) return
      const curName = activeNameRef.current
      if (curName) editsRef.current.set(curName, cloneMatrix(rowsRef.current))
      const name = names[idx]
      const edited = editsRef.current.get(name)
      const grid = edited
        ? cloneMatrix(edited)
        : normalizeMatrix(rowsFromSheet(wbRef.current?.Sheets[name]))
      if (!edited && !originalsRef.current.has(name)) {
        originalsRef.current.set(name, cloneMatrix(grid))
      }
      activeNameRef.current = name
      activeIndexRef.current = idx
      applyRows(grid)
      applyActive(null)
      applyEditing(null)
      setVisibleRows(INITIAL_VISIBLE_ROWS)
      setActiveSheet(idx)
      recomputeDirty()
    },
    [applyActive, applyEditing, applyRows, recomputeDirty]
  )

  /* --- structural operations --- */
  const addRow = useCallback(() => {
    const w = currentWidth()
    const next = [...rowsRef.current, new Array<string>(w).fill('')]
    applyRows(next)
    setVisibleRows((v) => (next.length > v ? v + LOAD_MORE_STEP : v))
    markMutated()
  }, [applyRows, currentWidth, markMutated])

  const addCol = useCallback(() => {
    const cur = rowsRef.current
    const next = cur.length === 0 ? [['']] : cur.map((row) => [...row, ''])
    applyRows(next)
    markMutated()
  }, [applyRows, markMutated])

  const delRow = useCallback(() => {
    const a = activeRef.current
    if (!a) return
    const next = rowsRef.current.filter((_, i) => i !== a.r)
    applyRows(next)
    applyEditing(null)
    if (next.length === 0) applyActive(null)
    else applyActive({ r: Math.min(a.r, next.length - 1), c: Math.min(a.c, currentWidth() - 1) })
    markMutated()
  }, [applyActive, applyEditing, applyRows, currentWidth, markMutated])

  const delCol = useCallback(() => {
    const a = activeRef.current
    const w = currentWidth()
    if (!a || w <= 1) return
    const next = rowsRef.current.map((row) => {
      const out = row.slice(0, a.c)
      return a.c < row.length ? out.concat(row.slice(a.c + 1)) : out
    })
    applyRows(next)
    applyEditing(null)
    const len = next.length
    applyActive(len === 0 ? null : { r: Math.min(a.r, len - 1), c: Math.min(a.c, w - 2) })
    markMutated()
  }, [applyActive, applyEditing, applyRows, currentWidth, markMutated])

  /* --- save: csv/tsv as delimited text, excel via the original workbook --- */
  const handleSave = useCallback(async () => {
    if (!dirty || savingRef.current) return
    savingRef.current = true
    setSaving(true)
    try {
      const ext = getExt(file.name)
      const isTsv = ext === 'tsv'
      const delimited = ext === 'csv' || isTsv
      const curName = activeNameRef.current
      const curRows = rowsRef.current
      if (curName) {
        editsRef.current.set(curName, cloneMatrix(curRows))
        mutatedRef.current.add(curName)
      }
      let out: Blob
      if (delimited) {
        const ws = XLSX.utils.aoa_to_sheet(matrixToAoa(curRows))
        const text = XLSX.utils.sheet_to_csv(ws, { FS: isTsv ? '\t' : ',' })
        out = new Blob([text], {
          type: isTsv ? 'text/tab-separated-values;charset=utf-8' : 'text/csv;charset=utf-8',
        })
      } else {
        const wb = wbRef.current
        if (!wb) throw new Error('workbook unavailable')
        // Flush every sheet edited this session; untouched sheets stay as-is
        // so their formulas / styles are preserved byte-for-byte.
        for (const [name, edited] of editsRef.current) {
          if (!wb.Sheets[name]) continue
          wb.Sheets[name] = XLSX.utils.aoa_to_sheet(matrixToAoa(edited))
        }
        // .xls stays .xls (biff8); xlsx/xlsm/xlsb/ods inputs are written as xlsx.
        const data = XLSX.write(wb, {
          bookType: ext === 'xls' ? 'xls' : 'xlsx',
          type: 'array',
        })
        out = new Blob([data], {
          type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        })
      }
      await onSave(out)
      // Rebase baselines: everything persisted is now the new "original".
      for (const [name, edited] of editsRef.current) {
        originalsRef.current.set(name, cloneMatrix(edited))
      }
      editsRef.current.clear()
      mutatedRef.current.clear()
      recomputeDirty()
      toast.success(t('tSaved'))
    } catch {
      toast.error(t('tSaveFailed'))
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }, [dirty, file.name, onSave, recomputeDirty, t])

  /* ---------------------------------------------------------------- */
  /* Render                                                            */
  /* ---------------------------------------------------------------- */

  if (status === 'parsing') {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <div className="flex min-h-0 flex-1 flex-col gap-3 p-6">
          <Skeleton className="h-9 w-44" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-11/12" />
          <Skeleton className="h-9 w-4/5" />
          <Skeleton className="h-9 w-2/3" />
        </div>
      </div>
    )
  }

  if (status === 'error') {
    return (
      <div className="flex h-full min-h-0 flex-col items-center justify-center p-6">
        <Card className="max-w-sm px-6 text-center text-sm text-muted-foreground">
          {t('errGeneric')}
        </Card>
      </div>
    )
  }

  const totalCols = rows[0]?.length ?? 0
  const renderCols = Math.min(totalCols, MAX_RENDER_COLS)
  const hiddenCols = totalCols - renderCols
  const shownRows = rows.slice(0, visibleRows)

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Toolbar */}
      <div className="no-touch-callout flex shrink-0 items-center gap-1.5 overflow-x-auto border-b bg-background/95 px-2 py-2">
        {sheetNames.length > 1 && (
          <div className="flex shrink-0 items-center gap-1.5 pr-1" title={t('csvSheets')}>
            <FileSpreadsheet className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <Select value={String(activeSheet)} onValueChange={(v) => switchSheet(Number(v))}>
              <SelectTrigger
                size="sm"
                aria-label={t('csvSheets')}
                className="h-9 min-w-32 max-w-44"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {sheetNames.map((name, i) => (
                  <SelectItem key={`${i}:${name}`} value={String(i)}>
                    {name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <Button
          variant="ghost"
          size="icon"
          className="h-10 w-10 shrink-0 sm:w-auto sm:px-3"
          title={t('csvAddRow')}
          onClick={addRow}
        >
          <Plus className="size-4 shrink-0" />
          <span className="hidden text-xs sm:inline">{t('csvAddRow')}</span>
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-10 w-10 shrink-0 sm:w-auto sm:px-3"
          title={t('csvAddCol')}
          onClick={addCol}
        >
          <Columns3 className="size-4 shrink-0" />
          <span className="hidden text-xs sm:inline">{t('csvAddCol')}</span>
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-10 w-10 shrink-0"
          title={t('csvDelRow')}
          aria-label={t('csvDelRow')}
          disabled={!active}
          onClick={delRow}
        >
          <Trash2 className="size-4 shrink-0" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-10 w-10 shrink-0"
          title={t('csvDelCol')}
          aria-label={t('csvDelCol')}
          disabled={!active}
          onClick={delCol}
        >
          <SquareMinus className="size-4 shrink-0" />
        </Button>

        <Button
          size="sm"
          className="ml-auto h-9 shrink-0 gap-1.5"
          disabled={!dirty || saving}
          onClick={handleSave}
        >
          <Save className="size-4 shrink-0" />
          <span className="text-xs">{t('save')}</span>
        </Button>
      </div>

      {/* Grid */}
      <div className="min-h-0 flex-1 overflow-auto">
        <table className="border-collapse text-sm">
          <thead>
            <tr>
              <th scope="col" className="sticky left-0 top-0 z-30 bg-background p-0">
                <div className="flex h-9 w-12 items-center justify-center border-b border-r border-border/60 bg-muted/60" />
              </th>
              {Array.from({ length: renderCols }, (_, c) => (
                <th key={c} scope="col" className="sticky top-0 z-20 bg-background p-0">
                  <div className="flex h-9 min-w-[110px] max-w-[260px] items-center justify-center border-b border-r border-border/60 bg-muted/60 px-2.5 text-xs font-medium text-muted-foreground">
                    {colLabel(c)}
                  </div>
                </th>
              ))}
              {hiddenCols > 0 && (
                <th scope="col" className="sticky top-0 z-20 bg-background p-0">
                  <div className="flex h-9 w-10 items-center justify-center border-b border-r border-border/60 bg-muted/60 text-xs font-medium text-muted-foreground">
                    …
                  </div>
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {shownRows.map((row, r) => (
              <tr key={r}>
                <td className="sticky left-0 z-10 bg-background p-0">
                  <div className="flex h-9 w-12 items-center justify-center border-b border-r border-border/60 bg-muted/60 text-xs text-muted-foreground">
                    {r + 1}
                  </div>
                </td>
                {Array.from({ length: renderCols }, (_, c) => {
                  const isActive = active !== null && active.r === r && active.c === c
                  const isEditing = editing !== null && editing.r === r && editing.c === c
                  const value = row[c] ?? ''
                  return (
                    <td key={c} className="p-0">
                      <div
                        className={cn(
                          'flex h-9 min-w-[110px] max-w-[260px] items-center truncate border-b border-r border-border/60',
                          isEditing ? 'px-0' : 'px-2.5',
                          isActive && 'bg-accent/30 outline outline-2 outline-primary -outline-offset-2'
                        )}
                        onClick={() => {
                          if (isEditing) return
                          cancelEditRef.current = false
                          applyActive({ r, c })
                          applyEditing({ r, c })
                        }}
                      >
                        {isEditing ? (
                          <input
                            key={`${r}:${c}`}
                            autoFocus
                            defaultValue={value}
                            aria-label={`${colLabel(c)}${r + 1}`}
                            className="h-full w-full min-w-0 bg-background px-2.5 text-sm outline-none"
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault()
                                cancelEditRef.current = false
                                commitEnter(r, c, e.currentTarget.value)
                              } else if (e.key === 'Escape') {
                                e.preventDefault()
                                cancelEditRef.current = true
                                applyEditing(null)
                              }
                            }}
                            onBlur={(e) => {
                              if (cancelEditRef.current) {
                                cancelEditRef.current = false
                                return
                              }
                              setCellValue(r, c, e.currentTarget.value)
                              applyEditing(null)
                            }}
                          />
                        ) : (
                          <span className="truncate">{value}</span>
                        )}
                      </div>
                    </td>
                  )
                })}
                {hiddenCols > 0 && (
                  <td className="p-0">
                    <div className="flex h-9 w-10 items-center justify-center border-b border-r border-border/60 text-xs text-muted-foreground">
                      …
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Load more */}
      {rows.length > visibleRows && (
        <div className="flex shrink-0 justify-center bg-background px-3 py-2">
          <Button
            variant="ghost"
            size="sm"
            className="h-9 text-xs"
            onClick={() => setVisibleRows((v) => v + LOAD_MORE_STEP)}
          >
            {tf('csvLoadMore', { n: Math.min(LOAD_MORE_STEP, rows.length - visibleRows) })}
          </Button>
        </div>
      )}

      {/* Status bar */}
      <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-t px-3 py-2 text-xs text-muted-foreground">
        <span>{tf('csvRows', { n: rows.length })}</span>
        <span>{tf('csvCols', { n: totalCols })}</span>
        <span className="ml-auto">{t('csvEditHint')}</span>
      </div>
    </div>
  )
}
