import admin from "firebase-admin";
import { createRequire } from "module";

const require = createRequire(import.meta.url);

import fs from "fs";
import path from "path";

try {
  let serviceAccount: any;

  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  } else {
    const jsonPath = path.join(process.cwd(), "config", "firebase-service-account.json");
    if (fs.existsSync(jsonPath)) {
      serviceAccount = require("./firebase-service-account.json");
    }
  }

  if (serviceAccount && !admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
    console.log("✅ Firebase Admin SDK initialized successfully.");
  } else if (!serviceAccount) {
    console.warn("⚠️  Firebase Admin SDK service account not provided. Push notifications disabled.");
  }
} catch (error: any) {
  console.warn("⚠️  Firebase Admin SDK failed to initialize. Push notifications will be disabled. Error:", error.message);
}

export default admin;