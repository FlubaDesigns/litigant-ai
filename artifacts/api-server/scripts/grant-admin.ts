import { initializeApp, cert } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON!);
initializeApp({ credential: cert(sa) });

const email = process.argv[2];
if (!email) { console.error("Usage: grant-admin.ts <email>"); process.exit(1); }

const user = await getAuth().getUserByEmail(email);
console.log("Found UID:", user.uid);
await getAuth().setCustomUserClaims(user.uid, { admin: true });
console.log("✅ Admin claim set for", user.email);
process.exit(0);
