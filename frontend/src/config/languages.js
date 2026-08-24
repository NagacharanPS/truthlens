export const SUPPORTED_LANGUAGES = [
  {
    code: "auto",
    name: "Auto Detect",
    nativeName: "Auto Detect",
  },
  {
    code: "en",
    name: "English",
    nativeName: "English (EN)",
  },
  {
    code: "kn",
    name: "Kannada",
    nativeName: "ಕನ್ನಡ (Kannada)",
  },
  {
    code: "hi",
    name: "Hindi",
    nativeName: "हिन्दी (Hindi)",
  },
  {
    code: "te",
    name: "Telugu",
    nativeName: "తెలుగు (Telugu)",
  },
];

export const LANGUAGE_CODE_MAP = SUPPORTED_LANGUAGES.reduce((acc, lang) => {
  acc[lang.code] = lang;
  return acc;
}, {});

export function getLanguageByCode(code) {
  if (!code) return LANGUAGE_CODE_MAP.auto;
  const normalized = String(code).toLowerCase().trim();
  return LANGUAGE_CODE_MAP[normalized] || {
    code: normalized,
    name: normalized.toUpperCase(),
    nativeName: normalized.toUpperCase(),
  };
}

export function formatLanguageLabel(code) {
  const lang = getLanguageByCode(code);
  return lang?.nativeName || lang?.name || code;
}
