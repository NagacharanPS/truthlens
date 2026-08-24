from __future__ import annotations

import zipfile
from itertools import chain
from pathlib import Path
import sys

import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

BASE_DIR = Path(__file__).resolve().parent
PARENT_DIR = BASE_DIR.parent
if str(PARENT_DIR) not in sys.path:
    sys.path.insert(0, str(PARENT_DIR))

from ml_training.model_components import IMAGE_FEATURE_NAMES, extract_image_features_from_bytes, path_relative_to
from ml_training.training_utils import choose_best_result, compute_classification_metrics, save_text_report, save_training_report

DATASETS_DIR = BASE_DIR / "datasets"
IMAGE_DATASET_DIR = DATASETS_DIR / "image_dataset"
REAL_DIR = IMAGE_DATASET_DIR / "real"
FAKE_DIR = IMAGE_DATASET_DIR / "fake"
SAVED_MODELS_DIR = BASE_DIR / "saved_models"
SOURCE_IMAGE_ZIP = BASE_DIR.parent / "datasets" / "spam_pictures.zip"
RANDOM_STATE = 42


def ensure_directories() -> None:
    REAL_DIR.mkdir(parents=True, exist_ok=True)
    FAKE_DIR.mkdir(parents=True, exist_ok=True)
    SAVED_MODELS_DIR.mkdir(parents=True, exist_ok=True)


def iter_folder_images(folder: Path, label: int):
    for image_path in folder.rglob("*"):
        if image_path.suffix.lower() not in {".png", ".jpg", ".jpeg", ".webp"}:
            continue
        yield image_path.name, image_path.read_bytes(), label


def iter_zip_images(zip_path: Path):
    if not zip_path.exists():
        raise FileNotFoundError("No image dataset source was found in backend/datasets.")

    with zipfile.ZipFile(zip_path) as archive:
        for name in archive.namelist():
            lower_name = name.lower()
            if not lower_name.endswith((".png", ".jpg", ".jpeg", ".webp")):
                continue

            if "/genuine_site_0/" in lower_name:
                label = 0
            elif "/phishing_site_1/" in lower_name:
                label = 1
            else:
                continue

            with archive.open(name) as image_file:
                yield Path(name).name, image_file.read(), label


def load_image_dataset() -> pd.DataFrame:
    ensure_directories()

    supported_extensions = {".png", ".jpg", ".jpeg", ".webp"}
    folder_has_images = any(path.suffix.lower() in supported_extensions for path in REAL_DIR.rglob("*")) or any(
        path.suffix.lower() in supported_extensions for path in FAKE_DIR.rglob("*")
    )
    image_rows = []
    iterator = (
        chain(iter_folder_images(REAL_DIR, 0), iter_folder_images(FAKE_DIR, 1))
        if folder_has_images
        else iter_zip_images(SOURCE_IMAGE_ZIP)
    )

    for file_name, image_bytes, label in iterator:
        try:
            feature_map = extract_image_features_from_bytes(image_bytes=image_bytes, file_name=file_name)
        except Exception:
            continue

        feature_map["label"] = label
        feature_map["file_name"] = file_name
        image_rows.append(feature_map)

    if not image_rows:
        raise RuntimeError("No usable images were found for training.")

    return pd.DataFrame(image_rows)


def build_candidates() -> list[dict[str, object]]:
    return [
        {
            "model_name": "Logistic Regression",
            "pipeline": Pipeline(
                [
                    ("scaler", StandardScaler()),
                    (
                        "clf",
                        LogisticRegression(
                            C=2.0,
                            max_iter=3000,
                            class_weight="balanced",
                            solver="liblinear",
                        ),
                    ),
                ]
            ),
        },
        {
            "model_name": "Random Forest",
            "pipeline": Pipeline(
                [
                    (
                        "clf",
                        RandomForestClassifier(
                            n_estimators=320,
                            max_depth=14,
                            min_samples_split=4,
                            min_samples_leaf=2,
                            class_weight="balanced_subsample",
                            random_state=RANDOM_STATE,
                            n_jobs=1,
                        ),
                    )
                ]
            ),
        },
    ]


def train_models() -> dict[str, object]:
    dataset = load_image_dataset()
    X = dataset[IMAGE_FEATURE_NAMES].astype(np.float32)
    y = dataset["label"].astype(int)

    X_train, X_test, y_train, y_test = train_test_split(
        X,
        y,
        test_size=0.2,
        random_state=RANDOM_STATE,
        stratify=y,
    )

    results = []

    for candidate in build_candidates():
        model_name = str(candidate["model_name"])
        pipeline = candidate["pipeline"]

        try:
            pipeline.fit(X_train, y_train)
            y_pred = pipeline.predict(X_test)
            metrics = compute_classification_metrics(y_test, y_pred)

            results.append(
                {
                    "model_name": model_name,
                    "pipeline": pipeline,
                    "metrics": metrics,
                }
            )

            print(
                f"[image] {model_name}: accuracy={metrics['accuracy']}, "
                f"precision={metrics['precision']}, recall={metrics['recall']}, f1={metrics['f1']}"
            )
        except Exception as exc:
            print(f"[image] {model_name} failed: {exc}")

    if not results:
        raise RuntimeError("No image model candidate completed successfully.")

    best_result = choose_best_result(results)

    artifact = {
        "model_name": best_result["model_name"],
        "pipeline": best_result["pipeline"],
        "feature_names": IMAGE_FEATURE_NAMES,
        "notes": (
            "This is a lightweight feature-based placeholder model. "
            "A CNN or transfer-learning deepfake model can replace it later without changing the backend route."
        ),
    }
    joblib.dump(artifact, SAVED_MODELS_DIR / "image_model.pkl")

    report_payload = {
        "dataset_path": path_relative_to(BASE_DIR, IMAGE_DATASET_DIR),
        "train_rows": len(X_train),
        "test_rows": len(X_test),
        "best_model": best_result["model_name"],
        "results": results,
    }
    save_training_report(SAVED_MODELS_DIR / "image_model_metrics.json", report_payload)
    save_text_report(
        SAVED_MODELS_DIR / "image_model_report.txt",
        "TruthShield Image Fake Detection Model Evaluation",
        results,
        best_result,
    )

    print(f"[image] Best model saved: {best_result['model_name']}")
    print(f"[image] Dataset source: {IMAGE_DATASET_DIR} or {SOURCE_IMAGE_ZIP}")
    print(f"[image] Model: {SAVED_MODELS_DIR / 'image_model.pkl'}")

    return best_result


if __name__ == "__main__":
    train_models()
