"""Configuration management for PaperTrail."""

import os
from pathlib import Path
from typing import Any

import yaml
from dotenv import load_dotenv

# Resolve project root (4 levels up from this file: python/papertrail/common/config.py -> root)
ROOT_DIR = Path(__file__).resolve().parents[3]

# Load root .env
load_dotenv(ROOT_DIR / ".env")
load_dotenv(ROOT_DIR / "python" / ".env")

MANIFEST_PATH = ROOT_DIR / "data" / "manifest" / "corpus.yaml"
CHUNK_CONFIGS_PATH = ROOT_DIR / "data" / "manifest" / "chunk_configs.yaml"
RAW_DATA_DIR = ROOT_DIR / "data" / "raw"
RESULTS_DIR = ROOT_DIR / "data" / "results"

def get_database_url() -> str:
    url = os.environ.get("DIRECT_URL") or os.environ.get("DATABASE_URL")
    if not url:
        raise ValueError("Neither DIRECT_URL nor DATABASE_URL is set in .env")
    return url

def load_manifest() -> dict[str, Any]:
    if not MANIFEST_PATH.exists():
        raise FileNotFoundError(f"Manifest not found at {MANIFEST_PATH}")
    with open(MANIFEST_PATH, encoding="utf-8") as f:
        return yaml.safe_load(f)

def load_chunk_configs() -> dict[str, Any]:
    if not CHUNK_CONFIGS_PATH.exists():
        raise FileNotFoundError(f"Chunk configs not found at {CHUNK_CONFIGS_PATH}")
    with open(CHUNK_CONFIGS_PATH, encoding="utf-8") as f:
        data = yaml.safe_load(f)
    return data.get("configs", {})
