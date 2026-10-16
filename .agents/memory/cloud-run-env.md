# Retired deployment instructions

Use the current README.md “Release and deploy” section. The only production
release path is the exact-source Authorization Engine approval transported by
`.github/workflows/deploy-cloudrun.yml` and `scripts/lai-release.mjs`.
Build through `artifacts/api-server/build.mjs` and its canonical Dockerfile.
The old direct deployment and Firebase Functions build commands are disabled.
