from __future__ import annotations

import zipfile
from pathlib import Path
import sys

import joblib
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import train_test_split
from sklearn.pipeline import FeatureUnion, Pipeline

BASE_DIR = Path(__file__).resolve().parent
PARENT_DIR = BASE_DIR.parent
if str(PARENT_DIR) not in sys.path:
    sys.path.insert(0, str(PARENT_DIR))

from ml_training.model_components import URLFeatureExtractor, path_relative_to
from ml_training.training_utils import choose_best_result, compute_classification_metrics, save_text_report, save_training_report

DATASETS_DIR = BASE_DIR / "datasets"
SAVED_MODELS_DIR = BASE_DIR / "saved_models"
URL_DATASET_PATH = DATASETS_DIR / "url_dataset.csv"
SOURCE_URL_CSV = BASE_DIR.parent / "datasets" / "extracted" / "urls" / "urls" / "urls.csv"
SOURCE_URL_ZIP = BASE_DIR.parent / "datasets" / "urls.zip"
RANDOM_STATE = 42


def ensure_directories() -> None:
    DATASETS_DIR.mkdir(parents=True, exist_ok=True)
    SAVED_MODELS_DIR.mkdir(parents=True, exist_ok=True)


def load_source_url_dataframe() -> pd.DataFrame:
    if SOURCE_URL_CSV.exists():
        return pd.read_csv(SOURCE_URL_CSV)

    if not SOURCE_URL_ZIP.exists():
        raise FileNotFoundError("No URL dataset source was found in backend/datasets.")

    with zipfile.ZipFile(SOURCE_URL_ZIP) as archive:
        csv_name = next(name for name in archive.namelist() if name.lower().endswith(".csv"))
        with archive.open(csv_name) as csv_file:
            return pd.read_csv(csv_file)


def bootstrap_url_dataset() -> pd.DataFrame:
    ensure_directories()

    if URL_DATASET_PATH.exists():
        dataset = pd.read_csv(URL_DATASET_PATH)
        if {"url", "label"}.issubset(dataset.columns):
            return dataset[["url", "label"]].dropna()

    source_df = load_source_url_dataframe()
    dataset = source_df[["url", "label"]].dropna().copy()
    dataset["url"] = dataset["url"].astype(str).str.strip()
    dataset["label"] = dataset["label"].astype(int)
    dataset = dataset.drop_duplicates(subset=["url"]).reset_index(drop=True)
    dataset.to_csv(URL_DATASET_PATH, index=False)
    return dataset


def build_logistic_pipeline() -> Pipeline:
    return Pipeline(
        [
            (
                "features",
                FeatureUnion(
                    [
                        (
                            "char_tfidf",
                            TfidfVectorizer(
                                analyzer="char_wb",
                                ngram_range=(3, 5),
                                min_df=2,
                                sublinear_tf=True,
                                max_features=25000,
                            ),
                        ),
                        ("numeric", URLFeatureExtractor()),
                    ]
                ),
            ),
            (
                "clf",
                LogisticRegression(
                    C=3.0,
                    max_iter=3000,
                    class_weight="balanced",
                    solver="liblinear",
                ),
            ),
        ]
    )


def build_random_forest_pipeline() -> Pipeline:
    return Pipeline(
        [
            ("features", URLFeatureExtractor()),
            (
                "clf",
                RandomForestClassifier(
                    n_estimators=320,
                    max_depth=18,
                    min_samples_split=4,
                    min_samples_leaf=2,
                    class_weight="balanced_subsample",
                    random_state=RANDOM_STATE,
                    n_jobs=1,
                ),
            ),
        ]
    )


def train_models() -> dict[str, object]:
    dataset = bootstrap_url_dataset()
    X_train, X_test, y_train, y_test = train_test_split(
        dataset["url"],
        dataset["label"],
        test_size=0.2,
        random_state=RANDOM_STATE,
        stratify=dataset["label"],
    )

    candidates = [
        {"model_name": "Logistic Regression", "pipeline": build_logistic_pipeline()},
        {"model_name": "Random Forest", "pipeline": build_random_forest_pipeline()},
    ]

    results = []

    for candidate in candidates:
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
                f"[url] {model_name}: accuracy={metrics['accuracy']}, "
                f"precision={metrics['precision']}, recall={metrics['recall']}, f1={metrics['f1']}"
            )
        except Exception as exc:
            print(f"[url] {model_name} failed: {exc}")

    if not results:
        raise RuntimeError("No URL model candidate completed successfully.")

    best_result = choose_best_result(results)
    joblib.dump(best_result["pipeline"], SAVED_MODELS_DIR / "url_model.pkl")

    report_payload = {
        "dataset_path": path_relative_to(BASE_DIR, URL_DATASET_PATH),
        "train_rows": len(X_train),
        "test_rows": len(X_test),
        "best_model": best_result["model_name"],
        "results": results,
    }
    save_training_report(SAVED_MODELS_DIR / "url_model_metrics.json", report_payload)
    save_text_report(
        SAVED_MODELS_DIR / "url_model_report.txt",
        "TruthShield URL Phishing Model Evaluation",
        results,
        best_result,
    )

    print(f"[url] Best model saved: {best_result['model_name']}")
    print(f"[url] Dataset: {URL_DATASET_PATH}")
    print(f"[url] Model: {SAVED_MODELS_DIR / 'url_model.pkl'}")

    return best_result


if __name__ == "__main__":
    train_models()
