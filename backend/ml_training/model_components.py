from __future__ import annotations

import io
import math
import re
from pathlib import Path
from typing import Iterable
from urllib.parse import urlparse

import numpy as np
from PIL import Image, ImageFilter, ImageOps
from scipy import sparse
from sklearn.base import BaseEstimator, TransformerMixin

TEXT_KEYWORD_GROUPS = {
    "otp": ["otp", "pin", "cvv", "passcode", "verification code", "one-time password"],
    "banking": ["bank", "wallet", "upi", "payment", "account", "card", "netbanking"],
    "phishing": ["verify", "login", "click", "tap here", "confirm", "reset", "security alert"],
    "offer": ["reward", "gift", "free", "winner", "refund", "cashback", "prize", "bonus"],
    "urgency": ["urgent", "immediately", "asap", "act now", "final warning", "suspended", "expire"],
}

URL_SUSPICIOUS_WORDS = [
    "login",
    "verify",
    "secure",
    "update",
    "bonus",
    "gift",
    "reward",
    "wallet",
    "crypto",
    "otp",
    "free",
    "bank",
    "signin",
    "confirm",
]
SHORTENER_HOSTS = {"bit.ly", "tinyurl.com", "t.co", "goo.gl", "cutt.ly", "rebrand.ly", "is.gd", "ow.ly", "j.gs"}

IMAGE_FEATURE_NAMES = [
    "width",
    "height",
    "aspect_ratio",
    "gray_mean",
    "gray_std",
    "edge_mean",
    "edge_std",
    "entropy",
    "bright_ratio",
    "dark_ratio",
    "horizontal_symmetry",
    "vertical_symmetry",
    "bytes_per_pixel",
    "is_png",
    "is_jpeg",
    "file_name_flag_count",
]

IMAGE_NAME_RED_FLAGS = {"ai", "deepfake", "synthetic", "generated", "render", "swap", "edit", "fake"}


def normalize_text(text: str) -> str:
    """Normalize text while preserving fraud-relevant tokens."""
    lowered = text.lower().strip()
    lowered = re.sub(r"https?://\S+|www\.\S+", " urltoken ", lowered)
    lowered = re.sub(r"\b[\w\.-]+@[\w\.-]+\.\w+\b", " emailtoken ", lowered)
    lowered = re.sub(r"\b\d{4,}\b", " numbertoken ", lowered)
    lowered = re.sub(r"[^a-z0-9!?$%#@.\s]", " ", lowered)
    lowered = re.sub(r"\s+", " ", lowered)
    return lowered.strip()


def count_phrase_hits(value: str, phrases: Iterable[str]) -> int:
    lowered = value.lower()
    return sum(1 for phrase in phrases if phrase in lowered)


class TextHeuristicTransformer(BaseEstimator, TransformerMixin):
    """Extract compact scam-oriented features that complement TF-IDF."""

    def fit(self, X, y=None):  # noqa: N803 - sklearn signature
        return self

    def transform(self, X):  # noqa: N803 - sklearn signature
        rows = []

        for raw_text in X:
            text = str(raw_text or "")
            normalized = normalize_text(text)
            tokens = normalized.split()
            token_count = len(tokens)
            uppercase_tokens = sum(1 for token in text.split() if token.isupper() and len(token) > 2)
            url_hits = len(re.findall(r"https?://|www\.", text, flags=re.IGNORECASE))
            digit_tokens = len(re.findall(r"\d", text))
            exclamation_count = text.count("!")
            question_count = text.count("?")

            feature_row = [
                len(text),
                token_count,
                uppercase_tokens,
                url_hits,
                digit_tokens,
                exclamation_count,
                question_count,
            ]

            for phrases in TEXT_KEYWORD_GROUPS.values():
                feature_row.append(count_phrase_hits(normalized, phrases))

            feature_row.extend(
                [
                    int(bool(re.search(r"\bclick\s+here\b|\btap\s+here\b", normalized))),
                    int(bool(re.search(r"\burgent\b|\bfinal warning\b|\bsuspended\b", normalized))),
                    int(bool(re.search(r"\botp\b|\bpin\b|\bcvv\b", normalized))),
                    int(bool(re.search(r"\b(bank|wallet|payment|account)\b", normalized))),
                ]
            )

            rows.append(feature_row)

        return sparse.csr_matrix(np.asarray(rows, dtype=np.float32))


class URLFeatureExtractor(BaseEstimator, TransformerMixin):
    """Create numeric phishing indicators from a raw URL string."""

    def fit(self, X, y=None):  # noqa: N803 - sklearn signature
        return self

    def transform(self, X):  # noqa: N803 - sklearn signature
        rows = []

        for raw_url in X:
            url = str(raw_url or "").strip()
            if not re.match(r"^[a-z]+://", url, flags=re.IGNORECASE):
                url = f"https://{url}"

            parsed = urlparse(url)
            host = parsed.netloc.lower()
            path_query = f"{parsed.path}{parsed.query}".lower()
            special_char_count = len(re.findall(r"[^a-zA-Z0-9]", url))
            suspicious_word_hits = sum(word in f"{host}{path_query}" for word in URL_SUSPICIOUS_WORDS)
            is_ip = int(bool(re.fullmatch(r"\d{1,3}(?:\.\d{1,3}){3}", host)))
            digit_count = sum(char.isdigit() for char in host)
            slash_count = url.count("/")
            dot_count = host.count(".")
            dash_count = host.count("-")
            at_count = url.count("@")
            eq_count = url.count("=")
            question_count = url.count("?")
            amp_count = url.count("&")

            row = [
                len(url),
                len(host),
                dot_count,
                int(parsed.scheme == "https"),
                suspicious_word_hits,
                is_ip,
                int(host in SHORTENER_HOSTS),
                special_char_count,
                digit_count,
                slash_count,
                dash_count,
                at_count,
                eq_count,
                question_count,
                amp_count,
                int("xn--" in host),
                int(any(tld and host.endswith(tld) for tld in (".zip", ".xyz", ".click", ".top", ".work", ".fit"))),
            ]
            rows.append(row)

        return sparse.csr_matrix(np.asarray(rows, dtype=np.float32))


def _image_entropy(gray_image: Image.Image) -> float:
    histogram = np.asarray(gray_image.histogram(), dtype=np.float32)
    histogram /= max(histogram.sum(), 1.0)
    histogram = histogram[histogram > 0]
    return float(-(histogram * np.log2(histogram)).sum())


def extract_image_features_from_bytes(image_bytes: bytes, file_name: str = "image.png") -> dict[str, float]:
    """Extract lightweight forensic features from image bytes."""
    image = Image.open(io.BytesIO(image_bytes))
    image.load()
    image = ImageOps.exif_transpose(image)
    rgb_image = image.convert("RGB")
    gray_image = ImageOps.grayscale(rgb_image)
    edge_image = gray_image.filter(ImageFilter.FIND_EDGES)

    width, height = rgb_image.size
    gray_array = np.asarray(gray_image, dtype=np.float32)
    edge_array = np.asarray(edge_image, dtype=np.float32)
    small_gray = gray_image.resize((96, 96))
    mirrored_horizontal = ImageOps.mirror(small_gray)
    mirrored_vertical = ImageOps.flip(small_gray)
    small_array = np.asarray(small_gray, dtype=np.float32)
    horizontal_delta = np.abs(small_array - np.asarray(mirrored_horizontal, dtype=np.float32)).mean() / 255.0
    vertical_delta = np.abs(small_array - np.asarray(mirrored_vertical, dtype=np.float32)).mean() / 255.0
    bytes_per_pixel = len(image_bytes) / max(width * height, 1)
    lower_name = file_name.lower()

    return {
        "width": float(width),
        "height": float(height),
        "aspect_ratio": float(width / max(height, 1)),
        "gray_mean": float(gray_array.mean()),
        "gray_std": float(gray_array.std()),
        "edge_mean": float(edge_array.mean()),
        "edge_std": float(edge_array.std()),
        "entropy": _image_entropy(gray_image),
        "bright_ratio": float((gray_array > 220).mean()),
        "dark_ratio": float((gray_array < 35).mean()),
        "horizontal_symmetry": float(1.0 - horizontal_delta),
        "vertical_symmetry": float(1.0 - vertical_delta),
        "bytes_per_pixel": float(bytes_per_pixel),
        "is_png": float(lower_name.endswith(".png")),
        "is_jpeg": float(lower_name.endswith(".jpg") or lower_name.endswith(".jpeg")),
        "file_name_flag_count": float(sum(flag in lower_name for flag in IMAGE_NAME_RED_FLAGS)),
    }


def image_feature_vector_from_bytes(image_bytes: bytes, file_name: str = "image.png") -> np.ndarray:
    features = extract_image_features_from_bytes(image_bytes=image_bytes, file_name=file_name)
    return np.asarray([features[name] for name in IMAGE_FEATURE_NAMES], dtype=np.float32)


def path_relative_to(base_dir: Path, path: Path) -> str:
    try:
        return str(path.resolve().relative_to(base_dir.resolve()))
    except ValueError:
        return str(path.resolve())
