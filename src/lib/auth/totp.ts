import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function encryptionKey(): Buffer {
  const raw = process.env.AUTH_ENCRYPTION_KEY;
  if (raw && /^[a-f\d]{64}$/i.test(raw)) return Buffer.from(raw, "hex");
  if (process.env.NODE_ENV === "production") throw new Error("生产环境必须配置 64 位十六进制 AUTH_ENCRYPTION_KEY");
  return createHmac("sha256", "sigma-dev-only").update("totp").digest();
}

function encodeBase32(buffer: Buffer): string {
  let bits = "";
  for (const byte of buffer) bits += byte.toString(2).padStart(8, "0");
  let result = "";
  for (let index = 0; index < bits.length; index += 5) result += ALPHABET[Number.parseInt(bits.slice(index, index + 5).padEnd(5, "0"), 2)];
  return result;
}

function decodeBase32(value: string): Buffer {
  let bits = "";
  for (const character of value.replace(/=+$/g, "").toUpperCase()) {
    const index = ALPHABET.indexOf(character);
    if (index < 0) throw new Error("无效的 TOTP 密钥");
    bits += index.toString(2).padStart(5, "0");
  }
  const bytes: number[] = [];
  for (let index = 0; index + 8 <= bits.length; index += 8) bytes.push(Number.parseInt(bits.slice(index, index + 8), 2));
  return Buffer.from(bytes);
}

function codeAt(secret: string, counter: number): string {
  const message = Buffer.alloc(8);
  message.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac("sha1", decodeBase32(secret)).update(message).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const value = (digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000;
  return value.toString().padStart(6, "0");
}

export function generateTotpSecret(): string {
  return encodeBase32(randomBytes(20));
}

export function totpUri(secret: string, email: string): string {
  const label = encodeURIComponent(`Sigma Bot:${email}`);
  return `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent("Sigma Bot")}&algorithm=SHA1&digits=6&period=30`;
}

export function verifyTotp(secret: string, candidate: string, now = Date.now()): boolean {
  if (!/^\d{6}$/.test(candidate)) return false;
  const supplied = Buffer.from(candidate);
  const counter = Math.floor(now / 30_000);
  return [-1, 0, 1].some((offset) => timingSafeEqual(Buffer.from(codeAt(secret, counter + offset)), supplied));
}

export function encryptSecret(secret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  return `${iv.toString("hex")}:${cipher.getAuthTag().toString("hex")}:${encrypted.toString("hex")}`;
}

export function decryptSecret(stored: string): string {
  const [ivHex, tagHex, encryptedHex] = stored.split(":");
  if (!ivHex || !tagHex || !encryptedHex) throw new Error("无效的加密密钥格式");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));
  return Buffer.concat([decipher.update(Buffer.from(encryptedHex, "hex")), decipher.final()]).toString("utf8");
}
