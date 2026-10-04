"""Shared source-export policy and credential checks. Never print matched values."""
import io
import pathlib
import re
import subprocess
import sys
import tomllib
import zipfile

ROOT = pathlib.Path(__file__).resolve().parents[1]
SECRET_NAMES = {
    'FIREBASE_SERVICE_ACCOUNT_JSON', 'FIREBASE_SERVICE_ACCOUNT', 'GCP_SA_KEY',
    'ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'GEMINI_API_KEY', 'XAI_API_KEY',
    'RESEND_API_KEY', 'SQUARE_ACCESS_TOKEN', 'SQUARE_WEBHOOK_SIGNATURE_KEY',
    'ADMIN_MASTER_SECRET', 'SESSION_SECRET', 'VITE_FIREBASE_API_KEY',
}
PATTERNS = {
    'Google API key': rb'AIza[0-9A-Za-z_-]{35}',
    'private key': rb'-----BEGIN (?:RSA |EC )?PRIVATE KEY-----',
    'Anthropic token': rb'sk-ant-api\d+-[A-Za-z0-9_-]{50,}',
    'OpenAI token': rb'sk-proj-[A-Za-z0-9_-]{40,}',
    'xAI token': rb'xai-[A-Za-z0-9_-]{40,}',
    'Resend token': rb'(?<![A-Za-z0-9_])re_[A-Za-z0-9_]{25,}',
}


def tracked_files():
    return subprocess.check_output(['git', 'ls-files', '-z'], cwd=ROOT).decode().rstrip('\0').split('\0')


def source_files():
    excluded = {'node_modules', '.git', '.firebase', 'dist', 'downloads', 'exports',
                'attached_assets', 'test-results', 'playwright-report', '__pycache__'}
    for name in tracked_files():
        path = pathlib.PurePosixPath(name)
        if not (ROOT / name).is_file() or excluded.intersection(path.parts):
            continue
        if name.startswith('firebase-functions/lib/') or path.suffix in {'.zip', '.gz', '.tar', '.log', '.tsbuildinfo'}:
            continue
        if path.name == '.replit' or (path.name.startswith('.env') and path.name not in {'.env.example', '.env.production'}):
            continue
        yield name


def inspect_bytes(name, data, depth=0):
    findings = [(name, label) for label, pattern in PATTERNS.items() if re.search(pattern, data)]
    if name.split('!')[-1].endswith('.replit'):
        try:
            config = tomllib.loads(data.decode())
            shared = config.get('userenv', {}).get('shared', {})
            findings.extend((name, 'credential assignment: ' + key) for key in SECRET_NAMES if shared.get(key))
        except (ValueError, UnicodeError):
            findings.append((name, 'unreadable Replit configuration'))
    if data.startswith(b'PK\x03\x04'):
        if depth >= 3:
            return findings + [(name, 'archive nesting limit exceeded')]
        try:
            with zipfile.ZipFile(io.BytesIO(data)) as archive:
                total = 0
                for entry in archive.infolist():
                    total += entry.file_size
                    if total > 100_000_000 or entry.file_size > 30_000_000:
                        findings.append((name, 'archive inspection limit exceeded'))
                        break
                    if not entry.is_dir():
                        findings.extend(inspect_bytes(name + '!' + entry.filename, archive.read(entry), depth + 1))
        except (zipfile.BadZipFile, RuntimeError):
            findings.append((name, 'unreadable archive'))
    return findings


def check_sources():
    findings = []
    for name in tracked_files():
        path = ROOT / name
        if path.is_file():
            findings.extend(inspect_bytes(name, path.read_bytes()))
    for name, reason in findings:
        print(f'{name}: {reason}', file=sys.stderr)
    if findings:
        raise SystemExit(1)
    print('Tracked source and archive credential checks passed.', file=sys.stderr)


if __name__ == '__main__':
    check_sources()
    if len(sys.argv) > 1 and sys.argv[1] == 'manifest':
        print('\n'.join(source_files()))
