import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AuthShell } from "../components/auth/auth-shell";
import { SignInForm } from "../components/auth/sign-in-form";
import { SignUpForm } from "../components/auth/sign-up-form";
import type {
  AuthContent,
  AuthMode,
  AuthTheme,
  SignInFormData,
  SignUpFormData,
} from "../components/auth/types";

import toast from "react-hot-toast";
import { initSocket } from "../sockets/socket-service";

const ACCESS_TOKEN_KEY = "accessToken";
const REFRESH_TOKEN_KEY = "refreshToken";
const SOCKET_TOKEN_KEY = "authToken"; // token used by socket client
import * as authApi from "../lib/api/auth";
import { firebaseAuth, googleProvider } from "../lib/firebase";
import { signInWithPopup, GoogleAuthProvider } from "firebase/auth";

const signInContent: AuthContent = {
  image: {
    src: "https://i.ibb.co/XrkdGrrv/original-ccdd6d6195fff2386a31b684b7abdd2e-removebg-preview.png",
    alt: "A beautiful interior design for sign-in",
  },
  quote: {
    text: "Welcome Back! The journey continues.",
    author: "PingFLow",
  },
};

const signUpContent: AuthContent = {
  image: {
    src: "https://i.ibb.co/HTZ6DPsS/original-33b8479c324a5448d6145b3cad7c51e7-removebg-preview.png",
    alt: "A vibrant, modern space for new beginnings",
  },
  quote: {
    text: "Create an account. A new chapter awaits.",
    author: "PingFLow",
  },
};

interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  user: Record<string, unknown>;
}

function getInitialTheme(): AuthTheme {
  if (typeof window === "undefined") {
    return "light";
  }

  const storedTheme = window.localStorage.getItem("theme");
  if (storedTheme === "dark" || storedTheme === "light") {
    return storedTheme;
  }

  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function applyTheme(theme: AuthTheme) {
  document.documentElement.classList.toggle("dark", theme === "dark");
  window.localStorage.setItem("theme", theme);
}

function storeAuthTokens(result: AuthResponse | null | undefined) {
  if (!result || !result.accessToken || !result.refreshToken) return;
  try {
    window.localStorage.setItem(ACCESS_TOKEN_KEY, result.accessToken);
    window.localStorage.setItem(REFRESH_TOKEN_KEY, result.refreshToken);
    // Store token used by socket client
    window.localStorage.setItem(SOCKET_TOKEN_KEY, result.accessToken);
    // Initialize socket connection immediately after obtaining token
    initSocket(result.accessToken);
  } catch {
    // ignore storage errors
  }
}

export function AuthPage({ initialMode }: { initialMode?: AuthMode } = {}) {
  const navigate = useNavigate();
  const [mode, setMode] = useState<AuthMode>(() => initialMode ?? "signin");
  const [theme, setTheme] = useState<AuthTheme>(getInitialTheme);
  const [authError, setAuthError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const handleSignIn = async (data: SignInFormData) => {
    setAuthError(null);
    setIsSubmitting(true);

    try {
      const result = await authApi.login({
        email: data.email,
        password: data.password,
      });
      storeAuthTokens(result);
      toast.success("Signed in successfully");
      navigate("/profile");
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Login failed";
      setAuthError(msg);
      toast.error(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSignUp = async (data: SignUpFormData) => {
    setAuthError(null);
    setIsSubmitting(true);

    try {
      const result = await authApi.register({
        name: data.name,
        email: data.email,
        password: data.password,
      });
      // The register endpoint may or may not return tokens depending on server flow.
      if (
        result &&
        (result as any).accessToken &&
        (result as any).refreshToken
      ) {
        storeAuthTokens(result as AuthResponse);
        toast.success("Account created successfully");
        navigate("/profile");
      } else {
        toast.success("Account created — please verify your email if required");
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Sign up failed";
      setAuthError(msg);
      toast.error(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGoogleSignIn = async () => {
    try {
      if (!firebaseAuth || !googleProvider) {
        toast.error("Google sign-in is not configured in this environment.");
        return;
      }
      const result = await signInWithPopup(firebaseAuth, googleProvider);
      // Try to get the Google OAuth ID token from the popup credential
      const credential = GoogleAuthProvider.credentialFromResult(result);
      const idToken = credential?.idToken ?? (await result.user.getIdToken());
      const backendResult = await authApi.googleLogin({ idToken });
      storeAuthTokens(backendResult);
      toast.success("Signed in with Google");
      navigate("/profile");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Google sign‑in failed");
    }
  };
  return (
    <AuthShell
      mode={mode}
      theme={theme}
      onGoogleSignIn={handleGoogleSignIn}
      onToggleTheme={() =>
        setTheme((prev) => (prev === "dark" ? "light" : "dark"))
      }
      onSwitchMode={() =>
        setMode((prev) => (prev === "signin" ? "signup" : "signin"))
      }
      content={mode === "signin" ? signInContent : signUpContent}
    >
      {mode === "signin" ? (
        <SignInForm
          onSubmit={handleSignIn}
          authError={authError}
          isSubmitting={isSubmitting}
        />
      ) : (
        <SignUpForm
          onSubmit={handleSignUp}
          authError={authError}
          isSubmitting={isSubmitting}
        />
      )}
      {/* Google sign-in button moved into AuthShell to avoid duplicate buttons */}
    </AuthShell>
  );
}
