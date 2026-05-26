import { Navigate, Route, Routes } from "react-router-dom";
import { AuthPage } from "./pages/auth-page";
import { AppShell } from "./components/layout/app-shell";
import { ChatPage } from "./features/chat";
import { CommunitiesPage } from "./pages/communities-page";
import { ProfilePage } from "./features/profile";
import { StatusPage } from "./pages/status-page";
import ProtectedRoute from "./components/auth/protected-route";

import { useEffect } from "react";
import { initSocket } from "./sockets/socket-service";

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

function App() {
  useEffect(() => {
    const keys = ["accessToken", "authToken"];
    const token =
      keys.map((k) => localStorage.getItem(k)).find(Boolean) || null;
    if (token && isJwtValid(token)) {
      initSocket(token);
    } else if (token) {
      console.warn(
        "🔌 Token found but appears invalid/expired; socket not initialized.",
      );
    } else {
      console.warn("🔌 No auth token found; socket not initialized.");
    }
  }, []);

  return (
    <Routes>
      <Route path="/auth/login" element={<AuthPage initialMode={"signin"} />} />
      <Route
        path="/auth/signup"
        element={<AuthPage initialMode={"signup"} />}
      />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <AppShell />
          </ProtectedRoute>
        }
      >
        <Route path="/chat" element={<ChatPage />} />
        <Route path="/status" element={<StatusPage />} />
        <Route path="/communities" element={<CommunitiesPage />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/profile/:sectionId" element={<ProfilePage />} />
        <Route index element={<Navigate to="/chat" replace />} />
      </Route>
      <Route path="*" element={<Navigate to="/auth/login" replace />} />
    </Routes>
  );
}

export default App;
