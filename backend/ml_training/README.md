# TruthShield ML Training

This folder contains the separate training workspace for TruthShield machine-learning models. It improves model quality without changing the frontend design or replacing the current backend route structure.

## Folder Layout

```text
backend/
└── ml_training/
    ├── train_text_model.py
    ├── train_url_model.py
    ├── train_image_model.py
    ├── datasets/
    │   ├── text_dataset.csv
    │   ├── url_dataset.csv
    │   └── image_dataset/
    │       ├── real/
    │       └── fake/
    ├── saved_models/
    │   ├── message_model.pkl
    │   ├── message_vectorizer.pkl
    │   ├── url_model.pkl
    │   └── image_model.pkl
    └── README.md
```

## How To Train The Text Model

```bash
cd backend
python ml_training/train_text_model.py
```

What it does:

- Bootstraps `datasets/text_dataset.csv` if it does not exist
- Uses TF-IDF plus scam-oriented heuristic features
- Compares Logistic Regression, Calibrated Linear SVM, and Random Forest
- Saves the best model as `saved_models/message_model.pkl`
- Saves the fitted feature transformer as `saved_models/message_vectorizer.pkl`

## How To Train The URL Model

```bash
cd backend
python ml_training/train_url_model.py
```

What it does:

- Bootstraps `datasets/url_dataset.csv` if it does not exist
- Uses URL structure features and phishing-oriented indicators
- Compares Logistic Regression and Random Forest pipelines
- Saves the best model as `saved_models/url_model.pkl`

## How To Train The Image Model

```bash
cd backend
python ml_training/train_image_model.py
```

What it does:

- Uses `datasets/image_dataset/real` and `datasets/image_dataset/fake` if they contain images
- Otherwise reads the existing `backend/datasets/spam_pictures.zip` source directly
- Extracts lightweight image-forensics features such as size, symmetry, entropy, blur-like edge statistics, and compression hints
- Compares Logistic Regression and Random Forest
- Saves the best model as `saved_models/image_model.pkl`

## Evaluation Outputs

Each training script also saves:

- JSON metrics with accuracy, precision, recall, F1-score, confusion matrix, and model comparison
- A readable text report with classification reports for each candidate model

## Backend Run Command

```bash
uvicorn main:app --reload
```

Restart the backend after training so it reloads the newest artifacts from `ml_training/saved_models/`.

## Frontend Run Command

```bash
cd frontend
npm run dev
```

## Notes

- The backend prefers models from `ml_training/saved_models/` when they exist.
- If improved model loading fails, the backend falls back safely to the legacy models or heuristic scoring instead of crashing.
- The image model is intentionally lightweight and ML-ready. A future CNN or transfer-learning deepfake model can replace it later without changing the API route.
