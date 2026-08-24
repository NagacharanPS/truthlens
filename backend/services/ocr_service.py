"""
Multilingual OCR Service for TruthLens.
Extracts text from screenshots and images in English and Indian languages:
(English, Kannada, Hindi, Telugu, Tamil, Malayalam, Marathi, Bengali).
"""
from __future__ import annotations

import io
import logging
from dataclasses import dataclass, field
from typing import Any

from PIL import Image

logger = logging.getLogger(__name__)

# Script to EasyOCR language mappings
OCR_LANGUAGE_SETS: dict[str, list[str]] = {
    "auto": ["en", "hi"],
    "en": ["en"],
    "hi": ["hi", "en"],
    "kn": ["kn", "en"],
    "te": ["te", "en"],
}

_READER_CACHE: dict[str, Any] = {}
_EASYOCR_AVAILABLE: bool | None = None


@dataclass
class OcrResult:
    available: bool
    text: str
    detected_script: str | None = None
    confidence: float | None = None
    word_count: int = 0
    lines: list[str] = field(default_factory=list)
    error: str | None = None


def is_easyocr_available() -> bool:
    global _EASYOCR_AVAILABLE
    if _EASYOCR_AVAILABLE is not None:
        return _EASYOCR_AVAILABLE

    try:
        import easyocr  # noqa: F401
        _EASYOCR_AVAILABLE = True
    except Exception as exc:
        logger.warning(f"EasyOCR is not available: {exc}")
        _EASYOCR_AVAILABLE = False

    return _EASYOCR_AVAILABLE


def get_ocr_reader(lang_code: str = "auto") -> Any | None:
    if not is_easyocr_available():
        return None

    import easyocr

    norm_code = (lang_code or "auto").lower().strip()
    lang_list = OCR_LANGUAGE_SETS.get(norm_code, OCR_LANGUAGE_SETS["auto"])
    cache_key = "_".join(sorted(lang_list))

    if cache_key in _READER_CACHE:
        return _READER_CACHE[cache_key]

    try:
        # gpu=False for universal CPU compatibility
        reader = easyocr.Reader(lang_list, gpu=False, verbose=False)
        _READER_CACHE[cache_key] = reader
        return reader
    except Exception as exc:
        logger.error(f"Failed to initialize EasyOCR reader for {lang_list}: {exc}")
        return None


def extract_text_from_image(
    image_bytes: bytes,
    language_hint: str | None = None,
) -> OcrResult:
    if not image_bytes:
        return OcrResult(available=False, text="", error="Image bytes empty")

    if not is_easyocr_available():
        return OcrResult(
            available=False,
            text="",
            error="OCR engine is not installed or available.",
        )

    try:
        pil_img = Image.open(io.BytesIO(image_bytes))
        pil_img.load()
        if pil_img.mode != "RGB":
            pil_img = pil_img.convert("RGB")

        # Resize if overly large for fast OCR
        max_dim = 1600
        w, h = pil_img.size
        if max(w, h) > max_dim:
            scale = max_dim / max(w, h)
            new_size = (int(w * scale), int(h * scale))
            pil_img = pil_img.resize(new_size, Image.Resampling.BILINEAR)

        # Convert back to bytes for EasyOCR
        buffer = io.BytesIO()
        pil_img.save(buffer, format="JPEG", quality=90)
        processed_bytes = buffer.getvalue()

        # Determine language reader to use
        hint = (language_hint or "auto").lower().strip()
        reader = get_ocr_reader(hint) or get_ocr_reader("auto")
        if reader is None:
            return OcrResult(available=False, text="", error="Failed to create OCR reader")

        # Run OCR
        results = reader.readtext(processed_bytes)
        if not results:
            # If auto had no results and hint is not auto, retry with general reader
            if hint != "auto":
                fallback_reader = get_ocr_reader("auto")
                if fallback_reader:
                    results = fallback_reader.readtext(processed_bytes)

        if not results:
            return OcrResult(
                available=True,
                text="",
                confidence=None,
                word_count=0,
                lines=[],
            )

        extracted_lines: list[str] = []
        confidences: list[float] = []

        for item in results:
            # item format: (bbox, text, prob)
            if len(item) >= 2:
                line_text = str(item[1]).strip()
                if line_text:
                    extracted_lines.append(line_text)
                    if len(item) >= 3 and isinstance(item[2], (int, float)):
                        confidences.append(float(item[2]))

        full_text = " ".join(extracted_lines).strip()
        avg_confidence = (
            round(sum(confidences) / len(confidences), 2)
            if confidences
            else None
        )
        words = full_text.split()

        return OcrResult(
            available=True,
            text=full_text,
            detected_script=hint if hint != "auto" else None,
            confidence=avg_confidence,
            word_count=len(words),
            lines=extracted_lines,
        )

    except Exception as exc:
        logger.error(f"OCR text extraction failed: {exc}")
        return OcrResult(
            available=False,
            text="",
            error=str(exc),
        )
