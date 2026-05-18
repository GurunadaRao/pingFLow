import { Request, Response } from "express";

import {
  AuthError,
  getAuthenticatedUserProfile,
  loginWithEmailPassword,
  registerWithEmailPassword,
  rotateRefreshToken,
} from "../services/auth.service";
import {
  validateLoginInput,
  validateRefreshInput,
  validateRegisterInput,
} from "../validations/auth.validation";

function handleAuthError(error: unknown, res: Response): Response {
  if (error instanceof AuthError) {
    return res.status(error.statusCode).json({ error: error.message });
  }

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
    const payload = validateRegisterInput(req.body);
    const result = await registerWithEmailPassword(payload);
    return res.status(201).json(result);
  } catch (error) {
    return handleAuthError(error, res);
  }
}

export async function loginHandler(
  req: Request,
  res: Response,
): Promise<Response> {
  try {
    const payload = validateLoginInput(req.body);
    const result = await loginWithEmailPassword(payload);
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
    const payload = validateRefreshInput(req.body);
    const result = await rotateRefreshToken(payload);
    return res.status(200).json(result);
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

    const user = await getAuthenticatedUserProfile(userId);
    return res.status(200).json({ user });
  } catch (error) {
    return handleAuthError(error, res);
  }
}
