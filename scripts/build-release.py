#!/usr/bin/env python3
"""
Litigant AI — Release Builder
Usage: python3 scripts/build-release.py

Builds downloads/litigant-ai-latest.zip from the current workspace,
verifies every file in REQUIRED_FILES is present, and writes a SHA-256
checksum to downloads/litigant-ai-latest.sha256.

Exit code 0 = success, 1 = completeness check failed.
"""

import zipfile, os, hashlib, sys
from datetime import datetime, timezone

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# ── Exclusions ────────────────────────────────────────────────────────────────
EXCLUDE_DIRS = {
    "node_modules", ".git", "dist", ".cache",
    "__pycache__", ".local", "downloads", "attached_assets",
}
EXCLUDE_SUBTREES = {
    "firebase-functions/lib",
}
EXCLUDE_EXTS = {".zip", ".tar", ".gz", ".log"}

# ── Completeness checklist — every file here must be in the final zip ─────────
REQUIRED_FILES = [
    # Core frontend
    "artifacts/gh-brain/src/pages/app/Session.tsx",
    "artifacts/gh-brain/src/hooks/useBrainSession.ts",
    "artifacts/gh-brain/src/services/sessionService.ts",
    "artifacts/gh-brain/src/services/firestoreService.ts",
    "artifacts/gh-brain/src/services/authService.ts",
    "artifacts/gh-brain/src/services/adminService.ts",
    "artifacts/gh-brain/src/contexts/AuthContext.tsx",
    "artifacts/gh-brain/src/data/templates.ts",
    "artifacts/gh-brain/src/data/toolPages.ts",
    "artifacts/gh-brain/src/pages/app/Billing.tsx",
    "artifacts/gh-brain/src/pages/app/History.tsx",
    "artifacts/gh-brain/src/pages/app/Settings.tsx",
    "artifacts/gh-brain/src/pages/admin/Admin.tsx",
    # Core backend
    "artifacts/api-server/src/lib/brainEngine.ts",
    "artifacts/api-server/src/lib/creditLedger.ts",
    "artifacts/api-server/src/lib/creditEngine.ts",
    "artifacts/api-server/src/lib/pricingConfig.ts",
    "artifacts/api-server/src/lib/seatBriefs.ts",
    "artifacts/api-server/src/lib/emailService.ts",
    "artifacts/api-server/src/lib/emailTemplateStore.ts",
    "artifacts/api-server/src/routes/brain.ts",
    "artifacts/api-server/src/routes/billing.ts",
    "artifacts/api-server/src/routes/admin.ts",
    "artifacts/api-server/src/routes/sessions.ts",
    "artifacts/api-server/src/routes/account.ts",
    # Seat briefs
    "artifacts/api-server/src/seats/orchestrator.md",
    "artifacts/api-server/src/seats/moderator.md",
    "artifacts/api-server/src/seats/architect.md",
    "artifacts/api-server/src/seats/builder.md",
    "artifacts/api-server/src/seats/auditor.md",
    "artifacts/api-server/src/seats/litigant.md",
    # Firebase / config
    "firebase.json",
    "firestore.rules",
    "package.json",
    "pnpm-workspace.yaml",
    # Docs
    "docs/firebase-audit.md",
]

# ── Build ─────────────────────────────────────────────────────────────────────
def collect_files():
    manifest = []
    for dirpath, dirs, files in os.walk(ROOT):
        dirs[:] = sorted(
            d for d in dirs
            if d not in EXCLUDE_DIRS and not d.startswith(".")
        )
        rel_root = os.path.relpath(dirpath, ROOT)
        if rel_root == ".":
            rel_root = ""
        if any(rel_root == x or rel_root.startswith(x + os.sep)
               for x in EXCLUDE_SUBTREES):
            continue
        for fname in sorted(files):
            if any(fname.endswith(e) for e in EXCLUDE_EXTS):
                continue
            abs_path = os.path.join(dirpath, fname)
            arc_name = os.path.join(rel_root, fname) if rel_root else fname
            manifest.append((abs_path, arc_name))
    return manifest


def build_zip(manifest, zip_path):
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as zf:
        for abs_path, arc_name in manifest:
            zf.write(abs_path, arc_name)


def verify(zip_path):
    with zipfile.ZipFile(zip_path) as zf:
        packed = {info.filename for info in zf.infolist()}
    missing = [f for f in REQUIRED_FILES if f not in packed]
    return missing


def sha256(zip_path):
    h = hashlib.sha256()
    with open(zip_path, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


def main():
    os.makedirs(os.path.join(ROOT, "downloads"), exist_ok=True)
    zip_path = os.path.join(ROOT, "downloads", "litigant-ai-latest.zip")
    sha_path = zip_path.replace(".zip", ".sha256")

    print("Collecting files…")
    manifest = collect_files()
    print(f"  {len(manifest)} files found")

    print("Building zip…")
    build_zip(manifest, zip_path)
    size_mb = os.path.getsize(zip_path) / 1024 / 1024
    print(f"  {size_mb:.2f} MB written to downloads/litigant-ai-latest.zip")

    print("Verifying completeness…")
    missing = verify(zip_path)
    if missing:
        print(f"\n  FAILED — {len(missing)} required file(s) missing from zip:")
        for f in missing:
            print(f"    ✗  {f}")
        sys.exit(1)
    else:
        print(f"  All {len(REQUIRED_FILES)} required files verified ✓")

    print("Computing SHA-256…")
    digest = sha256(zip_path)
    with open(sha_path, "w") as f:
        f.write(f"{digest}  litigant-ai-latest.zip\n")
    print(f"  {digest}")

    print(f"\n  Built: {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}")
    print(f"  Files: {len(manifest)}")
    print(f"  Size:  {size_mb:.2f} MB")
    print(f"  SHA-256: {digest}")
    print("\ndownloads/")
    for fname in sorted(os.listdir(os.path.join(ROOT, "downloads"))):
        sz = os.path.getsize(os.path.join(ROOT, "downloads", fname))
        print(f"  {fname}  ({sz/1024:.0f} KB)")


if __name__ == "__main__":
    main()
