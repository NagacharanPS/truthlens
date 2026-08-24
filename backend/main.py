from __future__ import annotations

import io
import math
import re
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional
from urllib.parse import urlparse

import joblib
import numpy as np
import pandas as pd
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image, ImageStat, UnidentifiedImageError
from pydantic import BaseModel, Field
from starlette.config import Config

from ml_training.model_components import IMAGE_FEATURE_NAMES, extract_image_features_from_bytes
from services.clip_image_analyzer import analyze_image_with_clip
from services.c2pa_checker import check_c2pa_provenance
from services.persuasion_analyzer import analyze_persuasion_patterns
from services.shap_explainer import explain_text_prediction, explain_url_prediction
from services.whois_checker import check_domain_age
from services.ocr_service import extract_text_from_image, is_easyocr_available
from text_processing import SUPPORTED_LANGUAGES, preprocess_text_for_analysis
from ai_explain import generate_explanation, ExplanationRequest

BASE_DIR = Path(__file__).resolve().parent
CONFIG = Config(str(BASE_DIR / ".env"))
MODELS_DIR = BASE_DIR / "models"
IMPROVED_MODELS_DIR = BASE_DIR / "ml_training" / "saved_models"
MODEL_SEARCH_DIRS = [IMPROVED_MODELS_DIR, MODELS_DIR]

DEFAULT_SERVICE_NAME = "TruthShield AI Backend"
DEFAULT_CORS_ORIGINS = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:4173",
    "http://127.0.0.1:4173",
]
DEFAULT_CORS_ORIGIN_REGEX = r"https?://(localhost|127\.0\.0\.1)(:\d+)?"


def get_configured_cors_origins() -> list[str]:
    raw_origins = CONFIG(
        "BACKEND_CORS_ORIGINS",
        cast=str,
        default=",".join(DEFAULT_CORS_ORIGINS),
    )
    return [origin.strip() for origin in raw_origins.split(",") if origin.strip()]


SERVICE_NAME = CONFIG("BACKEND_SERVICE_NAME", cast=str, default=DEFAULT_SERVICE_NAME)
CORS_ORIGINS = get_configured_cors_origins()
CORS_ORIGIN_REGEX = CONFIG(
    "BACKEND_CORS_ORIGIN_REGEX",
    cast=str,
    default=DEFAULT_CORS_ORIGIN_REGEX,
)

TEXT_POSITIVE_LABELS = {"spam", "scam", "fraud", "1", "true", "positive", "malicious"}
URL_POSITIVE_LABELS = {"phishing", "malicious", "spam", "fraud", "bad", "1", "true", "positive", "unsafe"}
IMAGE_POSITIVE_LABELS = {"fake", "manipulation", "phishing", "scam", "suspicious", "1", "true", "positive"}

TEXT_SIGNAL_GROUPS = {
    "Urgency Signals": ["urgent", "immediately", "asap", "suspended", "final warning", "act now", "action", "emergency", "within 24 hours"],
    "Credential Bait": ["otp", "password", "pin", "cvv", "bank", "account", "verify account", "kyc", "aadhaar", "pan card", "credentials"],
    "Link Pressure": ["click", "tap here", "login", "reset", "security alert", "http://", "https://", "www.", "open link"],
    "Reward Trigger": ["reward", "bonus", "winner", "gift", "refund", "cashback", "prize", "lottery", "free money"],
}
TEXT_RED_FLAG_TERMS = sorted({term for terms in TEXT_SIGNAL_GROUPS.values() for term in terms})

URL_SIGNAL_GROUPS = {
    "Domain Spoofing": ["login", "verify", "secure", "bank", "wallet", "support", "account"],
    "Transport Risk": ["http://"],
    "Credential Trap": ["otp", "password", "confirm", "update", "signin"],
    "Malicious Incentive": ["reward", "bonus", "gift", "free", "claim"],
}
URL_RED_FLAG_TERMS = sorted({term for terms in URL_SIGNAL_GROUPS.values() for term in terms})
SUSPICIOUS_TLDS = {".zip", ".click", ".top", ".xyz", ".gq", ".tk", ".work", ".fit"}
SHORTENED_DOMAINS = {"bit.ly", "tinyurl.com", "t.co", "goo.gl", "cutt.ly", "rebrand.ly", "j.gs"}
IMAGE_NAME_RED_FLAGS = {"ai", "deepfake", "synthetic", "generated", "render", "face-swap", "swap", "edit", "fake"}


class TextVerificationRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=12000)
    language: Optional[str] = Field(default="auto")


class UrlVerificationRequest(BaseModel):
    url: str = Field(..., min_length=1, max_length=4096)


class SignalMetric(BaseModel):
    label: str
    value: int


class VerificationResponse(BaseModel):
    type: str
    status: str
    riskScore: int
    riskLevel: str
    confidence: int
    prediction: str | None = None
    redFlags: list[str]
    explanation: str
    recommendation: str
    originalText: str | None = None
    detectedLanguage: str | None = None
    detectedLanguageCode: str | None = None
    languageConfidence: float | None = None
    languages: list[str] = Field(default_factory=list)
    isMixed: bool = Field(default=False)
    correctedText: str | None = None
    englishText: str | None = None
    ocrText: str | None = None
    ocrDetected: bool = Field(default=False)
    ocrConfidence: float | None = None
    suspiciousKeywords: list[str] = Field(default_factory=list)
    signalBreakdown: list[SignalMetric] = Field(default_factory=list)
    # NLP Diagnostic Statuses
    normalizationStatus: str = Field(default="Completed")
    tokenizationStatus: str = Field(default="Completed")
    languageDetectionStatus: str = Field(default="Completed")
    threatPatternStatus: str = Field(default="Completed")
    # Persuasion analysis (text scans)
    persuasionScore: int = Field(default=0)
    persuasionPatterns: list[str] = Field(default_factory=list)
    persuasionExplanation: str = Field(default="")
    # C2PA provenance (image scans)
    c2paVerified: bool = Field(default=False)
    c2paGenerator: str = Field(default="")
    c2paRiskSignal: str = Field(default="")
    # CLIP analysis (image scans)
    clipAiScore: int = Field(default=0)
    clipAvailable: bool = Field(default=False)
    # Confidence interval
    confidenceLow: int = Field(default=0)
    confidenceHigh: int = Field(default=0)
    # SHAP top features
    shapTopRisk: list[str] = Field(default_factory=list)
    shapTopSafe: list[str] = Field(default_factory=list)
    shapAvailable: bool = Field(default=False)
    metadata: dict[str, Any] = Field(default_factory=dict)


@dataclass
class ModelArtifact:
    name: str
    model: Any | None
    vectorizer: Any | None = None
    source: str = "fallback"
    error: str | None = None


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def clamp_score(value: float | int, minimum: int = 0, maximum: int = 100) -> int:
    return max(minimum, min(maximum, int(round(value))))


def normalize_label(value: Any) -> str:
    return str(value).strip().lower()


def dedupe(items: list[str]) -> list[str]:
    seen: set[str] = set()
    unique: list[str] = []

    for item in items:
        cleaned = item.strip()
        if not cleaned:
            continue

        lowered = cleaned.lower()
        if lowered in seen:
            continue

        seen.add(lowered)
        unique.append(cleaned)

    return unique


def get_risk_level(score: int) -> str:
    if score >= 70:
        return "High"
    if score >= 40:
        return "Medium"
    return "Low"


def get_confidence_interval(confidence: int, used_fallback: bool, n_signals: int) -> tuple[int, int]:
    base_margin = 14 if used_fallback else 8
    signal_reduction = min(n_signals * 1.5, 6)
    margin = max(int(round(base_margin - signal_reduction)), 4)
    low = clamp_score(confidence - margin)
    high = clamp_score(confidence + margin)
    return low, high


def score_from_keyword_hits(content: str, phrases: list[str], base: int = 8, weight: int = 18) -> int:
    lowered = content.lower()
    hits = sum(1 for phrase in phrases if phrase in lowered)
    if hits == 0:
        return base
    return clamp_score(base + hits * weight, 5, 98)


def artifact_engine_label(artifact: ModelArtifact) -> str:
    if artifact.model is None:
        return "heuristic-fallback"
    return Path(artifact.source).name


def load_model_artifact(model_name: str, vectorizer_name: str | None = None) -> ModelArtifact:
    errors: list[str] = []

    for directory in MODEL_SEARCH_DIRS:
        model_path = directory / model_name

        if not model_path.exists():
            continue

        try:
            model = joblib.load(model_path)
        except Exception as exc:
            errors.append(f"{model_path.name}: {exc}")
            continue

        vectorizer = None
        if vectorizer_name:
            vectorizer_path = directory / vectorizer_name
            if vectorizer_path.exists():
                try:
                    vectorizer = joblib.load(vectorizer_path)
                except Exception as exc:
                    errors.append(f"{vectorizer_path.name}: {exc}")
                    continue

        return ModelArtifact(
            name=model_name,
            model=model,
            vectorizer=vectorizer,
            source=str(model_path),
            error="; ".join(errors) if errors else None,
        )

    return ModelArtifact(
        name=model_name,
        model=None,
        vectorizer=None,
        source="fallback",
        error="; ".join(errors) if errors else f"{model_name} was not found.",
    )


def prepare_model_input(artifact: ModelArtifact, raw_value: Any):
    if artifact.vectorizer is not None:
        return artifact.vectorizer.transform([raw_value])
    return [raw_value]


def get_positive_probability(model: Any, model_input: Any, positive_labels: set[str]) -> tuple[str, float]:
    prediction = normalize_label(model.predict(model_input)[0])

    if hasattr(model, "predict_proba"):
        try:
            probabilities = model.predict_proba(model_input)[0]
            classes = getattr(model, "classes_", [])

            for index, class_label in enumerate(classes):
                if normalize_label(class_label) in positive_labels:
                    return prediction, float(probabilities[index])

            max_probability = float(max(probabilities))
            return prediction, max_probability if prediction in positive_labels else 1 - max_probability
        except Exception:
            pass

    if hasattr(model, "decision_function"):
        try:
            decision = model.decision_function(model_input)
            raw_value = decision[0] if hasattr(decision, "__len__") else decision

            if hasattr(raw_value, "__len__"):
                raw_value = max(raw_value)

            bounded_value = max(min(float(raw_value), 18.0), -18.0)
            probability = 1.0 / (1.0 + math.exp(-bounded_value))
            return prediction, probability if prediction in positive_labels else 1 - probability
        except Exception:
            pass

    return prediction, 0.88 if prediction in positive_labels else 0.12


text_artifact = load_model_artifact("message_model.pkl", "message_vectorizer.pkl")
url_artifact = load_model_artifact("url_model.pkl")
image_artifact = load_model_artifact("image_model.pkl")


app = FastAPI(
    title=SERVICE_NAME,
    version="2.2.0",
    summary="Unified Multilingual Verification API for TruthLens",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_origin_regex=CORS_ORIGIN_REGEX,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


def build_response(
    scan_type: str,
    status: str,
    risk_score: int,
    confidence: int,
    prediction: str,
    red_flags: list[str],
    explanation: str,
    recommendation: str,
    signal_breakdown: list[dict[str, Any]],
    metadata: dict[str, Any] | None = None,
    text_context: dict[str, Any] | None = None,
    persuasion_context: dict[str, Any] | None = None,
    image_context: dict[str, Any] | None = None,
    confidence_interval: tuple[int, int] | None = None,
    shap_context: dict[str, Any] | None = None,
) -> VerificationResponse:
    conf_low, conf_high = confidence_interval or (clamp_score(confidence - 8), clamp_score(confidence + 8))
    return VerificationResponse(
        type=scan_type,
        status=status,
        riskScore=clamp_score(risk_score),
        riskLevel=get_risk_level(clamp_score(risk_score)),
        confidence=clamp_score(confidence),
        confidenceLow=conf_low,
        confidenceHigh=conf_high,
        prediction=prediction,
        redFlags=red_flags if red_flags else ["No major red flags detected"],
        explanation=explanation,
        recommendation=recommendation,
        signalBreakdown=[SignalMetric(label=item["label"], value=clamp_score(item["value"])) for item in signal_breakdown],
        metadata=metadata or {},
        **(text_context or {}),
        **(persuasion_context or {}),
        **(image_context or {}),
        **(shap_context or {}),
    )


def get_text_status(risk_score: int) -> str:
    if risk_score >= 70:
        return "Scam Detected"
    if risk_score >= 40:
        return "Suspicious Message"
    return "Likely Safe"


def get_url_status(risk_score: int) -> str:
    if risk_score >= 70:
        return "Unsafe Link"
    if risk_score >= 40:
        return "Review Link"
    return "Likely Safe"


def get_image_status(risk_score: int) -> str:
    if risk_score >= 70:
        return "Threat / Manipulation Detected"
    if risk_score >= 40:
        return "Review Recommended"
    return "Likely Authentic"


def get_text_recommendation(risk_level: str, language_code: str = "en") -> str:
    if risk_level == "High":
        if language_code == "kn":
            return "ಈ ಲಿಂಕ್ ಅನ್ನು ಕ್ಲಿಕ್ ಮಾಡಬೇಡಿ. ನಿಮ್ಮ OTP ಅಥವಾ ಬ್ಯಾಂಕ್ ವಿವರಗಳನ್ನು ಹಂಚಿಕೊಳ್ಳಬೇಡಿ. ಅಧಿಕೃತ ಮೂಲದ ಮೂಲಕ ಪರಿಶೀಲಿಸಿ."
        if language_code == "hi":
            return "इस लिंक पर क्लिक न करें। अपना ओटीपी या बैंक विवरण साझा न करें। आधिकारिक चैनल के माध्यम से पुष्टि करें।"
        if language_code == "te":
            return "ఈ లింక్‌ను క్లిక్ చేయవద్దు. మీ ఓటీపీ లేదా బ్యాంక్ వివరాలను పంచుకోవద్దు. అధికారిక ఛానెల్ ద్వారా ధృవీకరించండి."
        if language_code == "ta":
            return "இந்த இணைப்பை கிளிக் செய்ய வேண்டாம். உங்கள் ஓடிபி அல்லது வங்கி விவரங்களை பகிர வேண்டாம்."
        if language_code == "ml":
            return "ഈ ലിങ്കിൽ ക്ലിക്ക് ചെയ്യരുത്. നിങ്ങളുടെ ഒടിപിയോ ബാങ്ക് വിവരങ്ങളോ പങ്കിടരുത്."
        if language_code == "mr":
            return "या लिंकवर क्लिक करू नका. तुमचा ओटीपी किंवा बँक तपशील कोणालाही सांगू नका."
        if language_code == "bn":
            return "এই লিঙ্কে ক্লিক করবেন না। আপনার ওটিপি বা ব্যাংক বিবরণ শেয়ার করবেন না।"
        return "Do not reply or share OTP, passwords, or banking details. Verify the sender through an official channel."

    if risk_level == "Medium":
        return "Pause before acting, validate the sender independently, and avoid opening links until confirmed."
    return "Stay cautious and verify the sender if the request still feels unusual."


def get_url_recommendation(risk_level: str) -> str:
    if risk_level == "High":
        return "Do not open this link or submit credentials. Check the destination through an official website or app."
    if risk_level == "Medium":
        return "Inspect the domain carefully before opening it and avoid entering sensitive details."
    return "Continue with caution and confirm the exact domain spelling before visiting the page."


def get_image_recommendation(risk_level: str) -> str:
    if risk_level == "High":
        return "Do not trust this image as evidence on its own. Cross-check it with the original source and trusted references."
    if risk_level == "Medium":
        return "Request the original file or source context before relying on this image."
    return "The image appears lower risk, but important decisions should still be validated with source context."


def build_text_explanation(risk_score: int, red_flags: list[str], used_fallback: bool = False, detected_lang: str = "English") -> str:
    if risk_score >= 70:
        explanation = f"The submitted {detected_lang} message contains critical threat indicators such as {', '.join(red_flags[:3])}."
    elif risk_score >= 40:
        explanation = f"The submitted {detected_lang} message shows cautionary patterns with suspicious cues such as {', '.join(red_flags[:3])}."
    else:
        explanation = f"The submitted {detected_lang} message shows safe content with no strong fraud or coercion indicators."

    if used_fallback and risk_score >= 40:
        return f"{explanation} Evaluated using multilingual keyword and pattern heuristics."

    return explanation


def append_text_processing_context(
    explanation: str,
    detected_language: str,
    translation_status: str,
    rectified_text: bool,
    translation_warning: str | None,
) -> str:
    notes = [explanation]

    if translation_status == "translated":
        notes.append(
            f"The backend detected {detected_language} input and normalized it into English for cross-engine verification."
        )
    elif translation_status == "partial":
        notes.append(
            f"The backend detected {detected_language} input and analyzed language-specific keywords."
        )
    elif rectified_text:
        notes.append("The backend normalized Unicode formatting and token structures before scoring.")

    if translation_warning:
        notes.append(translation_warning)

    return " ".join(notes)


def normalize_url(value: str) -> str:
    trimmed = value.strip()
    if "://" in trimmed:
        return trimmed
    return f"https://{trimmed}"


def build_url_explanation(risk_score: int, red_flags: list[str], used_fallback: bool = False) -> str:
    if risk_score >= 70:
        explanation = f"This URL has phishing-style characteristics driven by signals such as {', '.join(red_flags[:3])}."
    elif risk_score >= 40:
        explanation = f"This URL needs manual review because it contains caution signals such as {', '.join(red_flags[:3])}."
    else:
        explanation = "The link looks safer than a typical phishing URL, but domain spelling should still be checked before opening."

    if used_fallback:
        return f"{explanation} Safe heuristic scoring evaluated the destination domain."

    return explanation


def build_image_explanation(risk_score: int, red_flags: list[str], used_ml: bool = False, ocr_text: str | None = None, detected_lang: str | None = None) -> str:
    if risk_score >= 70:
        if ocr_text:
            explanation = f"The image screenshot contains suspicious {detected_lang or 'text'} content with threat cues ({', '.join(red_flags[:3])})."
        else:
            explanation = f"The image shows multiple manipulation-style cues including {', '.join(red_flags[:3])}."
    elif risk_score >= 40:
        explanation = f"The image has caution indicators, including {', '.join(red_flags[:3])}."
    else:
        explanation = "The current scan found no strong manipulation or fraud signals in this image."

    return explanation


def extract_text_red_flags(content: str) -> list[str]:
    lowered = content.lower()
    matched = [term for term in TEXT_RED_FLAG_TERMS if term in lowered]

    if "http://" in lowered or "https://" in lowered or "www." in lowered:
        matched.append("link included")

    if any(token.isupper() and len(token) >= 4 for token in content.split()):
        matched.append("all-caps pressure")

    return dedupe(matched)[:8]


def get_text_rule_signals(content: str) -> list[dict[str, int | str]]:
    lowered = content.lower()
    return [
        {"label": "Urgency Signals", "value": score_from_keyword_hits(lowered, TEXT_SIGNAL_GROUPS["Urgency Signals"], base=5, weight=22)},
        {"label": "Credential Bait", "value": score_from_keyword_hits(lowered, TEXT_SIGNAL_GROUPS["Credential Bait"], base=5, weight=24)},
        {"label": "Link Pressure", "value": score_from_keyword_hits(lowered, TEXT_SIGNAL_GROUPS["Link Pressure"], base=5, weight=20)},
        {"label": "Reward Trigger", "value": score_from_keyword_hits(lowered, TEXT_SIGNAL_GROUPS["Reward Trigger"], base=5, weight=18)},
    ]


def get_text_heuristic_score(signals: list[dict[str, int | str]], content: str, red_flags: list[str]) -> int:
    if not red_flags:
        return 8

    lowered = content.lower()
    active_categories = sum(1 for s in signals if isinstance(s["value"], (int, float)) and s["value"] >= 18)

    score = (
        signals[0]["value"] * 0.28
        + signals[1]["value"] * 0.34
        + signals[2]["value"] * 0.20
        + signals[3]["value"] * 0.18
        + min(len(red_flags) * 5, 20)
    )

    if active_categories >= 3:
        score = max(score, 82)
    elif active_categories >= 2 and any(isinstance(s["value"], (int, float)) and s["value"] >= 25 for s in signals):
        score = max(score, 75)
    elif len(red_flags) >= 3:
        score = max(score, 72)
    elif len(red_flags) >= 2:
        score = max(score, 50)

    if any(k in lowered for k in ("suspended", "blocked", "disconnected", "arrest", "legal action", "verify", "click here", "click this link")):
        if any(w in lowered for w in ("account", "bank", "electricity", "card", "otp", "password")):
            score = max(score, 80)

    if "otp" in lowered and any(word in lowered for word in ("bank", "account", "wallet", "share")):
        score = max(score, 88)

    return clamp_score(score, 6, 98)


def extract_url_red_flags(raw_url: str, host: str, path_and_query: str) -> list[str]:
    combined = f"{host}{path_and_query}".lower()
    matched = [term for term in URL_RED_FLAG_TERMS if term in combined]

    if raw_url.lower().startswith("http://"):
        matched.append("http only")
    if host in SHORTENED_DOMAINS:
        matched.append("shortened link")
    if any(host.endswith(tld) for tld in SUSPICIOUS_TLDS):
        matched.append("risky domain suffix")
    if host.count(".") >= 3:
        matched.append("multi-subdomain pattern")
    if "xn--" in host:
        matched.append("punycode")
    if any(char.isdigit() for char in host):
        matched.append("numeric domain pattern")

    return dedupe(matched)[:8]


def get_url_rule_signals(raw_url: str, host: str, path_and_query: str) -> list[dict[str, int | str]]:
    combined = f"{raw_url.lower()} {host.lower()} {path_and_query.lower()}"
    transport_score = 88 if raw_url.lower().startswith("https://") else 24
    structure_score = 22

    if host.count(".") >= 3:
        structure_score += 20
    if "-" in host:
        structure_score += 12
    if any(host.endswith(tld) for tld in SUSPICIOUS_TLDS):
        structure_score += 26
    if host in SHORTENED_DOMAINS:
        structure_score += 20
    if "xn--" in host:
        structure_score += 20

    return [
        {"label": "Domain Spoofing", "value": score_from_keyword_hits(combined, URL_SIGNAL_GROUPS["Domain Spoofing"], base=8, weight=18)},
        {"label": "Transport Risk", "value": 100 - clamp_score(transport_score)},
        {"label": "Credential Trap", "value": score_from_keyword_hits(combined, URL_SIGNAL_GROUPS["Credential Trap"], base=8, weight=19)},
        {"label": "Structural Risk", "value": clamp_score(structure_score)},
    ]


def get_url_heuristic_score(signals: list[dict[str, int | str]], red_flags: list[str]) -> int:
    score = (
        signals[0]["value"] * 0.34
        + signals[1]["value"] * 0.18
        + signals[2]["value"] * 0.24
        + signals[3]["value"] * 0.24
        + min(len(red_flags) * 1.5, 10)
    )
    return clamp_score(score, 5, 98)


def get_image_signal_breakdown(
    file_name: str,
    width: int,
    height: int,
    stddev_mean: float,
    bytes_per_pixel: float,
    has_alpha: bool,
    heuristic_score: int,
) -> list[dict[str, int | str]]:
    avatar_score = 18
    aspect_ratio = width / max(height, 1)

    if 0.95 <= aspect_ratio <= 1.05:
        avatar_score += 28
    if width < 800 or height < 800:
        avatar_score += 18

    synthetic_name_score = 10 + sum(1 for term in IMAGE_NAME_RED_FLAGS if term in file_name.lower()) * 18
    texture_score = clamp_score(100 - stddev_mean * 2.2, 6, 96)
    compression_score = clamp_score(20 + (0.18 - bytes_per_pixel) * 180 if bytes_per_pixel < 0.18 else 12, 6, 92)
    transparency_score = 72 if has_alpha else 12

    return [
        {"label": "Avatar Pattern", "value": clamp_score(avatar_score)},
        {"label": "Synthetic Naming", "value": clamp_score(synthetic_name_score)},
        {"label": "Texture Uniformity", "value": texture_score},
        {"label": "Compression Trace", "value": compression_score},
        {"label": "Heuristic Risk", "value": heuristic_score},
        {"label": "Alpha Layer Signal", "value": transparency_score},
    ]


def get_model_based_score(
    artifact: ModelArtifact,
    raw_value: Any,
    positive_labels: set[str],
) -> tuple[str | None, int | None, str | None]:
    if artifact.model is None:
        return None, None, artifact.error

    try:
        model_input = prepare_model_input(artifact, raw_value)
        prediction_label, probability = get_positive_probability(artifact.model, model_input, positive_labels)
        return prediction_label, clamp_score(probability * 100), None
    except Exception as exc:
        return None, None, str(exc)


def get_image_model_score(artifact: ModelArtifact, image_bytes: bytes, file_name: str) -> tuple[str | None, int | None, str | None]:
    if artifact.model is None:
        return None, None, artifact.error

    try:
        loaded_model = artifact.model
        pipeline = loaded_model.get("pipeline") if isinstance(loaded_model, dict) else loaded_model
        feature_names = loaded_model.get("feature_names", IMAGE_FEATURE_NAMES) if isinstance(loaded_model, dict) else IMAGE_FEATURE_NAMES
        feature_map = extract_image_features_from_bytes(image_bytes=image_bytes, file_name=file_name)
        feature_frame = pd.DataFrame(
            [{name: feature_map.get(name, 0.0) for name in feature_names}],
            columns=feature_names,
        )
        prediction_label, probability = get_positive_probability(pipeline, feature_frame, IMAGE_POSITIVE_LABELS)
        return prediction_label, clamp_score(probability * 100), None
    except Exception as exc:
        return None, None, str(exc)


@app.get("/")
def root() -> dict[str, Any]:
    return {
        "service": SERVICE_NAME,
        "message": f"{SERVICE_NAME} is running with full 8-language multilingual verification.",
        "docs": "/docs",
        "health": "/api/health",
        "languages": list(SUPPORTED_LANGUAGES.keys()),
        "timestamp": utc_now_iso(),
    }


@app.get("/api/health")
@app.get("/health")
def health_check() -> dict[str, Any]:
    from services.clip_image_analyzer import _clip_ready, _clip_load_error
    return {
        "service": SERVICE_NAME,
        "status": "ok",
        "timestamp": utc_now_iso(),
        "features": {
            "multilingualTextNormalization": True,
            "supportedTextLanguages": list(SUPPORTED_LANGUAGES.values()),
            "persuasionPatternClassifier": True,
            "clipImageDetector": _clip_ready,
            "c2paProvenanceCheck": True,
            "multilingualOcr": is_easyocr_available(),
        },
        "models": {
            "messageModel": text_artifact.model is not None,
            "messageVectorizer": text_artifact.vectorizer is not None,
            "urlModel": url_artifact.model is not None,
            "imageModel": image_artifact.model is not None,
            "clipModel": _clip_ready,
            "ocrEngine": is_easyocr_available(),
        },
        "sources": {
            "messageModel": text_artifact.source,
            "urlModel": url_artifact.source,
            "imageModel": image_artifact.source,
            "clipModel": "openai/clip-vit-base-patch32" if _clip_ready else (_clip_load_error or "not loaded"),
        },
        "errors": {
            "messageModel": text_artifact.error,
            "urlModel": url_artifact.error,
            "imageModel": image_artifact.error,
        },
        "routes": [
            "POST /api/verify/text",
            "POST /api/verify/image",
            "POST /api/verify/url",
            "POST /api/explain",
        ],
    }


@app.post("/api/explain")
def explain_analytics(payload: ExplanationRequest) -> dict[str, Any]:
    explanation = generate_explanation(payload)
    return {
        "explanation": explanation,
        "timestamp": utc_now_iso(),
    }


@app.post("/api/verify/text", response_model=VerificationResponse)
def verify_text(payload: TextVerificationRequest) -> VerificationResponse:
    text = payload.text.strip()
    if not text:
        raise HTTPException(status_code=400, detail="Text input is required.")

    # Step 1 — Multilingual normalization and language detection
    language_hint = payload.language if payload.language and payload.language != "auto" else None
    processed_text = preprocess_text_for_analysis(text, selected_language=language_hint)
    analysis_text = processed_text.analysis_text or text
    used_translated_text = processed_text.translation_status in {"translated", "partial"}

    # Step 2 — Check if text contains embedded URLs (Multilingual Text + URL support)
    embedded_urls = re.findall(r"https?://[^\s]+", text)
    url_risk_score = 0
    url_red_flags: list[str] = []
    if embedded_urls:
        first_url = normalize_url(embedded_urls[0])
        try:
            parsed_u = urlparse(first_url)
            if parsed_u.netloc:
                u_host = parsed_u.netloc.lower()
                u_path = f"{parsed_u.path or ''}{parsed_u.query or ''}"
                url_red_flags = extract_url_red_flags(first_url, u_host, u_path)
                u_signals = get_url_rule_signals(first_url, u_host, u_path)
                u_heur = get_url_heuristic_score(u_signals, url_red_flags)
                _, u_ml, _ = get_model_based_score(url_artifact, first_url, URL_POSITIVE_LABELS)
                url_risk_score = u_heur if u_ml is None else clamp_score(u_ml * 0.8 + u_heur * 0.2)
        except Exception:
            pass

    # Step 3 — Keyword heuristics + ML model
    red_flags = extract_text_red_flags(analysis_text)
    for kw in processed_text.suspicious_keywords:
        if kw.lower() not in [r.lower() for r in red_flags]:
            red_flags.append(kw)

    rule_signals = get_text_rule_signals(analysis_text)
    heuristic_score = get_text_heuristic_score(rule_signals, analysis_text, red_flags)
    prediction_label, ml_score, model_error = get_model_based_score(text_artifact, analysis_text, TEXT_POSITIVE_LABELS)
    used_fallback = ml_score is None

    # CRITICAL: If no threat signals or keywords are matched in benign content, ensure safe low base score
    has_threat_signals = bool(red_flags) or any(s["value"] > 20 for s in rule_signals)
    if not has_threat_signals and (ml_score is None or ml_score < 30):
        base_score = 8
    elif used_fallback:
        base_score = heuristic_score
    elif used_translated_text:
        translated_blend = clamp_score(ml_score * 0.40 + heuristic_score * 0.60)
        base_score = max(heuristic_score, translated_blend)
    else:
        base_score = clamp_score(ml_score * 0.78 + heuristic_score * 0.22)

    # Step 4 — Persuasion-pattern classifier
    persuasion = analyze_persuasion_patterns(text, analysis_text)

    HIGH_SEVERITY_SINGLE_PATTERNS = {
        "Blackmail and Sextortion",
        "Crypto and Investment Lure",
        "Fake Prize and Fee Fraud",
        "Bank Detail Change Fraud",
        "Family Emergency Money Request",
    }

    if persuasion.persuasion_score > 15:
        persuasion_scaled = clamp_score(persuasion.persuasion_score * 1.4, 0, 100)
        ml_says_safe = (ml_score is not None) and (ml_score < 30)
        persuasion_is_strong = persuasion.persuasion_score >= 35

        if used_fallback or (ml_says_safe and persuasion_is_strong):
            persuasion_weight = 0.80
            base_weight = 0.20
        else:
            persuasion_weight = 0.35
            base_weight = 0.65

        risk_score = clamp_score(base_score * base_weight + persuasion_scaled * persuasion_weight)

        if len(persuasion.patterns_detected) >= 4:
            risk_score = max(risk_score, 75)
        elif len(persuasion.patterns_detected) >= 3:
            risk_score = max(risk_score, 72)
        elif len(persuasion.patterns_detected) >= 2:
            risk_score = max(risk_score, 50)

        if any(p in HIGH_SEVERITY_SINGLE_PATTERNS for p in persuasion.patterns_detected):
            risk_score = max(risk_score, 72)
    else:
        risk_score = base_score

    # Step 5 — Blend URL risk if embedded link was analyzed
    if url_risk_score >= 45:
        risk_score = max(risk_score, clamp_score(risk_score * 0.6 + url_risk_score * 0.4))
        red_flags.append("suspicious link in message")
        for urf in url_red_flags:
            red_flags.append(f"url: {urf}")

    for pattern in persuasion.patterns_detected:
        red_flags.append(pattern.lower())
    red_flags = dedupe(red_flags)[:10]

    risk_level = get_risk_level(risk_score)
    if used_fallback:
        confidence = clamp_score(52 + abs(risk_score - 50) * 0.58)
    elif used_translated_text:
        confidence = clamp_score(57 + abs(risk_score - 50) * 0.62)
    else:
        confidence = clamp_score(60 + abs(risk_score - 50) * 0.72)

    prediction = "Scam" if risk_score >= 50 else "Safe"
    signal_breakdown = [
        *rule_signals,
        {"label": "ML Scam Score", "value": ml_score or heuristic_score},
        {"label": "Persuasion Score", "value": persuasion.persuasion_score},
    ]
    if url_risk_score > 0:
        signal_breakdown.append({"label": "Embedded URL Risk", "value": url_risk_score})

    explanation = append_text_processing_context(
        explanation=build_text_explanation(
            risk_score,
            red_flags or ["no red flags detected"],
            used_fallback=used_fallback,
            detected_lang=processed_text.detected_language,
        ),
        detected_language=processed_text.detected_language,
        translation_status=processed_text.translation_status,
        rectified_text=processed_text.rectified_text,
        translation_warning=processed_text.translation_warning,
    )
    if persuasion.patterns_detected:
        explanation = f"{explanation} {persuasion.explanation}"
    if url_risk_score >= 45:
        explanation = f"{explanation} Embedded link scored {url_risk_score}% threat risk."

    shap_result = explain_text_prediction(text_artifact.model, text_artifact.vectorizer, analysis_text) if not used_fallback else None
    conf_low, conf_high = get_confidence_interval(confidence, used_fallback, len(signal_breakdown))

    if shap_result and shap_result.available and shap_result.top_risk_features:
        top_features = ", ".join(f'"{f}"' for f in shap_result.top_risk_features[:3])
        explanation = f"{explanation} Key contributing features: {top_features}."

    return build_response(
        scan_type="text",
        status=get_text_status(risk_score),
        risk_score=risk_score,
        confidence=confidence,
        prediction=prediction,
        red_flags=red_flags or ["No major red flags detected"],
        explanation=explanation,
        recommendation=get_text_recommendation(risk_level, processed_text.detected_language_code),
        signal_breakdown=signal_breakdown,
        confidence_interval=(conf_low, conf_high),
        text_context={
            "originalText": processed_text.original_text,
            "detectedLanguage": processed_text.detected_language,
            "detectedLanguageCode": processed_text.detected_language_code,
            "languageConfidence": processed_text.language_confidence,
            "languages": processed_text.languages,
            "isMixed": processed_text.is_mixed,
            "correctedText": processed_text.corrected_text,
            "englishText": processed_text.english_text,
            "suspiciousKeywords": processed_text.suspicious_keywords,
            "normalizationStatus": processed_text.normalization_status,
            "tokenizationStatus": processed_text.tokenization_status,
            "languageDetectionStatus": processed_text.language_detection_status,
            "threatPatternStatus": processed_text.threat_pattern_status,
        },
        persuasion_context={
            "persuasionScore": persuasion.persuasion_score,
            "persuasionPatterns": persuasion.patterns_detected,
            "persuasionExplanation": persuasion.explanation,
        },
        shap_context={
            "shapAvailable": shap_result.available if shap_result else False,
            "shapTopRisk": shap_result.top_risk_features if shap_result else [],
            "shapTopSafe": shap_result.top_safe_features if shap_result else [],
        },
        metadata={
            "engine": artifact_engine_label(text_artifact),
            "modelSource": text_artifact.source,
            "fallbackUsed": used_fallback,
            "modelError": model_error,
            "inputLength": len(text),
            "normalizedLength": len(analysis_text),
            "rawPrediction": prediction_label,
            "originalText": processed_text.original_text,
            "normalizedText": analysis_text,
            "correctedText": processed_text.corrected_text,
            "englishText": processed_text.english_text,
            "detectedLanguage": processed_text.detected_language,
            "detectedLanguageCode": processed_text.detected_language_code,
            "languageConfidence": processed_text.language_confidence,
            "languages": processed_text.languages,
            "isMixed": processed_text.is_mixed,
            "languageDetectionMethod": processed_text.detection_method,
            "translationApplied": processed_text.translation_applied,
            "translationStatus": processed_text.translation_status,
            "rectifiedText": processed_text.rectified_text,
            "translationWarning": processed_text.translation_warning,
            "processingNotes": " ".join(processed_text.processing_notes),
            "normalizedKeywords": ", ".join(processed_text.matched_terms),
            "suspiciousKeywords": processed_text.suspicious_keywords,
            "textProcessor": processed_text.processor,
            "textProcessorError": processed_text.processor_error,
            "shapTopRisk": shap_result.top_risk_features if shap_result else [],
            "shapTopSafe": shap_result.top_safe_features if shap_result else [],
            "shapError": shap_result.error if shap_result else None,
            "confidenceLow": conf_low,
            "confidenceHigh": conf_high,
        },
    )


@app.post("/api/verify/url", response_model=VerificationResponse)
def verify_url(payload: UrlVerificationRequest) -> VerificationResponse:
    normalized_url = normalize_url(payload.url)

    try:
        parsed = urlparse(normalized_url)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="URL format is invalid.") from exc

    if not parsed.netloc:
        raise HTTPException(status_code=400, detail="URL format is invalid.")

    host = parsed.netloc.lower()
    path_and_query = f"{parsed.path or ''}{parsed.query or ''}"
    red_flags = extract_url_red_flags(normalized_url, host, path_and_query)
    rule_signals = get_url_rule_signals(normalized_url, host, path_and_query)
    heuristic_score = get_url_heuristic_score(rule_signals, red_flags)
    prediction_label, ml_score, model_error = get_model_based_score(url_artifact, normalized_url, URL_POSITIVE_LABELS)
    used_fallback = ml_score is None
    risk_score = heuristic_score if used_fallback else clamp_score(ml_score * 0.8 + heuristic_score * 0.2)

    whois_result = check_domain_age(host)
    if whois_result.is_very_new:
        red_flags.append("very new domain")
        risk_score = clamp_score(risk_score + whois_result.risk_score_delta)
    elif whois_result.is_new_domain:
        red_flags.append("recently registered domain")
        risk_score = clamp_score(risk_score + whois_result.risk_score_delta)
    elif whois_result.risk_label == "trusted domain":
        risk_score = clamp_score(risk_score + whois_result.risk_score_delta)
    elif whois_result.risk_label == "established domain":
        risk_score = clamp_score(risk_score + whois_result.risk_score_delta)

    risk_level = get_risk_level(risk_score)
    confidence = (
        clamp_score(52 + abs(risk_score - 50) * 0.55)
        if used_fallback
        else clamp_score(60 + abs(risk_score - 50) * 0.7)
    )
    prediction = "Phishing" if risk_score >= 50 else "Safe"
    signal_breakdown = [
        *rule_signals,
        {"label": "ML Phishing Score", "value": ml_score or heuristic_score},
    ]
    if whois_result.available and whois_result.age_days is not None:
        signal_breakdown.append({
            "label": "Domain Age Risk",
            "value": clamp_score(max(0, 90 - whois_result.age_days // 4)) if whois_result.age_days < 365 else 5,
        })

    shap_result = explain_url_prediction(url_artifact.model, normalized_url) if not used_fallback else None
    conf_low, conf_high = get_confidence_interval(confidence, used_fallback, len(signal_breakdown))

    url_explanation = build_url_explanation(risk_score, red_flags or ["suspicious domain structure"], used_fallback=used_fallback)
    if whois_result.available and whois_result.age_days is not None:
        url_explanation = f"{url_explanation} {whois_result.summary}"
    if shap_result and shap_result.available and shap_result.top_risk_features:
        top_features = ", ".join(f'"{f}"' for f in shap_result.top_risk_features[:3])
        url_explanation = f"{url_explanation} Top risk features: {top_features}."

    return build_response(
        scan_type="url",
        status=get_url_status(risk_score),
        risk_score=risk_score,
        confidence=confidence,
        prediction=prediction,
        red_flags=dedupe(red_flags) or ["suspicious domain structure"],
        explanation=url_explanation,
        recommendation=get_url_recommendation(risk_level),
        signal_breakdown=signal_breakdown,
        confidence_interval=(conf_low, conf_high),
        shap_context={
            "shapAvailable": shap_result.available if shap_result else False,
            "shapTopRisk": shap_result.top_risk_features if shap_result else [],
            "shapTopSafe": shap_result.top_safe_features if shap_result else [],
        },
        metadata={
            "engine": artifact_engine_label(url_artifact),
            "modelSource": url_artifact.source,
            "fallbackUsed": used_fallback,
            "modelError": model_error,
            "host": host,
            "scheme": parsed.scheme,
            "rawPrediction": prediction_label,
            "whois": {
                "domain": whois_result.domain,
                "ageDays": whois_result.age_days,
                "registeredOn": whois_result.registered_on,
                "registrar": whois_result.registrar,
                "riskLabel": whois_result.risk_label,
                "summary": whois_result.summary,
                "error": whois_result.error,
            },
            "shapTopRisk": shap_result.top_risk_features if shap_result else [],
            "shapTopSafe": shap_result.top_safe_features if shap_result else [],
            "confidenceLow": conf_low,
            "confidenceHigh": conf_high,
        },
    )


@app.post("/api/verify/image", response_model=VerificationResponse)
async def verify_image(
    image: UploadFile = File(...),
    language: Optional[str] = Form(default="auto"),
) -> VerificationResponse:
    if not image.filename:
        raise HTTPException(status_code=400, detail="Image file is required.")

    image_bytes = await image.read()
    if not image_bytes:
        raise HTTPException(status_code=400, detail="Image file is empty.")

    try:
        pil_image = Image.open(io.BytesIO(image_bytes))
        pil_image.load()
    except UnidentifiedImageError as exc:
        raise HTTPException(status_code=400, detail="Unsupported image format.") from exc

    rgb_image = pil_image.convert("RGB")
    resized = rgb_image.resize((128, 128))
    stat = ImageStat.Stat(resized)
    stddev_mean = sum(stat.stddev) / len(stat.stddev)
    width, height = pil_image.size
    file_name = image.filename.lower()
    bytes_per_pixel = len(image_bytes) / max(width * height, 1)
    has_alpha = "A" in pil_image.getbands()

    # Step 1 — Forensic Heuristics
    heuristic_score = 14
    red_flags: list[str] = []

    if width < 800 or height < 800:
        heuristic_score += 18
        red_flags.append("low resolution")

    aspect_ratio = width / max(height, 1)
    if 0.95 <= aspect_ratio <= 1.05:
        heuristic_score += 10
        red_flags.append("avatar-style crop")

    matched_name_terms = [term for term in IMAGE_NAME_RED_FLAGS if term in file_name]
    if matched_name_terms:
        heuristic_score += 10 + len(matched_name_terms) * 6
        red_flags.append("synthetic-style filename")

    if stddev_mean < 28:
        heuristic_score += 18
        red_flags.append("low texture variance")

    if bytes_per_pixel < 0.18:
        heuristic_score += 14
        red_flags.append("heavy compression")

    if has_alpha:
        heuristic_score += 12
        red_flags.append("alpha layer present")

    heuristic_score = clamp_score(heuristic_score, 6, 96)

    # Step 2 — Trained Image Model
    prediction_label, ml_score, model_error = get_image_model_score(image_artifact, image_bytes, file_name)
    used_ml = ml_score is not None

    # Step 3 — CLIP AI detector
    clip_result = analyze_image_with_clip(image_bytes)
    if clip_result.available and clip_result.ai_score > 40:
        red_flags.append("clip: ai-generated visual pattern")

    # Step 4 — C2PA provenance check
    mime_type = image.content_type or "image/jpeg"
    c2pa_result = check_c2pa_provenance(image_bytes, mime_type)
    if c2pa_result.risk_signal == "tampered":
        red_flags.append("c2pa: manifest tampered")
    elif c2pa_result.risk_signal == "no-credentials" and clip_result.available and clip_result.ai_score > 55:
        red_flags.append("c2pa: no content credentials")

    # Step 5 — Multilingual OCR Analysis
    ocr_result = extract_text_from_image(image_bytes, language_hint=language)
    ocr_text_risk = 0
    ocr_detected_language = "English"
    ocr_language_code = "en"
    ocr_confidence = ocr_result.confidence
    ocr_processed_result = None

    if ocr_result.available and ocr_result.text.strip():
        ocr_processed_result = preprocess_text_for_analysis(ocr_result.text, selected_language=language)
        ocr_analysis_text = ocr_processed_result.analysis_text or ocr_result.text
        ocr_detected_language = ocr_processed_result.detected_language
        ocr_language_code = ocr_processed_result.detected_language_code

        ocr_flags = extract_text_red_flags(ocr_analysis_text)
        for kw in ocr_processed_result.suspicious_keywords:
            if kw.lower() not in [r.lower() for r in ocr_flags]:
                ocr_flags.append(kw)

        ocr_signals = get_text_rule_signals(ocr_analysis_text)
        ocr_heur = get_text_heuristic_score(ocr_signals, ocr_analysis_text, ocr_flags)
        _, ocr_ml_score, _ = get_model_based_score(text_artifact, ocr_analysis_text, TEXT_POSITIVE_LABELS)
        ocr_text_risk = ocr_heur if ocr_ml_score is None else clamp_score(ocr_ml_score * 0.65 + ocr_heur * 0.35)

        ocr_persuasion = analyze_persuasion_patterns(ocr_result.text, ocr_analysis_text)
        if ocr_persuasion.persuasion_score > 15:
            ocr_text_risk = max(ocr_text_risk, clamp_score(ocr_persuasion.persuasion_score * 1.3))

        if ocr_text_risk >= 50:
            for flag in ocr_flags:
                red_flags.append(f"ocr: {flag}")
            for p in ocr_persuasion.patterns_detected:
                red_flags.append(f"ocr: {p.lower()}")

    # Step 6 — Blend all signals (Visual forensics + OCR text threat)
    if clip_result.available and used_ml:
        visual_blended = clamp_score(heuristic_score * 0.25 + ml_score * 0.20 + clip_result.ai_score * 0.55)
    elif clip_result.available:
        visual_blended = clamp_score(heuristic_score * 0.35 + clip_result.ai_score * 0.65)
    elif used_ml:
        visual_blended = clamp_score(heuristic_score * 0.62 + ml_score * 0.38)
    else:
        visual_blended = heuristic_score

    if ocr_result.available and ocr_result.text.strip():
        # Text screenshots: OCR threat is significant signal
        if ocr_text_risk >= 50:
            final_risk = max(visual_blended, clamp_score(visual_blended * 0.35 + ocr_text_risk * 0.65))
        else:
            final_risk = clamp_score(visual_blended * 0.70 + ocr_text_risk * 0.30)
    else:
        final_risk = visual_blended

    risk_score = clamp_score(final_risk + c2pa_result.risk_score_delta, 1, 99)
    risk_level = get_risk_level(risk_score)

    confidence = clamp_score(
        (64 if (clip_result.available or used_ml or (ocr_result.available and ocr_result.text)) else 56)
        + abs(risk_score - 50) * 0.74
    )

    signal_breakdown = get_image_signal_breakdown(
        file_name=file_name,
        width=width,
        height=height,
        stddev_mean=stddev_mean,
        bytes_per_pixel=bytes_per_pixel,
        has_alpha=has_alpha,
        heuristic_score=heuristic_score,
    )
    signal_breakdown.append({"label": "ML Image Score", "value": ml_score or heuristic_score})
    if clip_result.available:
        signal_breakdown.append({"label": "CLIP AI Score", "value": clip_result.ai_score})
    if ocr_result.available and ocr_result.text.strip():
        signal_breakdown.append({"label": f"OCR Text Threat ({ocr_detected_language})", "value": ocr_text_risk})

    explanation = build_image_explanation(
        risk_score,
        dedupe(red_flags) or ["no manipulation indicators"],
        used_ml=used_ml,
        ocr_text=ocr_result.text if ocr_result.available else None,
        detected_lang=ocr_detected_language,
    )
    if clip_result.available:
        clip_verdict = "likely AI-generated" if clip_result.ai_score >= 50 else "likely authentic"
        explanation = f"{explanation} CLIP vision model assessed visual authenticity at {clip_result.ai_score}% AI probability."
    if c2pa_result.available:
        explanation = f"{explanation} {c2pa_result.summary}"
    if ocr_result.available and ocr_result.text.strip():
        explanation = f"{explanation} OCR extracted {ocr_result.word_count} words in {ocr_detected_language}."

    return build_response(
        scan_type="image",
        status=get_image_status(risk_score),
        risk_score=risk_score,
        confidence=confidence,
        prediction="Fake" if risk_score >= 50 else "Real",
        red_flags=dedupe(red_flags) or ["No major red flags detected"],
        explanation=explanation,
        recommendation=get_image_recommendation(risk_level),
        signal_breakdown=signal_breakdown,
        image_context={
            "clipAiScore": clip_result.ai_score,
            "clipAvailable": clip_result.available,
            "c2paVerified": c2pa_result.is_verified,
            "c2paGenerator": c2pa_result.generator,
            "c2paRiskSignal": c2pa_result.risk_signal,
            "ocrText": ocr_result.text if ocr_result.available else None,
            "ocrDetected": bool(ocr_result.available and ocr_result.text),
            "ocrConfidence": ocr_confidence,
            "detectedLanguage": ocr_detected_language,
            "detectedLanguageCode": ocr_language_code,
        },
        metadata={
            "engine": "clip+ocr+heuristic+ml" if (clip_result.available and ocr_result.available) else "heuristic-image-analyzer",
            "modelSource": image_artifact.source,
            "fallbackUsed": not used_ml and not clip_result.available,
            "modelError": model_error,
            "width": width,
            "height": height,
            "format": pil_image.format or "unknown",
            "rawPrediction": prediction_label,
            "detectedLanguage": ocr_detected_language,
            "detectedLanguageCode": ocr_language_code,
            "ocrText": ocr_result.text if ocr_result.available else None,
            "ocrConfidence": ocr_confidence,
            "clip": {
                "available": clip_result.available,
                "aiScore": clip_result.ai_score,
                "realScore": clip_result.real_score,
                "topAiPrompt": clip_result.top_ai_prompt,
                "error": clip_result.error,
            },
            "c2pa": {
                "available": c2pa_result.available,
                "hasManifest": c2pa_result.has_manifest,
                "isVerified": c2pa_result.is_verified,
                "isTampered": c2pa_result.is_tampered,
                "generator": c2pa_result.generator,
                "actions": c2pa_result.actions,
                "riskSignal": c2pa_result.risk_signal,
                "summary": c2pa_result.summary,
                "error": c2pa_result.error,
            },
        },
    )


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "main:app",
        host=CONFIG("BACKEND_HOST", cast=str, default="127.0.0.1"),
        port=CONFIG("BACKEND_PORT", cast=int, default=8000),
        reload=CONFIG("BACKEND_RELOAD", cast=bool, default=True),
    )
