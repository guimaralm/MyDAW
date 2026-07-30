"""Pre-download the Demucs model weights so the first real separation isn't slowed by a download."""
from demucs.pretrained import get_model

MODEL_NAME = "htdemucs"

if __name__ == "__main__":
    print(f"Downloading/caching model '{MODEL_NAME}'...")
    get_model(MODEL_NAME)
    print("Model cached and ready.")
