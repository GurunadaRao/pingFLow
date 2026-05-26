export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  user: Record<string, unknown>;
}

const rawApiUrl = (import.meta.env.VITE_API_URL ?? "").toString().trim();
if (!rawApiUrl) {
  // eslint-disable-next-line no-console
  console.warn("VITE_API_URL is not set — falling back to relative /api path");
}
const API_BASE = rawApiUrl
  ? `${rawApiUrl.replace(/\/+$/g, "")}/api/v1/auth`
  : "/api/v1/auth";

async function handleResponse(response: Response) {
  const data = (await response.json().catch(() => null)) as Partial<
    AuthResponse & { error?: string }
  > | null;

  if (!response.ok) {
    throw new Error(data?.error ?? "Request failed");
  }

  if (!data?.accessToken || !data?.refreshToken) {
    throw new Error("Authentication response was incomplete");
  }

  return data as AuthResponse;
}

export async function login(payload: { email: string; password: string }) {
  const res = await fetch(`${API_BASE}/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: payload.email, password: payload.password }),
  });

  return handleResponse(res);
}

export async function register(payload: {
  name: string;
  email: string;
  password: string;
}) {
  const res = await fetch(`${API_BASE}/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      displayName: payload.name,
      email: payload.email,
      password: payload.password,
    }),
  });

  // The server may or may not return tokens on register depending on verification flow.
  const data = (await res.json().catch(() => null)) as Partial<
    AuthResponse & {
      user?: Record<string, unknown>;
      verificationToken?: string;
      error?: string;
    }
  > | null;

  if (!res.ok) throw new Error(data?.error ?? "Request failed");

  // If tokens are present, return them in the AuthResponse shape
  if (data?.accessToken && data?.refreshToken) {
    return data as AuthResponse;
  }

  // Otherwise return whatever the server provided (user, verificationToken, message, etc.)
  return data;
}

export async function googleLogin(payload: { idToken: string }) {
  const res = await fetch(`${API_BASE}/google`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idToken: payload.idToken }),
  });

  return handleResponse(res as Response);
}

export async function refresh(payload: { refreshToken: string }) {
  const res = await fetch(`${API_BASE}/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken: payload.refreshToken }),
  });

  const data = (await res.json().catch(() => null)) as Partial<{
    accessToken?: string;
    refreshToken?: string;
    user?: Record<string, unknown>;
    error?: string;
  }> | null;

  if (!res.ok) throw new Error(data?.error ?? "Refresh failed");
  if (!data?.accessToken) throw new Error("Refresh response incomplete");

  return { accessToken: data.accessToken, refreshToken: data.refreshToken };
}

const ACCESS_TOKEN_KEY = "accessToken";
const REFRESH_TOKEN_KEY = "refreshToken";

export function setTokens(accessToken: string, refreshToken: string) {
  try {
    window.localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
    window.localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
  } catch {
    // ignore storage errors
  }
}

export async function getProfile(): Promise<{ user: Record<string, unknown> }> {
  const attemptFetch = async (token?: string) => {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(`${API_BASE}/profile`, { headers, method: "GET" });
    return res;
  };

  const accessToken =
    window.localStorage.getItem(ACCESS_TOKEN_KEY) ?? undefined;
  let res = await attemptFetch(accessToken);

  if (res.status === 401) {
    const refreshToken = window.localStorage.getItem(REFRESH_TOKEN_KEY);
    if (!refreshToken) throw new Error("Unauthorized");

    // try to rotate tokens
    try {
      const tokens = await refresh({ refreshToken });
      // Update access token and refresh token only when provided by the server
      try {
        window.localStorage.setItem(ACCESS_TOKEN_KEY, tokens.accessToken);
        if (tokens.refreshToken)
          window.localStorage.setItem(REFRESH_TOKEN_KEY, tokens.refreshToken);
      } catch {
        // ignore storage errors
      }

      res = await attemptFetch(tokens.accessToken);
    } catch (err) {
      throw new Error("Unauthorized", { cause: err });
    }
  }

  const data = (await res.json().catch(() => null)) as {
    user?: Record<string, unknown>;
    error?: string;
  } | null;

  if (!res.ok) {
    throw new Error(data?.error ?? "Failed to fetch profile");
  }

  if (!data || !data.user) throw new Error("Profile not found");

  return { user: data.user };
}

export default {
  login,
  register,
  refresh,
  rotate: refresh,
  getProfile,
  setTokens,
  googleLogin,
};
