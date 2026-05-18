export interface RegisterInput {
  name: string;
  email: string;
  password: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface RefreshInput {
  refreshToken: string;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateRegisterInput(payload: unknown): RegisterInput {
  if (!payload || typeof payload !== "object") {
    throw new Error("Invalid payload");
  }

  const { name, email, password } = payload as Record<string, unknown>;

  if (typeof name !== "string" || name.trim().length < 2) {
    throw new Error("Name must be at least 2 characters long");
  }

  if (
    typeof email !== "string" ||
    !EMAIL_REGEX.test(email.trim().toLowerCase())
  ) {
    throw new Error("Email is invalid");
  }

  if (typeof password !== "string" || password.length < 8) {
    throw new Error("Password must be at least 8 characters long");
  }

  return {
    name: name.trim(),
    email: email.trim().toLowerCase(),
    password,
  };
}

export function validateLoginInput(payload: unknown): LoginInput {
  if (!payload || typeof payload !== "object") {
    throw new Error("Invalid payload");
  }

  const { email, password } = payload as Record<string, unknown>;

  if (
    typeof email !== "string" ||
    !EMAIL_REGEX.test(email.trim().toLowerCase())
  ) {
    throw new Error("Email is invalid");
  }

  if (typeof password !== "string" || password.length === 0) {
    throw new Error("Password is required");
  }

  return {
    email: email.trim().toLowerCase(),
    password,
  };
}

export function validateRefreshInput(payload: unknown): RefreshInput {
  if (!payload || typeof payload !== "object") {
    throw new Error("Invalid payload");
  }

  const { refreshToken } = payload as Record<string, unknown>;

  if (typeof refreshToken !== "string" || refreshToken.trim().length === 0) {
    throw new Error("Refresh token is required");
  }

  return {
    refreshToken: refreshToken.trim(),
  };
}
