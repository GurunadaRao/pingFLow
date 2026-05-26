import { Navigate, useLocation } from "react-router-dom";

const ACCESS_TOKEN_KEYS = ["accessToken", "authToken"];

function isJwtValid(token: string | null) {
  if (!token) return false;
  if (token.split(".").length === 3) {
    try {
      const payload = JSON.parse(atob(token.split(".")[1]));
      if (payload && payload.exp) {
        return Date.now() / 1000 < payload.exp - 5;
      }
    } catch {
      return false;
    }
  }
  return true;
}

export function ProtectedRoute({ children }: { children: JSX.Element }) {
  const location = useLocation();
  const token =
    typeof window !== "undefined"
      ? ACCESS_TOKEN_KEYS.map((k) => window.localStorage.getItem(k)).find(
          Boolean,
        ) || null
      : null;

  if (!isJwtValid(token)) {
    return <Navigate to="/auth/login" replace state={{ from: location }} />;
  }

  return children;
}

export default ProtectedRoute;
