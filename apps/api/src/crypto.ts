import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

function key(secret: string): Buffer {
  return createHash('sha256').update(secret).digest();
}

/** AES-256-GCM, format versionné iv.tag.ciphertext (base64url). */
export function encryptSecret(value: string, secret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(secret), iv);
  const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return `v1.${iv.toString('base64url')}.${cipher.getAuthTag().toString('base64url')}.${ciphertext.toString('base64url')}`;
}

export function decryptSecret(value: string, secret: string): string {
  const [version, iv, tag, ciphertext] = value.split('.');
  if (version !== 'v1' || !iv || !tag || !ciphertext) throw new Error('Secret chiffré invalide');
  const decipher = createDecipheriv('aes-256-gcm', key(secret), Buffer.from(iv, 'base64url'));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertext, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}
