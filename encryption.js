/**
 * EncryptionManager - Handles secure storage of API keys using AES-GCM encryption
 * with PBKDF2 key derivation from a 4-digit PIN.
 */
class EncryptionManager {
    constructor() {
        // Encryption configuration constants
        this.config = {
            algorithm: 'AES-GCM',
            keyLength: 256,
            saltLength: 16,
            ivLength: 12,
            tagLength: 128,
            iterations: 100000,
            hashSalt: 'yt-extension-salt' // Application-specific salt for PIN hashing
        };
    }

    /**
     * Derives an encryption key from a PIN using PBKDF2
     * @private
     * @param {string} pin - The 4-digit PIN
     * @param {Uint8Array} salt - Random salt for key derivation
     * @returns {Promise<CryptoKey>} The derived encryption key
     */
    async deriveKey(pin, salt) {
        const encoder = new TextEncoder();
        const pinData = encoder.encode(pin);
        
        const keyMaterial = await crypto.subtle.importKey(
            'raw',
            pinData,
            { name: 'PBKDF2' },
            false,
            ['deriveBits', 'deriveKey']
        );

        return await crypto.subtle.deriveKey(
            {
                name: 'PBKDF2',
                salt: salt,
                iterations: this.config.iterations,
                hash: 'SHA-256'
            },
            keyMaterial,
            { name: this.config.algorithm, length: this.config.keyLength },
            false,
            ['encrypt', 'decrypt']
        );
    }

    /**
     * Encrypts data using AES-GCM with a PIN-derived key
     * @param {Object} data - The data to encrypt
     * @param {string} pin - The 4-digit PIN for encryption
     * @returns {Promise<string>} Base64-encoded encrypted data
     * @throws {Error} If encryption fails
     */
    async encrypt(data, pin) {
        if (!this.validatePin(pin)) {
            throw new Error('Invalid PIN format');
        }

        const encoder = new TextEncoder();
        const dataBytes = encoder.encode(JSON.stringify(data));
        
        // Generate cryptographically secure random values
        const salt = crypto.getRandomValues(new Uint8Array(this.config.saltLength));
        const iv = crypto.getRandomValues(new Uint8Array(this.config.ivLength));
        
        const key = await this.deriveKey(pin, salt);
        
        const encryptedData = await crypto.subtle.encrypt(
            {
                name: this.config.algorithm,
                iv: iv,
                tagLength: this.config.tagLength
            },
            key,
            dataBytes
        );
        
        // Package encrypted data with salt and IV for decryption
        const combined = new Uint8Array(
            salt.length + iv.length + encryptedData.byteLength
        );
        combined.set(salt, 0);
        combined.set(iv, salt.length);
        combined.set(new Uint8Array(encryptedData), salt.length + iv.length);
        
        return btoa(String.fromCharCode(...combined));
    }

    /**
     * Decrypts data using AES-GCM with a PIN-derived key
     * @param {string} encryptedString - Base64-encoded encrypted data
     * @param {string} pin - The 4-digit PIN for decryption
     * @returns {Promise<Object>} The decrypted data
     * @throws {Error} If decryption fails (wrong PIN or corrupted data)
     */
    async decrypt(encryptedString, pin) {
        if (!this.validatePin(pin)) {
            throw new Error('Invalid PIN format');
        }

        try {
            const combined = Uint8Array.from(atob(encryptedString), c => c.charCodeAt(0));
            
            // Extract components from the combined data
            const salt = combined.slice(0, this.config.saltLength);
            const iv = combined.slice(
                this.config.saltLength, 
                this.config.saltLength + this.config.ivLength
            );
            const encryptedData = combined.slice(
                this.config.saltLength + this.config.ivLength
            );
            
            const key = await this.deriveKey(pin, salt);
            
            const decryptedData = await crypto.subtle.decrypt(
                {
                    name: this.config.algorithm,
                    iv: iv,
                    tagLength: this.config.tagLength
                },
                key,
                encryptedData
            );
            
            const decoder = new TextDecoder();
            return JSON.parse(decoder.decode(decryptedData));
        } catch (error) {
            throw new Error('Decryption failed: Invalid PIN or corrupted data');
        }
    }

    /**
     * Creates a SHA-256 hash of the PIN for verification
     * @private
     * @param {string} pin - The 4-digit PIN
     * @returns {Promise<string>} Hex-encoded hash
     */
    async hashPin(pin) {
        const encoder = new TextEncoder();
        const data = encoder.encode(pin + this.config.hashSalt);
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    }

    /**
     * Validates PIN format (must be exactly 4 digits)
     * @param {string} pin - The PIN to validate
     * @returns {boolean} True if valid, false otherwise
     */
    validatePin(pin) {
        return typeof pin === 'string' && /^\d{4}$/.test(pin);
    }

    /**
     * Checks if encryption is enabled (PIN has been set up)
     * @returns {Promise<boolean>} True if encryption is enabled
     */
    async isEncryptionEnabled() {
        return new Promise((resolve) => {
            chrome.storage.local.get(['encryptionEnabled', 'pinHash'], (result) => {
                resolve(
                    result.encryptionEnabled === true && 
                    typeof result.pinHash === 'string' && 
                    result.pinHash.length > 0
                );
            });
        });
    }

    /**
     * Sets up a new PIN for encryption
     * @param {string} pin - The 4-digit PIN to set
     * @returns {Promise<void>}
     * @throws {Error} If PIN is invalid or storage fails
     */
    async setupPin(pin) {
        if (!this.validatePin(pin)) {
            throw new Error('PIN must be exactly 4 digits');
        }

        const pinHash = await this.hashPin(pin);
        
        return this.setStorageData({
            encryptionEnabled: true,
            pinHash: pinHash
        });
    }

    /**
     * Verifies a PIN against the stored hash
     * @param {string} pin - The PIN to verify
     * @returns {Promise<boolean>} True if PIN is correct
     */
    async verifyPin(pin) {
        if (!this.validatePin(pin)) {
            return false;
        }
        
        const pinHash = await this.hashPin(pin);
        const stored = await this.getStorageData(['pinHash']);
        return stored.pinHash === pinHash;
    }

    /**
     * Checks if the current session is unlocked
     * @returns {Promise<boolean>} True if session is unlocked
     */
    async isSessionUnlocked() {
        const result = await this.getSessionData(['unlocked', 'unlockedAt']);
        
        // Check if session is unlocked and not expired (optional: add timeout)
        const isUnlocked = result.unlocked === true;
        
        return isUnlocked;
    }

    /**
     * Unlocks the session with a PIN
     * @param {string} pin - The PIN to unlock with
     * @returns {Promise<void>}
     * @throws {Error} If PIN is invalid
     */
    async unlockSession(pin) {
        const isValid = await this.verifyPin(pin);
        
        if (!isValid) {
            throw new Error('Invalid PIN');
        }

        return this.setSessionData({ 
            unlocked: true,
            sessionPin: pin,
            unlockedAt: Date.now()
        });
    }

    /**
     * Gets the PIN from the current session
     * @returns {Promise<string|null>} The session PIN or null if not available
     */
    async getSessionPin() {
        const result = await this.getSessionData(['sessionPin']);
        return result.sessionPin || null;
    }

    /**
     * Locks the session by clearing session data
     * @returns {Promise<void>}
     */
    async lockSession() {
        return new Promise((resolve) => {
            chrome.storage.session.clear(() => resolve());
        });
    }

    /**
     * Migrates existing unencrypted API keys to encrypted storage
     * @param {Object} apiKeys - The unencrypted API keys
     * @param {string} pin - The PIN to encrypt with
     * @returns {Promise<void>}
     */
    async migrateApiKeys(apiKeys, pin) {
        if (!apiKeys || Object.keys(apiKeys).length === 0) {
            return;
        }

        const encryptedKeys = await this.encrypt(apiKeys, pin);
        
        return this.setStorageData({
            encryptedApiKeys: encryptedKeys,
            apiKeys: {} // Clear unencrypted keys
        });
    }

    /**
     * Resets encryption by removing all encryption-related data
     * @returns {Promise<void>}
     */
    async resetEncryption() {
        return new Promise((resolve, reject) => {
            chrome.storage.local.remove([
                'encryptionEnabled',
                'pinHash',
                'encryptedApiKeys'
            ], () => {
                if (chrome.runtime.lastError) {
                    reject(chrome.runtime.lastError);
                } else {
                    this.lockSession().then(resolve);
                }
            });
        });
    }

    // Utility methods for cleaner storage operations
    /**
     * Helper method to get data from chrome.storage.local
     * @private
     */
    async getStorageData(keys) {
        return new Promise((resolve) => {
            chrome.storage.local.get(keys, (result) => resolve(result));
        });
    }

    /**
     * Helper method to set data in chrome.storage.local
     * @private
     */
    async setStorageData(data) {
        return new Promise((resolve, reject) => {
            chrome.storage.local.set(data, () => {
                if (chrome.runtime.lastError) {
                    reject(chrome.runtime.lastError);
                } else {
                    resolve();
                }
            });
        });
    }

    /**
     * Helper method to get data from chrome.storage.session
     * @private
     */
    async getSessionData(keys) {
        return new Promise((resolve) => {
            chrome.storage.session.get(keys, (result) => resolve(result));
        });
    }

    /**
     * Helper method to set data in chrome.storage.session
     * @private
     */
    async setSessionData(data) {
        return new Promise((resolve, reject) => {
            chrome.storage.session.set(data, () => {
                if (chrome.runtime.lastError) {
                    reject(chrome.runtime.lastError);
                } else {
                    resolve();
                }
            });
        });
    }
}

// Export for use in extension
if (typeof module !== 'undefined' && module.exports) {
    module.exports = EncryptionManager;
}
