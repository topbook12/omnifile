/**
 * i18n dictionary — media (video/audio) tools (Task 4-c).
 * Owned by the media-tools agent. Keys are referenced by
 * src/components/tools/media/* and src/components/tools/registry.tsx.
 *
 * KEEP the toolTitle/toolTitleDesc keys below — the registry references them.
 */

export const en: Record<string, string> = {
  // Registry card labels (referenced by tools/registry.tsx)
  toolMediaConvert: 'Media converter',
  toolMediaConvertDesc: 'Video MP4/WebM/MKV/AVI/MOV · audio MP3/WAV/M4A/FLAC',
  toolVideoCompress: 'Video compressor',
  toolVideoCompressDesc: 'Shrink big videos with quality & resolution control',
  toolAudioExtract: 'Audio extractor',
  toolAudioExtractDesc: 'Pull the sound track out of any video as MP3/M4A/WAV',
  toolVideoGif: 'Video to GIF',
  toolVideoGifDesc: 'Clip a section and export an animated GIF',

  // ── ffmpeg.wasm engine / common ──
  mediaWasmTitle: 'Runs entirely on your device',
  mediaWasmUnsupported: 'This browser does not support WebAssembly — these tools cannot run here.',
  mediaFirstUseHint:
    'First use downloads the ~10 MB processing engine (once). Files are processed in memory on this device — keep them under ~200 MB; a desktop browser works best.',
  mediaSlowHint:
    'In-browser encoding is slower than native apps — large videos take a while.',
  mediaEngineLoading: 'Loading engine…',
  mediaEngineError: 'Could not load the media engine — check your internet connection and try again.',
  mediaTooLarge: 'File is too large ({size}) — keep files under about 250 MB.',
  mediaFileOf: 'File {n} of {total}',
  mediaDoneToast: 'All files processed',
  mediaVideoOnlyFile: 'Not a video file — this tool only accepts video.',
  mediaAudioToVideo: 'Audio files cannot be converted to a video format — pick an audio format instead.',

  // ── shared options ──
  mediaOutputFormat: 'Output format',
  mediaAdvanced: 'Advanced settings',
  mediaCrf: 'Video quality (CRF)',
  mediaCrfHint: 'Lower value = better quality, bigger file',
  mediaAudioBitrate: 'Audio bitrate',
  mediaAudioOnlyMp3: 'Audio only (MP3)',

  // ── video compressor ──
  mediaPresetSmall: 'Small',
  mediaResolution: 'Resolution',
  mediaResOriginal: 'Original size',
  mediaCompressed: 'Compressed {from} → {to}',

  // ── audio extractor ──
  mediaAudioFormat: 'Audio format',
  mediaBitrateLossyHint: 'Bitrate applies to MP3, M4A and OGG only',

  // ── video → GIF ──
  mediaTrimStart: 'Start (seconds)',
  mediaTrimDuration: 'Duration (seconds)',
  mediaDurationHint: 'Longer clips make much bigger GIFs — max 60 s',
  mediaFps: 'Frames per second',
  mediaPalettePhase: 'Generating palette…',
  mediaGifPhase: 'Encoding GIF…',
  mediaGifOneHint: 'One video at a time works best — GIF encoding is heavy (batch still runs, slowly).',
}

export const bn: Record<string, string> = {
  toolMediaConvert: 'মিডিয়া কনভার্টার',
  toolMediaConvertDesc: 'ভিডিও MP4/WebM/MKV/AVI/MOV · অডিও MP3/WAV/M4A/FLAC',
  toolVideoCompress: 'ভিডিও কম্প্রেসার',
  toolVideoCompressDesc: 'বড় ভিডিও ছোট করুন, কোয়ালিটি ও রেজোলিউশন নিয়ন্ত্রণসহ',
  toolAudioExtract: 'অডিও এক্সট্রাক্টর',
  toolAudioExtractDesc: 'যেকোনো ভিডিও থেকে শুধু অডিও MP3/M4A/WAV হিসেবে নিন',
  toolVideoGif: 'ভিডিও থেকে GIF',
  toolVideoGifDesc: 'নির্দিষ্ট অংশ কেটে অ্যানিমেটেড GIF বানান',

  // ── ffmpeg.wasm ইঞ্জিন / কমন ──
  mediaWasmTitle: 'সম্পূর্ণ আপনার ডিভাইসেই চলে',
  mediaWasmUnsupported: 'এই ব্রাউজার WebAssembly সাপোর্ট করে না — এই টুলগুলো এখানে চলবে না।',
  mediaFirstUseHint:
    'প্রথমবার ব্যবহারে প্রায় ১০ MB-র প্রসেসিং ইঞ্জিন একবার নামবে। ফাইল এই ডিভাইসের মেমোরিতেই প্রসেস হয় — ২০০ MB-র নিচে রাখা ভালো; ডেস্কটপ ব্রাউজারে সবচেয়ে ভালো চলে।',
  mediaSlowHint:
    'ব্রাউজারের ভেতরে এনকোডিং নেটিভ অ্যাপের চেয়ে ধীর — বড় ভিডিওতে সময় লাগবে।',
  mediaEngineLoading: 'ইঞ্জিন লোড হচ্ছে…',
  mediaEngineError: 'মিডিয়া ইঞ্জিন লোড করা যায়নি — ইন্টারনেট সংযোগ দেখে আবার চেষ্টা করুন।',
  mediaTooLarge: 'ফাইলটি খুব বড় ({size}) — প্রায় ২৫০ MB-র নিচে রাখুন।',
  mediaFileOf: 'ফাইল {n}/{total}',
  mediaDoneToast: 'সব ফাইল প্রসেস হয়েছে',
  mediaVideoOnlyFile: 'ভিডিও ফাইল নয় — এই টুলে শুধু ভিডিও চলে।',
  mediaAudioToVideo: 'অডিও ফাইল ভিডিও ফরম্যাটে রূপান্তর হয় না — অডিও ফরম্যাট বাছুন।',

  // ── শেয়ারড অপশন ──
  mediaOutputFormat: 'আউটপুট ফরম্যাট',
  mediaAdvanced: 'অ্যাডভান্সড সেটিংস',
  mediaCrf: 'ভিডিও কোয়ালিটি (CRF)',
  mediaCrfHint: 'মান কম = ভালো কোয়ালিটি, বড় ফাইল',
  mediaAudioBitrate: 'অডিও বিটরেট',
  mediaAudioOnlyMp3: 'শুধু অডিও (MP3)',

  // ── ভিডিও কম্প্রেসার ──
  mediaPresetSmall: 'ছোট',
  mediaResolution: 'রেজোলিউশন',
  mediaResOriginal: 'আসল মাপ',
  mediaCompressed: '{from} থেকে {to} এ কমপ্রেস হয়েছে',

  // ── অডিও এক্সট্রাক্টর ──
  mediaAudioFormat: 'অডিও ফরম্যাট',
  mediaBitrateLossyHint: 'বিটরেট শুধু MP3, M4A ও OGG-তে কাজ করে',

  // ── ভিডিও → GIF ──
  mediaTrimStart: 'শুরু (সেকেন্ড)',
  mediaTrimDuration: 'সময়কাল (সেকেন্ড)',
  mediaDurationHint: 'বেশি সময়ের GIF অনেক বড় হয়ে যায় — সর্বোচ্চ ৬০ সেকেন্ড',
  mediaFps: 'ফ্রেম প্রতি সেকেন্ড (FPS)',
  mediaPalettePhase: 'প্যালেট তৈরি হচ্ছে…',
  mediaGifPhase: 'GIF এনকোড হচ্ছে…',
  mediaGifOneHint: 'একবারে একটি ভিডিওই ভালো — GIF এনকোডিং ভারী (ব্যাচ চলবে, তবে ধীরে)।',
}
