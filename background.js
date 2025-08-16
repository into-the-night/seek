// Background script for YouTube Video Search extension
class BackgroundService {
    constructor() {
        this.currentVideoInfo = null;
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
                    this.saveApiKeys(request.apiKeys).then(() => {
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

    async saveApiKeys(apiKeys) {
        return new Promise((resolve, reject) => {
            chrome.storage.local.set({ apiKeys: apiKeys }, () => {
                if (chrome.runtime.lastError) {
                    reject(chrome.runtime.lastError);
                } else {
                    resolve();
                }
            });
        });
    }

    async getApiKeys() {
        return new Promise((resolve, reject) => {
            chrome.storage.local.get(['apiKeys'], (result) => {
                if (chrome.runtime.lastError) {
                    reject(chrome.runtime.lastError);
                } else {
                    resolve(result.apiKeys || {});
                }
            });
        });
    }

    async saveTranscript(videoId, transcript) {
        return new Promise((resolve, reject) => {
            chrome.storage.local.get(['transcripts'], (result) => {
                const transcripts = result.transcripts || {};
                transcripts[videoId] = {
                    transcript: transcript,
                    timestamp: Date.now()
                };
                
                chrome.storage.local.set({ transcripts: transcripts }, () => {
                    if (chrome.runtime.lastError) {
                        reject(chrome.runtime.lastError);
                    } else {
                        resolve();
                    }
                });
            });
        });
    }

    async getTranscript(videoId) {
        return new Promise((resolve, reject) => {
            chrome.storage.local.get(['transcripts'], (result) => {
                if (chrome.runtime.lastError) {
                    reject(chrome.runtime.lastError);
                } else {
                    const transcripts = result.transcripts || {};
                    const transcriptData = transcripts[videoId];
                    resolve(transcriptData || null);
                }
            });
        });
    }

    async saveEmbeddings(videoId, embeddings) {
        return new Promise((resolve, reject) => {
            chrome.storage.local.get(['embeddings'], (result) => {
                const allEmbeddings = result.embeddings || {};
                allEmbeddings[videoId] = {
                    embeddings: embeddings,
                    timestamp: Date.now()
                };
                
                chrome.storage.local.set({ embeddings: allEmbeddings }, () => {
                    if (chrome.runtime.lastError) {
                        reject(chrome.runtime.lastError);
                    } else {
                        resolve();
                    }
                });
            });
        });
    }

    async getEmbeddings(videoId) {
        return new Promise((resolve, reject) => {
            chrome.storage.local.get(['embeddings'], (result) => {
                if (chrome.runtime.lastError) {
                    reject(chrome.runtime.lastError);
                } else {
                    const allEmbeddings = result.embeddings || {};
                    const embeddingData = allEmbeddings[videoId];
                    resolve(embeddingData || null);
                }
            });
        });
    }

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
                description: 'short'
            };
        } else if (durationInMinutes < 30) {
            return {
                segmentDuration: 8,    // 8 seconds
                maxWords: 12,          // 12 words max
                description: 'medium'
            };
        } else if (durationInMinutes < 60) {
            return {
                segmentDuration: 12,   // 12 seconds
                maxWords: 18,          // 18 words max
                description: 'long'
            };
        } else {
            return {
                segmentDuration: 15,   // 15 seconds
                maxWords: 25,          // 25 words max
                description: 'very_long'
            };
        }
    }

    // Clean up old data (optional - can be called periodically)
    async cleanupOldData() {
        const maxAge = 7 * 24 * 60 * 60 * 1000; // 7 days
        const now = Date.now();

        chrome.storage.local.get(['transcripts', 'embeddings'], (result) => {
            const transcripts = result.transcripts || {};
            const embeddings = result.embeddings || {};

            // Clean old transcripts
            Object.keys(transcripts).forEach(videoId => {
                if (now - transcripts[videoId].timestamp > maxAge) {
                    delete transcripts[videoId];
                }
            });

            // Clean old embeddings
            Object.keys(embeddings).forEach(videoId => {
                if (now - embeddings[videoId].timestamp > maxAge) {
                    delete embeddings[videoId];
                }
            });

            // Save cleaned data
            chrome.storage.local.set({ transcripts, embeddings });
        });
    }

    // Pin management methods
    async savePin(pin) {
        return new Promise((resolve, reject) => {
            chrome.storage.local.get(['pins'], (result) => {
                if (chrome.runtime.lastError) {
                    reject(chrome.runtime.lastError);
                    return;
                }

                const pins = result.pins || [];
                
                // Generate unique ID for the pin
                const pinId = Date.now().toString() + Math.random().toString(36).substr(2, 9);
                const newPin = {
                    id: pinId,
                    ...pin,
                    createdAt: Date.now()
                };

                pins.push(newPin);

                chrome.storage.local.set({ pins: pins }, () => {
                    if (chrome.runtime.lastError) {
                        reject(chrome.runtime.lastError);
                    } else {
                        resolve();
                    }
                });
            });
        });
    }

    async getPins(videoId) {
        return new Promise((resolve, reject) => {
            chrome.storage.local.get(['pins'], (result) => {
                if (chrome.runtime.lastError) {
                    reject(chrome.runtime.lastError);
                    return;
                }

                const pins = result.pins || [];
                const videoPins = pins.filter(pin => pin.videoId === videoId);
                resolve(videoPins);
            });
        });
    }

    async getAllPins() {
        return new Promise((resolve, reject) => {
            chrome.storage.local.get(['pins'], (result) => {
                if (chrome.runtime.lastError) {
                    reject(chrome.runtime.lastError);
                    return;
                }

                const pins = result.pins || [];
                
                // Sort by creation date, newest first
                pins.sort((a, b) => b.createdAt - a.createdAt);
                resolve(pins);
            });
        });
    }

    async deletePin(pinId) {
        return new Promise((resolve, reject) => {
            chrome.storage.local.get(['pins'], (result) => {
                if (chrome.runtime.lastError) {
                    reject(chrome.runtime.lastError);
                    return;
                }

                const pins = result.pins || [];
                const updatedPins = pins.filter(pin => pin.id !== pinId);

                chrome.storage.local.set({ pins: updatedPins }, () => {
                    if (chrome.runtime.lastError) {
                        reject(chrome.runtime.lastError);
                    } else {
                        resolve();
                    }
                });
            });
        });
    }

    // Handle opening pin form from content script
    async handleOpenPinForm(pinData, sender) {
        try {
            
            // Try to send message to popup if it's open
            // Since we can't directly check if popup is open, we'll use a different approach
            
            // Store the pin data temporarily for when popup opens
            await new Promise((resolve, reject) => {
                chrome.storage.local.set({ 
                    pendingPinData: {
                        ...pinData,
                        timestamp: Date.now()
                    }
                }, () => {
                    if (chrome.runtime.lastError) {
                        reject(chrome.runtime.lastError);
                    } else {
                        resolve();
                    }
                });
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
}

// Initialize the background service
const backgroundService = new BackgroundService();

// Run cleanup on startup
backgroundService.cleanupOldData(); 