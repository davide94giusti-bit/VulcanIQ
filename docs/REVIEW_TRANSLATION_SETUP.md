# Review translation: zero-cost on-device mode

The public review detail modal translates review text with the browser-native Translator API and Language Detector API. Translation runs on the visitor's device and does not call a VulcanIQ server endpoint or a paid cloud translation provider.

## Cost and credentials

- No Google Cloud Translation project is required.
- No API key or translation secret is required.
- No translation usage is billed to VulcanIQ.
- Review text is not sent to a VulcanIQ translation backend.
- The browser may download a language model or language pack the first time a supported language pair is used.

## Browser compatibility

The feature is progressive enhancement. The modal always keeps the original review available.

- When the browser exposes both `Translator` and `LanguageDetector`, the visitor can request translation on demand.
- If the browser does not support the APIs, the translation action is disabled and the original review remains readable.
- Chrome currently documents the Translator and Language Detector APIs for desktop Chrome, not mobile Chrome. Other browsers may add compatible implementations over time, so VulcanIQ uses feature detection instead of user-agent detection.
- Language-pair support is checked by the browser when the translator is created. Unsupported pairs fail gracefully.

## Runtime behavior

- Existing review language metadata is used as the preferred source-language hint.
- If no usable language metadata exists, the browser Language Detector API detects the source language locally.
- The target-language selector uses the language set currently documented for Chrome's Translator API implementation.
- Translation starts only after a visitor presses the Translate button, satisfying the browser's user-activation requirement.
- Download progress is shown when the browser needs an on-device model or language pack.
- Translation results are kept only in the open modal session and are not written back to Supabase.
- The visitor can switch between the translated review and the original text.
- The translated result is labeled as an on-device automatic translation.

## No server configuration

Do not add a cloud translation API key, a browser-exposed translation key, or a replacement paid-provider credential for this feature. If broader browser/mobile coverage is ever required, that should be a separate product decision because it would change the zero-cost constraint.
