# Replit dependency retirement — 2026-10-20

Removed the unused SQL workspace and its API/Docker/compiler references, Replit tooling and domain fallbacks. Existing Firestore-backed Google Cloud API and Firebase Hosting remain.

No customer data, provider accounts, subscriptions, credentials or cloud resources are deleted. Candidate checks and production deployment/verification are separate. Historical instruction documents named replit.md remain documentation, not runtime dependencies.
