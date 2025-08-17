// Import encryption manager
importScripts('encryption.js');

// Background script for YouTube Video Search extension
class BackgroundService {
    constructor() {
        this.currentVideoInfo = null;
        this.encryptionManager = new EncryptionManager();
        this.setupMessageHandlers();
        this.setupStorageKeys();
    }

    setupMessageHandlers() {
        chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
            switch (request.action) {
                case 'updateVideoInfo':
                    this.updateVideoInfo(request.videoInfo);
                    break;
                case 'getCurrentVideoInfo':
                    sendResponse(this.currentVideoInfo);
                    break;
                case 'saveApiKeys':
                    this.saveApiKeys(request.apiKeys, request.pin).then(() => {
                        sendResponse({ success: true });
                    }).catch(error => {
                        sendResponse({ success: false, error: error.message });
                    });
                    return true;
                case 'getApiKeys':
                    this.getApiKeys().then(apiKeys => {
                        sendResponse(apiKeys);
                    }).catch(error => {
                        sendResponse({ error: error.message });
                    });
                    return true;
                case 'setupPin':
                    this.encryptionManager.setupPin(request.pin).then(() => {
                        sendResponse({ success: true });
                    }).catch(error => {
                        sendResponse({ success: false, error: error.message });
                    });
                    return true;
                case 'verifyPin':
                    this.encryptionManager.verifyPin(request.pin).then(isValid => {
                        sendResponse({ success: isValid });
                    }).catch(error => {
                        sendResponse({ success: false, error: error.message });
                    });
                    return true;
                case 'unlockSession':
                    this.encryptionManager.unlockSession(request.pin).then(() => {
                        sendResponse({ success: true });
                    }).catch(error => {
                        sendResponse({ success: false, error: error.message });
                    });
                    return true;
                case 'isSessionUnlocked':
                    this.encryptionManager.isSessionUnlocked().then(unlocked => {
                        sendResponse({ unlocked: unlocked });
                    }).catch(error => {
                        sendResponse({ unlocked: false, error: error.message });
                    });
                    return true;
                case 'isEncryptionEnabled':
                    this.encryptionManager.isEncryptionEnabled().then(enabled => {
                        sendResponse({ enabled: enabled });
                    }).catch(error => {
                        sendResponse({ enabled: false, error: error.message });
                    });
                    return true;
                case 'resetEncryption':
                    this.encryptionManager.resetEncryption().then(() => {
                        sendResponse({ success: true });
                    }).catch(error => {
                        sendResponse({ success: false, error: error.message });
                    });
                    return true;
                case 'saveTranscript':
                    this.saveTranscript(request.videoId, request.transcript).then(() => {
                        sendResponse({ success: true });
                    }).catch(error => {
                        sendResponse({ success: false, error: error.message });
                    });
                    return true;
                case 'getTranscript':
                    this.getTranscript(request.videoId).then(transcript => {
                        sendResponse(transcript);
                    }).catch(error => {
                        sendResponse({ error: error.message });
                    });
                    return true;
                case 'saveEmbeddings':
                    this.saveEmbeddings(request.videoId, request.embeddings).then(() => {
                        sendResponse({ success: true });
                    }).catch(error => {
                        sendResponse({ success: false, error: error.message });
                    });
                    return true;
                case 'getEmbeddings':
                    this.getEmbeddings(request.videoId).then(embeddings => {
                        sendResponse(embeddings);
                    }).catch(error => {
                        sendResponse({ error: error.message });
                    });
                    return true;
                case 'transcribeWithDeepgram':
                    this.transcribeWithDeepgram(request.audioStreamUrl, request.videoId).then(transcript => {
                        sendResponse({ transcript: transcript });
                    }).catch(error => {
                        sendResponse({ error: error.message });
                    });
                    return true;
                case 'savePin':
                    this.savePin(request.pin).then(() => {
                        sendResponse({ success: true });
                    }).catch(error => {
                        sendResponse({ success: false, error: error.message });
                    });
                    return true;
                case 'getPins':
                    this.getPins(request.videoId).then(pins => {
                        sendResponse(pins);
                    }).catch(error => {
                        sendResponse({ error: error.message });
                    });
                    return true;
                case 'getAllPins':
                    this.getAllPins().then(pins => {
                        sendResponse(pins);
                    }).catch(error => {
                        sendResponse({ error: error.message });
                    });
                    return true;
                case 'deletePin':
                    this.deletePin(request.pinId).then(() => {
                        sendResponse({ success: true });
                    }).catch(error => {
                        sendResponse({ success: false, error: error.message });
                    });
                    return true;
                case 'openPinForm':
                    this.handleOpenPinForm(request.pinData, sender).then((result) => {
                        sendResponse(result);
                    }).catch(error => {
                        sendResponse({ success: false, error: error.message });
                    });
                    return true;
                default:
                    break;
            }
        });
    }

    setupStorageKeys() {
        // Initialize storage structure if not exists
        chrome.storage.local.get(['apiKeys', 'transcripts', 'embeddings', 'pins'], (result) => {
            if (!result.apiKeys) {
                chrome.storage.local.set({ apiKeys: {} });
            }
            if (!result.transcripts) {
                chrome.storage.local.set({ transcripts: {} });
            }
            if (!result.embeddings) {
                chrome.storage.local.set({ embeddings: {} });
            }
            if (!result.pins) {
                chrome.storage.local.set({ pins: [] });
            }
        });
    }

    updateVideoInfo(videoInfo) {
        this.currentVideoInfo = videoInfo;
        
        // Notify popup if it's open about the video info update
        chrome.runtime.sendMessage({
            action: 'videoInfoUpdated',
            videoInfo: videoInfo
        }).catch(() => {
            // Popup might not be open, that's okay
        });
    }

    async saveApiKeys(apiKeys, pin = null) {
        try {
            const isEncryptionEnabled = await this.encryptionManager.isEncryptionEnabled();
            
            if (isEncryptionEnabled) {
                // If encryption is enabled, encrypt the API keys
                let pinToUse = pin;
                
                // If no passkey provided, try to get it from session
                if (!pinToUse) {
                    pinToUse = await this.encryptionManager.getSessionPin();
                }
                
                if (!pinToUse) {
                    throw new Error('Passkey required to save API keys');
                }
                
                const encryptedKeys = await this.encryptionManager.encrypt(apiKeys, pinToUse);
                
                return this.setStorageData({ 
                    encryptedApiKeys: encryptedKeys,
                    apiKeys: {} // Clear any unencrypted keys
                });
            } else {
                // Backward compatibility: save unencrypted
                return this.setStorageData({ apiKeys: apiKeys });
            }
        } catch (error) {
            throw error;
        }
    }

    async getApiKeys() {
        try {
            const isEncryptionEnabled = await this.encryptionManager.isEncryptionEnabled();
            
            if (isEncryptionEnabled) {
                // Check if session is unlocked
                const isUnlocked = await this.encryptionManager.isSessionUnlocked();
                
                if (!isUnlocked) {
                    throw new Error('Session locked. Please enter your passkey.');
                }
                
                // Get encrypted keys
                const result = await this.getStorageData(['encryptedApiKeys']);
                const encryptedKeys = result.encryptedApiKeys || null;
                
                if (!encryptedKeys) {
                    return {};
                }
                
                // Get session passkey
                const sessionPin = await this.encryptionManager.getSessionPin();
                
                if (!sessionPin) {
                    throw new Error('Session passkey not found. Please unlock session.');
                }
                
                // Decrypt and return
                return await this.encryptionManager.decrypt(encryptedKeys, sessionPin);
            } else {
                // Return unencrypted keys for backward compatibility
                const result = await this.getStorageData(['apiKeys']);
                return result.apiKeys || {};
            }
        } catch (error) {
            throw error;
        }
    }

    async saveTranscript(videoId, transcript) {
        const result = await this.getStorageData(['transcripts']);
        const transcripts = result.transcripts || {};
        transcripts[videoId] = {
            transcript: transcript,
            timestamp: Date.now()
        };
        return this.setStorageData({ transcripts: transcripts });
    }

    async getTranscript(videoId) {
        const result = await this.getStorageData(['transcripts']);
        const transcripts = result.transcripts || {};
        return transcripts[videoId] || null;
    }

    async saveEmbeddings(videoId, embeddings) {
        const result = await this.getStorageData(['embeddings']);
        const allEmbeddings = result.embeddings || {};
        allEmbeddings[videoId] = {
            embeddings: embeddings,
            timestamp: Date.now()
        };
        return this.setStorageData({ embeddings: allEmbeddings });
    }

    async getEmbeddings(videoId) {
        const result = await this.getStorageData(['embeddings']);
        const allEmbeddings = result.embeddings || {};
        return allEmbeddings[videoId] || null;
    }

    /**
     * Transcribes audio using Deepgram API (Future feature - not currently implemented)
     * @param {string} audioStreamUrl - URL of the audio stream
     * @param {string} videoId - YouTube video ID
     * @returns {Promise<Object>} Transcription result
     */
    async transcribeWithDeepgram(audioStreamUrl, videoId) {
        try {
            // Get the Deepgram API key
            const apiKeys = await this.getApiKeys();
            const deepgramApiKey = apiKeys.deepgram;
            
            if (!deepgramApiKey) {
                throw new Error('Deepgram API key not found. Please configure it in the extension settings.');
            }
            
            // Prepare the request to Deepgram
            const deepgramUrl = 'https://api.deepgram.com/v1/listen';
            const params = new URLSearchParams({
                model: 'nova-2',
                language: 'en-US',
                smart_format: 'true',
                punctuate: 'true',
                paragraphs: 'true',
                utterances: 'true',
                timestamps: 'true'
            });
            
            // Make the request to Deepgram
            const response = await fetch(`${deepgramUrl}?${params}`, {
                method: 'POST',
                headers: {
                    'Authorization': `Token ${deepgramApiKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    url: audioStreamUrl
                })
            });
            
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Deepgram API error: ${response.status} ${errorText}`);
            }
            
            const data = await response.json();
            
            // Get video duration for dynamic chunking
            let videoDuration = null;
            try {
                // Try to get duration from content script
                const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
                if (tabs[0]) {
                    const durationResponse = await chrome.tabs.sendMessage(tabs[0].id, { 
                        action: 'getVideoDuration' 
                    });
                    videoDuration = durationResponse?.duration;
                }
                            } catch (error) {
                    // Could not get video duration for dynamic chunking
                }
            
            // Parse the Deepgram response with dynamic chunking
            const transcript = this.parseDeepgramResponse(data, videoDuration);
            
            if (transcript && transcript.length > 0) {
                // Save the transcript for future use
                await this.saveTranscript(videoId, transcript);
            }
            
            return transcript;
        } catch (error) {
            throw error;
        }
    }

    parseDeepgramResponse(data, videoDuration = null) {
        try {
            const transcript = [];
            
            if (data.results && data.results.channels && data.results.channels[0]) {
                const alternatives = data.results.channels[0].alternatives;
                
                if (alternatives && alternatives[0] && alternatives[0].words) {
                    const words = alternatives[0].words;
                    
                    // Dynamic chunking based on video duration
                    const chunkingParams = this.getDynamicChunkingParams(videoDuration);
                    const segmentDuration = chunkingParams.segmentDuration;
                    const maxWords = chunkingParams.maxWords;
                    
                    let currentSegment = {
                        startTime: 0,
                        endTime: 0,
                        text: ''
                    };
                    
                    for (let i = 0; i < words.length; i++) {
                        const word = words[i];
                        const wordStart = parseFloat(word.start);
                        const wordEnd = parseFloat(word.end);
                        
                        // If this is the first word of the segment
                        if (currentSegment.text === '') {
                            currentSegment.startTime = wordStart;
                            currentSegment.endTime = wordEnd;
                            currentSegment.text = word.punctuated_word || word.word;
                        } else {
                            // Check if we should start a new segment
                            const timeDiff = wordStart - currentSegment.startTime;
                            const wordCount = currentSegment.text.split(' ').length;
                            
                            if (timeDiff >= segmentDuration || wordCount >= maxWords) {
                                // Finish current segment
                                transcript.push({
                                    startTime: Math.floor(currentSegment.startTime),
                                    endTime: Math.floor(currentSegment.endTime),
                                    text: currentSegment.text.trim()
                                });
                                
                                // Start new segment
                                currentSegment = {
                                    startTime: wordStart,
                                    endTime: wordEnd,
                                    text: word.punctuated_word || word.word
                                };
                            } else {
                                // Add word to current segment
                                currentSegment.endTime = wordEnd;
                                currentSegment.text += ' ' + (word.punctuated_word || word.word);
                            }
                        }
                    }
                    
                    // Don't forget the last segment
                    if (currentSegment.text !== '') {
                        transcript.push({
                            startTime: Math.floor(currentSegment.startTime),
                            endTime: Math.floor(currentSegment.endTime),
                            text: currentSegment.text.trim()
                        });
                    }
                }
                
                // Alternative parsing if word-level timestamps aren't available
                if (transcript.length === 0 && alternatives && alternatives[0] && alternatives[0].paragraphs) {
                    const paragraphs = alternatives[0].paragraphs.paragraphs;
                    
                    for (const paragraph of paragraphs) {
                        if (paragraph.sentences) {
                            for (const sentence of paragraph.sentences) {
                                transcript.push({
                                    startTime: Math.floor(sentence.start),
                                    endTime: Math.floor(sentence.end),
                                    text: sentence.text
                                });
                            }
                        }
                    }
                }
                
                // Final fallback - use the full transcript
                if (transcript.length === 0 && alternatives && alternatives[0] && alternatives[0].transcript) {
                    transcript.push({
                        startTime: 0,
                        endTime: 0,
                        text: alternatives[0].transcript
                    });
                }
            }
            
            return transcript;
        } catch (error) {
            return [];
        }
    }

    // Get dynamic chunking parameters based on video duration
    getDynamicChunkingParams(videoDuration) {
        // Parse video duration if it's a string (e.g., "10:35")
        let durationInSeconds = 0;
        
        if (typeof videoDuration === 'string') {
            const parts = videoDuration.split(':').map(part => parseInt(part));
            if (parts.length === 2) {
                durationInSeconds = parts[0] * 60 + parts[1]; // MM:SS
            } else if (parts.length === 3) {
                durationInSeconds = parts[0] * 3600 + parts[1] * 60 + parts[2]; // HH:MM:SS
            }
        } else if (typeof videoDuration === 'number') {
            durationInSeconds = videoDuration;
        }
        
        const durationInMinutes = durationInSeconds / 60;
        
        // Dynamic chunking strategy:
        // Short videos (< 10 min): Small, precise chunks for better granularity
        // Medium videos (10-30 min): Balanced chunks
        // Long videos (30-60 min): Larger chunks for efficiency
        // Very long videos (> 60 min): Large chunks for performance
        
        if (durationInMinutes < 10) {
            return {
                segmentDuration: 5,    // 5 seconds
                maxWords: 8,           // 8 words max (increased slightly from 6)
            };
        } else if (durationInMinutes < 30) {
            return {
                segmentDuration: 8,    // 8 seconds
                maxWords: 12,          // 12 words max
            };
        } else if (durationInMinutes < 60) {
            return {
                segmentDuration: 12,   // 12 seconds
                maxWords: 18,          // 18 words max
            };
        } else {
            return {
                segmentDuration: 15,   // 15 seconds
                maxWords: 25,          // 25 words max
            };
        }
    }


    // Pin management methods
    async savePin(pin) {
        const result = await this.getStorageData(['pins']);
        const pins = result.pins || [];
        
        // Generate unique ID for the pin
        const pinId = Date.now().toString() + Math.random().toString(36).substr(2, 9);
        const newPin = {
            id: pinId,
            ...pin,
            createdAt: Date.now()
        };

        pins.push(newPin);
        return this.setStorageData({ pins: pins });
    }

    async getPins(videoId) {
        const result = await this.getStorageData(['pins']);
        const pins = result.pins || [];
        return pins.filter(pin => pin.videoId === videoId);
    }

    async getAllPins() {
        const result = await this.getStorageData(['pins']);
        const pins = result.pins || [];
        // Sort by creation date, newest first
        return pins.sort((a, b) => b.createdAt - a.createdAt);
    }

    async deletePin(pinId) {
        const result = await this.getStorageData(['pins']);
        const pins = result.pins || [];
        const updatedPins = pins.filter(pin => pin.id !== pinId);
        return this.setStorageData({ pins: updatedPins });
    }

    // Handle opening pin form from content script
    async handleOpenPinForm(pinData, sender) {
        try {
            
            // Try to send message to popup if it's open
            // Since we can't directly check if popup is open, we'll use a different approach
            
            // Store the pin data temporarily for when popup opens
            await this.setStorageData({ 
                pendingPinData: {
                    ...pinData,
                    timestamp: Date.now()
                }
            });

            // Try to open the extension popup programmatically
            try {
                await chrome.action.openPopup();
            } catch (error) {
                
                // Alternative 1: Try to open extension in a new tab
                try {
                    const extensionUrl = chrome.runtime.getURL('popup.html');
                    await chrome.tabs.create({
                        url: extensionUrl,
                        active: true
                    });
                } catch (tabError) {
                    
                    // Alternative 2: Show notification to user
                    try {
                        await chrome.action.setBadgeText({ text: '!' });
                        await chrome.action.setBadgeBackgroundColor({ color: '#ff4444' });
                        
                        // Clear badge after 5 seconds
                        setTimeout(() => {
                            chrome.action.setBadgeText({ text: '' });
                        }, 5000);
                    } catch (badgeError) {
                        // Could not set badge
                    }
                }
            }

            return { 
                success: true, 
                message: 'Pin form triggered. If popup didn\'t open automatically, please click the extension icon.' 
            };
            
        } catch (error) {
            throw error;
        }
    }
    // Storage utility methods
    async getStorageData(keys) {
        return new Promise((resolve, reject) => {
            chrome.storage.local.get(keys, (result) => {
                if (chrome.runtime.lastError) {
                    reject(chrome.runtime.lastError);
                } else {
                    resolve(result);
                }
            });
        });
    }

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
}

// Initialize the background service
const backgroundService = new BackgroundService();