const SUPPORTED_TRANSLATION_LANGUAGES = Object.freeze([
  'ar', 'bg', 'bn', 'cs', 'da', 'de', 'el', 'en', 'es', 'fi', 'fr', 'he', 'hi', 'hr', 'hu', 'id', 'it',
  'ja', 'kn', 'ko', 'lt', 'mr', 'nl', 'no', 'pl', 'pt', 'ro', 'ru', 'sk', 'sl', 'sv', 'ta', 'te', 'th',
  'tr', 'uk', 'vi', 'zh', 'zh-Hant'
]);

const SUPPORTED_TRANSLATION_LANGUAGE_SET = new Set(SUPPORTED_TRANSLATION_LANGUAGES);

const LANGUAGE_ALIASES = Object.freeze({
  'zh-cn': 'zh',
  'zh-hans': 'zh',
  'zh-sg': 'zh',
  'zh-tw': 'zh-Hant',
  'zh-hk': 'zh-Hant',
  'zh-mo': 'zh-Hant',
  'zh-hant': 'zh-Hant'
});

function translationError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function normalizedLanguage(value) {
  const raw = String(value || '').trim().replace(/_/g, '-');
  if (!raw) return '';
  if (SUPPORTED_TRANSLATION_LANGUAGE_SET.has(raw)) return raw;
  const lower = raw.toLowerCase();
  if (LANGUAGE_ALIASES[lower]) return LANGUAGE_ALIASES[lower];
  const primary = lower.split('-')[0];
  return SUPPORTED_TRANSLATION_LANGUAGE_SET.has(primary) ? primary : '';
}

function languageName(code, uiLanguage = 'en') {
  const locale = uiLanguage === 'it' ? 'it' : 'en';
  try {
    const names = new Intl.DisplayNames([locale], { type: 'language' });
    return names.of(code) || code;
  } catch {
    return code;
  }
}

function progressMonitor(onProgress, phase) {
  return (monitor) => {
    monitor.addEventListener('downloadprogress', (event) => {
      const loaded = Number(event?.loaded);
      const progress = Number.isFinite(loaded) ? Math.max(0, Math.min(100, Math.round(loaded * 100))) : null;
      onProgress?.({ phase, progress });
    });
  };
}

function mapNativeTranslationError(error) {
  if (error?.code) return error;
  if (error?.name === 'NotAllowedError') {
    return translationError('translation_not_allowed', 'On-device translation could not start. Try again after interacting with the page.');
  }
  if (error?.name === 'NotSupportedError') {
    return translationError('translation_pair_unsupported', 'This language pair is not supported by this browser.');
  }
  if (error?.name === 'NetworkError') {
    return translationError('translation_model_download_failed', 'The browser could not download the on-device translation model.');
  }
  if (error?.name === 'QuotaExceededError') {
    return translationError('translation_input_too_large', 'This review is too long for the browser translation model.');
  }
  return translationError('translation_failed', 'On-device translation failed.');
}

export function reviewTranslationFallbackLanguages(uiLanguage = 'en') {
  const locale = uiLanguage === 'it' ? 'it' : 'en';
  return SUPPORTED_TRANSLATION_LANGUAGES
    .map((language) => ({ language, name: languageName(language, locale) }))
    .sort((a, b) => a.name.localeCompare(b.name, locale));
}

export async function loadReviewTranslationLanguages(uiLanguage = 'en') {
  return reviewTranslationFallbackLanguages(uiLanguage);
}

export function browserReviewTranslationSupported() {
  if (typeof globalThis === 'undefined') return false;
  return typeof globalThis.Translator?.create === 'function'
    && typeof globalThis.LanguageDetector?.create === 'function';
}

export function normalizeReviewTranslationLanguage(value) {
  return normalizedLanguage(value);
}

async function detectReviewLanguage(text, { onProgress } = {}) {
  const Detector = globalThis.LanguageDetector;
  if (!Detector || typeof Detector.create !== 'function') {
    throw translationError('translation_browser_unsupported', 'This browser does not support on-device language detection.');
  }

  let detector;
  try {
    onProgress?.({ phase: 'detecting', progress: null });
    detector = await Detector.create({
      monitor: progressMonitor(onProgress, 'downloading_detector')
    });
    const results = await detector.detect(text);
    const match = Array.isArray(results)
      ? results.find((item) => item?.detectedLanguage && item.detectedLanguage !== 'und')
      : null;
    const detected = normalizedLanguage(match?.detectedLanguage);
    if (!detected) {
      throw translationError('translation_source_unsupported', 'The review language could not be detected or is not supported.');
    }
    return detected;
  } catch (error) {
    throw mapNativeTranslationError(error);
  } finally {
    try { detector?.destroy?.(); } catch { /* noop */ }
  }
}

export async function translateReviewText({ text, targetLanguage, sourceLanguage, onProgress } = {}) {
  const sourceText = String(text || '').trim();
  const target = normalizedLanguage(targetLanguage);
  if (!sourceText || !target) throw translationError('translation_input_incomplete', 'Translation input is incomplete.');
  if (!browserReviewTranslationSupported()) {
    throw translationError('translation_browser_unsupported', 'This browser does not support on-device review translation.');
  }

  let source = normalizedLanguage(sourceLanguage);
  if (!source) source = await detectReviewLanguage(sourceText, { onProgress });
  if (source === target) {
    throw translationError('translation_same_language', 'The review is already in the selected language.');
  }

  const TranslatorApi = globalThis.Translator;
  let translator;
  try {
    onProgress?.({ phase: 'preparing', progress: null });
    translator = await TranslatorApi.create({
      sourceLanguage: source,
      targetLanguage: target,
      monitor: progressMonitor(onProgress, 'downloading_translator')
    });
    onProgress?.({ phase: 'translating', progress: null });
    const translatedText = String(await translator.translate(sourceText) || '').trim();
    if (!translatedText) throw translationError('translation_failed', 'The browser returned an empty translation.');
    onProgress?.({ phase: 'complete', progress: 100 });
    return {
      ok: true,
      translated_text: translatedText,
      detected_source_language: source,
      target_language: target,
      provider: 'browser_on_device'
    };
  } catch (error) {
    throw mapNativeTranslationError(error);
  } finally {
    try { translator?.destroy?.(); } catch { /* noop */ }
  }
}
