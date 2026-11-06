export function normalizeUsername(username: string): string {
  return username.trim().toLowerCase();
}

export function credentialEmail(username: string): string {
  return `${normalizeUsername(username)}@users.routine.invalid`;
}

export function usernameFromCredentialEmail(email: string): string | null {
  const suffix = "@users.routine.invalid";
  const normalized = email.toLowerCase();
  return normalized.endsWith(suffix) ? normalized.slice(0, -suffix.length) : null;
}
