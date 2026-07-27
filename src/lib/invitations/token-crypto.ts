import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const VERSION = "v1";
const IV_BYTES = 12;
const AUTH_TAG_BYTES = 16;

function encryptionKey(secret?: string) {
  const value = secret ?? process.env.INVITATION_TOKEN_ENCRYPTION_KEY;
  if (!value || value.trim().length < 32) {
    throw new Error("邀请链接加密密钥未配置或长度不足。请设置 INVITATION_TOKEN_ENCRYPTION_KEY 后重试。");
  }
  return createHash("sha256").update(value).digest();
}

export function encryptInvitationToken(token: string, secret?: string) {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(secret), iv);
  const encrypted = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  const payload = Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString("base64url");
  return `${VERSION}.${payload}`;
}

export function decryptInvitationToken(ciphertext: string, secret?: string) {
  const [version, encoded] = ciphertext.split(".");
  if (version !== VERSION || !encoded) throw new Error("邀请链接密文格式无效。");
  const payload = Buffer.from(encoded, "base64url");
  if (payload.length <= IV_BYTES + AUTH_TAG_BYTES) throw new Error("邀请链接密文不完整。");
  const iv = payload.subarray(0, IV_BYTES);
  const authTag = payload.subarray(IV_BYTES, IV_BYTES + AUTH_TAG_BYTES);
  const encrypted = payload.subarray(IV_BYTES + AUTH_TAG_BYTES);
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(secret), iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
}
