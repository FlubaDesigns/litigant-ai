# Repository publishing rules

- Before any Git push or GitHub API write, run `python3 scripts/source_safety.py` on the full candidate checkout and inspect the exact files being published. This includes nested source archives. Never publish a credential value, including a Google browser API key.
- Store credentials in the existing secret store or ignored local environment files. `.gitignore` does not protect files already tracked by Git. Preserve existing executable modes when publishing through the GitHub API.
- Never print credentials in logs, commits, reports, or chat. Removing a value from Main does not revoke it or erase Git history; report those states separately.
