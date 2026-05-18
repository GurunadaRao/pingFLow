import crypto from "crypto";

const ITERATIONS = 310000;
const KEY_LENGTH = 32;
const DIGEST = "sha256";

export function hashPassword(
  password: string,
  salt?: string,
): { salt: string; hash: string } {
  const resolvedSalt = salt ?? crypto.randomBytes(16).toString("hex");
  const hash = crypto
    .pbkdf2Sync(password, resolvedSalt, ITERATIONS, KEY_LENGTH, DIGEST)
    .toString("hex");

  return {
    salt: resolvedSalt,
    hash,
  };
}

export function verifyPassword(
  password: string,
  salt: string,
  expectedHash: string,
): boolean {
  const computed = hashPassword(password, salt).hash;
  const expected = Buffer.from(expectedHash, "hex");
  const actual = Buffer.from(computed, "hex");

  if (expected.length !== actual.length) {
    return false;
  }

  return crypto.timingSafeEqual(expected, actual);
}
