import dotenv from "dotenv";

dotenv.config();

function required(name: string, value: string | undefined): string {
  if (!value || value.trim().length === 0) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  port: Number(process.env.PORT ?? 4000),
  databaseUrl: required("DATABASE_URL", process.env.DATABASE_URL),
  directUrl: required("DIRECT_URL", process.env.DIRECT_URL),
  jwtSecret: required("JWT_SECRET", process.env.JWT_SECRET),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? "7d",
  refreshTokenSecret: required(
    "REFRESH_TOKEN_SECRET",
    process.env.REFRESH_TOKEN_SECRET,
  ),
  refreshTokenExpiresIn: process.env.REFRESH_TOKEN_EXPIRES_IN ?? "30d",
  apiVersion: process.env.API_VERSION ?? "v1",
  // Redis (Upstash) - only REST API configuration
  upstashRedisUrl: process.env.UPSTASH_REDIS_REST_URL,
  redisUrl: process.env.REDIS_URL,
  upstashRedisToken: process.env.UPSTASH_REDIS_REST_TOKEN,
  // Optional direct Redis URL (e.g., docker://localhost:6379)
  

};
