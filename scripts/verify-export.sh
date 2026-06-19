#!/bin/bash
# scripts/verify-export.sh — verify a zip against its SHA-256 manifest.
#
# Usage:
#   bash scripts/verify-export.sh <zip> <manifest>

set -euo pipefail
ZIP="${1:-}"; MANIFEST="${2:-}"
[[ -z "$ZIP" || -z "$MANIFEST" ]] && { echo "Usage: $0 <zip> <manifest>" >&2; exit 1; }
[[ ! -f "$ZIP"      ]] && { echo "✗ Zip not found: $ZIP" >&2;      exit 1; }
[[ ! -f "$MANIFEST" ]] && { echo "✗ Manifest not found: $MANIFEST" >&2; exit 1; }

python3 - "$ZIP" "$MANIFEST" <<'PYEOF'
import sys, hashlib, zipfile

zip_path      = sys.argv[1]
manifest_path = sys.argv[2]

entries = []
with open(manifest_path) as f:
    for line in f:
        line = line.strip()
        if not line: continue
        expected_hash, filepath = line.split(None, 1)
        entries.append((expected_hash, filepath))

ok = err = 0
with zipfile.ZipFile(zip_path, "r") as zf:
    names_in_zip = set(zf.namelist())
    for expected_hash, filepath in entries:
        if filepath not in names_in_zip:
            print(f"  ✗ MISSING:  {filepath}")
            err += 1
            continue
        actual_hash = hashlib.sha256(zf.read(filepath)).hexdigest()
        if actual_hash == expected_hash:
            ok += 1
        else:
            print(f"  ✗ MISMATCH: {filepath}")
            print(f"      expected: {expected_hash}")
            print(f"      actual:   {actual_hash}")
            err += 1

total = ok + err
print()
if err == 0:
    print(f"✓ {ok}/{total} files — zip is complete and unmodified")
else:
    print(f"✗ {err}/{total} files failed verification")
    sys.exit(1)
PYEOF
