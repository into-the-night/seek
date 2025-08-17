// Encryption utility module for API key protection
class EncryptionManager {
    constructor() {
        this.algorithm = 'AES-GCM';
        this.keyLength = 256;
        this.saltLength = 16;
        this.ivLength = 12;
        this.tagLength = 128;
        this.iterations = 100000;
    }

    // Derive encryption key from passkey
    async deriveKey(pin, salt) {
        const encoder = new TextEncoder();
        const pinData = encoder.encode(pin);
        
        // Import passkey as key material
        const keyMaterial = await crypto.subtle.importKey(
            'raw',
            pinData,
            { name: 'PBKDF2' },
            false,
            ['deriveBits', 'deriveKey']
        );

        // Derive key using PBKDF2
        const key = await crypto.subtle.deriveKey(
            {
                name: 'PBKDF2',
                salt: salt,
                iterations: this.iterations,
                hash: 'SHA-256'
            },
            keyMaterial,
            { name: this.algorithm, length: this.keyLength },
            false,
            ['encrypt', 'decrypt']
        );

        return key;
    }

    // Encrypt data with passkey-derived key
    async encrypt(data, pin) {
        try {
            const encoder = new TextEncoder();
            const dataBytes = encoder.encode(JSON.stringify(data));
            
            // Generate random salt and IV
            const salt = crypto.getRandomValues(new Uint8Array(this.saltLength));
            const iv = crypto.getRandomValues(new Uint8Array(this.ivLength));
            
            // Derive key from passkey
            const key = await this.deriveKey(pin, salt);
            
            // Encrypt data
            const encryptedData = await crypto.subtle.encrypt(
                {
                    name: this.algorithm,
                    iv: iv,
                    tagLength: this.tagLength
                },
                key,
                dataBytes
            );
            
            // Combine salt, iv, and encrypted data
            const combined = new Uint8Array(salt.length + iv.length + encryptedData.byteLength);
            combined.set(salt, 0);
            combined.set(iv, salt.length);
            combined.set(new Uint8Array(encryptedData), salt.length + iv.length);
            
            // Convert to base64 for storage
            return btoa(String.fromCharCode.apply(null, combined));
        } catch (error) {
            throw new Error('Encryption failed: ' + error.message);
        }
    }

    // Decrypt data with passkey-derived key
    async decrypt(encryptedString, pin) {
        try {
            // Convert from base64
            const combined = Uint8Array.from(atob(encryptedString), c => c.charCodeAt(0));
            
            // Extract salt, iv, and encrypted data
            const salt = combined.slice(0, this.saltLength);
            const iv = combined.slice(this.saltLength, this.saltLength + this.ivLength);
            const encryptedData = combined.slice(this.saltLength + this.ivLength);
            
            // Derive key from passkey
            const key = await this.deriveKey(pin, salt);
            
            // Decrypt data
            const decryptedData = await crypto.subtle.decrypt(
                {
                    name: this.algorithm,
                    iv: iv,
                    tagLength: this.tagLength
                },
                key,
                encryptedData
            );
            
            // Convert back to string and parse JSON
            const decoder = new TextDecoder();
            const jsonString = decoder.decode(decryptedData);
            return JSON.parse(jsonString);
        } catch (error) {
            throw new Error('Decryption failed: Invalid passkey or corrupted data');
        }
    }

    // Hash passkey for verification (not for encryption)
    async hashPin(pin) {
        const encoder = new TextEncoder();
        const data = encoder.encode(pin + 'yt-extension-salt');
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    }

    // Validate passkey format (4 digits)
    validatePin(pin) {
        return /^\d{4}$/.test(pin);
    }

    // Check if encryption is enabled
    async isEncryptionEnabled() {
        return new Promise((resolve) => {
            chrome.storage.local.get(['encryptionEnabled', 'pinHash'], (result) => {
                resolve(result.encryptionEnabled === true && result.pinHash !== undefined);
            });
        });
    }

    // Set up passkey for first time
    async setupPin(pin) {
        if (!this.validatePin(pin)) {
            throw new Error('Passkey must be exactly 4 digits');
        }

        const pinHash = await this.hashPin(pin);
        
        return new Promise((resolve, reject) => {
            chrome.storage.local.set({
                encryptionEnabled: true,
                pinHash: pinHash
            }, () => {
                if (chrome.runtime.lastError) {
                    reject(chrome.runtime.lastError);
                } else {
                    resolve();
                }
            });
        });
    }

    // Verify passkey against stored hash
    async verifyPin(pin) {
        const pinHash = await this.hashPin(pin);
        
        return new Promise((resolve) => {
            chrome.storage.local.get(['pinHash'], (result) => {
                resolve(result.pinHash === pinHash);
            });
        });
    }

    // Check if session is unlocked
    async isSessionUnlocked() {
        return new Promise((resolve) => {
            chrome.storage.session.get(['unlocked'], (result) => {
                resolve(result.unlocked === true);
            });
        });
    }

    // Unlock session with passkey
    async unlockSession(pin) {
        const isValid = await this.verifyPin(pin);
        
        if (!isValid) {
            throw new Error('Invalid passkey');
        }

        return new Promise((resolve, reject) => {
            chrome.storage.session.set({ 
                unlocked: true,
                sessionPin: pin,
                unlockedAt: Date.now()
            }, () => {
                if (chrome.runtime.lastError) {
                    reject(chrome.runtime.lastError);
                } else {
                    resolve();
                }
            });
        });
    }

    // Get session passkey (for encryption/decryption during session)
    async getSessionPin() {
        return new Promise((resolve) => {
            chrome.storage.session.get(['sessionPin'], (result) => {
                resolve(result.sessionPin || null);
            });
        });
    }

    // Clear session (lock)
    async lockSession() {
        return new Promise((resolve) => {
            chrome.storage.session.clear(() => {
                resolve();
            });
        });
    }

    // Migrate existing unencrypted API keys to encrypted storage
    async migrateApiKeys(apiKeys, pin) {
        if (!apiKeys || Object.keys(apiKeys).length === 0) {
            return null;
        }

        // Encrypt the API keys
        const encryptedKeys = await this.encrypt(apiKeys, pin);
        
        return new Promise((resolve, reject) => {
            chrome.storage.local.set({
                encryptedApiKeys: encryptedKeys,
                apiKeys: {} // Clear unencrypted keys
            }, () => {
                if (chrome.runtime.lastError) {
                    reject(chrome.runtime.lastError);
                } else {
                    resolve();
                }
            });
        });
    }

    // Reset encryption (remove passkey and encrypted data)
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
                    // Also clear session
                    chrome.storage.session.clear(() => {
                        resolve();
                    });
                }
            });
        });
    }
}

// Export for use in extension
if (typeof module !== 'undefined' && module.exports) {
    module.exports = EncryptionManager;
}
