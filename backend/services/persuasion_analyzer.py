"""
Persuasion-pattern classifier for scam text.

Detects the psychological manipulation tactics used in scam messages
across English, Kannada, Hindi, Telugu, Tamil, Malayalam, Marathi, and Bengali.
"""
from __future__ import annotations

import json
import logging
import re
import subprocess
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from starlette.config import Config

logger = logging.getLogger(__name__)

BASE_DIR = Path(__file__).resolve().parent.parent
ENV_CONFIG = Config(str(BASE_DIR / ".env"))
GROQ_RUNNER = BASE_DIR / "services" / "runPersuasionService.js"
PLACEHOLDER_KEYS = {"", "your_groq_api_key_here"}
GROQ_TIMEOUT_SECONDS = max(
    1.0,
    ENV_CONFIG("BACKEND_GROQ_TIMEOUT_SECONDS", cast=float, default=8.0),
)

PERSUASION_PATTERNS: dict[str, dict[str, Any]] = {
    "Authority Impersonation": {
        "description": "Pretends to be a bank, government, police, or official body",
        "phrases": [
            "from your bank", "from the bank", "rbi", "reserve bank",
            "income tax department", "government of india", "police",
            "cybercrime", "fraud department", "customer care", "official notice",
            "legal notice", "court order", "irs", "fbi", "interpol",
            "from microsoft", "from apple", "from google", "from amazon",
            "your service provider", "telecom authority", "trai",
            "microsoft support", "apple support", "tech support",
            "this is microsoft", "this is apple", "this is your bank",
            "calling from the bank", "calling from your bank",
            # Multilingual phrases
            "बँक", "बैंक", "ಬ್ಯಾಂಕ್", "బ్యాంక్", "வங்கி", "ബാങ്ക്",
            "પોલીસ", "आयुक्त", "सरकार", "ಸ್ಥಗಿತ", "ಅಧಿಕೃತ",
        ],
        "weight": 22,
    },
    "Isolation Tactic": {
        "description": "Tells the victim not to tell family or friends",
        "phrases": [
            "don't tell anyone", "do not tell anyone", "keep this between us",
            "don't share this", "do not share this", "keep it secret",
            "don't inform", "do not inform", "confidential matter",
            "between you and me", "don't discuss", "do not discuss",
            "don't mention", "do not mention this to",
            "don't tell mom", "don't tell dad", "don't tell your family",
            "do not tell your parents", "keep this private",
            "please keep this between us", "don't tell your husband",
            "don't tell your wife", "don't tell your children",
            # Multilingual phrases
            "किसी को न बताएं", "साझा न करें", "ಯಾರಿಗೂ ಹೇಳಬೇಡಿ",
            "ఎవరికీ చెప్పవద్దు", "யாருக்கும் சொல்ல வேண்டாம்",
            "ആരോടും പറയരുത്", "कोणालाही सांगू नका", "কাউকে বলবেন না",
        ],
        "weight": 28,
    },
    "False Urgency": {
        "description": "Creates artificial time pressure to prevent rational thinking",
        "phrases": [
            "within 24 hours", "within 2 hours", "within 1 hour",
            "expires today", "last chance", "final notice", "act now",
            "immediately", "right now", "before it's too late",
            "account will be blocked", "account will be suspended",
            "service will be terminated", "legal action will be taken",
            "arrest warrant", "will be arrested",
            "within 48 hours", "limited time", "today only",
            "send now", "transfer now", "pay now", "call back immediately",
            "call us back immediately", "do not turn off",
            # Multilingual phrases
            "तुरंत", "अभी", "तಕ್ಷಣ", "ಈಗಲೇ", "వెంటనే", "తక్షణం",
            "உடனே", "உடனடியாக", "ഉടൻ", "ഉടൻതന്നെ", "त्वरित",
            "लगेच", "অবিলম্বে", "এখনই", "सत्यापन करें", "ಪರಿಶೀಲಿಸಿ",
            "ధృవీకరించండి", "சரிபார்க்கவும்", "സ്ഥിരീകരിക്കുക",
            "पडताळणी करा", "যাচাই করুন", "ಸ್ಥಗಿತಗೊಂಡಿದೆ", "निలిపివేయబడింది",
            "इடைநிறுத்தப்பட்டுள்ளது", "നിർത്തിവച്ചിരിക്കുന്നു", "নিলंबित", "স্থগিত",
        ],
        "weight": 18,
    },
    "Reciprocity Trap": {
        "description": "Claims to have already given something to lower defenses",
        "phrases": [
            "we have already credited", "already added to your account",
            "prize has been reserved", "reward is waiting",
            "we have selected you", "you have been chosen",
            "cashback already processed", "refund is ready",
            "just verify to claim", "just confirm to receive",
            "to release your funds", "to unlock your reward",
            "you have won", "you are a winner", "your email has won",
            "selected as a winner", "lucky winner", "congratulations you won",
            "prize money", "lottery winner", "you have been awarded",
            # Multilingual phrases
            "इनाम जीता", "पुरस्कार", "ಬಹುಮಾನ", "ಬಹುಮತಿ", "பரிசு",
            "സമ്മാനം", "बक्षीस जिंकले", "পুরস্কার জিতেছেন", "लॉटरी",
        ],
        "weight": 20,
    },
    "Fear and Rescue": {
        "description": "Creates fear then positions the scammer as the only solution",
        "phrases": [
            "only i can help", "only we can help", "i am the only one",
            "your account is at risk", "suspicious activity detected",
            "unauthorized access", "someone is trying to hack",
            "your data has been compromised", "protect your account now",
            "i will help you", "let me help you secure",
            "stay calm", "don't panic", "everything will be fine if",
            "virus on your computer", "virus detected", "your computer is infected",
            "we have detected", "hacker has access", "your device is compromised",
            "i have recorded you", "i have a video of you", "recorded through your webcam",
            "i will send this to your contacts", "expose you",
            # Multilingual phrases
            "खाता निलंबित", "ಖಾತೆ ಸ್ಥಗಿತ", "ఖాతా నిలిపివేత", "கணக்கு முடக்கம்",
            "അക്കൗണ്ട് സസ്‌പെൻഡ്", "खाते निलंबित", "অ্যাকাউন্ট স্থগিত",
            "बिजली काट दी जाएगी", "ವಿದ್ಯುತ್ ಕಡಿತ", "విద్యుత్ నిలిపివేత",
            "மின்சாரம் துண்டிப்பு", "വൈദ്യുതി വിച്ഛേദനം", "वीज खंडित", "বিদ্যুৎ সংযোগ বিচ্ছিন্ন",
        ],
        "weight": 24,
    },
    "Social Proof Manipulation": {
        "description": "Uses fake popularity or peer pressure to seem legitimate",
        "phrases": [
            "thousands of people", "millions of users", "everyone is doing",
            "your friends have already", "people in your area",
            "most popular offer", "trending right now",
            "limited to first 100", "only 5 spots left",
            "join the winners", "be part of the lucky few",
            "300 percent returns", "200 percent profit", "guaranteed returns",
            "made me rich", "financial advisor", "investment tip",
            "crypto investment", "trading platform", "i made a lot of money",
        ],
        "weight": 14,
    },
    "Crypto and Investment Lure": {
        "description": "Lures victim into fake crypto or investment schemes",
        "phrases": [
            "crypto investment", "bitcoin investment", "cryptocurrency",
            "trading platform", "investment tip", "guaranteed profit",
            "guaranteed returns", "300 percent", "200 percent", "double your money",
            "i messaged the wrong number", "wrong number sorry",
            "financial advisor", "hedge fund", "forex trading",
            "i can show you how", "let me show you how to invest",
            "my mentor taught me", "passive income", "financial freedom",
            "withdraw anytime", "deposit now", "trading account",
        ],
        "weight": 26,
    },
    "Blackmail and Sextortion": {
        "description": "Threatens to expose embarrassing content unless paid",
        "phrases": [
            "i have recorded you", "recorded through your webcam",
            "i have a video of you", "visiting adult websites",
            "i will send this to your contacts", "i will expose you",
            "pay or i will", "send bitcoin", "send crypto",
            "pay to this wallet", "bitcoin wallet", "crypto wallet",
            "i have your browsing history", "i installed malware",
            "i have access to your camera", "i have screenshots",
            "do not try to contact police", "do not report this",
            "48 hours to pay", "72 hours to pay",
        ],
        "weight": 30,
    },
    "Fake Prize and Fee Fraud": {
        "description": "Claims victim won a prize but requires a fee to claim it",
        "phrases": [
            "processing fee", "claim your prize", "release fee",
            "transfer fee", "administration fee", "tax fee",
            "to receive your winnings", "to unlock your prize",
            "send fee to claim", "pay to receive",
            "microsoft lottery", "google lottery", "annual lottery",
            "your email has won", "selected by computer ballot",
            "international lottery", "prize notification",
            "send your details to claim", "winning notification",
        ],
        "weight": 24,
    },
    "Bank Detail Change Fraud": {
        "description": "Impersonates a supplier or contact to redirect payments",
        "phrases": [
            "bank details have changed", "our account details have changed",
            "new bank account", "updated bank details", "please update your records",
            "transfer to new account", "new account number",
            "sort code has changed", "routing number has changed",
            "please use new details", "invoice payment",
            "urgent payment required", "overdue invoice",
            "payment is overdue", "immediate payment",
            "wire transfer", "bank transfer required",
            "ओटीपी साझा करें", "ಒಟಿಪಿ ಹಂಚಿಕೊಳ್ಳಿ", "ఓటీపీని పంచుకోండి",
            "ஓடிபியை பகிரவும்", "ഒടിപി പങ്കിടുക", "ओटीपी सांगा", "ওটিপি শেয়ার করুন",
        ],
        "weight": 26,
    },
    "Family Emergency Money Request": {
        "description": "Impersonates a family member in distress to request money",
        "phrases": [
            "it is me your", "it's me your grandson", "it's me your son",
            "i am in jail", "i am in hospital", "i had an accident",
            "i need bail money", "bail money", "need money urgently",
            "send money now", "wire me money", "transfer money to me",
            "do not tell mom", "do not tell dad", "please don't tell",
            "i am in trouble", "i need help urgently",
            "stranded abroad", "lost my wallet", "lost my phone",
            "mugged", "robbed", "emergency situation",
        ],
        "weight": 28,
    },
}


@dataclass
class PersuasionResult:
    patterns_detected: list[str]
    pattern_scores: dict[str, int]
    persuasion_score: int
    top_pattern: str
    explanation: str
    groq_used: bool = False
    groq_detail: dict[str, Any] = field(default_factory=dict)
    error: str | None = None


def _rule_score_patterns(text: str, normalized_text: str | None = None) -> dict[str, int]:
    candidates = [text.lower()]
    if normalized_text and normalized_text.lower() != text.lower():
        candidates.append(normalized_text.lower())

    scores: dict[str, int] = {}
    for name, config in PERSUASION_PATTERNS.items():
        hits = 0
        for cand in candidates:
            hits += sum(1 for phrase in config["phrases"] if phrase in cand)
        if hits > 0:
            scores[name] = min(hits * config["weight"], 100)
    return scores


def _is_groq_enabled() -> bool:
    key = ENV_CONFIG("GROQ_API_KEY", cast=str, default="").strip()
    return key not in PLACEHOLDER_KEYS and GROQ_RUNNER.exists()


def _run_groq_persuasion(text: str) -> dict[str, Any]:
    completed = subprocess.run(
        ["node", str(GROQ_RUNNER)],
        input=text,
        capture_output=True,
        text=True,
        encoding="utf-8",
        cwd=str(BASE_DIR),
        timeout=GROQ_TIMEOUT_SECONDS,
        check=False,
    )
    if completed.returncode != 0:
        raise RuntimeError(completed.stderr or "Groq persuasion analysis failed.")
    return json.loads(completed.stdout)


def analyze_persuasion_patterns(text: str, normalized_text: str | None = None) -> PersuasionResult:
    rule_scores = _rule_score_patterns(text, normalized_text)

    groq_detail: dict[str, Any] = {}
    groq_used = False
    groq_error: str | None = None

    if _is_groq_enabled():
        try:
            groq_detail = _run_groq_persuasion(normalized_text or text)
            groq_used = True
        except Exception as exc:
            groq_error = str(exc)
            logger.warning("[Persuasion] Groq unavailable: %s", exc)

    final_scores: dict[str, int] = {}
    all_pattern_names = list(PERSUASION_PATTERNS.keys())

    for name in all_pattern_names:
        rule_val = rule_scores.get(name, 0)
        if groq_used and "patternScores" in groq_detail:
            groq_val = int(groq_detail["patternScores"].get(name, 0))
            groq_val_scaled = min(groq_val * 10, 100)
            merged = int(round(groq_val_scaled * 0.6 + rule_val * 0.4))
        else:
            merged = rule_val
        if merged > 0:
            final_scores[name] = min(merged, 100)

    patterns_detected = [n for n, s in final_scores.items() if s >= 20]

    if not final_scores:
        persuasion_score = 0
        top_pattern = ""
    else:
        persuasion_score = min(
            int(round(sum(final_scores.values()) / len(PERSUASION_PATTERNS))),
            100,
        )
        top_pattern = max(final_scores, key=lambda k: final_scores[k])

    if groq_used and groq_detail.get("explanation"):
        explanation = str(groq_detail["explanation"])
    elif patterns_detected:
        desc_list = [
            PERSUASION_PATTERNS[p]["description"]
            for p in patterns_detected[:3]
        ]
        explanation = (
            f"Detected {len(patterns_detected)} manipulation tactic(s): "
            + "; ".join(desc_list) + "."
        )
    else:
        explanation = "No strong psychological manipulation patterns detected."

    return PersuasionResult(
        patterns_detected=patterns_detected,
        pattern_scores=final_scores,
        persuasion_score=persuasion_score,
        top_pattern=top_pattern,
        explanation=explanation,
        groq_used=groq_used,
        groq_detail=groq_detail,
        error=groq_error,
    )
