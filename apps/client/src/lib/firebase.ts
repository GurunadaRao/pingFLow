import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import type { Auth } from "firebase/auth";

// Coerce env values to strings and trim whitespace to avoid invalid-api-key errors
const firebaseConfig = {
  apiKey: (import.meta.env.VITE_FIREBASE_API_KEY ?? "").toString().trim(),
  authDomain: (import.meta.env.VITE_FIREBASE_AUTH_DOMAIN ?? "")
    .toString()
    .trim(),
  projectId: (import.meta.env.VITE_FIREBASE_PROJECT_ID ?? "").toString().trim(),
  storageBucket: (import.meta.env.VITE_FIREBASE_STORAGE_BUCKET ?? "")
    .toString()
    .trim(),
  messagingSenderId: (import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID ?? "")
    .toString()
    .trim(),
  appId: (import.meta.env.VITE_FIREBASE_APP_ID ?? "").toString().trim(),
  measurementId: (import.meta.env.VITE_FIREBASE_MEASUREMENT_ID ?? "")
    .toString()
    .trim(),
};

function isValidApiKey(key: unknown): key is string {
  return typeof key === "string" && key.trim().length > 10;
}

let firebaseAuth: Auth | null = null;
let googleProvider: GoogleAuthProvider | null = null;

try {
  if (!isValidApiKey(firebaseConfig.apiKey)) {
    // Fail fast with a clear console message instead of throwing an uncaught error
    // while keeping the app usable for non-Firebase flows.
    // eslint-disable-next-line no-console
    console.warn(
      "Firebase API key appears missing or invalid. Google sign-in will be disabled.",
    );
    console.debug(
      "firebase.apiKey length:",
      (firebaseConfig.apiKey || "").length,
    );
  } else {
    const app = initializeApp(firebaseConfig);
    firebaseAuth = getAuth(app);
    googleProvider = new GoogleAuthProvider();
  }
} catch (err) {
  // If initializeApp throws (for example invalid key), avoid crashing the whole app.
  // eslint-disable-next-line no-console
  console.error("Firebase initialization failed:", err);
  firebaseAuth = null;
  googleProvider = null;
}

export { firebaseAuth, googleProvider };
