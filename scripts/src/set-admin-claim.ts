/**
 * set-admin-claim.ts
 *
 * One-time bootstrap script to grant the `admin: true` Firebase Auth custom
 * claim to a user. Run this from the workspace root:
 *
 *   FIREBASE_SERVICE_ACCOUNT='<json>' pnpm --filter @workspace/scripts \
 *     exec tsx src/set-admin-claim.ts user@example.com
 *
 * Or by UID:
 *
 *   FIREBASE_SERVICE_ACCOUNT='<json>' pnpm --filter @workspace/scripts \
 *     exec tsx src/set-admin-claim.ts --uid abc123
 *
 * FIREBASE_SERVICE_ACCOUNT must be the JSON content of a Firebase service
 * account key file (not a path). You can also set FIREBASE_PROJECT_ID to
 * use application default credentials instead.
 *
 * After running, the user must sign out and sign back in for the new claim
 * to appear in their ID token.
 */

import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

function initAdmin() {
  if (getApps().length > 0) return;
  const serviceAccount = process.env["FIREBASE_SERVICE_ACCOUNT"];
  const projectId = process.env["FIREBASE_PROJECT_ID"];

  if (serviceAccount) {
    initializeApp({ credential: cert(JSON.parse(serviceAccount)) });
  } else if (projectId) {
    initializeApp({ projectId });
  } else {
    throw new Error(
      "Set FIREBASE_SERVICE_ACCOUNT or FIREBASE_PROJECT_ID before running this script."
    );
  }
}

async function main() {
  initAdmin();
  const auth = getAuth();

  const args = process.argv.slice(2);
  let uid: string | undefined;
  let email: string | undefined;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--uid" && args[i + 1]) {
      uid = args[i + 1];
    } else if (args[i] && !args[i]!.startsWith("--")) {
      email = args[i];
    }
  }

  if (!uid && !email) {
    console.error("Usage: tsx src/set-admin-claim.ts <email> [--uid <uid>]");
    process.exit(1);
  }

  let user;
  if (uid) {
    user = await auth.getUser(uid);
  } else {
    user = await auth.getUserByEmail(email!);
  }

  const currentClaims = user.customClaims ?? {};
  if (currentClaims["admin"] === true) {
    console.log(`✓ ${user.email ?? user.uid} already has admin: true`);
    process.exit(0);
  }

  await auth.setCustomUserClaims(user.uid, { ...currentClaims, admin: true });

  console.log(`✓ Set admin: true on ${user.email ?? user.uid} (UID: ${user.uid})`);
  console.log("  → The user must sign out and sign back in for the claim to take effect.");

  process.exit(0);
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
