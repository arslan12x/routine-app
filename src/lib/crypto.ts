import crypto from "crypto";

function getEncryptionKey(): Buffer {
  const secret = process.env.EMAIL_ENCRYPTION_KEY;
  if (!secret || secret.trim().length === 0) {
    throw new Error("EMAIL_ENCRYPTION_KEY environment variable is not configured on the server.");
  }
  return crypto.createHash("sha256").update(secret).digest();
}

/**
 * Encrypts plaintext using AES-256-GCM with a random 12-byte IV and authentication tag.
 * Returns payload in the format `iv:authTag:ciphertext` (all hex encoded).
 */
export function encryptSecret(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);

  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted.toString("hex")}`;
}

/**
 * Decrypts AES-256-GCM encrypted payload (`iv:authTag:ciphertext`).
 * Validates integrity via authentication tag; throws error if tampered or key mismatch.
 */
export function decryptSecret(payload: string): string {
  const key = getEncryptionKey();
  const parts = payload.split(":");
  if (parts.length !== 3) {
    throw new Error("Invalid encrypted payload format.");
  }

  const [ivHex, authTagHex, encryptedHex] = parts;
  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(authTagHex, "hex");
  const encrypted = Buffer.from(encryptedHex, "hex");

  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([
    decipher.update(encrypted),
    decipher.final(),
  ]);

  return decrypted.toString("utf8");
}
