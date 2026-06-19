#!/bin/bash
# scripts/export.sh — create a SHA-256 verified zip of all deployable source files.
#
# Excludes anything that can be rebuilt (lock files, dist/, .firebase cache,
# attached_assets screenshots) or is too large to be useful in a source export.
#
# Usage:
#   bash scripts/export.sh              # exports/litigant-ai-<timestamp>.zip
#   bash scripts/export.sh --dry-run    # manifest only, no zip

set -euo pipefail
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

OUTDIR="exports"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
ZIPNAME="litigant-ai-${TIMESTAMP}.zip"
MANIFEST="${OUTDIR}/manifest-${TIMESTAMP}.sha256"
DRY_RUN=false
for arg in "$@"; do [[ "$arg" == "--dry-run" ]] && DRY_RUN=true; done

mkdir -p "$OUTDIR"

# ── Step 1: source file list from git, minus rebuildable/large artifacts ──────
echo "[1/3] Listing deployable source files..."

GIT_SHA=$(git --no-optional-locks rev-parse --short HEAD 2>/dev/null || echo "unknown")

FILES=$(git --no-optional-locks ls-files | grep -vE \
  '^(attached_assets/|\.firebase/|pnpm-lock\.yaml$|.*\.tsbuildinfo$|exports/|downloads/)' \
  | grep -vE \
  '(\.zip$|firebase-functions/lib/|firebase-functions/package-lock\.json$|/public/downloads/)' \
  | sort)

FILE_COUNT=$(echo "$FILES" | grep -c . || true)
echo "  → ${FILE_COUNT} source files at commit ${GIT_SHA}"

# ── Step 2: SHA-256 checksum every file ───────────────────────────────────────
echo "[2/3] Computing checksums..."

> "$MANIFEST"
FAIL=0
while IFS= read -r f; do
  [[ -z "$f" ]] && continue
  if [[ ! -f "$f" ]]; then
    echo "  ✗ MISSING ON DISK: $f"
    FAIL=$((FAIL + 1))
    continue
  fi
  sha256sum "$f" >> "$MANIFEST"
done <<< "$FILES"

echo "  → $(wc -l < "$MANIFEST" | tr -d ' ') checksums → ${MANIFEST}"
[[ $FAIL -gt 0 ]] && { echo "  ✗ ${FAIL} missing file(s). Run: git status" >&2; exit 1; }

if [[ "$DRY_RUN" == true ]]; then
  echo ""; echo "Dry-run done. Manifest: ${MANIFEST}  Commit: ${GIT_SHA}"; exit 0
fi

# ── Step 3 & 4: zip + verify via Python (no 'zip' binary required) ────────────
echo "[3/3] Creating and verifying zip..."

python3 - "$MANIFEST" "${OUTDIR}/${ZIPNAME}" <<'PYEOF'
import sys, hashlib, zipfile, pathlib, os

manifest_path = sys.argv[1]
zip_path      = sys.argv[2]

entries = []
with open(manifest_path) as f:
    for line in f:
        line = line.strip()
        if not line: continue
        expected_hash, filepath = line.split(None, 1)
        entries.append((expected_hash, filepath))

with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=6) as zf:
    for _, filepath in entries:
        zf.write(filepath)

# Verify: re-hash every entry inside the zip
missing, mismatch = [], []
with zipfile.ZipFile(zip_path, "r") as zf:
    names_in_zip = set(zf.namelist())
    for expected_hash, filepath in entries:
        if filepath not in names_in_zip:
            missing.append(filepath)
            continue
        data = zf.read(filepath)
        actual_hash = hashlib.sha256(data).hexdigest()
        if actual_hash != expected_hash:
            mismatch.append(filepath)

total = len(entries)
if missing:
    print(f"\n  ✗ {len(missing)} file(s) missing from zip:")
    for f in missing: print(f"      {f}")
if mismatch:
    print(f"\n  ✗ {len(mismatch)} file(s) hash mismatch (truncated write?):")
    for f in mismatch: print(f"      {f}")
if missing or mismatch:
    sys.exit(1)

size_kb = os.path.getsize(zip_path) // 1024
print(f"  ✓ {total}/{total} files verified")
print(f"\n  Zip:    {zip_path}  ({size_kb} KB)")
PYEOF

echo "  Manifest: ${MANIFEST}  Commit: ${GIT_SHA}"
