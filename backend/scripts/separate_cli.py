"""Smoke test: run Demucs on a single file end-to-end, outside of FastAPI.

Usage: .venv/bin/python scripts/separate_cli.py path/to/song.mp3
"""
import sys
import time
from pathlib import Path

from demucs.separate import main as demucs_main

MODEL_NAME = "htdemucs"


def main() -> None:
    if len(sys.argv) != 2:
        print("Usage: separate_cli.py <path-to-audio-file>")
        sys.exit(1)

    input_path = Path(sys.argv[1]).expanduser().resolve()
    if not input_path.exists():
        print(f"File not found: {input_path}")
        sys.exit(1)

    out_dir = Path(__file__).resolve().parent.parent / "storage" / "jobs" / "cli-test"
    out_dir.mkdir(parents=True, exist_ok=True)

    print(f"Separating '{input_path.name}' with model '{MODEL_NAME}' (device=cpu)...")
    start = time.time()
    demucs_main([
        "-n", MODEL_NAME,
        "-d", "cpu",
        "-o", str(out_dir),
        str(input_path),
    ])
    elapsed = time.time() - start
    print(f"Done in {elapsed:.1f}s")

    stems_dir = out_dir / MODEL_NAME / input_path.stem
    if stems_dir.exists():
        print("Stems produced:")
        for f in sorted(stems_dir.iterdir()):
            print(f"  {f}")
    else:
        print(f"Expected output dir not found: {stems_dir}")


if __name__ == "__main__":
    main()
