import admin from "firebase-admin";
import { createRequire } from "module";

const require = createRequire(import.meta.url);

try {
  let serviceAccount: any;

  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  } else {
    serviceAccount = require("./firebase-service-account.json");
  }

  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
    console.log("✅ Firebase Admin SDK initialized successfully.");
  }
} catch (error: any) {
  console.warn("⚠️  Firebase Admin SDK failed to initialize. Push notifications will be disabled. Error:", error.message);
}

export default admin;