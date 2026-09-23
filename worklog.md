# OmniFile — Worklog

Project: "OmniFile — All-in-One File Viewer & Editor" — a local-first, installable PWA.
All file processing is 100% client-side (no backend). Runs as a Next.js 16 App Router app
(the sandbox mandates Next.js; every requested library — pdf.js, pdf-lib, CodeMirror 6,
SheetJS, mammoth, idb — is used exactly as planned, PWA implemented via hand-rolled
manifest + service worker instead of vite-plugin-pwa).

---

Task ID: 1
Agent: z-ai-code (main orchestrator)
Task: Foundation — deps, PWA shell, core libs, i18n, library UI, component stubs

Work Log:
- Installed: idb@8, pdfjs-dist@6.3.289, pdf-lib@1.17.1, xlsx@0.18.5, mammoth@1.12.3,
  @uiw/react-codemirror@4.25.11, @codemirror/lang-markdown, @codemirror/lang-json,
  @codemirror/language-data, dompurify@3.4.15 (sharp, sonner, next-themes, react-markdown,
  lucide-react already present). DO NOT install anything else.
- Copied pdfjs worker → public/pdf.worker.min.mjs (workerSrc = '/pdf.worker.min.mjs').
- Generated app icons → public/icons/{icon-192,icon-512,maskable-512,apple-touch-icon}.png, public/favicon.png.
- public/manifest.webmanifest (standalone, theme #0d9488) + public/sw.js (network-first
  offline shell, cache fallback) + src/components/pwa/register-sw.tsx (registers on load).
- src/lib/file-types.ts: `detectKind(name, mime) → FileKind` ('pdf'|'image'|'text'|'markdown'|'csv'|'excel'|'docx'|'video'|'audio'|'unsupported'),
  `getExt`, `kindToGroup`, `kindLabelKey` (→ i18n key kind*), FILTER_GROUPS, filterGroupLabelKey.
- src/lib/idb.ts (IndexedDB via idb, stores 'meta' + 'blobs'):
  `addFiles(File[]) → StoredFileMeta[]`, `listFiles() → StoredFileMeta[]`, `getFileBlob(id) → Blob|null`,
  `updateFileBlob(id, blob)`, `renameFile(id, name)`, `deleteFile(id)`,
  `requestPersistentStorage()`, `estimateStorage()`.
  StoredFileMeta = { id, name, mime, size, kind, addedAt, updatedAt, starred }.
- src/lib/viewer-types.ts — THE CONTRACT for all viewers/editors:
  ```ts
  interface ViewerEditorProps {
    file: StoredFileMeta; blob: Blob; dirty: boolean;
    onDirtyChange: (dirty: boolean) => void;
    onSave: (newBlob: Blob) => Promise<void>;  // persists into IndexedDB library
  }
  ```
- src/lib/fsa.ts: `openFilesWithPicker()` (FSA → input fallback), `openFilesWithInput(accept, multiple)`,
  `downloadBlob(blob, name)`, `saveOrDownloadBlob(blob, name) → 'saved'|'downloaded'`,
  `supportsOpenPicker()`, `supportsSavePicker()`.
- src/lib/format.ts: `formatBytes(n)`, `formatDate(ts, lang)`.
- src/lib/i18n.tsx: `useI18n() → { t, tf, lang, setLang }`. lang: 'bn' (default) | 'en'.
  t(key) → string; tf(key, {n: 5}) interpolates {n}. Full dictionary in the file — keys
  used by viewers/editors include: pdfPage/pdfPrev/pdfNext/pdfZoomIn/pdfZoomOut/pdfFit/pdfHint,
  editTab/previewTab/chars/lines, imgRotateLeft/imgRotateRight/imgFlipH/imgFlipV/imgCrop/
  imgCropHint/imgCropApply/imgResize/imgResizeTitle/imgWidth/imgHeight/imgKeepAspect/
  imgFilters/imgBrightness/imgContrast/imgSaturation/imgGrayscale/imgSepia/imgBlur/
  imgPresets/imgPresetNone/imgPresetBW/imgPresetSepia/imgPresetVivid/imgPresetCool/
  imgPresetWarm/imgUndo/imgProcessing, csvSheets/csvAddRow/csvAddCol/csvDelRow/csvDelCol/
  csvRows/csvCols/csvLoadMore/csvEditHint, docxNote/mediaHint, readOnly/save/download/back/
  cancel/reset/apply/done/loading/errGeneric/tSaveFailed/tDownloadStarted/tSaved.
  ⚠ Use ONLY existing keys — do NOT edit i18n.tsx (parallel agents share it).
- src/app/page.tsx: app shell (header, drop-zone hero, search + kind filter chips, file grid,
  sticky footer, drag&drop overlay, delete/rename/unsaved-close dialogs). Viewer routing via
  next/dynamic (ssr:false) per kind. Unsaved-close guard wired to `dirty`.
- Stubs in place (implement, do NOT rename/move):
  src/components/viewers/pdf-viewer.tsx (default export PdfViewer)
  src/components/editors/text-editor.tsx (TextEditor)
  src/components/editors/image-editor.tsx (ImageEditor)
  src/components/editors/sheet-editor.tsx (SheetEditor)
  src/components/viewers/docx-viewer.tsx (DocxViewer)
  src/components/viewers/media-viewer.tsx (MediaViewer)
- globals.css: Bengali font fallbacks, slim scrollbars, CodeMirror 100%-height rules
  (.cm-editor height 100%), .no-touch-callout helper.
- lint: 0 errors.

Stage Summary:
- Contract for every viewer/editor component: props = ViewerEditorProps above; component
  root must be `h-full flex flex-col` (it renders inside a `flex min-h-0 flex-1 flex-col`
  container — inner areas scroll, never the page). Mark file 'use client', default export,
  TypeScript strict, NO new deps, NO edits outside your assigned files, NO test files.
- Available shadcn/ui: button, badge, card, dialog, alert-dialog, input, label, tabs,
  slider, select, switch, separator, scroll-area, skeleton, tooltip, dropdown-menu,
  toggle, toggle-group, popover, drawer, sonner (`import { toast } from 'sonner'`).
- Design rules: mobile-first; NO blue/indigo; use semantic tokens (bg-background,
  bg-card, text-muted-foreground, border-border, bg-primary, accent-*); touch targets ≥44px
  (icon buttons: className "h-10 w-10"); dark-mode must look right (tokens only);
  toolbars: flex overflow-x-auto gap-1.5 shrink-0 buttons.
- Dev server is ALREADY RUNNING on port 3000 (dev.log). Do not start/restart it.
  Do not run lint/build. Just write correct code carefully.

---

Task ID: 2-b
Agent: text-editor-agent
Task: Text/Markdown editor with CodeMirror 6

Work Log:
- Read worklog.md + all contracts first: viewer-types.ts (ViewerEditorProps), file-types.ts
  (getExt/detectKind), i18n.tsx (t/tf are useCallback([lang]); keys editTab/previewTab/chars/
  lines/tSaved/tSaveFailed/errGeneric/save all exist in en+bn), tabs/button/skeleton ui
  components, globals.css (.cm-editor height 100%, .no-touch-callout, @theme — no xs
  breakpoint), page.tsx (TextEditor dynamically imported ssr:false, spreads viewerProps).
- Verified packages in package.json; @codemirror/view + @codemirror/language-data resolvable
  from node_modules (hoisted). Inspected @uiw/react-codemirror useCodeMirror source: the
  update-listener useMemo depends on onChange identity → stable callback + refs is safe.
- Replaced stub src/components/editors/text-editor.tsx with the full implementation:
  - Load: useEffect on blob → blob.text() with cancelled flag; value/originalText start '';
    Skeleton until loaded. Load/state tracked by blob IDENTITY (loadedFor/loadErrorFor) so
    every setState happens inside async callbacks (no sync setState-in-effect — matches the
    react-hooks/set-state-in-effect rule Task 1 had to eslint-disable elsewhere) and file
    switches show a fresh Skeleton instead of stale content.
  - CodeMirror: EditorView.lineWrapping always; markdown({codeLanguages: languages}) when
    file.kind==='markdown'; json() when getExt(file.name)==='json'; nothing otherwise.
    extensions memoized via useMemo on [mode, isJson]. theme from next-themes resolvedTheme
    ('dark'?'dark':'light'); className="h-full" + style height 100%.
  - basicSetup hoisted to module const { foldGutter: false } — @uiw includes basicSetup in
    its reconfigure effect deps, so a fresh literal each render (dirty flips per keystroke →
    parent re-render) would rebuild setup state and reset undo history.
  - onChange: setValue + onDirtyChange(newVal !== originalText) via ref mirrors
    (originalRef/onDirtyRef) — the handler bound once by @uiw can never read a stale
    originalText after save, nor a stale parent callback.
  - Markdown only: shadcn Tabs (edit|preview, Pencil/Eye, default 'edit') in toolbar; preview
    renders ReactMarkdown inside .docx-preview wrapper with the full manual prose class set
    (arbitrary-variant classes, all static strings so Tailwind picks them up) in an
    overflow-auto area. react-markdown escapes raw HTML by default → no sanitizer.
    Switching tabs unmounts/remounts CodeMirror; controlled value preserves content.
  - Toolbar: left = tabs (markdown) or FileCode icon + truncated file name (plain text);
    right = chars (hidden sm:inline) + lines counts, Save Button size="sm" h-9 with Save
    icon, Loader2 animate-spin while saving, disabled = saving || !isLoaded || isLoadError ||
    !dirty || value===originalText.
  - Save: new Blob([value], {type: file.mime || 'text/plain;charset=utf-8'}) → await onSave →
    applyOriginal(value) → toast tSaved; catch → toast tSaveFailed; finally clear saving.
  - All UI strings via useI18n; semantic tokens only (no blue/indigo); icons aria-hidden.
- Did NOT run lint/build/dev-server commands per rules; only read/verified files.

Stage Summary:
- dirty is owned by the parent: component fires onDirtyChange per edit and combines the
  parent `dirty` prop with local value===originalText for the Save gate → stays consistent
  even if the parent clears dirty during/after save (spec: "parent also clears dirty").
- Load failures show an inline centered errGeneric message (no toast — toast needed t in the
  effect which would have made the effect re-run on language switch and wipe unsaved edits);
  Save stays disabled on load error (value===originalText) so a failed read can never clobber
  the stored blob with empty content.
- "hidden xs:inline" from the spec was replaced with "hidden sm:inline": Tailwind @theme here
  defines no xs breakpoint, so xs:inline would never apply and chars count would be
  permanently hidden.
- Reload-on-t dependency avoided: the load effect depends only on [blob, applyOriginal]
  (both stable) → switching UI language mid-edit cannot reset the editor.
- Tab switch remounts CodeMirror (no display:none measurement bugs); trade-off: undo history
  and cursor position are not preserved across preview round-trips — value always is.
- Risk/notes: i18n `save` key used for the button label; Save button h-9 + TabsList h-9 per
  spec (slightly under the 40px guidance but explicit in the task); markdown preview re-parses
  only when visible; JSON detection is extension-based (file.kind 'text' + .json).

---

Task ID: 2-e
Agent: docx-media-agent
Task: DOCX viewer (mammoth) + media player

Work Log:
- Inspected node_modules/mammoth@1.12.3 first: package.json has NO "exports" map
  (deep imports allowed), "main" = ./lib/index.js with "browser" field mapping
  lib/unzip.js + lib/docx/files.js to browser-safe versions; prebuilt UMD bundles
  exist at package root (mammoth.browser.js 886KB, mammoth.browser.min.js 637KB);
  lib/index.d.ts ships (typed convertToHtml); only lib/unzip.js, lib/docx/files.js
  (browser-mapped away) and lib/main.js (CLI-only, not referenced by index.js)
  require Node built-ins → plain 'mammoth' import should bundle fine.
- docx-viewer.tsx: dynamic import chain — try `await import('mammoth')` first,
  catch → fallback `await import('mammoth/mammoth.browser.js')` (normalize
  `mod.default ?? mod`, validate convertToHtml is a function before use). Conversion
  in useEffect keyed on blob with `cancelled` flag (StrictMode-safe): convertToHtml
  on `await blob.arrayBuffer()` → DOMPurify.sanitize → setState (DOMPurify's default
  config keeps base64 data: URIs on img, so mammoth's inline images survive).
- DOCX render: read-only toolbar strip (Badge secondary t('readOnly') + muted
  text-xs t('docxNote'), shrink-0, border-b, bg-background/95); scroll area
  bg-muted/20 dark:bg-muted/10 p-4; centered docx-preview card max-w-3xl
  rounded-xl bg-card p-6 sm:p-10 shadow-sm; prose via Tailwind arbitrary variants
  ([&_h1..h4], [&_p]:my-2.5 leading-relaxed, [&_ul]/[&_ol] list-disc/decimal pl-6,
  [&_li]:my-1, [&_a]:text-primary underline, [&_img]:max-w-full rounded-lg,
  [&_table] w-full text-sm border-collapse + bordered th/td, th bg-muted/50,
  [&_blockquote] border-l-4 italic muted, [&_hr]:my-6, [&_>:first-child]:mt-0).
  Loading = centered Skeletons + t('loading'); error = centered Card with
  t('errGeneric') + truncated error message in text-xs muted.
- media-viewer.tsx: object URL created in useEffect on blob, revoked in cleanup
  (StrictMode-safe, key={url} on media elements forces clean remount per blob);
  failed state reset on blob change. Video (mime video/ or kind video): stage
  `bg-black/90 p-3` centered, native <video controls playsInline max-h-full
  max-w-full>, NO autoPlay. Audio: bg-muted/30 stage → Card w-full max-w-md p-6
  with absolute top-right secondary Badge t('mediaHint') (pointer-events-none),
  disc icon (rounded-full bg-primary/10 p-5 + Music h-8 w-8 text-primary),
  truncated file.name, formatBytes(file.size) muted, <audio controls class="mt-2
  w-full">. onError on either element → Card with t('errGeneric') replaces the
  player. All strings via useI18n; tokens only, no blue/indigo; roots
  `flex h-full min-h-0 flex-col`.

Stage Summary:
- mammoth import path: plain 'mammoth' is tried FIRST and is expected to work
  (its "browser" field swaps the two fs-requiring modules; no "exports" map).
  Fallback 'mammoth/mammoth.browser.js' (unminified, gets minified at build) is
  kept as runtime insurance via try/catch — both paths type-safe through
  `unknown` casts to a local MammothLike interface, so no @ts-ignore needed.
  Note: both entries are in the bundle graph → the unused fallback adds ~1 lazy
  chunk; acceptable trade-off for robustness.
- ViewerEditorProps contract honored (dirty/onSave intentionally ignored — both
  are read-only viewers); only the two assigned files were touched.
- Potential risks: (1) if a bundler ever ignores the "browser" field, the plain
  import fails at chunk-compile time and the fallback keeps the viewer working;
  (2) DOCX tables wider than the card are not horizontally wrapped inside the
  card (document area itself scrolls); (3) no mammoth warning messages surfaced
  to the UI by design (read-only, minimal UI).

---

Task ID: 2-c
Agent: image-editor-agent
Task: Canvas image editor (rotate/flip/crop/resize/filters + worker export)

Work Log:
- Created public/workers/image-worker.js (classic worker, plain JS, not bundled):
  draws transferred ImageBitmap into OffscreenCanvas with optional CSS filter string,
  convertToBlob({type, quality}), replies {ok:true,blob} or {ok:false,error}.
- Implemented src/components/editors/image-editor.tsx (default export ImageEditor,
  ViewerEditorProps contract, root `flex h-full min-h-0 flex-col`):
  * Decode: createImageBitmap(blob) in try/catch keyed once per file.id (re-decode
    skipped when parent refreshes `blob` after save, so undo history/filters survive);
    centered Skeleton + imgProcessing while decoding; Card + errGeneric on failure.
  * Working canvas in a ref (offscreen); destructive ops = rotate90 cw/ccw, flipH/V,
    crop(rect), resize(w,h); each op pushes previous canvas to undo stack (max 15,
    oldest shifted); Undo pops+swaps; Reset rebuilds from original ImageBitmap and
    clears undo + filters + crop/geom-dirty state, onDirtyChange(false).
  * Undo/Redo depth mirrored in state for button enable/disable; workingVersion
    counter drives preview redraw + fit recalculation after ref mutations.
  * Non-destructive filters state (brightness 50-150, contrast 50-150, saturation
    0-200, grayscale 0-100, sepia 0-100, blur 0-20px; defaults 100/100/100/0/0/0).
    Filter string builder omits defaults, '' when all default. 6 preset chips
    (Original/Mono/Vintage/Vivid/Cool/Warm) set slider values; active preset derived
    by equality, so manual slider edits deselect automatically. Panel toggled by
    SlidersHorizontal button (secondary when open), presets in overflow-x-auto chip
    row, sliders grid 1/2/3 cols with numeric values.
  * Preview: canvas.width/height = working dims, CSS-scaled to fit stage
    (scale = min(stageW/w, availH/h, 1) via ResizeObserver contentRect; availH
    reserves ~84px for crop chrome so crop mode never triggers jump-scroll).
    Drawn with ctx.filter = filterString on main thread.
  * Crop mode: relative inline-block wrapper (overflow-hidden) around canvas +
    pointer-captured overlay (touch-none, crosshair); marquee = dashed white border
    with 0 0 0 9999px rgba(0,0,0,.5) outset shadow (outer area darkened, clipped by
    wrapper); hint above canvas; Apply/Cancel row below canvas; display->image coords
    via scale factor, clamped to bounds, >=8px, taps (<2px drag) exit instead of
    cropping; entering crop mode resets any in-progress selection.
  * Resize dialog: width/height number inputs, keep-aspect Switch (default on,
    live counterpart-field updates via captured ratio), Apply clamps 16-8000 and
    recomputes h from clamped w when keep-aspect; high-quality draw
    (imageSmoothingEnabled + quality 'high').
  * Save: exportImage() = createImageBitmap(working) -> lazy Worker('/workers/image-worker.js')
    -> postMessage transfer [bitmap] -> promise resolved from one-shot message/error
    handlers; on any failure worker terminated+recreated and falls back to
    main-thread working.toBlob(). Format: jpeg->jpeg q0.92, webp->webp q0.92,
    everything else (incl. gif/avif/heic) -> PNG. Then await onSave(blob),
    toast tSaved / tSaveFailed, onDirtyChange(false). Save button disabled
    !dirty||saving, Loader2 spin while saving.
  * Dirty model: dirty after any geometry op (geomDirtyRef) or non-default filter
    state; cleared on save success and reset; mirror ref syncs from `dirty` prop so
    parent-driven clears are respected without redundant onDirtyChange calls.
  * Cleanup: worker terminated on unmount, ResizeObserver disconnected, decode
    cancelled flag; all canvas ops null-guarded; strings only via useI18n existing
    keys; toasts via sonner; semantic tokens only, no blue/indigo, h-10 touch targets.
- Verified with `npx tsc --noEmit`: zero errors under src/ (remaining output is
  unrelated sandbox examples/skills scaffolding).

Stage Summary:
- Export pipeline is worker-first with graceful degradation: Worker + OffscreenCanvas +
  createImageBitmap all required before attempting worker path; single reusable worker
  (terminated/recreated on error), main-thread toBlob fallback guarantees export
  works even in old browsers.
- Decode is keyed on file.id, NOT on blob identity: page.tsx re-reads the blob from
  IndexedDB after onSave, which must NOT reset the editing session (undo stack,
  filters, working canvas all survive a save).
- Filters stay non-destructive end-to-end: preview applies ctx.filter per frame,
  worker bakes the identical filter string into the exported blob; if a browser
  lacks ctx.filter (older Safari) both preview and export degrade identically
  (filters silently omitted) - acceptable, documented risk.
- Reset restores the ORIGINAL upload (mount-time bitmap), not the last saved blob;
  undo history is intentionally preserved across saves for continued editing.
- Crop confirm row sits below the canvas (spec-allowed alternative to absolute
  bottom-3) so it never overlaps the image on small screens; fit-scale reserves
  vertical space while crop mode is active.

---

Task ID: 2-a
Agent: pdf-viewer-agent
Task: PDF viewer with pdf.js

Work Log:
- Read worklog.md, viewer-types.ts, i18n.tsx (key check), button/skeleton/card components,
  tsconfig and pdfjs-dist@6.3.289 type defs (api.d.ts / pdf.d.ts) before writing code.
- Implemented src/components/viewers/pdf-viewer.tsx (default export PdfViewer, 'use client',
  props ViewerEditorProps — only `blob` consumed; dirty/onSave intentionally ignored).
  - Module top: `import * as pdfjsLib from 'pdfjs-dist'` +
    `pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'`.
  - Load effect keyed on `blob`: blob.arrayBuffer() → getDocument({ data }) → track numPages;
    `cancelled` flag + `loadingTask.destroy()` on cleanup (all setState calls happen after
    awaits, never synchronously in the effect body → keeps react-hooks/set-state-in-effect
    clean without eslint-disable comments); error → centered Card with t('errGeneric');
    loading → centered Skeleton block.
  - Render effect keyed on (doc, page, scale, fitMode, loading, error): getPage → viewport →
    render to <canvas> with devicePixelRatio scaling (backing store = viewport×dpr, CSS size
    = viewport, extra transform [dpr,0,0,dpr,0,0]); canvas.width assignment clears previous
    content; in-flight RenderTask cancelled in cleanup + defensively at start;
    RenderingCancelledException filtered; renderSeq ref drops stale completions;
    page.cleanup() in finally.
  - Fit-width default ON: ResizeObserver (rAF-debounced) tracks scroll-container width;
    baseWidth = current page's viewport width at scale 1 (seeded with page 1 at load so the
    first paint is already fitted, refreshed per rendered page).
  - Zoom: manual zoom state clamped [0.25, 5]; buttons ×/÷1.25 (round 2 decimals),
    ctrl+wheel over canvas area ±10% (native non-passive wheel listener — React synthetic
    onWheel is passive); any manual zoom turns fitMode off; toolbar shows
    Math.round(scale*100)% and a fit toggle (Maximize2, variant default when active).
  - Page nav: prev/next Chevron buttons disabled at bounds, tf('pdfPage',{page,total}) label;
    touch swipe (dx>60 && |dx|>|dy|*1.5 → flip) recorded via onTouchStart/onTouchEnd.
  - Layout per spec: root `flex h-full min-h-0 flex-col`; toolbar
    `flex items-center gap-1.5 overflow-x-auto border-b bg-background/95 px-2 py-2 no-touch-callout`
    with shrink-0 h-10 w-10 ghost icon Buttons; hint line text-xs text-muted-foreground pb-1;
    canvas area `min-h-0 flex-1 overflow-auto bg-muted/40 dark:bg-muted/20 p-3 flex items-start
    justify-center`; canvas `mx-auto block shrink-0 bg-white shadow-md` (shrink-0 is required
    or flex would compress the canvas instead of scrolling when zoomed in).
- Verified with `npx tsc --noEmit` (isolated check, no artifacts): 0 errors in pdf-viewer.tsx.
  Did not run lint/build/dev-server per rules.

Stage Summary:
- pdf.js v6 API specifics: RenderParameters now requires `canvas` (canvasContext is
  legacy/optional) → render call is `{ canvas, viewport, transform }`; PDFDocumentProxy has
  NO destroy() in v6 — teardown must go through PDFDocumentLoadingTask.destroy() (verified
  against shipped .d.ts; tsc caught my initial doc.destroy() usage).
- Scale design: single source of truth avoided setState-in-fit-effect lint issue by deriving
  effective scale = fitMode ? clamp(containerWidth/baseWidth) : zoom (both states), so fit
  recomputation is pure derivation — RO/zoom/wheel handlers stay event-driven; behavior is
  identical to a plain `scale` state. scaleRef mirrors it for the once-registered wheel
  handler and for zoom buttons resuming from the current fit scale.
- Error recovery: any user navigation/zoom action clears the error flag so a failed page
  render never permanently bricks the viewer; load errors show the errGeneric Card.
- Risks/notes: cross-monitor dpr changes won't re-render until next interaction (minor);
  swipe intentionally has no horizontal-scroll guard (per spec "keep it simple"); brief stale
  frame of the previous document is possible between blob change and the load effect's async
  state reset (harmless, canvas is read-only there).

---

Task ID: 2-d
Agent: sheet-editor-agent
Task: CSV/Excel viewer+editor with SheetJS

Work Log:
- Replaced src/components/editors/sheet-editor.tsx stub with the full SheetEditor
  (default export, ViewerEditorProps, 'use client', root flex h-full min-h-0 flex-col).
- Parse: useEffect keyed on [blob] → workbook via XLSX.read; kept in wbRef. For csv/tsv
  the blob is decoded with blob.text() + BOM strip and read as { type: 'string' } because
  SheetJS 0.18.5's array path mis-decodes non-BOM UTF-8 (verified Bengali → cp1252
  mojibake in node). Binary formats (xlsx/xlsm/xlsb/xls/ods) use the ArrayBuffer path.
  Matrix built with sheet_to_json<unknown[]>(ws, { header: 1, defval: '', raw: true }) →
  normalizeMatrix() → uniform string[][] (String(v ?? ''), rows padded to equal width,
  trailing all-empty rows/cols trimmed, min 1×1). Skeleton while parsing; Card with
  t('errGeneric') on parse failure (cancelled-flag guards async races).
- Grid: sticky A/B/C… header (colLabel() helper, Z → AA), sticky 1-based row-number
  column, z-30 corner cell; sticky cells layered bg-background (opaque) + inner div
  bg-muted/60 so scrolled content never bleeds through. Cells are divs with the spec's
  min-w-[110px] max-w-[260px] truncate px-2.5 h-9 flex border classes; click → active
  (outline-primary + bg-accent/30) + inline autoFocus input; Enter commits + moves
  active down one row, blur commits, Escape cancels (cancelEditRef guards the unmount
  blur). visibleRows starts at 100, "Load more" (+200, tf('csvLoadMore')) below the
  grid, hidden when all rows shown; columns capped at 80 with a muted "…" column note.
- Toolbar: Select (FileSpreadsheet icon) for multi-sheet workbooks, value = active
  index; Add row (Plus + sm text), Add column (Columns3 + sm text), Delete row (Trash2)
  / Delete column (SquareMinus) — the latter two disabled without an active cell and
  they clear/clamp editing + active. Save button right-aligned (ml-auto), disabled
  !dirty || saving → onSave(blob) → toast t('tSaved') / t('tSaveFailed').
- Per-sheet edit memory: editsRef Map<sheetName, string[][]> persisted on sheet switch
  / save; originalsRef Map holds the parsed baseline per sheet; recomputeDirty() marks
  dirty when ANY touched sheet differs from its baseline (mutatedRef Set gates scans).
  Sheet switch restores the edited matrix if present, else re-parses fresh from wbRef,
  and resets visibleRows / active / editing.
- Save: AOA coercion ('' → '', /^[+-]?\d+(\.\d+)?$/ && len<16 → Number, else string).
  csv/tsv → aoa_to_sheet + sheet_to_csv (FS ',' or '\t') → text/csv / text/tab-separated-
  values;charset=utf-8. Excel → original workbook from wbRef, active sheet replaced,
  OTHER sheets edited this session also flushed (untouched sheets stay byte-identical);
  bookType 'xls' for .xls else 'xlsx'; blob type application/vnd.openxmlformats-
  officedocument.spreadsheetml.sheet. After save, baselines are rebased and dirty
  cleared (parent also passes a fresh blob → re-parse).
- Status bar: tf('csvRows'), tf('csvCols') (real matrix width) + t('csvEditHint'),
  text-xs text-muted-foreground, border-t.
- Verified: npx tsc --noEmit → 0 errors in app code; dev server GET / → 200, compiled.

Stage Summary:
- ONLY src/components/editors/sheet-editor.tsx was modified. No new deps, no i18n edits
  (keys used: csvSheets/csvAddRow/csvAddCol/csvDelRow/csvDelCol/csvRows/csvCols/
  csvLoadMore/csvEditHint/save/tSaved/tSaveFailed/errGeneric), toasts via sonner,
  semantic tokens only (dark-mode safe), no blue/indigo, no emojis.
- Deliberate deviations, both correctness fixes: (1) csv/tsv parsed via type:'string'
  instead of type:'array' — the spec's arrayBuffer path corrupts non-BOM UTF-8 CSV
  (verified); binary formats unchanged. (2) thead sticky z-20 / corner z-30 instead of
  spec's flat z-10 — equal z-index let row-number cells paint over the header strip
  when scrolling vertically (DOM order).
- Save semantics: only the ACTIVE sheet's grid is replaced for excel files per spec,
  extended to also flush other sheets the user edited this session so those edits are
  not silently dropped; untouched sheets are preserved from the original workbook.
- Accepted limitations (per spec): .ods/.xlsm/.xlsb inputs are written back as .xlsx
  bytes (filename keeps its old extension); edited sheets lose formulas/styles on save
  (AOA round-trip); huge sheets keep full matrix in memory (render is virtualized to
  100 rows / 80 cols); "Load more" reveals +200 rows per click.
- Next agent notes: parent page.tsx already wires dirty/onSave; nothing else to touch.

---
Task ID: 3
Agent: z-ai-code (main orchestrator)
Task: Integration, verification, polish

Work Log:
- Fixed lint across all agent files: media-viewer object-URL pattern (useMemo + revoke
  effect instead of setState-in-effect), docx-viewer loading state (loadedFor blob-identity
  pattern), removed unused eslint-disable directives, added public/** to eslint ignores.
- Fixed FileCard layout: shadcn Card base includes flex-col → added flex-row.
- MAJOR FIX — app shell height chain: root div used min-h-dvh, so every h-full inside the
  viewer (image editor stage, CodeMirror) resolved to auto and collapsed (image canvas
  stage measured 24px). Changed to app-shell pattern: root `flex h-dvh flex-col
  overflow-hidden`, main `min-h-0 flex-1 overflow-hidden`, library scrolls internally
  (`h-full overflow-y-auto`), footer `shrink-0` (always visible, app-like PWA shell).
- Fixed ThemeToggle hydration mismatch (title/aria-label depended on resolvedTheme →
  static "Toggle theme" label; icon state via CSS classes).
- Browser-verified end-to-end via agent-browser (headless Chrome): added 9 test files
  through the real picker flow (showOpenFilePicker mocked with real File bytes); exercised
  PDF (page nav 1/3→3/3, fit-width 215%, zoom, swipe hint), TXT (CodeMirror edit → dirty
  badge → save → toast), MD (Edit/Preview tabs, full markdown rendering), CSV (cell edit
  28→31, Enter commit, save), XLSX (2-sheet selector switch), JPG (rotate 90°, Mono preset
  grayscale, save via image worker → no errors), DOCX (mammoth HTML + read-only badge),
  WAV (audio player with duration), archive.xyz (unsupported message + download), rename
  dialog, delete confirm dialog, search filter, dark/light mode, bn/en toggle with Bengali
  numerals, mobile 390×844 viewport (library + image editor), OFFLINE mode (SW network-first
  fallback: full app + PDF viewer work offline, amber offline badge).
- Final: 0 lint errors, 0 hydration warnings, 0 page errors, tsc clean, all GET / 200.

Stage Summary:
- App complete: installable PWA (manifest + SW + icons), local-first library on IndexedDB
  with persistent-storage request, 6 format viewers/editors + unsupported fallback,
  bn/en i18n, dark mode, mobile-first responsive, offline-capable.
