/**
 * Digital-certificate sealing for the PDF suite (Task 2-e) — 100% client-side.
 *
 * A self-signed X.509 certificate is generated on-device with node-forge,
 * the ORIGINAL pdf bytes are SHA-256 hashed, the hash is signed with the
 * private key (RSA-SHA256) and a small visible seal is drawn onto the PDF.
 * The verifier (`.omnisig.json`) carries the signature + certificate so the
 * integrity of the document can be re-checked later — also fully offline.
 *
 * IMPORTANT SEMANTICS (mirrored in the UI copy):
 *   The cryptographic signature covers the hash of the ORIGINAL pdf. The
 *   sealed copy visually shows the seal block, so its own bytes differ from
 *   the signed original — verification therefore hashes the ORIGINAL file
 *   recorded in the .omnisig.json and compares it against the CURRENT file
 *   to detect any later modification.
 *
 * ERROR CONTRACT: expected failures are thrown as ToolError with an i18n key
 * (pdfErr*, defined in src/lib/i18n/tools-pdf-security.ts).
 */

import { PDFDocument, rgb, StandardFonts } from '@cantoo/pdf-lib'
import forge from 'node-forge'

import { ToolError } from '@/lib/tools/pdf-tools-advanced'

/** User-provided identity for the self-signed certificate. */
export interface CertificateRequestInfo {
  commonName: string
  email?: string
  organization?: string
  /** Validity in days (default 365). */
  daysValid?: number
}

/** Certificate + private key PEM pair with a display fingerprint. */
export interface GeneratedCertificate {
  certPem: string
  keyPem: string
  /** SHA-256 over the certificate DER, hex grouped by 2 with ':'. */
  fingerprint: string
}

/** The parsed `.omnisig.json` side-car. */
export interface SigJson {
  format: 'omnifile-esign-1'
  algorithm: 'RSA-SHA256'
  signatureBase64: string
  certPem: string
  fingerprint: string
  /** ISO timestamp of the signing moment. */
  timestamp: string
  /** SHA-256 hex of the ORIGINAL pdf bytes (what the signature covers). */
  fileHash: string
  originalFileName: string
}

/** Output of signHash(). */
export interface SignResult {
  signatureBase64: string
  certPem: string
  fingerprint: string
  algorithm: 'RSA-SHA256'
  timestamp: string
}

export interface SealResult {
  sealedPdf: Blob
  sigJson: Blob
}

export interface SealVerifyResult {
  valid: boolean
  hashMatches: boolean
  subject: string
  timestamp: string
  fingerprint: string
}

/* -------------------------------------------------------------------------- */
/*                              small utilities                               */
/* -------------------------------------------------------------------------- */

/**
 * Appearance text is drawn with the standard Helvetica font (WinAnsi
 * encoding) — characters outside Latin-1 (e.g. Bengali) cannot be encoded
 * and would make pdf-lib throw. Non-Latin characters are replaced with '?';
 * the cryptographic identity lives in the certificate itself, not the seal.
 */
function latinSafe(text: string): string {
  return Array.from(text)
    .map((ch) => {
      const c = ch.codePointAt(0) ?? 63
      if ((c >= 32 && c <= 126) || (c >= 160 && c <= 255)) return ch
      return '?'
    })
    .join('')
}

/** Bytes → lowercase hex. */
function toHex(bytes: Uint8Array): string {
  let hex = ''
  for (const b of bytes) hex += b.toString(16).padStart(2, '0')
  return hex
}

/** Hex string → grouped-by-2 uppercase fingerprint ("AB:CD:…"). */
function groupHex(hex: string): string {
  return (hex.match(/.{2}/g) ?? []).join(':').toUpperCase()
}

/** SHA-256 over the certificate DER, formatted for display. */
function certificateFingerprint(cert: forge.pki.Certificate): string {
  const der = forge.asn1.toDer(forge.pki.certificateToAsn1(cert)).getBytes()
  const md = forge.md.sha256.create()
  md.update(der)
  return groupHex(md.digest().toHex())
}

/** SHA-256 hex of the certificate DER from a PEM string. */
function fingerprintFromPem(certPem: string): string {
  return certificateFingerprint(forge.pki.certificateFromPem(certPem))
}

/* -------------------------------------------------------------------------- */
/*                          1. certificate generation                         */
/* -------------------------------------------------------------------------- */

/**
 * Generate a self-signed RSA-2048 / SHA-256 certificate on this device.
 * The key pair NEVER leaves the browser (no sync, no upload).
 */
export async function generateCertificate(
  info: CertificateRequestInfo
): Promise<GeneratedCertificate> {
  const commonName = info.commonName.trim()
  if (!commonName) throw new ToolError('pdfErrCertName')

  const days = Math.min(3650, Math.max(1, Math.floor(info.daysValid ?? 365)))

  // ~1–3s on modern hardware; synchronous by design so the flow stays simple.
  const keyPair = forge.pki.rsa.generateKeyPair(2048)

  const cert = forge.pki.createCertificate()
  cert.publicKey = keyPair.publicKey
  cert.serialNumber = forge.util.bytesToHex(forge.random.getBytesSync(16))

  const attrs: forge.pki.CertificateField[] = [{ name: 'commonName', value: commonName }]
  if (info.email?.trim()) attrs.push({ name: 'emailAddress', value: info.email.trim() })
  if (info.organization?.trim()) {
    attrs.push({ name: 'organizationName', value: info.organization.trim() })
  }

  cert.setSubject(attrs)
  cert.setIssuer(attrs) // self-signed: issuer === subject
  cert.validity.notBefore = new Date()
  cert.validity.notAfter = new Date(Date.now() + days * 24 * 60 * 60 * 1000)
  cert.sign(keyPair.privateKey, forge.md.sha256.create())

  return {
    certPem: forge.pki.certificateToPem(cert),
    keyPem: forge.pki.privateKeyToPem(keyPair.privateKey),
    fingerprint: certificateFingerprint(cert),
  }
}

/* -------------------------------------------------------------------------- */
/*                          2. hashing + raw signature                        */
/* -------------------------------------------------------------------------- */

/**
 * SHA-256 of the pdf bytes via WebCrypto (async, streaming-friendly for big
 * files) with a node-forge fallback for non-secure contexts.
 */
export async function hashPdf(bytes: Uint8Array): Promise<string> {
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    try {
      const digest = await crypto.subtle.digest('SHA-256', bytes as BufferSource)
      return toHex(new Uint8Array(digest))
    } catch {
      /* fall through to the forge implementation */
    }
  }
  const md = forge.md.sha256.create()
  const CHUNK = 0x8000
  for (let i = 0; i < bytes.length; i += CHUNK) {
    let bin = ''
    const end = Math.min(bytes.length, i + CHUNK)
    for (let j = i; j < end; j++) bin += String.fromCharCode(bytes[j]!)
    md.update(bin)
  }
  return md.digest().toHex()
}

/**
 * Sign a hex-encoded SHA-256 digest with the private key (RSA-SHA256).
 *
 * `certPem` is required because the returned object carries the certificate
 * (needed by any verifier to check the signature) and the certificate
 * fingerprint — neither can be derived from the private key alone.
 */
export function signHash(hashHex: string, keyPem: string, certPem: string): SignResult {
  const key = forge.pki.privateKeyFromPem(keyPem)
  const md = forge.md.sha256.create()
  md.update(forge.util.hexToBytes(hashHex))
  const signature = key.sign(md) // binary string
  return {
    signatureBase64: forge.util.encode64(signature),
    certPem,
    fingerprint: fingerprintFromPem(certPem),
    algorithm: 'RSA-SHA256',
    timestamp: new Date().toISOString(),
  }
}

/** Verify a signed digest against the certificate inside the sig record. */
export function verifySignature(
  hashHex: string,
  sig: Pick<SigJson, 'signatureBase64' | 'certPem'>
): { valid: boolean; subject: string } {
  const cert = forge.pki.certificateFromPem(sig.certPem)
  const md = forge.md.sha256.create()
  md.update(forge.util.hexToBytes(hashHex))
  const rsaKey = cert.publicKey as forge.pki.rsa.PublicKey
  const valid = rsaKey.verify(md.digest().bytes(), forge.util.decode64(sig.signatureBase64))
  const cn = cert.subject.getField('commonName')
  return { valid, subject: cn ? String(cn.value) : '' }
}

/* -------------------------------------------------------------------------- */
/*                            3. seal + verification                          */
/* -------------------------------------------------------------------------- */

/** Visible seal block geometry (bottom-right corner of the page). */
const SEAL_W = 236
const SEAL_H = 72
const SEAL_MARGIN = 20

/**
 * Seal a pdf:
 *  1. hash the ORIGINAL bytes,
 *  2. sign that hash with the certificate,
 *  3. draw a small visible seal block (red border) on the chosen page,
 *  4. return the sealed pdf + the `.omnisig.json` verifier side-car.
 *
 * The signature covers the ORIGINAL file hash; the sealed copy merely
 * displays the seal — see the module docblock above.
 */
export async function sealPdf(
  file: File,
  certInfo: GeneratedCertificate,
  opts: { pageIndex?: number } = {}
): Promise<SealResult> {
  const originalBytes = new Uint8Array(await file.arrayBuffer())
  const fileHash = await hashPdf(originalBytes) // signature covers THIS hash
  const sig = signHash(fileHash, certInfo.keyPem, certInfo.certPem)

  const doc = await PDFDocument.load(originalBytes)
  const pageCount = doc.getPageCount()
  const index = Math.min(Math.max(0, opts.pageIndex ?? pageCount - 1), pageCount - 1)
  const page = doc.getPage(index)
  const { width: pageW, height: pageH } = page.getSize()

  const font = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)

  const boxW = Math.min(SEAL_W, Math.max(120, pageW - SEAL_MARGIN * 2))
  const boxH = Math.min(SEAL_H, Math.max(48, pageH - SEAL_MARGIN * 2))
  const x = pageW - boxW - SEAL_MARGIN
  const y = SEAL_MARGIN

  // Frame: white backing for readability + the dark-red stroke required by
  // the seal look (rgb 0.6/0/0).
  page.drawRectangle({
    x,
    y,
    width: boxW,
    height: boxH,
    color: rgb(1, 1, 1),
    opacity: 0.85,
    borderColor: rgb(0.6, 0, 0),
    borderWidth: 1.25,
  })

  const fpClean = sig.fingerprint.replace(/:/g, '')
  const fpShort = `${fpClean.slice(0, 12)}…${fpClean.slice(-12)}`

  // The identity comes from the certificate itself (subject CN).
  const parsedCert = forge.pki.certificateFromPem(certInfo.certPem)
  const cnField = parsedCert.subject.getField('commonName')
  const cn = cnField ? String(cnField.value) : 'Unnamed'
  page.drawText('Digitally signed', {
    x: x + 10,
    y: y + boxH - 18,
    size: 10,
    font: bold,
    color: rgb(0.6, 0, 0),
  })
  page.drawText(latinSafe(cn), {
    x: x + 10,
    y: y + boxH - 34,
    size: 9,
    font,
    color: rgb(0.15, 0.15, 0.15),
  })
  page.drawText(latinSafe(`Fingerprint: ${fpShort}`), {
    x: x + 10,
    y: y + boxH - 48,
    size: 8,
    font,
    color: rgb(0.3, 0.3, 0.3),
  })
  page.drawText(latinSafe(sig.timestamp), {
    x: x + 10,
    y: y + boxH - 61,
    size: 8,
    font,
    color: rgb(0.3, 0.3, 0.3),
  })

  const sealedBytes = await doc.save()

  const sigJson: SigJson = {
    format: 'omnifile-esign-1',
    algorithm: sig.algorithm,
    signatureBase64: sig.signatureBase64,
    certPem: sig.certPem,
    fingerprint: sig.fingerprint,
    timestamp: sig.timestamp,
    fileHash,
    originalFileName: file.name,
  }

  return {
    sealedPdf: new Blob([sealedBytes], { type: 'application/pdf' }),
    sigJson: new Blob([JSON.stringify(sigJson, null, 2)], { type: 'application/json' }),
  }
}

/** Parse + validate a `.omnisig.json` side-car. */
export async function parseOmnisig(file: File | Blob): Promise<SigJson> {
  let parsed: unknown
  try {
    parsed = JSON.parse(await file.text())
  } catch {
    throw new ToolError('pdfErrBadSigJson')
  }
  const sig = parsed as Partial<SigJson> | null
  if (
    !sig ||
    typeof sig.signatureBase64 !== 'string' ||
    typeof sig.certPem !== 'string' ||
    typeof sig.fileHash !== 'string' ||
    typeof sig.timestamp !== 'string'
  ) {
    throw new ToolError('pdfErrBadSigJson')
  }
  return {
    format: 'omnifile-esign-1',
    algorithm: 'RSA-SHA256',
    signatureBase64: sig.signatureBase64,
    certPem: sig.certPem,
    fingerprint: typeof sig.fingerprint === 'string' ? sig.fingerprint : '',
    timestamp: sig.timestamp,
    fileHash: sig.fileHash,
    originalFileName:
      typeof sig.originalFileName === 'string' ? sig.originalFileName : 'document.pdf',
  }
}

/**
 * Verify a pdf against its `.omnisig.json`:
 *  - `valid`       → the signature matches the hash recorded at signing time
 *  - `hashMatches` → the CURRENT pdf bytes equal that recorded hash;
 *                    `false` means "document changed after signing".
 */
export async function verifySeal(pdfFile: File | Blob, sigJsonFile: File | Blob): Promise<SealVerifyResult> {
  const sig = await parseOmnisig(sigJsonFile)
  const currentHash = await hashPdf(new Uint8Array(await pdfFile.arrayBuffer()))
  const { valid, subject } = verifySignature(sig.fileHash, sig)
  return {
    valid,
    hashMatches: sig.fileHash === currentHash,
    subject,
    timestamp: sig.timestamp,
    fingerprint: sig.fingerprint,
  }
}
