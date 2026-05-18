import { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";

import { env } from "../config/env";

interface AccessTokenPayload {
  sub: string;
  email: string;
  type: "access";
  iat?: number;
  exp?: number;
}

export function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): Response | void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res
      .status(401)
      .json({ error: "Missing or invalid authorization header" });
  }

  const accessToken = authHeader.slice("Bearer ".length).trim();

  try {
    const payload = jwt.verify(
      accessToken,
      env.jwtSecret,
    ) as AccessTokenPayload;

    if (!payload.sub || payload.type !== "access") {
      return res.status(401).json({ error: "Invalid access token" });
    }

    req.auth = {
      userId: payload.sub,
      email: payload.email,
    };

    return next();
  } catch (_error) {
    return res.status(401).json({ error: "Invalid or expired access token" });
  }
}
