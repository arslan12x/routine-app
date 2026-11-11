export function normalizeUsername(username: string): string {
  return username.trim().toLowerCase();
}

export function credentialEmail(username: string): string {
  const normalized = normalizeUsername(username);
  return `${normalized}@routine.local`;
}

export function usernameFromCredentialEmail(email: string): string | null {
  const normalized = email.toLowerCase().trim();
  if (!normalized.includes("@")) return null;
  const [localPart] = normalized.split("@", 2);
  return localPart ? normalizeUsername(localPart) : null;
}
