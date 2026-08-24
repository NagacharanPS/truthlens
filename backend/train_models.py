import os
import zipfile
import pandas as pd
import joblib

from sklearn.pipeline import Pipeline
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression

os.makedirs("models", exist_ok=True)
os.makedirs("datasets/extracted/msg", exist_ok=True)
os.makedirs("datasets/extracted/urls", exist_ok=True)

def unzip_file(zip_path, extract_to):
    with zipfile.ZipFile(zip_path, "r") as zip_ref:
        zip_ref.extractall(extract_to)
    print("Extracted:", zip_path)

def find_csv(folder):
    for root, dirs, files in os.walk(folder):
        for file in files:
            if file.lower().endswith(".csv"):
                return os.path.join(root, file)
    return None

unzip_file("datasets/msg.zip", "datasets/extracted/msg")
unzip_file("datasets/urls.zip", "datasets/extracted/urls")

# Message model
msg_csv = find_csv("datasets/extracted/msg")
print("Message CSV found:", msg_csv)

msg = pd.read_csv(msg_csv, encoding="latin-1")

if "v1" in msg.columns and "v2" in msg.columns:
    msg = msg[["v1", "v2"]]
    msg.columns = ["label", "message"]
else:
    msg = msg.iloc[:, :2]
    msg.columns = ["label", "message"]

msg = msg.dropna()

message_model = Pipeline([
    ("tfidf", TfidfVectorizer()),
    ("clf", LogisticRegression(max_iter=1000))
])

message_model.fit(msg["message"], msg["label"])
joblib.dump(message_model, "models/message_model.pkl")
print("Saved message_model.pkl")

# URL model
url_csv = find_csv("datasets/extracted/urls")
print("URL CSV found:", url_csv)

url = pd.read_csv(url_csv)
url = url[["url", "label"]].dropna()

# use only sample rows for speed
url = url.sample(n=5000, random_state=42)

url_model = Pipeline([
    ("tfidf", TfidfVectorizer(
        analyzer="char",
        ngram_range=(2,4),
        max_features=3000
    )),
    ("clf", LogisticRegression(max_iter=500))
])

url_model.fit(url["url"], url["label"])
joblib.dump(url_model, "models/url_model.pkl")
print("Saved url_model.pkl")

print("All models created successfully")