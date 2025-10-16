// src/firebase.js
import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";

function pick(...vals) {
  for (const v of vals) {
    if (v !== undefined && v !== null && String(v).trim() !== "") return String(v);
  }
  return undefined;
}

const cfg = {
  apiKey: pick(window._env_?.REACT_APP_FIREBASE_API_KEY, process.env.REACT_APP_FIREBASE_API_KEY),
  authDomain: pick(window._env_?.REACT_APP_FIREBASE_AUTH_DOMAIN, process.env.REACT_APP_FIREBASE_AUTH_DOMAIN),
  projectId: pick(window._env_?.REACT_APP_FIREBASE_PROJECT_ID, process.env.REACT_APP_FIREBASE_PROJECT_ID),
  storageBucket: pick(window._env_?.REACT_APP_FIREBASE_STORAGE_BUCKET, process.env.REACT_APP_FIREBASE_STORAGE_BUCKET),
  messagingSenderId: pick(window._env_?.REACT_APP_MESSAGING_SENDER_ID, process.env.REACT_APP_MESSAGING_SENDER_ID),
  appId: pick(window._env_?.REACT_APP_FIREBASE_APP_ID, process.env.REACT_APP_FIREBASE_APP_ID),
  // ถ้ามี measurementId ก็ใส่ได้เหมือนกัน:
  measurementId: pick(window._env_?.REACT_APP_FIREBASE_MEASUREMENT_ID, process.env.REACT_APP_FIREBASE_MEASUREMENT_ID),
};

function assertConfig(obj) {
  const required = ["apiKey", "authDomain", "projectId", "appId"];
  const missing = required.filter(k => !obj[k]);
  if (missing.length) {
    // log แบบไม่โชว์ค่าเต็ม ๆ
    // ช่วยดีบักว่าตอนนี้อ่านจาก window._env_ ได้ไหม
    // eslint-disable-next-line no-console
    console.error("[firebase] Missing keys:", missing);
    // eslint-disable-next-line no-console
    console.error("[firebase] window._env_ keys:", Object.keys(window._env_ || {}));
    throw new Error("Missing Firebase config: " + missing.join(", "));
  }
}
assertConfig(cfg);

const app = initializeApp(cfg);

export const auth = getAuth(app);
export const provider = new GoogleAuthProvider();
// ปรับ optional:
provider.setCustomParameters({ prompt: "select_account" });
// auth.useDeviceLanguage(); // ถ้าต้องการให้ UI ตามภาษาของเบราว์เซอร์

export default app;
