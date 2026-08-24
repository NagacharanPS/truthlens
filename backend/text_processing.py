from __future__ import annotations

import difflib
import json
import re
import subprocess
import unicodedata
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from starlette.config import Config

try:  # pragma: no cover - optional dependency
    from langdetect import DetectorFactory, detect_langs

    DetectorFactory.seed = 0
except Exception:  # pragma: no cover - keep the backend working without extra installs
    detect_langs = None


SUPPORTED_LANGUAGES = {
    "en": "English",
    "kn": "Kannada",
    "hi": "Hindi",
    "te": "Telugu",
}
SUPPORTED_LANGUAGE_NAMES = {name.lower(): code for code, name in SUPPORTED_LANGUAGES.items()}
BASE_DIR = Path(__file__).resolve().parent
ENV_CONFIG = Config(str(BASE_DIR / ".env"))
GROQ_LANGUAGE_RUNNER = BASE_DIR / "services" / "runGroqLanguageService.js"
PLACEHOLDER_GROQ_API_KEYS = {"", "your_groq_api_key_here"}
GROQ_TIMEOUT_SECONDS = max(
    1.0,
    ENV_CONFIG("BACKEND_GROQ_TIMEOUT_SECONDS", cast=float, default=8.0),
)

SCRIPT_LANGUAGE_PATTERNS = {
    "kn": re.compile(r"[\u0C80-\u0CFF]"),
    "te": re.compile(r"[\u0C00-\u0C7F]"),
    "devanagari": re.compile(r"[\u0900-\u097F]"),
}

# Distinct vocabulary markers to differentiate Marathi vs Hindi in Devanagari script
MARATHI_MARKERS = {
    "आहे", "करा", "खाते", "तुमचे", "पडताळणी", "त्वरित", "निलंबित", "सांगा", "झाले", "नाही",
    "करावे", "मिळवा", "बँक", "ओटीपी", "लगेच", "कृपया", "संदेश", "खात्याची", "पडताळा", "पडताळणीसाठी",
    "लिंकवर", "क्लिक", "करा", "नंबर", "पासवर्ड", "संपर्क", "कराल", "आहोत", "झाला", "झाली",
    "केले", "केली", "करावा", "घेऊन", "द्या", "दिले", "तपासा", "नुकसान", "बक्षीस", "सुरक्षित",
}

HINDI_MARKERS = {
    "है", "हैं", "करें", "खाता", "आपका", "सत्यापन", "तुरंत", "निलंबित", "बताएं", "हुआ",
    "नहीं", "करना", "पाएं", "बैंक", "ओटीपी", "सत्यापित", "अपने", "कृपया", "संदेश", "खाते",
    "लिंक", "क्लिक", "करो", "नंबर", "पासवर्ड", "संपर्क", "होगी", "होगा", "गया", "गई",
    "किया", "कीजिए", "दीजिए", "इनाम", "पुरस्कार", "सुरक्षा", "चेतावनी", "साझा", "रिफंड", "उपहार",
}

LATIN_LANGUAGE_HINTS = {
    "en": {
        "the", "your", "account", "bank", "verify", "click", "link", "password", "code",
        "security", "urgent", "message", "email", "blocked", "suspended", "immediately",
        "kyc", "pan", "aadhaar", "otp", "debit", "credit", "card", "fund", "transfer",
        "reward", "prize", "cashback", "winner", "lottery", "gift", "refund", "alert",
    },
    "es": {
        "hola", "usted", "tu", "su", "cuenta", "banco", "haga", "haz", "clic", "enlace",
        "contrasena", "codigo", "premio", "reembolso", "seguridad", "alerta", "verifique", "verifica",
    },
    "fr": {
        "bonjour", "votre", "compte", "banque", "cliquez", "lien", "mot", "passe", "code",
        "cadeau", "remboursement", "securite", "alerte", "veuillez", "verifiez", "urgent",
    },
    # Romanized Indian language hints help with common transliterated scams
    "hi": {
        "aapka", "kripya", "turant", "abhi", "khata", "khate", "satyapit", "suraksha",
        "inaam", "uphar", "otp", "karo", "kare", "link", "paisa", "jald",
    },
    "kn": {
        "nimma", "khate", "thakshana", "parishilisi", "link", "click", "madi", "bahumana",
    },
    "te": {
        "mee", "khata", "ventane", "dhruveekarinchandi", "link", "click", "cheyandi", "bahumathi",
    },
    "ta": {
        "ungal", "kanakku", "udane", "sariparkkavum", "inaippu", "click", "seiyyavum", "parisu",
    },
    "ml": {
        "ningalude", "account", "udan", "sthirikarikkuka", "link", "click", "cheyyuka", "sammanam",
    },
    "mr": {
        "tumche", "khate", "twarit", "padtalani", "kara", "link", "click", "bakshis",
    },
    "bn": {
        "apnar", "account", "ebong", "jotno", "joldi", "jilipi", "link", "click", "korun", "puroshkar",
    },
}

ENGLISH_SCAM_VOCAB = {
    "account", "alert", "asap", "bank", "blocked", "bonus", "cashback", "claim",
    "click", "code", "confirm", "credential", "cvv", "free", "gift", "immediately",
    "link", "login", "now", "offer", "otp", "password", "pin", "prize", "refund",
    "reset", "reward", "security", "suspended", "tap", "urgent", "verify", "wallet",
    "warning", "winner", "kyc", "aadhaar", "pan", "debit", "credit", "electricity",
    "disconnected", "arrest", "police", "legal", "action", "penalty", "lottery",
}

COMMON_ENGLISH_CORRECTIONS = {
    "accnt": "account",
    "acount": "account",
    "accont": "account",
    "alertt": "alert",
    "bonous": "bonus",
    "cashbk": "cashback",
    "clic": "click",
    "clik": "click",
    "confrm": "confirm",
    "credntials": "credentials",
    "gft": "gift",
    "immediatly": "immediately",
    "immdiately": "immediately",
    "lgn": "login",
    "logn": "login",
    "passcodee": "passcode",
    "passwrd": "password",
    "pasword": "password",
    "paswrd": "password",
    "paswrod": "password",
    "refnd": "refund",
    "rewrd": "reward",
    "scurity": "security",
    "suspened": "suspended",
    "urgnt": "urgent",
    "verfication": "verification",
    "verfy": "verify",
    "vrify": "verify",
}

# Domain-specific translation and keyword mappings for all 8 supported languages
TRANSLATION_RULES = [
    # English standardizations
    ("your account has been suspended", "your account suspended"),
    ("verify your account", "verify your account"),
    ("click the link", "click here"),
    ("click on the link", "click here"),
    ("share otp", "share otp"),
    ("share code", "share code"),
    ("account suspended", "account suspended"),
    ("security alert", "security alert"),
    ("act now", "act now"),
    ("final warning", "final warning"),

    # Hindi (हिन्दी)
    ("आपका बैंक खाता निलंबित कर दिया गया है", "your bank account suspended immediately verify"),
    ("अपने खाते को सत्यापित करें", "verify your account"),
    ("अपने अकाउंट को सत्यापित करें", "verify your account"),
    ("आपका खाता निलंबित", "your account suspended"),
    ("आपका अकाउंट निलंबित", "your account suspended"),
    ("तुरंत कार्रवाई करें", "act now"),
    ("अभी कार्रवाई करें", "act now"),
    ("तुरंत सत्यापन करें", "verify immediately"),
    ("तुरंत सत्यापित करें", "verify immediately"),
    ("लिंक पर क्लिक करें", "click here"),
    ("इस लिंक पर क्लिक करें", "click this link"),
    ("ओटीपी साझा करें", "share otp"),
    ("पासवर्ड साझा करें", "share password"),
    ("केवाईसी अपडेट करें", "update kyc immediately"),
    ("बिजली कनेक्शन काट दिया जाएगा", "electricity power disconnected suspend"),
    ("लॉटरी जीती है", "lottery winner prize reward"),
    ("इनाम का दावा करें", "claim prize reward"),
    ("तुरन्त", "urgent"),
    ("तुरंत", "urgent"),
    ("अभी", "now"),
    ("कृपया", "please"),
    ("अपने", "your"),
    ("आपका", "your"),
    ("खाते", "account"),
    ("खाता", "account"),
    ("अकाउंट", "account"),
    ("बैंक", "bank"),
    ("सत्यापित", "verify"),
    ("सत्यापन", "verify"),
    ("वेरिफाई", "verify"),
    ("लिंक", "link"),
    ("क्लिक", "click"),
    ("ओटीपी", "otp"),
    ("पासवर्ड", "password"),
    ("साझा", "share"),
    ("कोड", "code"),
    ("पुरस्कार", "reward"),
    ("इनाम", "prize"),
    ("उपहार", "gift"),
    ("रिफंड", "refund"),
    ("सुरक्षा", "security"),
    ("चेतावनी", "warning"),
    ("निलंबित", "suspended"),
    ("स्थगित", "suspended"),
    ("धोखाधड़ी", "fraud"),
    ("स्कैम", "scam"),
    ("रोक दिया", "blocked"),

    # Kannada (ಕನ್ನಡ)
    ("ನಿಮ್ಮ ಬ್ಯಾಂಕ್ ಖಾತೆಯನ್ನು ಪರಿಶೀಲಿಸಲು ಈ ಲಿಂಕ್ ಕ್ಲಿಕ್ ಮಾಡಿ", "verify your bank account click this link"),
    ("ನಿಮ್ಮ ಬ್ಯಾಂಕ್ ಖಾತೆ ಸ್ಥಗಿತಗೊಂಡಿದೆ", "your bank account suspended"),
    ("ನಿಮ್ಮ ಖಾತೆಯನ್ನು ಪರಿಶೀಲಿಸಿ", "verify your account"),
    ("ತಕ್ಷಣ ಕ್ರಮ ಕೈಗೊಳ್ಳಿ", "act now"),
    ("ತಕ್ಷಣ ಪರಿಶೀಲಿಸಿ", "verify immediately"),
    ("ಲಿಂಕ್ ಕ್ಲಿಕ್ ಮಾಡಿ", "click here"),
    ("ಈ ಲಿಂಕ್ ಕ್ಲಿಕ್ ಮಾಡಿ", "click this link"),
    ("ಒಟಿಪಿ ಹಂಚಿಕೊಳ್ಳಿ", "share otp"),
    ("ಗುಪ್ತಪದ ಹಂಚಿಕೊಳ್ಳಿ", "share password"),
    ("ಕೆವೈಸಿ ನವೀಕರಿಸಿ", "update kyc immediately"),
    ("ವಿದ್ಯುತ್ ಸಂಪರ್ಕ ಕಡಿತಗೊಳಿಸಲಾಗುವುದು", "electricity disconnected suspended"),
    ("ಬಹುಮಾನ ಗೆದ್ದಿದ್ದೀರಿ", "winner prize lottery reward"),
    ("ತಕ್ಷಣ", "urgent"),
    ("ಈಗಲೇ", "now"),
    ("ದಯವಿಟ್ಟು", "please"),
    ("ನಿಮ್ಮ", "your"),
    ("ಖಾತೆ", "account"),
    ("ಬ್ಯಾಂಕ್", "bank"),
    ("ಪರಿಶೀಲಿಸಿ", "verify"),
    ("ಪರಿಶೀಲಿಸಲು", "verify"),
    ("ಲಿಂಕ್", "link"),
    ("ಕ್ಲಿಕ್", "click"),
    ("ಮಾಡಿ", "do"),
    ("ಒಟಿಪಿ", "otp"),
    ("ಗುಪ್ತಪದ", "password"),
    ("ಕೋಡ್", "code"),
    ("ಬಹುಮಾನ", "reward"),
    ("ಉಡುಗೊರೆ", "gift"),
    ("ರಿಫಂಡ್", "refund"),
    ("ಭದ್ರತೆ", "security"),
    ("ಎಚ್ಚರಿಕೆ", "warning"),
    ("ಸ್ಥಗಿತಗೊಂಡಿದೆ", "suspended"),
    ("ಸ್ಥಗಿತ", "suspended"),
    ("ನಿರ್ಬಂಧಿಸಲಾಗಿದೆ", "blocked"),

    # Telugu (తెలుగు)
    ("మీ బ్యాంక్ ఖాతా నిలిపివేయబడింది", "your bank account suspended"),
    ("వెంటనే ధృవీకరించండి", "verify immediately"),
    ("మీ ఖాతాను ధృవీకరించండి", "verify your account"),
    ("తక్షణ చర్య తీసుకోండి", "act now"),
    ("ఈ లింక్ పై క్లిక్ చేయండి", "click this link"),
    ("లింక్ పై క్లిక్ చేయండి", "click here"),
    ("ఓటీపీని పంచుకోండి", "share otp"),
    ("పాస్‌వర్డ్ పంచుకోండి", "share password"),
    ("కేవైసీ అప్‌డేట్ చేయండి", "update kyc immediately"),
    ("విద్యుత్ సరఫరా నిలిపివేయబడుతుంది", "electricity power disconnected suspend"),
    ("బహుమతి గెలుచుకున్నారు", "winner prize reward lottery"),
    ("తక్షణం", "urgent"),
    ("వెంటనే", "immediately"),
    ("దయచేసి", "please"),
    ("మీ", "your"),
    ("ఖాతా", "account"),
    ("ఖాతాను", "account"),
    ("బ్యాంక్", "bank"),
    ("ధృవీకరించండి", "verify"),
    ("లింక్", "link"),
    ("క్లిక్", "click"),
    ("చేయండి", "do"),
    ("ఓటిపి", "otp"),
    ("ఓటీపీ", "otp"),
    ("పాస్‌వర్డ్", "password"),
    ("కోడ్", "code"),
    ("బహుమతి", "reward"),
    ("బహుమానం", "gift"),
    ("రిఫండ్", "refund"),
    ("భద్రత", "security"),
    ("హెచ్చరిక", "warning"),
    ("నిలిపివేయబడింది", "suspended"),
    ("బ్లాక్ చేయబడింది", "blocked"),

    # Tamil (தமிழ்)
    ("உங்கள் வங்கி கணக்கு இடைநிறுத்தப்பட்டுள்ளது", "your bank account suspended"),
    ("உங்கள் வங்கி கணக்கு முடக்கப்பட்டுள்ளது", "your bank account blocked suspended"),
    ("உடனடியாக சரிபார்க்கவும்", "verify immediately"),
    ("உங்கள் கணக்கை சரிபார்க்கவும்", "verify your account"),
    ("உடனே செயல்படவும்", "act now"),
    ("இந்த இணைப்பை கிளிக் செய்யவும்", "click this link"),
    ("இணைப்பை கிளிக் செய்யவும்", "click here"),
    ("ஓடிபியை பகிரவும்", "share otp"),
    ("கடவுச்சொல்லை பகிரவும்", "share password"),
    ("கேஒய்சி புதுப்பிக்கவும்", "update kyc immediately"),
    ("மின்சாரம் துண்டிக்கப்படும்", "electricity power disconnected suspend"),
    ("மின் இணைப்பு துண்டிக்கப்படும்", "electricity power disconnected suspend"),
    ("பரிசு வென்றுள்ளீர்கள்", "winner prize reward lottery"),
    ("ரொக்கப் பரிசை வென்றுள்ளீர்கள்", "winner prize reward lottery cash claim"),
    ("ரொக்கப் பரிசை", "cash prize reward"),
    ("பரிசை", "prize reward"),
    ("கிளிக் செய்க", "click here link"),
    ("உடனே", "urgent"),
    ("உடனடியாக", "immediately"),
    ("இப்போது", "now"),
    ("தயவுசெய்து", "please"),
    ("உங்கள்", "your"),
    ("கணக்கு", "account"),
    ("கணக்கை", "account"),
    ("வங்கி", "bank"),
    ("சரிபார்க்கவும்", "verify"),
    ("இணைப்பு", "link"),
    ("இணைப்பை", "link"),
    ("கிளிக்", "click"),
    ("செய்யவும்", "do"),
    ("ஓடிபி", "otp"),
    ("கடவுச்சொல்", "password"),
    ("குறியீடு", "code"),
    ("வெகுமதி", "reward"),
    ("பரிசு", "gift"),
    ("பணம் திருப்பு", "refund"),
    ("பாதுகாப்பு", "security"),
    ("எச்சரிக்கை", "warning"),
    ("இடைநிறுத்தப்பட்டுள்ளது", "suspended"),
    ("முடக்கப்பட்டுள்ளது", "blocked"),
    ("முடக்கப்பட்டது", "blocked"),

    # Malayalam (മലയാളം)
    ("നിങ്ങളുടെ ബാങ്ക് അക്കൗണ്ട് താൽക്കാലികമായി നിർത്തിവച്ചിരിക്കുന്നു", "your bank account suspended"),
    ("ഉടൻ സ്ഥിരീകരിക്കുക", "verify immediately"),
    ("നിങ്ങളുടെ അക്കൗണ്ട് സ്ഥിരീകരിക്കുക", "verify your account"),
    ("ഉടൻ നടപടി സ്വീകരിക്കുക", "act now"),
    ("ഈ ലിങ്കിൽ ക്ലിക്ക് ചെയ്യുക", "click this link"),
    ("ലിങ്കിൽ ക്ലിക്ക് ചെയ്യുക", "click here"),
    ("ഒടിപി പങ്കിടുക", "share otp"),
    ("പാസ്‌വേഡ് പങ്കിടുക", "share password"),
    ("കെവൈസി അപ്‌ഡേറ്റ് ചെയ്യുക", "update kyc immediately"),
    ("വൈദ്യുതി വിച്ഛേദിക്കും", "electricity power disconnected suspend"),
    ("സമ്മാനം നേടിയിരിക്കുന്നു", "winner prize reward lottery"),
    ("ഉടൻ", "urgent"),
    ("ഉടൻതന്നെ", "immediately"),
    ("ഇപ്പോൾ", "now"),
    ("ദയവായി", "please"),
    ("നിങ്ങളുടെ", "your"),
    ("അക്കൗണ്ട്", "account"),
    ("ബാങ്ക്", "bank"),
    ("സ്ഥിരീകരിക്കുക", "verify"),
    ("ലിങ്ക്", "link"),
    ("ലിങ്കിൽ", "link"),
    ("ക്ലിക്ക്", "click"),
    ("ചെയ്യുക", "do"),
    ("ഒടിപി", "otp"),
    ("പാസ്‌വേഡ്", "password"),
    ("കോഡ്", "code"),
    ("സമ്മാനം", "reward"),
    ("ഗിഫ്റ്റ്", "gift"),
    ("റീഫണ്ട്", "refund"),
    ("സുരക്ഷ", "security"),
    ("മുന്നറിയിപ്പ്", "warning"),
    ("സസ്‌പെൻഡ്", "suspended"),
    ("താൽക്കാലികമായി നിർത്തിവച്ചിരിക്കുന്നു", "suspended"),
    ("ബ്ലോക്ക് ചെയ്തു", "blocked"),

    # Marathi (मराठी)
    ("तुमचे बँक खाते निलंबित करण्यात आले आहे", "your bank account suspended"),
    ("त्वरित पडताळणी करा", "verify immediately"),
    ("तुमचे खाते पडताळा", "verify your account"),
    ("तुमचे खाते निलंबित", "your account suspended"),
    ("त्वरित कारवाई करा", "act now"),
    ("या लिंकवर क्लिक करा", "click this link"),
    ("लिंकवर क्लिक करा", "click here"),
    ("ओटीपी सांगा", "share otp"),
    ("पासवर्ड सांगा", "share password"),
    ("केवायसी अपडेट करा", "update kyc immediately"),
    ("वीज पुरवठा खंडित केला जाईल", "electricity power disconnected suspend"),
    ("बक्षीस जिंकले आहे", "winner prize reward lottery"),
    ("त्वरित", "urgent"),
    ("लगेच", "now"),
    ("कृपया", "please"),
    ("तुमचे", "your"),
    ("खाते", "account"),
    ("खात्याची", "account"),
    ("बँक", "bank"),
    ("पडताळणी", "verify"),
    ("पडताळा", "verify"),
    ("लिंक", "link"),
    ("क्लिक", "click"),
    ("करा", "do"),
    ("ओटीपी", "otp"),
    ("पासवर्ड", "password"),
    ("कोड", "code"),
    ("बक्षीस", "reward"),
    ("भेट", "gift"),
    ("परतावा", "refund"),
    ("सुरक्षा", "security"),
    ("इशारा", "warning"),
    ("निलंबित", "suspended"),
    ("बंद केले", "blocked"),

    # Bengali (বাংলা)
    ("আপনার ব্যাংক অ্যাকাউন্ট স্থগিত করা হয়েছে", "your bank account suspended"),
    ("অবিলম্বে যাচাই করুন", "verify immediately"),
    ("আপনার অ্যাকাউন্ট যাচাই করুন", "verify your account"),
    ("অবিলম্বে পদক্ষেপ নিন", "act now"),
    ("এই লিঙ্কে ক্লিক করুন", "click this link"),
    ("লিঙ্কে ক্লিক করুন", "click here"),
    ("ওটিপি শেয়ার করুন", "share otp"),
    ("পাসওয়ার্ড শেয়ার করুন", "share password"),
    ("কেওয়াইসি আপডেট করুন", "update kyc immediately"),
    ("বিদ্যুৎ সংযোগ বিচ্ছিন্ন করা হবে", "electricity power disconnected suspend"),
    ("পুরস্কার জিতেছেন", "winner prize reward lottery"),
    ("অবিলম্বে", "urgent"),
    ("এখনই", "now"),
    ("দয়া করে", "please"),
    ("আপনার", "your"),
    ("অ্যাকাউন্ট", "account"),
    ("হিসাব", "account"),
    ("ব্যাংক", "bank"),
    ("যাচাই", "verify"),
    ("লিঙ্ক", "link"),
    ("লিঙ্কে", "link"),
    ("ক্লিক", "click"),
    ("করুন", "do"),
    ("ওটিপি", "otp"),
    ("পাসওয়ার্ড", "password"),
    ("কোড", "code"),
    ("পুরস্কার", "reward"),
    ("উপহার", "gift"),
    ("রিফান্ড", "refund"),
    ("নিরাপত্তা", "security"),
    ("সতর্কতা", "warning"),
    ("স্থগিত", "suspended"),
    ("ব্লক করা হয়েছে", "blocked"),

    # Spanish (Español)
    ("verifique su cuenta", "verify your account"),
    ("verifica tu cuenta", "verify your account"),
    ("haga clic aqui", "click here"),
    ("haz clic aqui", "click here"),
    ("su cuenta ha sido suspendida", "your account suspended"),
    ("tu cuenta ha sido suspendida", "your account suspended"),
    ("comparta el codigo", "share code"),
    ("urgente", "urgent"),
    ("inmediatamente", "immediately"),
    ("cuenta", "account"),
    ("banco", "bank"),
    ("verifique", "verify"),
    ("verifica", "verify"),
    ("clic", "click"),
    ("enlace", "link"),
    ("contrasena", "password"),
    ("codigo", "code"),
    ("premio", "prize"),
    ("recompensa", "reward"),
    ("regalo", "gift"),
    ("reembolso", "refund"),
    ("seguridad", "security"),
    ("alerta", "alert"),
    ("suspendida", "suspended"),
    ("actualice", "update"),
    ("actualiza", "update"),
    ("gratis", "free"),
    ("ganador", "winner"),

    # French (Français)
    ("verifiez votre compte", "verify your account"),
    ("cliquez ici", "click here"),
    ("votre compte a ete suspendu", "your account suspended"),
    ("partagez le code", "share code"),
    ("mot de passe", "password"),
    ("urgent", "urgent"),
    ("immediatement", "immediately"),
    ("compte", "account"),
    ("banque", "bank"),
    ("verifiez", "verify"),
    ("cliquez", "click"),
    ("lien", "link"),
    ("motdepasse", "password"),
    ("code", "code"),
    ("cadeau", "gift"),
    ("remboursement", "refund"),
    ("recompense", "reward"),
    ("securite", "security"),
    ("alerte", "alert"),
    ("suspendu", "suspended"),
    ("gratuit", "free"),
    ("gagnant", "winner"),
]

TRANSLATION_RULES.sort(key=lambda item: len(item[0]), reverse=True)
SUPPORTED_LANGUAGE_CODES = set(SUPPORTED_LANGUAGES)


@dataclass
class TextProcessingResult:
    original_text: str
    cleaned_text: str
    normalized_text: str
    analysis_text: str
    detected_language_code: str
    detected_language: str
    detection_method: str
    translation_applied: bool
    rectified_text: bool
    translation_status: str
    language_confidence: float | None = None
    languages: list[str] = field(default_factory=list)
    is_mixed: bool = False
    translation_warning: str | None = None
    matched_terms: list[str] = field(default_factory=list)
    processing_notes: list[str] = field(default_factory=list)
    corrected_text: str | None = None
    english_text: str | None = None
    suspicious_keywords: list[str] = field(default_factory=list)
    processor: str = "offline"
    processor_error: str | None = None
    normalization_status: str = "Completed"
    tokenization_status: str = "Completed"
    language_detection_status: str = "Completed"
    threat_pattern_status: str = "Completed"


def strip_accents(value: str) -> str:
    decomposed = unicodedata.normalize("NFKD", value)
    rebuilt: list[str] = []
    last_base_is_latin = False

    for char in decomposed:
        if unicodedata.combining(char):
            if not last_base_is_latin:
                rebuilt.append(char)
            continue

        rebuilt.append(char)
        last_base_is_latin = "LATIN" in unicodedata.name(char, "")

    return unicodedata.normalize("NFC", "".join(rebuilt))


_HOMOGLYPH_MAP: dict[str, str] = {
    # Cyrillic lookalikes
    "\u0430": "a", "\u0435": "e", "\u043e": "o", "\u0440": "r",
    "\u0441": "c", "\u0445": "x", "\u0456": "i",
    "\u0443": "y", "\u0410": "A", "\u0415": "E", "\u041e": "O",
    "\u0420": "R", "\u0421": "C", "\u0425": "X", "\u0406": "I",
    # Greek lookalikes
    "\u03b1": "a", "\u03b5": "e", "\u03bf": "o", "\u03c1": "p",
    "\u03bd": "v", "\u03b9": "i", "\u03ba": "k", "\u03c5": "u",
    # Mathematical/styled letters
    "\uff41": "a", "\uff42": "b", "\uff43": "c",
    "\uff44": "d", "\uff45": "e", "\uff46": "f", "\uff47": "g",
    "\uff48": "h", "\uff49": "i", "\uff4a": "j", "\uff4b": "k",
    "\uff4c": "l", "\uff4d": "m", "\uff4e": "n", "\uff4f": "o",
    "\uff50": "p", "\uff51": "q", "\uff52": "r", "\uff53": "s",
    "\uff54": "t", "\uff55": "u", "\uff56": "v", "\uff57": "w",
    "\uff58": "x", "\uff59": "y", "\uff5a": "z",
    # Zero-width and invisible characters
    "\u200b": "", "\u200c": "", "\u200d": "", "\u200e": "",
    "\u200f": "", "\u2060": "", "\ufeff": "", "\u00ad": "",
}


def normalize_homoglyphs(value: str) -> str:
    normalized = unicodedata.normalize("NFKC", value)
    result = []
    for char in normalized:
        result.append(_HOMOGLYPH_MAP.get(char, char))
    return "".join(result)


def normalize_spaces(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip()


def dedupe_preserve_order(items: list[str]) -> list[str]:
    seen: set[str] = set()
    ordered: list[str] = []

    for item in items:
        cleaned = normalize_spaces(item)
        if not cleaned:
            continue

        lowered = cleaned.lower()
        if lowered in seen:
            continue

        seen.add(lowered)
        ordered.append(cleaned)

    return ordered


def join_fragmented_words(value: str) -> str:
    patterns = [
        r"\b(?:[A-Za-z]\s+){2,}[A-Za-z]\b",
        r"(?:[\u0900-\u097F]\s+){2,}[\u0900-\u097F]",
        r"(?:[\u0980-\u09FF]\s+){2,}[\u0980-\u09FF]",
        r"(?:[\u0B80-\u0BFF]\s+){2,}[\u0B80-\u0BFF]",
        r"(?:[\u0C00-\u0C7F]\s+){2,}[\u0C00-\u0C7F]",
        r"(?:[\u0C80-\u0CFF]\s+){2,}[\u0C80-\u0CFF]",
        r"(?:[\u0D00-\u0D7F]\s+){2,}[\u0D00-\u0D7F]",
    ]

    updated = value
    for pattern in patterns:
        updated = re.sub(pattern, lambda match: match.group(0).replace(" ", ""), updated)

    return updated


def rectify_common_english(value: str) -> str:
    tokens = re.findall(r"[a-z']+|[^a-z']+", value.lower())
    corrected_tokens: list[str] = []

    for token in tokens:
        if not re.fullmatch(r"[a-z']+", token):
            corrected_tokens.append(token)
            continue

        if token in COMMON_ENGLISH_CORRECTIONS:
            corrected_tokens.append(COMMON_ENGLISH_CORRECTIONS[token])
            continue

        if token in ENGLISH_SCAM_VOCAB or len(token) <= 3:
            corrected_tokens.append(token)
            continue

        suggestion = difflib.get_close_matches(token, ENGLISH_SCAM_VOCAB, n=1, cutoff=0.84)
        corrected_tokens.append(suggestion[0] if suggestion else token)

    return normalize_spaces("".join(corrected_tokens))


def clean_input_text(value: str) -> str:
    normalized = unicodedata.normalize("NFKC", value)
    normalized = re.sub(r"[\u200B-\u200D\uFEFF]", "", normalized)
    normalized = normalized.replace("\r", " ").replace("\n", " ")
    normalized = normalize_homoglyphs(normalized)
    normalized = normalized.replace("’", "'").replace("`", "'")
    normalized = normalized.replace("“", '"').replace("”", '"')
    normalized = join_fragmented_words(normalized)
    return normalize_spaces(normalized)


def detect_script_language(value: str, hint_language: str | None = None) -> tuple[str | None, str | None, float | None, list[str]]:
    scores: dict[str, int] = {}
    for code, pattern in SCRIPT_LANGUAGE_PATTERNS.items():
        scores[code] = len(pattern.findall(value))

    latin_count = len(re.findall(r"[a-zA-Z]", value))
    total_chars = sum(scores.values()) + latin_count

    if total_chars <= 0:
        return None, None, None, []

    # Check for Devanagari script (Hindi vs Marathi)
    dev_count = scores.get("devanagari", 0)
    scores_without_dev = {k: v for k, v in scores.items() if k != "devanagari"}
    best_code, best_score = max(scores_without_dev.items(), key=lambda item: item[1]) if scores_without_dev else (None, 0)

    detected_code = None
    detected_confidence = None
    languages_found: list[str] = []

    if dev_count > best_score and dev_count > 0:
        detected_code = "hi"
        languages_found.append("hi")
        ratio = dev_count / total_chars
        detected_confidence = round(min(0.99, max(0.85, ratio * 1.05)), 2)

    elif best_score > 0:
        detected_code = best_code
        languages_found.append(best_code)
        ratio = best_score / total_chars
        detected_confidence = round(min(0.99, max(0.85, ratio * 1.05)), 2)

    # Check for code-mixed English
    if latin_count >= 6 and detected_code and detected_code != "en":
        languages_found.append("en")

    return detected_code, "script" if detected_code else None, detected_confidence, languages_found


def detect_latin_language(value: str, hint_language: str | None = None) -> tuple[str, str, float | None, list[str]]:
    normalized = strip_accents(value).lower()
    words = re.findall(r"[a-z']+", normalized)

    if not words:
        if hint_language and hint_language in SUPPORTED_LANGUAGES:
            return hint_language, "hint", 0.90, [hint_language]
        return "en", "default", 0.95, ["en"]

    if hint_language and hint_language in SUPPORTED_LANGUAGES and hint_language != "auto":
        # Validate if hint matches vocabulary hints
        if hint_language in LATIN_LANGUAGE_HINTS:
            hints = LATIN_LANGUAGE_HINTS[hint_language]
            hits = sum(1 for word in words if word in hints)
            if hits > 0:
                return hint_language, "hint-matched", 0.96, [hint_language]

    if detect_langs is not None and len(normalized) >= 24:
        try:
            guesses = detect_langs(normalized)
            if guesses:
                top_guess = guesses[0]
                language_code = top_guess.lang.split("-")[0]
                if language_code in SUPPORTED_LANGUAGE_CODES:
                    conf = round(float(top_guess.prob), 2)
                    return language_code, "langdetect", conf, [language_code]
        except Exception:
            pass

    score_map = {
        code: sum(1 for word in words if word in hints)
        for code, hints in LATIN_LANGUAGE_HINTS.items()
    }
    best_code, best_score = max(score_map.items(), key=lambda item: item[1])

    if best_score <= 0:
        if hint_language and hint_language in SUPPORTED_LANGUAGES and hint_language != "auto":
            return hint_language, "hint-fallback", 0.90, [hint_language]
        return "en", "heuristic-default", 0.92, ["en"]

    conf = round(min(0.98, max(0.80, 0.70 + (best_score / max(len(words), 1)) * 0.3)), 2)
    return best_code, "keyword", conf, [best_code]


def detect_supported_language(value: str, hint_language: str | None = None) -> tuple[str, str, float | None, list[str], bool]:
    hint_code = resolve_supported_language_code(hint_language) if hint_language else None
    if hint_code == "auto":
        hint_code = None

    script_code, script_method, script_conf, script_langs = detect_script_language(value, hint_code)
    if script_code:
        is_mixed = len(script_langs) > 1
        return script_code, script_method or "script", script_conf, script_langs, is_mixed

    latin_code, latin_method, latin_conf, latin_langs = detect_latin_language(value, hint_code)
    is_mixed = len(latin_langs) > 1
    return latin_code, latin_method, latin_conf, latin_langs, is_mixed


def replace_phrase(value: str, source: str, target: str) -> tuple[str, bool]:
    pattern = re.compile(re.escape(source))
    updated, count = pattern.subn(target, value)
    return updated, count > 0


def translate_supported_text(value: str) -> tuple[str, list[str]]:
    translated = strip_accents(value).lower()
    matched_terms: list[str] = []

    for source, target in TRANSLATION_RULES:
        translated, matched = replace_phrase(translated, source, target)
        if matched and source != target:
            matched_terms.append(target)

    # Preserve all Indian language scripts, Latin, numbers and safe punctuation
    translated = re.sub(
        r"[^0-9a-z\u0900-\u097F\u0980-\u09FF\u0B80-\u0BFF\u0C00-\u0C7F\u0C80-\u0CFF\u0D00-\u0D7F:/._\-'\s]",
        " ",
        translated,
    )
    translated = normalize_spaces(translated)
    return translated, dedupe_preserve_order(matched_terms)


def build_analysis_text(normalized_text: str, matched_terms: list[str], detected_language_code: str) -> str:
    english_ready = rectify_common_english(normalized_text)
    english_tokens = re.findall(r"[a-z']+", english_ready)
    english_only = normalize_spaces(re.sub(r"[^0-9a-z:/._\-'\s]", " ", english_ready))

    if detected_language_code == "en":
        return english_ready

    # Combine both matched mapped terms and any direct English tokens from code-mixed input
    summary_tokens: list[str] = []
    for phrase in matched_terms:
        summary_tokens.extend(re.findall(r"[a-z']+", phrase.lower()))

    summary_tokens.extend(english_tokens)
    keyword_summary = normalize_spaces(" ".join(dedupe_preserve_order(summary_tokens)))

    if keyword_summary:
        return rectify_common_english(keyword_summary)

    return english_only or english_ready


def resolve_supported_language_code(value: str | None) -> str | None:
    if not value:
        return None

    normalized = normalize_spaces(str(value)).lower()
    if not normalized or normalized in {"auto", "all"}:
        return "auto"

    if normalized in SUPPORTED_LANGUAGES:
        return normalized

    if normalized in SUPPORTED_LANGUAGE_NAMES:
        return SUPPORTED_LANGUAGE_NAMES[normalized]

    if "-" in normalized:
        short_code = normalized.split("-", 1)[0].strip()
        if short_code in SUPPORTED_LANGUAGES:
            return short_code

    base_name = normalized.split("(", 1)[0].strip()
    return SUPPORTED_LANGUAGE_NAMES.get(base_name)


def collect_string_list(value: Any) -> list[str]:
    if not isinstance(value, list):
        return []

    return [str(item).strip() for item in value if str(item).strip()]


def is_groq_normalizer_enabled() -> bool:
    api_key = ENV_CONFIG("GROQ_API_KEY", cast=str, default="").strip()
    return api_key not in PLACEHOLDER_GROQ_API_KEYS and GROQ_LANGUAGE_RUNNER.exists()


def run_groq_language_normalizer(value: str) -> dict[str, Any]:
    completed = subprocess.run(
        ["node", str(GROQ_LANGUAGE_RUNNER)],
        input=value,
        capture_output=True,
        text=True,
        encoding="utf-8",
        cwd=str(BASE_DIR),
        timeout=GROQ_TIMEOUT_SECONDS,
        check=False,
    )

    if completed.returncode != 0:
        error_text = normalize_spaces(completed.stderr or completed.stdout or "Groq language processing failed.")
        raise RuntimeError(error_text)

    try:
        payload = json.loads(completed.stdout)
    except json.JSONDecodeError as exc:
        raise RuntimeError("Groq language processing returned invalid JSON.") from exc

    if not isinstance(payload, dict):
        raise RuntimeError("Groq language processing returned an unexpected response.")

    return payload


def build_groq_text_processing_result(value: str, payload: dict[str, Any], selected_language: str | None = None) -> TextProcessingResult:
    source_text = normalize_spaces(value)
    original_text = normalize_spaces(str(payload.get("originalText") or source_text)) or source_text
    cleaned_text = clean_input_text(original_text)
    corrected_text = clean_input_text(str(payload.get("correctedText") or cleaned_text))
    english_source = clean_input_text(str(payload.get("englishText") or corrected_text or cleaned_text))
    analysis_text = rectify_common_english(english_source) or rectify_common_english(corrected_text) or cleaned_text.lower()

    detected_language_name = normalize_spaces(str(payload.get("detectedLanguage") or ""))
    detected_language_code = resolve_supported_language_code(detected_language_name)
    
    hint_code = resolve_supported_language_code(selected_language)
    if not detected_language_code or detected_language_code == "auto":
        detected_language_code, detection_method, confidence, languages, is_mixed = detect_supported_language(cleaned_text, hint_code)
    else:
        _, detection_method, confidence, languages, is_mixed = detect_supported_language(cleaned_text, detected_language_code)

    detected_language = SUPPORTED_LANGUAGES.get(detected_language_code, detected_language_name or "English")
    if is_mixed and len(languages) > 1:
        names = [SUPPORTED_LANGUAGES.get(c, c.upper()) for c in languages]
        detected_language = f"Mixed ({' + '.join(names)})"

    suspicious_keywords = dedupe_preserve_order(collect_string_list(payload.get("suspiciousKeywords")))
    cleaned_baseline = strip_accents(cleaned_text).lower()

    translation_applied = detected_language_code != "en" or analysis_text != cleaned_baseline
    rectified_text = strip_accents(corrected_text).lower() != cleaned_baseline or analysis_text != cleaned_baseline

    if detected_language_code == "en" and rectified_text:
        translation_status = "normalized-english"
    elif detected_language_code == "en":
        translation_status = "direct-english"
    else:
        translation_status = "translated"

    processing_notes = ["Groq normalized the text before the scam model ran."]
    if strip_accents(corrected_text).lower() != cleaned_baseline:
        processing_notes.append("Groq repaired spelling or formatting issues before scoring.")
    if detected_language_code != "en":
        processing_notes.append(f"Groq translated the {detected_language} message into English before the verification model ran.")
    if suspicious_keywords:
        processing_notes.append("Groq extracted suspicious keywords preserved in scan metadata.")

    return TextProcessingResult(
        original_text=original_text,
        cleaned_text=cleaned_text,
        normalized_text=analysis_text,
        analysis_text=analysis_text,
        detected_language_code=detected_language_code,
        detected_language=detected_language,
        detection_method="groq",
        language_confidence=confidence or 0.95,
        languages=languages or [detected_language_code],
        is_mixed=is_mixed,
        translation_applied=translation_applied,
        rectified_text=rectified_text,
        translation_status=translation_status,
        translation_warning=None,
        matched_terms=suspicious_keywords,
        processing_notes=processing_notes,
        corrected_text=corrected_text,
        english_text=analysis_text,
        suspicious_keywords=suspicious_keywords,
        processor="groq",
        processor_error=None,
        normalization_status="Completed",
        tokenization_status="Completed",
        language_detection_status="Completed",
        threat_pattern_status="Completed",
    )


def preprocess_text_for_analysis_offline(
    value: str,
    selected_language: str | None = None,
    processor_error: str | None = None,
) -> TextProcessingResult:
    original_text = normalize_spaces(value)
    cleaned_text = clean_input_text(original_text)
    hint_code = resolve_supported_language_code(selected_language)
    
    detected_language_code, detection_method, confidence, languages, is_mixed = detect_supported_language(cleaned_text, hint_code)
    normalized_text, matched_terms = translate_supported_text(cleaned_text)
    analysis_text = build_analysis_text(normalized_text, matched_terms, detected_language_code)

    translation_applied = detected_language_code != "en" or bool(matched_terms)
    rectified_text = cleaned_text != original_text or normalized_text != strip_accents(cleaned_text).lower() or analysis_text != normalized_text

    if detected_language_code == "en" and translation_applied:
        translation_status = "normalized-english"
    elif detected_language_code == "en":
        translation_status = "direct-english"
    elif matched_terms:
        translation_status = "translated"
    else:
        translation_status = "partial"

    detected_language_name = SUPPORTED_LANGUAGES.get(detected_language_code, "English")
    if is_mixed and len(languages) > 1:
        names = [SUPPORTED_LANGUAGES.get(c, c.upper()) for c in languages]
        detected_language = f"Mixed ({' + '.join(names)})"
    else:
        detected_language = detected_language_name

    processing_notes: list[str] = []
    if detection_method == "script":
        processing_notes.append(f"Detected native {detected_language_name} script.")
    elif detection_method == "langdetect":
        processing_notes.append("Detected the input language with an offline language-ID engine.")
    elif detection_method in {"hint", "hint-matched", "hint-fallback"}:
        processing_notes.append(f"Used user-specified {detected_language_name} hint with content validation.")
    elif detection_method == "keyword":
        processing_notes.append(f"Detected {detected_language_name} vocabulary patterns.")
    else:
        processing_notes.append("Defaulted to English-safe processing.")

    if is_mixed:
        processing_notes.append("Identified code-mixed text structure across multiple scripts.")

    if cleaned_text != original_text:
        processing_notes.append("Normalized Unicode characters and joined fragmented words before analysis.")

    if matched_terms:
        processing_notes.append(f"Extracted {len(matched_terms)} threat phrases mapped from {detected_language_name}.")
    elif detected_language_code != "en":
        processing_notes.append("Analyzed language-specific tokens and heuristics.")

    if analysis_text != normalized_text:
        processing_notes.append("Applied spelling and token rectification before scoring.")

    if processor_error:
        processing_notes.append("Offline multilingual NLP engine processed the content.")

    translation_warning = None
    if detected_language_code != "en" and not matched_terms and not is_mixed:
        translation_warning = (
            f"Detected {detected_language_name} input. Analyzed content with multilingual keyword heuristics."
        )

    return TextProcessingResult(
        original_text=original_text,
        cleaned_text=cleaned_text,
        normalized_text=normalized_text,
        analysis_text=analysis_text or cleaned_text,
        detected_language_code=detected_language_code,
        detected_language=detected_language,
        detection_method=detection_method,
        language_confidence=confidence,
        languages=languages or [detected_language_code],
        is_mixed=is_mixed,
        translation_applied=translation_applied,
        rectified_text=rectified_text,
        translation_status=translation_status,
        translation_warning=translation_warning,
        matched_terms=matched_terms,
        processing_notes=processing_notes,
        corrected_text=cleaned_text,
        english_text=analysis_text or cleaned_text,
        suspicious_keywords=matched_terms,
        processor="offline",
        processor_error=processor_error,
        normalization_status="Completed",
        tokenization_status="Completed",
        language_detection_status="Completed",
        threat_pattern_status="Completed",
    )


def preprocess_text_for_analysis(value: str, selected_language: str | None = None) -> TextProcessingResult:
    if is_groq_normalizer_enabled():
        try:
            groq_payload = run_groq_language_normalizer(value)
            return build_groq_text_processing_result(value, groq_payload, selected_language=selected_language)
        except (FileNotFoundError, OSError, RuntimeError, subprocess.TimeoutExpired) as exc:
            return preprocess_text_for_analysis_offline(value, selected_language=selected_language, processor_error=normalize_spaces(str(exc)))

    return preprocess_text_for_analysis_offline(value, selected_language=selected_language)
