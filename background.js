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
                default:
                    break;
            }
        });
    }

    setupStorageKeys() {
        // Initialize storage structure if not exists
        chrome.storage.local.get(['apiKeys', 'transcripts', 'embeddings'], (result) => {
            if (!result.apiKeys) {
                chrome.storage.local.set({ apiKeys: {} });
            }
            if (!result.transcripts) {
                chrome.storage.local.set({ transcripts: {} });
            }
            if (!result.embeddings) {
                chrome.storage.local.set({ embeddings: {} });
            }
        });
    }

    updateVideoInfo(videoInfo) {
        this.currentVideoInfo = videoInfo;
        console.log('Updated video info:', videoInfo);
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
            console.log('Starting Deepgram transcription for video:', videoId);
            
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
            
            console.log('Making request to Deepgram API...');
            
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
                console.error('Deepgram API error:', response.status, errorText);
                throw new Error(`Deepgram API error: ${response.status} ${errorText}`);
            }
            
            const data = await response.json();
            console.log('Deepgram response received:', data);
            
            // Parse the Deepgram response
            const transcript = this.parseDeepgramResponse(data);
            
            if (transcript && transcript.length > 0) {
                // Save the transcript for future use
                await this.saveTranscript(videoId, transcript);
                console.log('Transcript saved successfully');
            }
            
            return transcript;
        } catch (error) {
            console.error('Error in Deepgram transcription:', error);
            throw error;
        }
    }

    parseDeepgramResponse(data) {
        try {
            const transcript = [];
            
            if (data.results && data.results.channels && data.results.channels[0]) {
                const alternatives = data.results.channels[0].alternatives;
                
                if (alternatives && alternatives[0] && alternatives[0].words) {
                    const words = alternatives[0].words;
                    
                    // Group words into segments (every 6 words or 5 seconds)
                    const segmentDuration = 5; // seconds
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
                            
                            if (timeDiff >= segmentDuration || wordCount >= 6) {
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
            
            console.log('Parsed Deepgram transcript:', transcript.length, 'segments');
            return transcript;
        } catch (error) {
            console.error('Error parsing Deepgram response:', error);
            return [];
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
}

// Initialize the background service
const backgroundService = new BackgroundService();

// Run cleanup on startup
backgroundService.cleanupOldData(); 