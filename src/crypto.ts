/**
 * Cross-platform crypto utilities for browser and Node.js
 */
export class AEADCrypto {
    private static readonly KEY_LENGTH = 32; // 256 bits
    private static readonly IV_LENGTH = 12; // 96 bits (recommended for GCM)
    private static readonly TAG_LENGTH = 16; // 128 bits

    /**
     * Check if running in browser environment
     */
    private static isBrowser(): boolean {
        return typeof window !== 'undefined' && typeof window.crypto !== 'undefined';
    }

    /**
     * Generate random bytes - works in both Node.js and browser
     */
    private static randomBytes(length: number): Uint8Array {
        if (this.isBrowser()) {
            const bytes = new Uint8Array(length);
            window.crypto.getRandomValues(bytes);
            return bytes;
        } else {
            const crypto = require('crypto');
            return new Uint8Array(crypto.randomBytes(length));
        }
    }

    /**
     * Convert base64 string to Uint8Array
     */
    private static base64ToBytes(base64: string): Uint8Array {
        if (this.isBrowser()) {
            const binary = atob(base64);
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) {
                bytes[i] = binary.charCodeAt(i);
            }
            return bytes;
        } else {
            return new Uint8Array(Buffer.from(base64, 'base64'));
        }
    }

    /**
     * Convert Uint8Array to base64 string
     */
    private static bytesToBase64(bytes: Uint8Array): string {
        if (this.isBrowser()) {
            let binary = '';
            for (let i = 0; i < bytes.length; i++) {
                binary += String.fromCharCode(bytes[i]);
            }
            return btoa(binary);
        } else {
            return Buffer.from(bytes).toString('base64');
        }
    }

    /**
     * Convert string to Uint8Array
     */
    private static stringToBytes(str: string): Uint8Array {
        const encoder = new TextEncoder();
        return encoder.encode(str);
    }

    /**
     * Convert Uint8Array to string
     */
    private static bytesToString(bytes: Uint8Array): string {
        const decoder = new TextDecoder();
        return decoder.decode(bytes);
    }

    /**
     * Generates a new random AEAD key
     * @returns Base64 encoded key
     */
    static generateKey(): string {
        const key = this.randomBytes(this.KEY_LENGTH);
        return this.bytesToBase64(key);
    }

    /**
     * Encrypts an object using AES-256-GCM
     * @param obj - The object to encrypt
     * @param keyBase64 - The base64 encoded key
     * @returns Base64 encoded encrypted message (IV + ciphertext + auth tag)
     */
    static async encryptObject<T>(obj: T, keyBase64: string): Promise<string> {
        const json = JSON.stringify(obj);
        const plaintext = this.stringToBytes(json);
        const key = this.base64ToBytes(keyBase64);
        const iv = this.randomBytes(this.IV_LENGTH);

        if (this.isBrowser()) {
            // Browser: Use Web Crypto API
            const cryptoKey = await window.crypto.subtle.importKey(
                'raw',
                key,
                { name: 'AES-GCM' },
                false,
                ['encrypt']
            );

            const encrypted = await window.crypto.subtle.encrypt(
                { name: 'AES-GCM', iv, tagLength: this.TAG_LENGTH * 8 },
                cryptoKey,
                plaintext
            );

            // Web Crypto returns ciphertext + tag combined
            const encryptedBytes = new Uint8Array(encrypted);

            // Combine IV + ciphertext+tag
            const result = new Uint8Array(iv.length + encryptedBytes.length);
            result.set(iv, 0);
            result.set(encryptedBytes, iv.length);

            return this.bytesToBase64(result);
        } else {
            // Node.js: Use built-in crypto
            const crypto = require('crypto');
            const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

            let encrypted = cipher.update(plaintext);
            encrypted = Buffer.concat([encrypted, cipher.final()]);

            const tag = cipher.getAuthTag();

            // Concatenate IV + encrypted data + auth tag
            const result = Buffer.concat([iv, encrypted, tag]);
            return result.toString('base64');
        }
    }

    /**
     * Decrypts a message using AES-256-GCM and returns the object
     * @param encryptedBase64 - Base64 encoded encrypted message (IV + ciphertext + auth tag)
     * @param keyBase64 - The base64 encoded key
     * @returns The decrypted object
     */
    static async decryptObject<T>(encryptedBase64: string, keyBase64: string): Promise<T> {
        const data = this.base64ToBytes(encryptedBase64);
        const key = this.base64ToBytes(keyBase64);

        // Extract IV and ciphertext+tag
        const iv = data.slice(0, this.IV_LENGTH);
        const ciphertextAndTag = data.slice(this.IV_LENGTH);

        if (this.isBrowser()) {
            // Browser: Use Web Crypto API
            const cryptoKey = await window.crypto.subtle.importKey(
                'raw',
                key,
                { name: 'AES-GCM' },
                false,
                ['decrypt']
            );

            const decrypted = await window.crypto.subtle.decrypt(
                { name: 'AES-GCM', iv, tagLength: this.TAG_LENGTH * 8 },
                cryptoKey,
                ciphertextAndTag
            );

            const json = this.bytesToString(new Uint8Array(decrypted));
            return JSON.parse(json) as T;
        } else {
            // Node.js: Use built-in crypto
            const crypto = require('crypto');
            const tag = ciphertextAndTag.slice(ciphertextAndTag.length - this.TAG_LENGTH);
            const encrypted = ciphertextAndTag.slice(0, ciphertextAndTag.length - this.TAG_LENGTH);

            const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
            decipher.setAuthTag(tag);

            let decrypted = decipher.update(encrypted);
            decrypted = Buffer.concat([decrypted, decipher.final()]);

            const json = decrypted.toString('utf8');
            return JSON.parse(json) as T;
        }
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
