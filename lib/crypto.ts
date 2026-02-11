import {createCipheriv, createDecipheriv, randomBytes} from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LEN = 12; // GCM 권장 IV 길이
const AUTH_TAG_LEN = 16;

/**
 * MASTER_KEY 획득 (openssl rand -hex 32로 생성한 64자 hex = 32 bytes)
 */
function getMasterKey(): Buffer {
  const masterKeyHex = process.env.MASTER_KEY;
  if (!masterKeyHex) {
    throw new Error("MASTER_KEY 환경 변수가 설정되지 않았습니다.");
  }
  const key = Buffer.from(masterKeyHex, "hex");
  if (key.length !== 32) {
    throw new Error(
      "MASTER_KEY는 32바이트(64 hex자)여야 합니다. openssl rand -hex 32 사용",
    );
  }
  return key;
}

/**
 * 평문을 AES-256-GCM으로 암호화
 * 포맷: iv(12) + authTag(16) + ciphertext
 * @returns base64
 */
export function encrypt(plaintext: string): string {
  const key = getMasterKey();
  const iv = randomBytes(IV_LEN);

  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  const combined = Buffer.concat([iv, authTag, encrypted]);
  return combined.toString("base64");
}

/**
 * 암호화된 문자열 복호화
 */
export function decrypt(encryptedBase64: string): string {
  const key = getMasterKey();
  const combined = Buffer.from(encryptedBase64, "base64");

  if (combined.length < IV_LEN + AUTH_TAG_LEN) {
    throw new Error("잘못된 암호화 데이터입니다.");
  }

  const iv = combined.subarray(0, IV_LEN);
  const authTag = combined.subarray(IV_LEN, IV_LEN + AUTH_TAG_LEN);
  const ciphertext = combined.subarray(IV_LEN + AUTH_TAG_LEN);

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  return decipher.update(ciphertext) + decipher.final("utf8");
}
