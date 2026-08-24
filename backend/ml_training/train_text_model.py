from __future__ import annotations

import zipfile
from pathlib import Path
import sys

import joblib
import pandas as pd
from sklearn.calibration import CalibratedClassifierCV
from sklearn.ensemble import RandomForestClassifier
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import train_test_split
from sklearn.pipeline import FeatureUnion
from sklearn.svm import LinearSVC

BASE_DIR = Path(__file__).resolve().parent
PARENT_DIR = BASE_DIR.parent
if str(PARENT_DIR) not in sys.path:
    sys.path.insert(0, str(PARENT_DIR))

from ml_training.model_components import TextHeuristicTransformer, normalize_text, path_relative_to
from ml_training.training_utils import choose_best_result, compute_classification_metrics, save_text_report, save_training_report

DATASETS_DIR = BASE_DIR / "datasets"
SAVED_MODELS_DIR = BASE_DIR / "saved_models"
TEXT_DATASET_PATH = DATASETS_DIR / "text_dataset.csv"
SOURCE_TEXT_CSV = BASE_DIR.parent / "datasets" / "extracted" / "msg" / "spam.csv"
SOURCE_TEXT_ZIP = BASE_DIR.parent / "datasets" / "msg.zip"
RANDOM_STATE = 42


def ensure_directories() -> None:
    DATASETS_DIR.mkdir(parents=True, exist_ok=True)
    SAVED_MODELS_DIR.mkdir(parents=True, exist_ok=True)


def load_source_text_dataframe() -> pd.DataFrame:
    if SOURCE_TEXT_CSV.exists():
        return pd.read_csv(SOURCE_TEXT_CSV, encoding="latin-1")

    if not SOURCE_TEXT_ZIP.exists():
        raise FileNotFoundError("No text dataset source was found in backend/datasets.")

    with zipfile.ZipFile(SOURCE_TEXT_ZIP) as archive:
        csv_name = next(name for name in archive.namelist() if name.lower().endswith(".csv"))
        with archive.open(csv_name) as csv_file:
            return pd.read_csv(csv_file, encoding="latin-1")


def bootstrap_text_dataset() -> pd.DataFrame:
    ensure_directories()

    if TEXT_DATASET_PATH.exists():
        dataset = pd.read_csv(TEXT_DATASET_PATH)
        if {"text", "label"}.issubset(dataset.columns):
            return dataset[["text", "label"]].dropna()

    source_df = load_source_text_dataframe()

    if {"v1", "v2"}.issubset(source_df.columns):
        dataset = source_df[["v2", "v1"]].rename(columns={"v2": "text", "v1": "label"})
    else:
        dataset = source_df.iloc[:, :2].copy()
        dataset.columns = ["text", "label"]

    dataset = dataset.dropna(subset=["text", "label"])
    dataset["text"] = dataset["text"].astype(str).str.strip()
    dataset["label"] = dataset["label"].astype(str).str.strip().str.lower().map({"ham": 0, "spam": 1, "0": 0, "1": 1})
    dataset = dataset.dropna(subset=["label"])
    dataset["label"] = dataset["label"].astype(int)
    dataset = dataset.drop_duplicates(subset=["text"]).reset_index(drop=True)
    dataset.to_csv(TEXT_DATASET_PATH, index=False)
    return dataset


def build_full_text_vectorizer() -> FeatureUnion:
    return FeatureUnion(
        [
            (
                "word_tfidf",
                TfidfVectorizer(
                    preprocessor=normalize_text,
                    ngram_range=(1, 2),
                    min_df=2,
                    max_df=0.98,
                    sublinear_tf=True,
                    stop_words="english",
                    max_features=20000,
                ),
            ),
            (
                "char_tfidf",
                TfidfVectorizer(
                    preprocessor=normalize_text,
                    analyzer="char_wb",
                    ngram_range=(3, 5),
                    min_df=2,
                    sublinear_tf=True,
                    max_features=12000,
                ),
            ),
            ("heuristics", TextHeuristicTransformer()),
        ]
    )


def build_model_candidates() -> list[dict[str, object]]:
    return [
        {
            "model_name": "Logistic Regression",
            "vectorizer": build_full_text_vectorizer(),
            "model": LogisticRegression(
                C=4.0,
                max_iter=4000,
                class_weight="balanced",
                solver="liblinear",
            ),
        },
        {
            "model_name": "Calibrated Linear SVM",
            "vectorizer": build_full_text_vectorizer(),
            "model": CalibratedClassifierCV(
                estimator=LinearSVC(C=1.2, class_weight="balanced", max_iter=12000),
                method="sigmoid",
                cv=3,
            ),
        },
        {
            "model_name": "Random Forest",
            "vectorizer": TextHeuristicTransformer(),
            "model": RandomForestClassifier(
                n_estimators=350,
                max_depth=16,
                min_samples_split=4,
                min_samples_leaf=2,
                class_weight="balanced_subsample",
                random_state=RANDOM_STATE,
                n_jobs=1,
            ),
        },
    ]


def train_models() -> dict[str, object]:
    dataset = bootstrap_text_dataset()
    X_train, X_test, y_train, y_test = train_test_split(
        dataset["text"],
        dataset["label"],
        test_size=0.2,
        random_state=RANDOM_STATE,
        stratify=dataset["label"],
    )

    results = []

    for candidate in build_model_candidates():
        vectorizer = candidate["vectorizer"]
        model = candidate["model"]
        model_name = str(candidate["model_name"])

        try:
            X_train_features = vectorizer.fit_transform(X_train)
            X_test_features = vectorizer.transform(X_test)

            model.fit(X_train_features, y_train)
            y_pred = model.predict(X_test_features)
            metrics = compute_classification_metrics(y_test, y_pred)

            results.append(
                {
                    "model_name": model_name,
                    "vectorizer": vectorizer,
                    "model": model,
                    "metrics": metrics,
                }
            )

            print(
                f"[text] {model_name}: accuracy={metrics['accuracy']}, "
                f"precision={metrics['precision']}, recall={metrics['recall']}, f1={metrics['f1']}"
            )
        except Exception as exc:
            print(f"[text] {model_name} failed: {exc}")

    if not results:
        raise RuntimeError("No text model candidate completed successfully.")

    best_result = choose_best_result(results)

    joblib.dump(best_result["model"], SAVED_MODELS_DIR / "message_model.pkl")
    joblib.dump(best_result["vectorizer"], SAVED_MODELS_DIR / "message_vectorizer.pkl")

    report_payload = {
        "dataset_path": path_relative_to(BASE_DIR, TEXT_DATASET_PATH),
        "train_rows": len(X_train),
        "test_rows": len(X_test),
        "best_model": best_result["model_name"],
        "results": results,
    }
    save_training_report(SAVED_MODELS_DIR / "message_model_metrics.json", report_payload)
    save_text_report(
        SAVED_MODELS_DIR / "message_model_report.txt",
        "TruthShield Text Scam Model Evaluation",
        results,
        best_result,
    )

    print(f"[text] Best model saved: {best_result['model_name']}")
    print(f"[text] Dataset: {TEXT_DATASET_PATH}")
    print(f"[text] Model: {SAVED_MODELS_DIR / 'message_model.pkl'}")
    print(f"[text] Vectorizer: {SAVED_MODELS_DIR / 'message_vectorizer.pkl'}")

    return best_result


if __name__ == "__main__":
    train_models()
