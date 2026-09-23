/**
 * i18n dictionary — image tools (Task 4-a).
 * Owned by the image-tools agent. Keys are referenced by
 * src/components/tools/image/* and src/components/tools/registry.tsx.
 *
 * KEEP the toolTitle/toolTitleDesc keys below — the registry references them.
 */

export const en: Record<string, string> = {
  // Registry card labels (referenced by tools/registry.tsx)
  toolImageCompress: 'Image compressor',
  toolImageCompressDesc: 'Shrink photos to an exact KB/MB target or quality level',
  toolImageConvert: 'Format converter',
  toolImageConvertDesc: 'JPG, PNG, WebP, HEIC, BMP → JPG/PNG/WebP',
  toolImageResize: 'Resize & crop',
  toolImageResizeDesc: 'Resize by pixels or %, crop to 1:1, 16:9 and more',
  toolImageBgRemove: 'Background remover',
  toolImageBgRemoveDesc: 'Erase the backdrop with on-device or Gemini AI',
  toolImageEnhance: 'AI image enhancer',
  toolImageEnhanceDesc: 'Upscale & sharpen blurry images with AI',
  toolImageVector: 'Vector converter',
  toolImageVectorDesc: 'Trace JPG/PNG into scalable SVG vector art',

  // ── Shared across image tools (Task 4-a) ──
  imgOptionsLabel: 'Options',
  imgEngineLabel: 'Engine',
  imgProcessed: '{n} image(s) processed',

  // ── Compressor ──
  imgModeLabel: 'Mode',
  imgModeQuality: 'Quality',
  imgModeTarget: 'Target size',
  imgQualityLabel: 'Quality: {q}%',
  imgFormatLabel: 'Output format',
  imgTargetLabel: 'Target size',
  imgUnitLabel: 'Unit',
  imgUnitKb: 'KB',
  imgUnitMb: 'MB',
  imgCompressedTo: 'Compressed to {size}',
  imgCompressFailed: 'Could not fully reach that size — closest result used',

  // ── Converter ──
  imgConvertTo: 'Convert to',
  imgHeicNote: 'HEIC/HEIF photos (iPhone) can be opened — browsers cannot output HEIC.',

  // ── Resize & crop ──
  imgResizeMode: 'Resize mode',
  imgResizePixels: 'By pixels',
  imgResizePercent: 'By percent',
  imgResizeRatio: 'Crop to ratio',
  imgWidth: 'Width (px)',
  imgHeight: 'Height (px)',
  imgKeepAspect: 'Keep aspect ratio',
  imgScaleValue: '{p}% of original',
  imgRatioLabel: 'Aspect ratio',
  imgGravityLabel: 'Position',
  imgGravityCenter: 'Center',
  imgGravityTop: 'Top',
  imgNeedDimension: 'Enter at least a width or a height',

  // ── Background remover ──
  imgModelHint:
    'First use downloads a small AI model (~40–80 MB) to your device; after that it works offline.',
  imgAfterLabel: 'After removal',
  imgAfterTransparent: 'Transparent PNG',
  imgAfterWhite: 'White background',
  imgAfterColour: 'Custom colour',
  imgColourLabel: 'Colour',

  // ── Enhancer ──
  imgEnhanceHint:
    'Free & offline — enlarges the image and sharpens details (Gemini AI gives better quality).',
  imgScaleLabel: 'Upscale',
  imgScale2x: '2× larger',
  imgScale4x: '4× larger',

  // ── Vector converter ──
  imgPresetLabel: 'Preset',
  imgPresetLogo: 'Logo (few colours, crisp)',
  imgPresetSketch: 'Sketch',
  imgPresetPoster: 'Poster (flat colours)',
  imgPresetPhoto: 'Photo (many colours, large file)',
  imgVectorNote: 'Output is SVG only — EPS is not possible in a browser. SVG scales everywhere.',
}

export const bn: Record<string, string> = {
  toolImageCompress: 'ইমেজ কম্প্রেসার',
  toolImageCompressDesc: 'নির্দিষ্ট KB/MB সাইজ বা কোয়ালিটিতে ছবি ছোট করুন',
  toolImageConvert: 'ফরম্যাট কনভার্টার',
  toolImageConvertDesc: 'JPG, PNG, WebP, HEIC, BMP → JPG/PNG/WebP',
  toolImageResize: 'রিসাইজ ও ক্রপ',
  toolImageResizeDesc: 'পিক্সেল বা % দিয়ে রিসাইজ, 1:1, 16:9 রেশিওতে ক্রপ',
  toolImageBgRemove: 'ব্যাকগ্রাউন্ড রিমুভার',
  toolImageBgRemoveDesc: 'অন-ডিভাইস বা Gemini AI দিয়ে ব্যাকগ্রাউন্ড মুছুন',
  toolImageEnhance: 'AI ইমেজ এনহ্যান্সার',
  toolImageEnhanceDesc: 'ঝাপসা ছবি AI দিয়ে বড় ও পরিষ্কার করুন',
  toolImageVector: 'ভেক্টর কনভার্টার',
  toolImageVectorDesc: 'JPG/PNG থেকে স্কেলেবল SVG ভেক্টর বানান',

  // ── ছবির টুলসে শেয়ারড (Task 4-a) ──
  imgOptionsLabel: 'অপশন',
  imgEngineLabel: 'ইঞ্জিন',
  imgProcessed: '{n}টি ছবি প্রসেস হয়েছে',

  // ── কম্প্রেসার ──
  imgModeLabel: 'মোড',
  imgModeQuality: 'কোয়ালিটি',
  imgModeTarget: 'নির্দিষ্ট সাইজ',
  imgQualityLabel: 'কোয়ালিটি: {q}%',
  imgFormatLabel: 'আউটপুট ফরম্যাট',
  imgTargetLabel: 'টার্গেট সাইজ',
  imgUnitLabel: 'একক',
  imgUnitKb: 'কেবি',
  imgUnitMb: 'এমবি',
  imgCompressedTo: '{size} এ কমপ্রেস হয়েছে',
  imgCompressFailed: 'ওই সাইজে পুরো পৌঁছানো গেল না — কাছাকাছি ফল ব্যবহার করা হয়েছে',

  // ── কনভার্টার ──
  imgConvertTo: 'যে ফরম্যাটে বদলাবেন',
  imgHeicNote: 'HEIC/HEIF ছবি (আইফোনের ছবি) খোলা যায় — ব্রাউজার HEIC আউটপুট দিতে পারে না।',

  // ── রিসাইজ ও ক্রপ ──
  imgResizeMode: 'রিসাইজ মোড',
  imgResizePixels: 'পিক্সেল ধরে',
  imgResizePercent: 'শতাংশ ধরে',
  imgResizeRatio: 'রেশিওতে ক্রপ',
  imgWidth: 'প্রস্থ (px)',
  imgHeight: 'উচ্চতা (px)',
  imgKeepAspect: 'অনুপাত ঠিক রাখুন',
  imgScaleValue: 'মূল ছবির {p}%',
  imgRatioLabel: 'অনুপাত',
  imgGravityLabel: 'অবস্থান',
  imgGravityCenter: 'মাঝখানে',
  imgGravityTop: 'উপরে',
  imgNeedDimension: 'অন্তত প্রস্থ বা উচ্চতা — একটি দিন',

  // ── ব্যাকগ্রাউন্ড রিমুভার ──
  imgModelHint:
    'প্রথমবার ব্যবহারে ছোট একটি AI মডেল (~৪০–৮০ MB) ডিভাইসে নামবে; এরপর অফলাইনেও চলবে।',
  imgAfterLabel: 'রিমুভ করার পরে',
  imgAfterTransparent: 'ট্রান্সপারেন্ট PNG',
  imgAfterWhite: 'সাদা ব্যাকগ্রাউন্ড',
  imgAfterColour: 'নিজের পছন্দের রঙ',
  imgColourLabel: 'রঙ',

  // ── এনহ্যান্সার ──
  imgEnhanceHint:
    'ফ্রি ও অফলাইন — ছবি বড় করে ডিটেইল ধারালো করে (Gemini AI আরও ভালো মান দেয়)।',
  imgScaleLabel: 'কত গুণ বড়',
  imgScale2x: '২ গুণ বড়',
  imgScale4x: '৪ গুণ বড়',

  // ── ভেক্টর কনভার্টার ──
  imgPresetLabel: 'প্রিসেট',
  imgPresetLogo: 'লোগো (কম রঙ, ঝকঝকে)',
  imgPresetSketch: 'স্কেচ',
  imgPresetPoster: 'পোস্টার (ফ্ল্যাট রঙ)',
  imgPresetPhoto: 'ছবি (অনেক রঙ, ফাইল বড়)',
  imgVectorNote: 'আউটপুট শুধু SVG — ব্রাউজারে EPS সম্ভব নয়। SVG সব জায়গায় স্কেল হয়।',
}
