function hasUnsafeControlChars(value: string): boolean {
  return /[\u0000-\u001F\u007F]/.test(value);
}

export function normalizeUsername(username: unknown): string {
  return typeof username === "string" ? username.trim() : "";
}

export function normalizeUsernameLookup(username: unknown): string {
  return normalizeUsername(username).toLowerCase();
}

export function assertValidUsername(username: string): string | null {
  if (!/^[a-zA-Z0-9._-]{3,32}$/.test(username)) {
    return "Username must be 3-32 characters and use only letters, numbers, dot, underscore, or dash.";
  }
  return null;
}

export function normalizeEmail(email: unknown): string {
  return typeof email === "string" ? email.trim().toLowerCase() : "";
}

export function assertValidEmail(email: string): string | null {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return "Please enter a valid email address.";
  }
  return null;
}

export function assertValidPassword(password: string): string | null {
  if (password.length < 8) {
    return "Password must be at least 8 characters.";
  }
  return null;
}

export function normalizeFreeText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function assertSafeFreeText(
  label: string,
  value: string,
  maxLength: number,
): string | null {
  if (!value) {
    return `${label} is required.`;
  }
  if (value.length > maxLength) {
    return `${label} must be at most ${maxLength} characters.`;
  }
  if (hasUnsafeControlChars(value)) {
    return `${label} contains invalid characters.`;
  }
  return null;
}

export function assertSafeOptionalFreeText(
  label: string,
  value: string,
  maxLength: number,
): string | null {
  if (!value) return null;
  return assertSafeFreeText(label, value, maxLength);
}

export function normalizeIdentifier(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function assertSafeIdentifier(
  label: string,
  value: string,
  maxLength: number,
): string | null {
  if (!value) {
    return `${label} is required.`;
  }
  if (value.length > maxLength) {
    return `${label} must be at most ${maxLength} characters.`;
  }
  if (!/^[a-zA-Z0-9:_./-]+$/.test(value)) {
    return `${label} contains invalid characters.`;
  }
  return null;
}
