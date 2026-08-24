"""
SHAP explainability service.

Computes feature-level attribution for text and URL models using SHAP.
Returns top contributing features with their impact direction and magnitude,
replacing the generic "red flags" list with model-grounded explanations.

- Text model: uses LinearExplainer on the TF-IDF + heuristic pipeline
- URL model:  uses TreeExplainer on the Random Forest / LinearExplainer on LR
- Falls back gracefully if SHAP computation fails
"""
from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Any

logger = logging.getLogger(__name__)


@dataclass
class ShapContribution:
    feature: str       # human-readable feature name
    value: float       # raw SHAP value (positive = pushes toward scam)
    impact: int        # 0-100 scaled absolute impact
    direction: str     # "risk" | "safe"


@dataclass
class ShapResult:
    available: bool
    contributions: list[ShapContribution]
    top_risk_features: list[str]    # top 5 features pushing toward scam
    top_safe_features: list[str]    # top 3 features pushing toward safe
    base_value: float               # model's average prediction
    error: str | None = None


def _scale_shap_values(values: list[float]) -> list[int]:
    """Scale SHAP values to 0-100 for display."""
    if not values:
        return []
    max_abs = max(abs(v) for v in values) or 1.0
    return [int(round(abs(v) / max_abs * 100)) for v in values]


def _clean_feature_name(name: str) -> str:
    """Strip vectorizer prefix and clean up feature names for display."""
    # Remove FeatureUnion prefixes like "word_tfidf:", "char_tfidf:", "heuristics:"
    for prefix in ("word_tfidf:", "char_tfidf:", "heuristics:", "char_tfidf:", "numeric:"):
        if name.startswith(prefix):
            name = name[len(prefix):]
            break
    # Truncate very long char n-gram features
    if len(name) > 40:
        name = name[:37] + "..."
    return name


def explain_text_prediction(
    model: Any,
    vectorizer: Any,
    text: str,
) -> ShapResult:
    """
    Run SHAP-style attribution on the text model for a single input.
    For Logistic Regression, uses coefficient × feature value (exact attribution).
    For tree models, uses SHAP TreeExplainer.
    """
    try:
        import numpy as np

        # Transform input through the vectorizer
        X = vectorizer.transform([text])

        model_type = type(model).__name__.lower()

        if "logistic" in model_type:
            # For LR: attribution = coef * feature_value (exact, no approximation needed)
            if hasattr(X, "toarray"):
                x_dense = X.toarray()[0]
            else:
                x_dense = np.asarray(X).flatten()

            coef = model.coef_[0] if hasattr(model, "coef_") else np.zeros(len(x_dense))
            sv = coef * x_dense  # element-wise: contribution of each feature

            base_value = float(model.intercept_[0]) if hasattr(model, "intercept_") else 0.0

        elif "forest" in model_type or "tree" in model_type:
            import shap
            explainer = shap.TreeExplainer(model)
            shap_values = explainer.shap_values(X)
            if isinstance(shap_values, list) and len(shap_values) == 2:
                shap_values = shap_values[1]
            if hasattr(shap_values, "toarray"):
                sv = shap_values.toarray()[0]
            else:
                sv = np.asarray(shap_values).flatten()
            base_value = float(explainer.expected_value[-1]) if hasattr(explainer, "expected_value") else 0.0

        else:
            # Calibrated SVM or other — use coefficient approach if available
            inner = getattr(model, "estimator", model)
            if hasattr(inner, "coef_"):
                if hasattr(X, "toarray"):
                    x_dense = X.toarray()[0]
                else:
                    x_dense = np.asarray(X).flatten()
                sv = inner.coef_[0] * x_dense
                base_value = float(inner.intercept_[0]) if hasattr(inner, "intercept_") else 0.0
            else:
                return ShapResult(
                    available=False, contributions=[], top_risk_features=[],
                    top_safe_features=[], base_value=0.0,
                    error=f"Unsupported model type: {model_type}",
                )

        # Get feature names from vectorizer
        feature_names = _get_text_feature_names(vectorizer)

        # Pair features with attribution values, filter near-zero
        pairs = [
            (name, float(val))
            for name, val in zip(feature_names, sv)
            if abs(val) > 1e-5
        ]
        # Sort by absolute impact descending
        pairs.sort(key=lambda x: abs(x[1]), reverse=True)
        top_pairs = pairs[:20]

        scaled = _scale_shap_values([v for _, v in top_pairs])
        contributions = [
            ShapContribution(
                feature=_clean_feature_name(name),
                value=val,
                impact=imp,
                direction="risk" if val > 0 else "safe",
            )
            for (name, val), imp in zip(top_pairs, scaled)
        ]

        top_risk = [c.feature for c in contributions if c.direction == "risk"][:5]
        top_safe = [c.feature for c in contributions if c.direction == "safe"][:3]

        return ShapResult(
            available=True,
            contributions=contributions,
            top_risk_features=top_risk,
            top_safe_features=top_safe,
            base_value=base_value,
        )

    except Exception as exc:
        logger.warning("[SHAP text] Failed: %s", exc)
        return ShapResult(
            available=False,
            contributions=[],
            top_risk_features=[],
            top_safe_features=[],
            base_value=0.0,
            error=str(exc),
        )


def explain_url_prediction(
    pipeline: Any,
    url: str,
) -> ShapResult:
    """
    Run SHAP on the URL model pipeline for a single URL.
    """
    try:
        import shap
        import numpy as np

        # Get the feature step and classifier from the pipeline
        if hasattr(pipeline, "named_steps"):
            steps = list(pipeline.named_steps.values())
            feature_step = steps[0] if len(steps) > 1 else None
            clf = steps[-1]
        else:
            feature_step = None
            clf = pipeline

        if feature_step is not None:
            X = feature_step.transform([url])
        else:
            X = [url]

        clf_type = type(clf).__name__.lower()

        if "forest" in clf_type or "tree" in clf_type or "gradient" in clf_type:
            explainer = shap.TreeExplainer(clf)
            shap_values = explainer.shap_values(X)
            if isinstance(shap_values, list) and len(shap_values) == 2:
                shap_values = shap_values[1]
        else:
            explainer = shap.LinearExplainer(clf, X, feature_perturbation="interventional")
            shap_values = explainer.shap_values(X)

        if hasattr(shap_values, "toarray"):
            sv = shap_values.toarray()[0]
        else:
            sv = np.asarray(shap_values).flatten()

        feature_names = _get_url_feature_names(feature_step)

        pairs = [
            (name, float(val))
            for name, val in zip(feature_names, sv)
            if abs(val) > 1e-4
        ]
        pairs.sort(key=lambda x: abs(x[1]), reverse=True)
        top_pairs = pairs[:15]

        scaled = _scale_shap_values([v for _, v in top_pairs])
        contributions = [
            ShapContribution(
                feature=name,
                value=val,
                impact=imp,
                direction="risk" if val > 0 else "safe",
            )
            for (name, val), imp in zip(top_pairs, scaled)
        ]

        top_risk = [c.feature for c in contributions if c.direction == "risk"][:5]
        top_safe = [c.feature for c in contributions if c.direction == "safe"][:3]

        base_value = float(explainer.expected_value) if hasattr(explainer, "expected_value") else 0.0
        if isinstance(base_value, (list, np.ndarray)):
            base_value = float(base_value[-1])

        return ShapResult(
            available=True,
            contributions=contributions,
            top_risk_features=top_risk,
            top_safe_features=top_safe,
            base_value=base_value,
        )

    except Exception as exc:
        logger.warning("[SHAP url] Failed: %s", exc)
        return ShapResult(
            available=False,
            contributions=[],
            top_risk_features=[],
            top_safe_features=[],
            base_value=0.0,
            error=str(exc),
        )


def _get_text_feature_names(vectorizer: Any) -> list[str]:
    """Extract feature names from TF-IDF FeatureUnion or plain vectorizer."""
    # Human-readable names for the TextHeuristicTransformer features
    heuristic_names = [
        "text length", "word count", "uppercase word count",
        "url count", "digit count", "exclamation marks", "question marks",
        "otp keywords", "banking keywords", "phishing keywords",
        "offer keywords", "urgency keywords",
        "click here pattern", "urgent/suspended pattern",
        "otp/pin/cvv pattern", "bank/wallet/account pattern",
    ]
    try:
        if hasattr(vectorizer, "transformer_list"):
            # FeatureUnion
            names: list[str] = []
            for name, transformer in vectorizer.transformer_list:
                if hasattr(transformer, "get_feature_names_out"):
                    names.extend([f"{name}:{f}" for f in transformer.get_feature_names_out()])
                elif hasattr(transformer, "get_feature_names"):
                    names.extend([f"{name}:{f}" for f in transformer.get_feature_names()])
                else:
                    # Heuristic transformer — use descriptive names
                    try:
                        n = transformer.transform(["test"]).shape[1]
                    except Exception:
                        n = len(heuristic_names)
                    names.extend(heuristic_names[:n] + [f"heuristic_{i}" for i in range(max(0, n - len(heuristic_names)))])
            return names
        if hasattr(vectorizer, "get_feature_names_out"):
            return list(vectorizer.get_feature_names_out())
        if hasattr(vectorizer, "get_feature_names"):
            return list(vectorizer.get_feature_names())
    except Exception:
        pass
    return [f"feature_{i}" for i in range(1000)]


def _get_url_feature_names(feature_step: Any) -> list[str]:
    """Extract feature names from URL feature extractor or FeatureUnion."""
    url_numeric_names = [
        "url_length", "host_length", "dot_count", "is_https",
        "suspicious_word_hits", "is_ip_address", "is_shortener",
        "special_char_count", "digit_count", "slash_count",
        "dash_count", "at_count", "equals_count", "question_count",
        "ampersand_count", "has_punycode", "suspicious_tld",
    ]
    try:
        if feature_step is None:
            return url_numeric_names
        if hasattr(feature_step, "transformer_list"):
            names: list[str] = []
            for tname, transformer in feature_step.transformer_list:
                if hasattr(transformer, "get_feature_names_out"):
                    names.extend([f"{tname}:{f}" for f in transformer.get_feature_names_out()])
                elif tname == "numeric":
                    names.extend(url_numeric_names)
                else:
                    n = transformer.transform(["https://example.com"]).shape[1]
                    names.extend([f"{tname}_{i}" for i in range(n)])
            return names
    except Exception:
        pass
    return url_numeric_names
