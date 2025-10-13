import admin from "firebase-admin";
// import fs from "fs";
// import path from "path";
// import { fileURLToPath } from "url";
import "dotenv/config";

function normalizePrivateKey(pk) {
  return pk.replace(/\\n/g, "\n");
}

function resolveCredentials() {
  const projectId = process.env.REACT_APP_FIREBASE_PROJECT_ID;
  const clientEmail = process.env.REACT_APP_GOOGLE_CLIENT_EMAIL;
  const privateKey = normalizePrivateKey(process.env.REACT_PRIVATE_KEY);

  if (projectId && clientEmail && privateKey) {
    return {
      type: "service_account", 
      project_id: projectId,
      client_email: clientEmail,
      private_key: privateKey,
    };
  }
  return null;
}

const credentials = resolveCredentials();

if (!admin.apps.length) {
  if (credentials) {
    admin.initializeApp({ credential: admin.credential.cert(credentials) });
  } else {
    try {
      admin.initializeApp({ credential: admin.credential.applicationDefault() });
      console.warn("Initialized Firebase Admin with applicationDefault credentials.");
    } catch (e) {
      throw new Error("No Firebase credentials found. Provide backend/config/service-account.json or set FIREBASE_SERVICE_ACCOUNT_JSON or GOOGLE_APPLICATION_CREDENTIALS.");
    }
  }
}

export default admin;