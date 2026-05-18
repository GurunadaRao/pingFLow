import jwt from "jsonwebtoken";
import { randomUUID } from "crypto";

import { env } from "../config/env";
import { RefreshTokenModel } from "../models/refresh-token.model";
import { UserModel } from "../models/user.model";
import { hashPassword, verifyPassword } from "../utils/crypto";
import {
  blacklistRefreshToken,
  isRefreshTokenBlacklisted,
  isRedisEnabled,
} from "../utils/redis";

export class AuthError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
  ) {
    super(message);
  }
}

interface AccessTokenPayload {
  sub: string;
  email: string;
  type: "access";
}

interface RefreshTokenPayload {
  sub: string;
  email: string;
  type: "refresh";
  jti: string;
}

function createAccessToken(userId: string, email: string): string {
  return jwt.sign(
    { sub: userId, email, type: "access" } as AccessTokenPayload,
    env.jwtSecret,
    {
      expiresIn: env.jwtExpiresIn,
    },
  );
}

function parseDurationToMs(duration: string): number {
  const match = duration.trim().match(/^(\d+)([smhd])$/i);
  if (!match) {
    throw new Error(
      "Invalid duration format. Use values like 30d, 12h, 15m, 20s.",
    );
  }

  const value = Number(match[1]);
  const unit = match[2].toLowerCase();
  const multiplierMap: Record<string, number> = {
    s: 1000,
    m: 60_000,
    h: 3_600_000,
    d: 86_400_000,
  };

  return value * multiplierMap[unit];
}

async function createAndPersistRefreshToken(
  userId: string,
  email: string,
): Promise<string> {
  const tokenId = randomUUID();
  const refreshToken = jwt.sign(
    {
      sub: userId,
      email,
      type: "refresh",
      jti: tokenId,
    } as RefreshTokenPayload,
    env.refreshTokenSecret,
    {
      expiresIn: env.refreshTokenExpiresIn,
    },
  );

  const { salt, hash } = hashPassword(refreshToken);
  const expiresAt = new Date(
    Date.now() + parseDurationToMs(env.refreshTokenExpiresIn),
  );

  await RefreshTokenModel.create({
    userId,
    tokenId,
    tokenSalt: salt,
    tokenHash: hash,
    expiresAt,
  });

  return refreshToken;
}

async function issueAuthTokens(
  userId: string,
  email: string,
): Promise<{
  accessToken: string;
  refreshToken: string;
}> {
  const accessToken = createAccessToken(userId, email);
  const refreshToken = await createAndPersistRefreshToken(userId, email);

  return {
    accessToken,
    refreshToken,
  };
}

export async function registerWithEmailPassword(input: {
  name: string;
  email: string;
  password: string;
}): Promise<{
  accessToken: string;
  refreshToken: string;
  user: Record<string, unknown>;
}> {
  const existing = await UserModel.findOne({ email: input.email }).lean();
  if (existing) {
    throw new AuthError("Email already registered", 409);
  }

  const { salt, hash } = hashPassword(input.password);

  const user = await UserModel.create({
    name: input.name,
    email: input.email,
    passwordSalt: salt,
    passwordHash: hash,
  });

  const tokens = await issueAuthTokens(user.id, user.email);

  return {
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    user: user.toJSON() as Record<string, unknown>,
  };
}

export async function loginWithEmailPassword(input: {
  email: string;
  password: string;
}): Promise<{
  accessToken: string;
  refreshToken: string;
  user: Record<string, unknown>;
}> {
  const user = await UserModel.findOne({ email: input.email })
    .select("+passwordHash +passwordSalt")
    .exec();

  if (!user) {
    throw new AuthError("Invalid credentials", 401);
  }

  const passwordMatches = verifyPassword(
    input.password,
    user.passwordSalt,
    user.passwordHash,
  );
  if (!passwordMatches) {
    throw new AuthError("Invalid credentials", 401);
  }

  const tokens = await issueAuthTokens(user.id, user.email);

  return {
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    user: user.toJSON() as Record<string, unknown>,
  };
}

export async function rotateRefreshToken(input: {
  refreshToken: string;
}): Promise<{ accessToken: string; refreshToken: string }> {
  let payload: RefreshTokenPayload;

  try {
    payload = jwt.verify(
      input.refreshToken,
      env.refreshTokenSecret,
    ) as RefreshTokenPayload;
  } catch (_error) {
    throw new AuthError("Invalid or expired refresh token", 401);
  }

  if (!payload.sub || !payload.jti || payload.type !== "refresh") {
    throw new AuthError("Invalid refresh token", 401);
  }

  // Fast reject if token is blacklisted in Redis
  if (isRedisEnabled()) {
    const blacklisted = await isRefreshTokenBlacklisted(payload.jti);
    if (blacklisted) {
      throw new AuthError("Refresh token has been revoked", 401);
    }
  }

  const record = await RefreshTokenModel.findOne({
    tokenId: payload.jti,
    userId: payload.sub,
  })
    .select("+tokenHash +tokenSalt")
    .exec();

  if (!record || record.revokedAt || record.expiresAt.getTime() <= Date.now()) {
    throw new AuthError("Refresh token is not active", 401);
  }

  const tokenMatches = verifyPassword(
    input.refreshToken,
    record.tokenSalt,
    record.tokenHash,
  );
  if (!tokenMatches) {
    throw new AuthError("Refresh token mismatch", 401);
  }

  const newRefreshToken = await createAndPersistRefreshToken(
    payload.sub,
    payload.email,
  );

  let newPayload: RefreshTokenPayload;
  try {
    newPayload = jwt.verify(
      newRefreshToken,
      env.refreshTokenSecret,
    ) as RefreshTokenPayload;
  } catch (_error) {
    throw new AuthError("Failed to rotate refresh token", 500);
  }

  record.revokedAt = new Date();
  record.replacedByTokenId = newPayload.jti;
  await record.save();

  // Add the old token's jti to Redis blacklist with TTL until original expiry
  if (isRedisEnabled()) {
    const ttlSeconds = Math.max(
      1,
      Math.floor((record.expiresAt.getTime() - Date.now()) / 1000),
    );
    await blacklistRefreshToken(payload.jti, ttlSeconds);
  }

  return {
    accessToken: createAccessToken(payload.sub, payload.email),
    refreshToken: newRefreshToken,
  };
}

export async function getAuthenticatedUserProfile(
  userId: string,
): Promise<Record<string, unknown>> {
  const user = await UserModel.findById(userId).exec();

  if (!user) {
    throw new AuthError("User not found", 404);
  }

  return user.toJSON() as Record<string, unknown>;
}
