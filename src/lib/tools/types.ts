/**
 * Shared types for the OmniFile advanced tools suite (Task 3).
 * Every tool produces `ToolResultFile` objects; batching, zipping and
 * downloading are handled by `batch.ts` so each tool stays focused on
 * its own conversion logic.
 */

/** One processed output file produced by any tool. */
export interface ToolResultFile {
  /** Suggested download file name (with extension). */
  name: string
  /** The processed payload. */
  blob: Blob
}

/** Overall batch progress, reported between individual files. */
export interface BatchProgress {
  /** Number of input files fully processed (success or failure). */
  done: number
  /** Total input files. */
  total: number
  /** Name of the file currently being processed (null when idle). */
  current: string | null
}

/** A single input file that could not be processed. */
export interface BatchFailure {
  name: string
  error: string
}

/** What `runToolBatch` resolves with. */
export interface BatchOutcome {
  results: ToolResultFile[]
  failed: BatchFailure[]
}
