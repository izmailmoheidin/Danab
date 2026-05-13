import * as bcrypt from "bcryptjs";

const BCRYPT_ROUNDS = 12;

export function looksLikePasswordHash(value: unknown): value is string {
  return typeof value === "string" && /^\$2[aby]\$\d{2}\$/.test(value);
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

export async function verifyPassword(
  plainPassword: string,
  storedPassword: unknown,
): Promise<{ valid: boolean; needsRehash: boolean }> {
  if (typeof storedPassword !== "string" || !storedPassword) {
    return { valid: false, needsRehash: false };
  }

  if (looksLikePasswordHash(storedPassword)) {
    const valid = await bcrypt.compare(plainPassword, storedPassword);
    return { valid, needsRehash: false };
  }

  return {
    valid: storedPassword === plainPassword,
    needsRehash: storedPassword === plainPassword,
  };
}
