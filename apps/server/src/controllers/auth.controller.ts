import { Request, Response } from "express";

import {
  registerUser,
  verifyEmail,
  loginUser,
  refreshAccessToken,
  revokeRefreshToken,
  logoutAllDevices,
  requestPasswordReset,
  resetPassword,
  getUserById,
} from "../services/auth.service";

function handleAuthError(error: unknown, res: Response): Response {
  if (error instanceof Error) {
    return res.status(400).json({ error: error.message });
  }

  return res.status(500).json({ error: "Internal server error" });
}

export async function registerHandler(
  req: Request,
  res: Response,
): Promise<Response> {
  try {
    const { email, password, displayName } = req.body;

    if (!email || !password || !displayName) {
      return res.status(400).json({
        error: "Email, password, and displayName are required",
      });
    }

    const result = await registerUser(email, password, displayName);
    return res.status(201).json(result);
  } catch (error) {
    return handleAuthError(error, res);
  }
}

export async function verifyEmailHandler(
  req: Request,
  res: Response,
): Promise<Response> {
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({ error: "Verification token is required" });
    }

    const user = await verifyEmail(token);
    return res
      .status(200)
      .json({ user, message: "Email verified successfully" });
  } catch (error) {
    return handleAuthError(error, res);
  }
}

export async function loginHandler(
  req: Request,
  res: Response,
): Promise<Response> {
  try {
    const { email, password, deviceId, platform } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        error: "Email and password are required",
      });
    }

    const userAgent = req.get("user-agent") || "";
    const ipAddress = req.ip || "0.0.0.0";

    const result = await loginUser(
      email,
      password,
      deviceId || "default",
      platform || "web",
      userAgent,
      ipAddress,
    );

    return res.status(200).json(result);
  } catch (error) {
    return handleAuthError(error, res);
  }
}

export async function refreshTokenHandler(
  req: Request,
  res: Response,
): Promise<Response> {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(400).json({ error: "Refresh token is required" });
    }

    const result = await refreshAccessToken(refreshToken);
    return res.status(200).json(result);
  } catch (error) {
    return handleAuthError(error, res);
  }
}

export async function logoutHandler(
  req: Request,
  res: Response,
): Promise<Response> {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(400).json({ error: "Refresh token is required" });
    }

    await revokeRefreshToken(refreshToken);
    return res.status(200).json({ message: "Logged out successfully" });
  } catch (error) {
    return handleAuthError(error, res);
  }
}

export async function logoutAllDevicesHandler(
  req: Request,
  res: Response,
): Promise<Response> {
  try {
    const userId = req.auth?.userId;

    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    await logoutAllDevices(userId);
    return res.status(200).json({ message: "Logged out from all devices" });
  } catch (error) {
    return handleAuthError(error, res);
  }
}

export async function forgotPasswordHandler(
  req: Request,
  res: Response,
): Promise<Response> {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: "Email is required" });
    }

    const resetToken = await requestPasswordReset(email);
    return res.status(200).json({
      message: "If email exists, password reset token has been sent",
      resetToken: resetToken || undefined, // Only return if needed for testing
    });
  } catch (error) {
    return handleAuthError(error, res);
  }
}

export async function resetPasswordHandler(
  req: Request,
  res: Response,
): Promise<Response> {
  try {
    const { token, newPassword } = req.body;

    if (!token || !newPassword) {
      return res.status(400).json({
        error: "Token and newPassword are required",
      });
    }

    const user = await resetPassword(token, newPassword);
    return res
      .status(200)
      .json({ user, message: "Password reset successfully" });
  } catch (error) {
    return handleAuthError(error, res);
  }
}

export async function profileHandler(
  req: Request,
  res: Response,
): Promise<Response> {
  try {
    const userId = req.auth?.userId;

    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const user = await getUserById(userId);

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    return res.status(200).json({ user });
  } catch (error) {
    return handleAuthError(error, res);
  }
}
