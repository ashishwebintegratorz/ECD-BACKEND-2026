import admin from "firebase-admin";
import { createRequire } from "module";

const require = createRequire(import.meta.url);

try {
  const serviceAccount = require("./firebase-service-account.json");

  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
    console.log("✅ Firebase Admin SDK initialized successfully.");
  }
} catch (error) {
  console.warn("⚠️  Firebase Service Account not found (config/firebase-service-account.json). Push notifications will be disabled.");
}

export default admin;