import * as crypto from 'crypto';

export class AEADCrypto {
    private static readonly ALGORITHM = 'aes-256-gcm';
    private static readonly KEY_LENGTH = 32; // 256 bits
    private static readonly IV_LENGTH = 12; // 96 bits (recommended for GCM)
    private static readonly TAG_LENGTH = 16; // 128 bits

    /**
     * Generates a new random AEAD key
     * @returns Base64 encoded key
     */
    static generateKey(): string {
        const key = crypto.randomBytes(this.KEY_LENGTH);
        return key.toString('base64');
    }

    /**
     * Encrypts an object using AES-256-GCM
     * @param obj - The object to encrypt
     * @param keyBase64 - The base64 encoded key
     * @returns Base64 encoded encrypted message (IV + ciphertext + auth tag)
     */
    static encryptObject<T>(obj: T, keyBase64: string): string {
        const json = JSON.stringify(obj);
        const key = Buffer.from(keyBase64, 'base64');
        const iv = crypto.randomBytes(this.IV_LENGTH);

        const cipher = crypto.createCipheriv(this.ALGORITHM, key, iv);

        let encrypted = cipher.update(json, 'utf8');
        encrypted = Buffer.concat([encrypted, cipher.final()]);

        const tag = cipher.getAuthTag();

        // Concatenate IV + encrypted data + auth tag
        const result = Buffer.concat([iv, encrypted, tag]);
        return result.toString('base64');
    }

    /**
     * Decrypts a message using AES-256-GCM and returns the object
     * @param encryptedBase64 - Base64 encoded encrypted message (IV + ciphertext + auth tag)
     * @param keyBase64 - The base64 encoded key
     * @returns The decrypted object
     */
    static decryptObject<T>(encryptedBase64: string, keyBase64: string): T {
        const key = Buffer.from(keyBase64, 'base64');
        const data = Buffer.from(encryptedBase64, 'base64');

        // Extract IV, ciphertext, and auth tag
        const iv = data.subarray(0, this.IV_LENGTH);
        const tag = data.subarray(data.length - this.TAG_LENGTH);
        const encrypted = data.subarray(this.IV_LENGTH, data.length - this.TAG_LENGTH);

        const decipher = crypto.createDecipheriv(this.ALGORITHM, key, iv);
        decipher.setAuthTag(tag);

        let decrypted = decipher.update(encrypted);
        decrypted = Buffer.concat([decrypted, decipher.final()]);

        const json = decrypted.toString('utf8');
        return JSON.parse(json) as T;
    }

    /**
     * Encrypts a message using AES-256-GCM
     * @param message - The plaintext message to encrypt
     * @param keyBase64 - The base64 encoded key
     * @returns Base64 encoded encrypted message (IV + ciphertext + auth tag)
     * @deprecated Use encryptObject instead
     */
    static encrypt(message: string, keyBase64: string): string {
        const key = Buffer.from(keyBase64, 'base64');
        const iv = crypto.randomBytes(this.IV_LENGTH);

        const cipher = crypto.createCipheriv(this.ALGORITHM, key, iv);

        let encrypted = cipher.update(message, 'utf8');
        encrypted = Buffer.concat([encrypted, cipher.final()]);

        const tag = cipher.getAuthTag();

        // Concatenate IV + encrypted data + auth tag
        const result = Buffer.concat([iv, encrypted, tag]);
        return result.toString('base64');
    }

    /**
     * Decrypts a message using AES-256-GCM
     * @param encryptedBase64 - Base64 encoded encrypted message (IV + ciphertext + auth tag)
     * @param keyBase64 - The base64 encoded key
     * @returns The decrypted plaintext message
     * @deprecated Use decryptObject instead
     */
    static decrypt(encryptedBase64: string, keyBase64: string): string {
        const key = Buffer.from(keyBase64, 'base64');
        const data = Buffer.from(encryptedBase64, 'base64');

        // Extract IV, ciphertext, and auth tag
        const iv = data.subarray(0, this.IV_LENGTH);
        const tag = data.subarray(data.length - this.TAG_LENGTH);
        const encrypted = data.subarray(this.IV_LENGTH, data.length - this.TAG_LENGTH);

        const decipher = crypto.createDecipheriv(this.ALGORITHM, key, iv);
        decipher.setAuthTag(tag);

        let decrypted = decipher.update(encrypted);
        decrypted = Buffer.concat([decrypted, decipher.final()]);

        return decrypted.toString('utf8');
    }
}
