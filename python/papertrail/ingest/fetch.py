"""Fetch corpus PDFs from manifest and calculate SHA-256 checksums."""

import hashlib
import time
from pathlib import Path

import httpx
import yaml

ROOT_DIR = Path(__file__).resolve().parents[3]
MANIFEST_PATH = ROOT_DIR / "data" / "manifest" / "corpus.yaml"
RAW_DIR = ROOT_DIR / "data" / "raw"

def compute_sha256(filepath: Path) -> str:
    hasher = hashlib.sha256()
    with open(filepath, "rb") as f:
        while chunk := f.read(65536):
            hasher.update(chunk)
    return hasher.hexdigest()

def fetch_corpus():
    RAW_DIR.mkdir(parents=True, exist_ok=True)

    with open(MANIFEST_PATH, encoding="utf-8") as f:
        manifest = yaml.safe_load(f)

    papers = manifest.get("papers", [])
    updated = False

    print(f"Fetching {len(papers)} papers from manifest...")
    headers = {
        "User-Agent": "PaperTrail-Research-Assistant/1.0 (Academic research project; mailto:contact@example.com)"
    }

    client = httpx.Client(timeout=60.0, follow_redirects=True, headers=headers)

    for paper in papers:
        doc_id = paper["doc_id"]
        source_url = paper["source_url"]
        target_path = RAW_DIR / f"{doc_id}.pdf"
        expected_sha = paper.get("sha256", "").strip()

        if target_path.exists():
            computed_sha = compute_sha256(target_path)
            if expected_sha and computed_sha == expected_sha:
                print(f"  [OK / CACHED] {doc_id} ({target_path.name})")
                continue
            elif not expected_sha:
                print(f"  [EXISTING] {doc_id} -> computed SHA256: {computed_sha}")
                paper["sha256"] = computed_sha
                updated = True
                continue

        print(f"  [DOWNLOADING] {doc_id} from {source_url} ...")
        try:
            resp = client.get(source_url)
            resp.raise_for_status()
            with open(target_path, "wb") as f:
                f.write(resp.content)

            computed_sha = compute_sha256(target_path)
            paper["sha256"] = computed_sha
            updated = True
            print(f"  [SAVED] {doc_id} ({len(resp.content)} bytes, sha: {computed_sha[:10]}...)")
            # Polite delay between arXiv requests
            time.sleep(1.0)
        except Exception as e:
            print(f"  [ERROR] Failed to download {doc_id}: {e}")

    if updated:
        with open(MANIFEST_PATH, "w", encoding="utf-8") as f:
            yaml.dump(manifest, f, sort_keys=False)
        print(f"Updated {MANIFEST_PATH} with computed SHA-256 hashes.")

if __name__ == "__main__":
    fetch_corpus()
