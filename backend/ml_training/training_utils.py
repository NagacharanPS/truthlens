from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from sklearn.metrics import (
    accuracy_score,
    classification_report,
    confusion_matrix,
    f1_score,
    precision_score,
    recall_score,
)


def compute_classification_metrics(y_true, y_pred) -> dict[str, Any]:
    return {
        "accuracy": round(float(accuracy_score(y_true, y_pred)), 4),
        "precision": round(float(precision_score(y_true, y_pred, zero_division=0)), 4),
        "recall": round(float(recall_score(y_true, y_pred, zero_division=0)), 4),
        "f1": round(float(f1_score(y_true, y_pred, zero_division=0)), 4),
        "confusion_matrix": confusion_matrix(y_true, y_pred).tolist(),
        "classification_report": classification_report(y_true, y_pred, zero_division=0, output_dict=True),
        "classification_report_text": classification_report(y_true, y_pred, zero_division=0),
    }


def choose_best_result(results: list[dict[str, Any]]) -> dict[str, Any]:
    return max(
        results,
        key=lambda item: (
            item["metrics"]["f1"],
            item["metrics"]["recall"],
            item["metrics"]["precision"],
            item["metrics"]["accuracy"],
        ),
    )


def save_training_report(output_path: Path, payload: dict[str, Any]) -> None:
    serializable = payload.copy()
    serializable["results"] = [
        {
            "model_name": entry["model_name"],
            "metrics": {
                key: value
                for key, value in entry["metrics"].items()
                if key != "classification_report_text"
            },
        }
        for entry in payload.get("results", [])
    ]
    output_path.write_text(json.dumps(serializable, indent=2), encoding="utf-8")


def save_text_report(output_path: Path, title: str, results: list[dict[str, Any]], best_result: dict[str, Any]) -> None:
    lines = [title, "=" * len(title), ""]

    for entry in results:
        lines.append(f"Model: {entry['model_name']}")
        lines.append(entry["metrics"]["classification_report_text"])
        lines.append(f"Confusion Matrix: {entry['metrics']['confusion_matrix']}")
        lines.append("")

    lines.append(f"Best Model: {best_result['model_name']}")
    lines.append(f"Best F1: {best_result['metrics']['f1']}")
    output_path.write_text("\n".join(lines), encoding="utf-8")
