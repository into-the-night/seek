// Popup script for YouTube Video Search extension
class PopupManager {
    constructor() {
        this.currentVideoInfo = null;
        this.isProcessing = false;
        this.statusTimeout = null;
        this.initializeUI();
        this.setupEventListeners();
        // Add a small delay before checking video to ensure proper initialization
        setTimeout(async () => {
            // Check if encryption is enabled and session is locked
            await this.checkEncryptionStatus();
            this.checkCurrentVideo();
            // Also check for pending pin data from content script
            this.checkPendingPinData();
        }, 100);
    }

    initializeUI() {
        this.elements = {
            noVideoMessage: document.getElementById('noVideoMessage'),
            searchInterface: document.getElementById('searchInterface'),
            searchInput: document.getElementById('searchInput'),
            searchButton: document.getElementById('searchButton'),
            status: document.getElementById('status'),
            results: document.getElementById('results'),
            resultsContent: document.getElementById('resultsContent'),
            settingsBtn: document.getElementById('settingsBtn'),
            // Tab elements
            tabBtns: document.querySelectorAll('.tab-btn'),
            searchTab: document.getElementById('searchTab'),
            pinsTab: document.getElementById('pinsTab'),
            // Pin elements
            createPinBtn: document.getElementById('createPinBtn'),
            pinsFromVideo: document.getElementById('pinsFromVideo'),
            pinsFromVideoContent: document.getElementById('pinsFromVideoContent'),
            allPinsContent: document.getElementById('allPinsContent'),
            // Modal elements
            pinModal: document.getElementById('pinModal'),
            pinTitle: document.getElementById('pinTitle'),
            pinTimestamp: document.getElementById('pinTimestamp'),
            pinVideoTitle: document.getElementById('pinVideoTitle'),
            closePinModal: document.getElementById('closePinModal'),
            cancelPin: document.getElementById('cancelPin'),
            savePin: document.getElementById('savePin')
        };
        
        this.currentTab = 'search';
        this.pendingPinData = null;

        // Ensure pin modal is hidden on startup
        if (this.elements.pinModal) {
            this.elements.pinModal.classList.add('hidden');
        }

        // Ensure create pin button is hidden initially
        if (this.elements.createPinBtn) {
            this.elements.createPinBtn.classList.add('hidden');
        }

    }

    setupEventListeners() {
        // Search button click
        if (this.elements.searchButton) {
            this.elements.searchButton.addEventListener('click', () => {
                this.handleSearch();
            });
        }

        // Enter key on search input
        if (this.elements.searchInput) {
            this.elements.searchInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    this.handleSearch();
                }
            });
            
            // Clear results when input is cleared
            this.elements.searchInput.addEventListener('input', (e) => {
                if (e.target.value.trim() === '') {
                    this.elements.results.classList.add('hidden');
                    this.elements.resultsContent.innerHTML = '';
                    this.updateCreatePinButtonVisibility();
                }
            });
        }

        // Settings button
        if (this.elements.settingsBtn) {
            this.elements.settingsBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.showSettings();
            });
        }

        // Tab switching
        this.elements.tabBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                this.switchTab(btn.dataset.tab);
            });
        });

        // Create pin button (in search popup)
        if (this.elements.createPinBtn) {
            this.elements.createPinBtn.addEventListener('click', () => {
                this.handleCreatePin();
            });
        }

        // Modal event listeners
        if (this.elements.closePinModal) {
            this.elements.closePinModal.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.closePinModal();
            });
        }

        if (this.elements.cancelPin) {
            this.elements.cancelPin.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.closePinModal();
            });
        }

        if (this.elements.savePin) {
            this.elements.savePin.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.savePinFromModal();
            });
        }

        // Modal backdrop click
        if (this.elements.pinModal) {
            this.elements.pinModal.addEventListener('click', (e) => {
                if (e.target === this.elements.pinModal) {
                    this.closePinModal();
                }
            });
        }

        // Listen for messages from content script
        chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
            if (request.action === 'openPinForm') {
                // Open pin form with the provided data, even if currentVideoInfo isn't loaded yet
                this.openPinForm(request.pinData);
            } else if (request.action === 'videoInfoUpdated') {
                // Update current video info when video changes
                this.handleVideoInfoUpdate(request.videoInfo);
            }
        });
    }

    async checkPendingPinData() {
        try {
            // Check if there's pending pin data from content script button click
            const result = await new Promise((resolve) => {
                chrome.storage.local.get(['pendingPinData'], (result) => {
                    if (chrome.runtime.lastError) {
                        resolve(null);
                    } else {
                        resolve(result.pendingPinData);
                    }
                });
            });

            if (result && result.timestamp) {
                // Check if the pending data is recent (within last 30 seconds)
                const age = Date.now() - result.timestamp;
                if (age < 30000) { // 30 seconds
                    // Clear the pending data
                    chrome.storage.local.remove(['pendingPinData']);
                    
                    // Open the pin form with this data
                    setTimeout(() => {
                        this.openPinForm(result);
                    }, 500); // Small delay to ensure UI is ready
                } else {
                    chrome.storage.local.remove(['pendingPinData']);
                }
            }
        } catch (error) {
            // Error checking pending pin data
        }
    }

    async checkEncryptionStatus() {
        try {
            // Check if encryption is enabled
            const encryptionEnabled = await new Promise((resolve) => {
                chrome.runtime.sendMessage({ action: 'isEncryptionEnabled' }, (response) => {
                    resolve(response?.enabled || false);
                });
            });

            if (encryptionEnabled) {
                // Check if session is unlocked
                const sessionUnlocked = await new Promise((resolve) => {
                    chrome.runtime.sendMessage({ action: 'isSessionUnlocked' }, (response) => {
                        resolve(response?.unlocked || false);
                    });
                });

                if (!sessionUnlocked) {
                    // Show PIN unlock modal
                    this.showPinUnlockModal();
                }
            }
        } catch (error) {
            console.error('Error checking encryption status:', error);
        }
    }

    showPinUnlockModal() {
        // Create Passkey unlock modal
        const modal = document.createElement('div');
        modal.id = 'pinUnlockModal';
        modal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.9);
            backdrop-filter: blur(10px);
            display: flex;
            justify-content: center;
            align-items: center;
            z-index: 3000;
            font-family: 'Inter', sans-serif;
        `;

        const modalContent = document.createElement('div');
        modalContent.style.cssText = `
            background: rgba(26, 26, 26, 0.95);
            backdrop-filter: blur(20px);
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: 16px;
            padding: 32px;
            width: 90%;
            max-width: 400px;
            box-shadow: 0 24px 48px rgba(0, 0, 0, 0.5);
        `;

        modalContent.innerHTML = `
            <style>
                #pinUnlockModal h3 {
                    color: #ffffff;
                    font-size: 24px;
                    font-weight: 700;
                    margin-bottom: 16px;
                    text-align: center;
                }
                #pinUnlockModal .pin-description {
                    color: rgba(255, 255, 255, 0.7);
                    font-size: 14px;
                    text-align: center;
                    margin-bottom: 24px;
                }
                #pinUnlockModal .pin-input-container {
                    display: flex;
                    justify-content: center;
                    gap: 12px;
                    margin-bottom: 24px;
                }
                #pinUnlockModal .pin-digit {
                    width: 50px;
                    height: 60px;
                    background: rgba(255, 255, 255, 0.08);
                    border: 2px solid rgba(255, 255, 255, 0.2);
                    border-radius: 8px;
                    color: #ffffff;
                    font-size: 24px;
                    font-weight: 600;
                    text-align: center;
                    outline: none;
                    transition: all 0.3s ease;
                }
                #pinUnlockModal .pin-digit:focus {
                    border-color: rgb(234, 102, 102);
                    box-shadow: 0 0 0 3px rgba(234, 102, 102, 0.2);
                    background: rgba(255, 255, 255, 0.12);
                }
                #pinUnlockModal .pin-digit.filled {
                    background: rgba(234, 102, 102, 0.1);
                    border-color: rgba(234, 102, 102, 0.3);
                }
                #pinUnlockModal .error-message {
                    color: #ef4444;
                    font-size: 14px;
                    text-align: center;
                    margin-bottom: 16px;
                    min-height: 20px;
                }
                #pinUnlockModal .unlock-btn {
                    width: 100%;
                    padding: 14px 20px;
                    background: linear-gradient(45deg, rgb(247, 168, 78) 0%, rgb(162, 92, 75) 100%);
                    color: #ffffff;
                    border: none;
                    border-radius: 8px;
                    font-size: 16px;
                    font-weight: 600;
                    cursor: pointer;
                    transition: all 0.3s ease;
                    text-transform: uppercase;
                    letter-spacing: 0.5px;
                }
                #pinUnlockModal .unlock-btn:hover:not(:disabled) {
                    transform: translateY(-2px);
                    box-shadow: 0 6px 20px rgba(235, 163, 141, 0.3);
                }
                #pinUnlockModal .unlock-btn:disabled {
                    opacity: 0.5;
                    cursor: not-allowed;
                }
            </style>
            <h3>🔒 Enter Your Passkey</h3>
            <div class="pin-description">Enter your 4-digit passkey to unlock your API keys</div>
            <div class="pin-input-container">
                <input type="password" class="pin-digit" maxlength="1" pattern="[0-9]" inputmode="numeric">
                <input type="password" class="pin-digit" maxlength="1" pattern="[0-9]" inputmode="numeric">
                <input type="password" class="pin-digit" maxlength="1" pattern="[0-9]" inputmode="numeric">
                <input type="password" class="pin-digit" maxlength="1" pattern="[0-9]" inputmode="numeric">
            </div>
            <div class="error-message"></div>
            <button class="unlock-btn" id="unlockBtn">Unlock Session</button>
        `;

        modal.appendChild(modalContent);
        document.body.appendChild(modal);

        // Setup Passkey input handlers
        const pinDigits = modalContent.querySelectorAll('.pin-digit');
        const unlockBtn = modalContent.querySelector('#unlockBtn');
        const errorMsg = modalContent.querySelector('.error-message');

        pinDigits.forEach((input, index) => {
            input.addEventListener('input', (e) => {
                const value = e.target.value;
                if (value && /^[0-9]$/.test(value)) {
                    e.target.classList.add('filled');
                    if (index < pinDigits.length - 1) {
                        pinDigits[index + 1].focus();
                    }
                } else {
                    e.target.value = '';
                    e.target.classList.remove('filled');
                }
                errorMsg.textContent = '';
            });

            input.addEventListener('keydown', (e) => {
                if (e.key === 'Backspace' && !e.target.value && index > 0) {
                    pinDigits[index - 1].focus();
                }
            });

            input.addEventListener('paste', (e) => {
                e.preventDefault();
                const pastedData = e.clipboardData.getData('text');
                if (/^\d{4}$/.test(pastedData)) {
                    pastedData.split('').forEach((digit, i) => {
                        if (pinDigits[i]) {
                            pinDigits[i].value = digit;
                            pinDigits[i].classList.add('filled');
                        }
                    });
                }
            });
        });

        const attemptUnlock = async () => {
            const pin = Array.from(pinDigits).map(input => input.value).join('');
            
            if (pin.length !== 4) {
                errorMsg.textContent = 'Please enter all 4 digits';
                return;
            }

            unlockBtn.disabled = true;
            unlockBtn.textContent = 'Unlocking...';

            try {
                const response = await new Promise((resolve) => {
                    chrome.runtime.sendMessage({ action: 'unlockSession', pin: pin }, (response) => {
                        resolve(response);
                    });
                });

                if (response?.success) {
                    // Remove modal and continue
                    modal.remove();
                } else {
                    errorMsg.textContent = 'Invalid PIN. Please try again.';
                    pinDigits.forEach(input => {
                        input.value = '';
                        input.classList.remove('filled');
                    });
                    pinDigits[0].focus();
                }
            } catch (error) {
                errorMsg.textContent = 'Error unlocking session. Please try again.';
            } finally {
                unlockBtn.disabled = false;
                unlockBtn.textContent = 'Unlock Session';
            }
        };

        unlockBtn.addEventListener('click', attemptUnlock);
        
        // Allow Enter key to submit
        pinDigits.forEach(input => {
            input.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    attemptUnlock();
                }
            });
        });

        // Focus first input
        setTimeout(() => pinDigits[0].focus(), 100);
    }

    async checkCurrentVideo() {
        try {
            // Get current tab
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            
            // Check if we're on YouTube
            if (!tab.url.includes('youtube.com/watch')) {
                this.showNoVideoMessage();
                return;
            }

            // Get video info from content script
            const response = await chrome.tabs.sendMessage(tab.id, { action: 'getVideoInfo' });
            
            if (response && response.isVideoPage) {
                this.currentVideoInfo = response;
                this.showSearchInterface();
                // Explicitly show the create pin button after video info is loaded
                this.updateCreatePinButtonVisibility();
            } else {
                this.showNoVideoMessage();
            }
        } catch (error) {
            this.showNoVideoMessage();
        }
    }

    updateCreatePinButtonVisibility() {
        // Check if results are currently displayed
        const resultsAreVisible = !this.elements.results.classList.contains('hidden');
        
        if (this.currentTab === 'search' && this.currentVideoInfo && this.currentVideoInfo.isVideoPage && !resultsAreVisible) {
            this.elements.createPinBtn.classList.remove('hidden');
        } else {
            this.elements.createPinBtn.classList.add('hidden');
        }
    }

    showNoVideoMessage() {
        this.elements.noVideoMessage.classList.remove('hidden');
        this.elements.searchInterface.classList.add('hidden');
        this.elements.createPinBtn.classList.add('hidden');
    }

    showSearchInterface() {
        this.elements.noVideoMessage.classList.add('hidden');
        this.elements.searchInterface.classList.remove('hidden');
        this.elements.searchInput.focus();
        
        // Create pin button visibility will be handled by updateCreatePinButtonVisibility()
    }

    async handleSearch() {
        const query = this.elements.searchInput.value.trim();
        
        if (!query) {
            this.showStatus('Please enter a search query', 'error');
            return;
        }

        if (this.isProcessing) {
            return;
        }

        this.isProcessing = true;
        this.elements.searchButton.disabled = true;
        this.elements.results.classList.add('hidden');
        // Hide create pin button during search
        this.elements.createPinBtn.classList.add('hidden');
        
        try {
            // Check if we have API keys using the new flexible selection
            const activeKey = await this.getActiveApiKey();
            if (activeKey.error) {
                this.showStatus(activeKey.error, 'error');
                this.isProcessing = false;
                this.elements.searchButton.disabled = false;
                return;
            }

            // Step 1: Get or generate transcript
            this.showStatus('Getting video transcript...', 'loading');
            const transcript = await this.getTranscript();
            
            // Step 2: Generate embeddings if needed
            this.showStatus('Processing video content...', 'loading');
            const embeddings = await this.getEmbeddings(transcript);
            
            // Step 3: Search for relevant moments
            this.showStatus('Searching for relevant moments...', 'loading');
            const results = await this.searchInVideo(query, transcript, embeddings);
            
            // Step 4: Display results
            this.displayResults(results);
            this.showStatus('Search completed!', 'success');
            
        } catch (error) {
            this.showStatus(`Error: ${error.message}`, 'error');
        } finally {
            this.isProcessing = false;
            this.elements.searchButton.disabled = false;
            // Show create pin button again after search
            this.updateCreatePinButtonVisibility();
        }
    }

    async getApiKeys() {
        return new Promise((resolve, reject) => {
            chrome.runtime.sendMessage({ action: 'getApiKeys' }, (response) => {
                if (chrome.runtime.lastError) {
                    reject(new Error(chrome.runtime.lastError.message || 'API key retrieval failed'));
                } else if (response && response.error) {
                    reject(new Error(response.error));
                } else if (response) {
                    resolve(response);
                } else {
                    reject(new Error('Failed to get API keys'));
                }
            });
        });
    }

    async getTranscript() {
        const videoId = this.currentVideoInfo.videoId;
        
        // Check if we have cached transcript
        const cachedTranscript = await new Promise((resolve) => {
            chrome.runtime.sendMessage({ action: 'getTranscript', videoId }, (response) => {
                if (chrome.runtime.lastError) {
                    resolve(null);
                } else {
                    resolve(response && !response.error ? response : null);
                }
            });
        });

        if (cachedTranscript) {
            return cachedTranscript.transcript;
        }

        // Generate new transcript using Deepgram
        const newTranscript = await this.generateTranscript(videoId);
        return newTranscript;
    }

    async generateTranscript(videoId) {
        const apiKeys = await this.getApiKeys();
        
        // First, try to get YouTube's built-in transcript
        try {
            const transcript = await this.getYouTubeTranscript(videoId);
            if (transcript && transcript.length > 0) {
                // Cache the transcript
                await new Promise((resolve) => {
                    chrome.runtime.sendMessage({ 
                        action: 'saveTranscript', 
                        videoId, 
                        transcript: transcript 
                    }, (response) => {
                        resolve(response);
                    });
                });
                
                return transcript;
            }
        } catch (error) {
            // YouTube built-in transcript failed
        }
        
        // Fallback to Deepgram (if available)
        if (apiKeys.deepgram) {
            try {
                const transcript = await this.getDeepgramTranscript(videoId, apiKeys.deepgram);
                
                // Cache the transcript
                await new Promise((resolve) => {
                    chrome.runtime.sendMessage({ 
                        action: 'saveTranscript', 
                        videoId, 
                        transcript: transcript 
                    }, (response) => {
                        resolve(response);
                    });
                });
                
                return transcript;
            } catch (error) {
                throw new Error('Unable to generate transcript. Please ensure the video has captions or try again later.');
            }
        }
        
        throw new Error('No transcription method available. Please enable captions on this video or configure Deepgram API key for audio transcription.');
    }

    async getYouTubeTranscript(videoId) {
        try {
            // Get current tab to access YouTube's transcript API
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            
            // Send message to content script to extract transcript
            const response = await chrome.tabs.sendMessage(tab.id, { 
                action: 'getYouTubeTranscript',
                videoId: videoId
            });
            
            if (response && response.transcript) {
                return response.transcript;
            }
            
            throw new Error('No transcript available');
        } catch (error) {
            throw error;
        }
    }

    async getDeepgramTranscript(videoId, apiKey) {
        try {
            // Get current tab to access the content script
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            
            // Send message to content script to extract audio and transcribe with Deepgram
            const response = await chrome.tabs.sendMessage(tab.id, { 
                action: 'getYouTubeTranscript',
                videoId: videoId
            });
            
            if (response && response.error) {
                throw new Error(response.error);
            }
            
            if (response && response.transcript) {
                return response.transcript;
            }
            
            throw new Error('No transcript received from Deepgram');
        } catch (error) {
            throw new Error(`Deepgram transcription failed: ${error.message}`);
        }
    }

    async getMockTranscript(videoId) {
        // Remove this mock function - it's no longer needed
        throw new Error('Mock transcript removed. Please use real transcription.');
    }

    async getEmbeddings(transcript) {
        if (!transcript || transcript.length === 0) {
            throw new Error('No transcript available for embedding generation');
        }

        // Check if we have cached embeddings
        const cachedEmbeddings = await new Promise((resolve) => {
            chrome.runtime.sendMessage({ 
                action: 'getEmbeddings', 
                videoId: this.currentVideoInfo.videoId 
            }, (response) => {
                if (chrome.runtime.lastError) {
                    resolve(null);
                } else {
                    resolve(response && !response.error ? response : null);
                }
            });
        });

        if (cachedEmbeddings) {
            return cachedEmbeddings.embeddings;
        }

        // Generate new embeddings
        const embeddings = await this.generateEmbeddings(transcript);
        
        // Cache the embeddings
        await new Promise((resolve) => {
            chrome.runtime.sendMessage({ 
                action: 'saveEmbeddings', 
                videoId: this.currentVideoInfo.videoId,
                embeddings: embeddings 
            }, (response) => {

                resolve(response);
            });
        });

        return embeddings;
    }

    async generateEmbeddings(transcript) {
        const apiKeys = await this.getApiKeys();
        
        // Check which embedding model to use based on available API keys
        const embeddingModel = await this.getPreferredEmbeddingModel(apiKeys);
        
        if (!embeddingModel) {
            throw new Error('No embedding API key configured. Please configure OpenAI, Hugging Face, or Google AI API key.');
        }

        // Split transcript into chunks with dynamic size based on transcript length
        const dynamicChunkSize = this.getDynamicChunkSize(transcript);
        const chunks = this.splitTranscriptIntoChunks(transcript, dynamicChunkSize);
        
        // Use batch processing for better performance on long transcripts
        const embeddings = await this.processEmbeddingsInBatches(chunks, embeddingModel, apiKeys);
        
        return embeddings;
    }

    async getPreferredEmbeddingModel(apiKeys) {
        // Get the saved preference
        const preference = await new Promise((resolve) => {
            chrome.storage.local.get(['selectedProvider'], (result) => {
                resolve(result.selectedProvider || null);
            });
        });
        
        // Check available keys
        const availableModels = [];
        if (apiKeys.openAI) availableModels.push({ name: 'OpenAI', type: 'openai', apiKey: apiKeys.openAI });
        if (apiKeys.googleAI) availableModels.push({ name: 'Google AI', type: 'google', apiKey: apiKeys.googleAI });
        if (apiKeys.huggingFace) availableModels.push({ name: 'BGE-base-en-v1.5', type: 'huggingface', apiKey: apiKeys.huggingFace });
        
        if (availableModels.length === 0) {
            return null;
        }
        
        // If only one model available, use it
        if (availableModels.length === 1) {
            return availableModels[0];
        }
        
        // If preference is set and available, use it
        if (preference) {
            const preferredModel = availableModels.find(m => m.type === preference);
            if (preferredModel) {
                return preferredModel;
            }
        }
        
        // Fallback to priority order: OpenAI > Google AI > Hugging Face
        if (apiKeys.openAI) {
            return { name: 'OpenAI', type: 'openai', apiKey: apiKeys.openAI };
        }
        if (apiKeys.googleAI) {
            return { name: 'Google AI', type: 'google', apiKey: apiKeys.googleAI };
        }
        if (apiKeys.huggingFace) {
            return { name: 'BGE-base-en-v1.5', type: 'huggingface', apiKey: apiKeys.huggingFace };
        }
        return null;
    }

    async getActiveApiKey() {
        const apiKeys = await this.getApiKeys();
        
        // Get the saved preference
        const preference = await new Promise((resolve) => {
            chrome.storage.local.get(['selectedProvider'], (result) => {
                resolve(result.selectedProvider || null);
            });
        });
        
        // Count available API keys
        const availableKeys = [];
        if (apiKeys.openAI) availableKeys.push({ provider: 'openai', key: apiKeys.openAI });
        if (apiKeys.googleAI) availableKeys.push({ provider: 'gemini', key: apiKeys.googleAI });
        if (apiKeys.huggingFace) availableKeys.push({ provider: 'huggingface', key: apiKeys.huggingFace });
        
        // No API keys configured
        if (availableKeys.length === 0) {
            return { error: 'Please configure an API key in settings', provider: null, key: null };
        }
        
        // Only one API key configured - use it
        if (availableKeys.length === 1) {
            return { 
                provider: availableKeys[0].provider, 
                key: availableKeys[0].key,
                error: null 
            };
        }
        
        // Multiple API keys configured - use preference or fallback
        if (preference) {
            // Check if the preferred provider has an API key
            const preferredKey = availableKeys.find(k => k.provider === preference);
            if (preferredKey) {
                return { 
                    provider: preferredKey.provider, 
                    key: preferredKey.key,
                    error: null 
                };
            }
        }
        
        // Fallback priority order: OpenAI > Gemini > HuggingFace
        const priorityOrder = ['openai', 'gemini', 'huggingface'];
        for (const provider of priorityOrder) {
            const found = availableKeys.find(k => k.provider === provider);
            if (found) {
                return { 
                    provider: found.provider, 
                    key: found.key,
                    error: null 
                };
            }
        }
        
        // This shouldn't happen but just in case
        return { 
            provider: availableKeys[0].provider, 
            key: availableKeys[0].key,
            error: null 
        };
    }

    async generateEmbedding(chunk, embeddingModel, apiKeys) {
        switch (embeddingModel.type) {
            case 'openai':
                return await this.generateOpenAIEmbedding(chunk, embeddingModel.apiKey);
            case 'huggingface':
                return await this.generateHuggingFaceEmbedding(chunk, embeddingModel.apiKey);
            case 'google':
                return await this.generateGoogleAIEmbedding(chunk, embeddingModel.apiKey);
            default:
                throw new Error(`Unsupported embedding model: ${embeddingModel.type}`);
        }
    }

    async generateOpenAIEmbedding(chunk, apiKey) {
        const response = await fetch('https://api.openai.com/v1/embeddings', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: 'text-embedding-3-small',
                input: chunk.text
            })
        });

        if (!response.ok) {
            throw new Error(`OpenAI API error: ${response.statusText}`);
        }

        const data = await response.json();
        return data.data[0].embedding;
    }

    async generateHuggingFaceEmbedding(chunk, apiKey) {
        const response = await fetch('https://api-inference.huggingface.co/models/BAAI/bge-base-en-v1.5', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                inputs: chunk.text,
                options: {
                    wait_for_model: true
                }
            })
        });

        if (!response.ok) {
            throw new Error(`Hugging Face API error: ${response.statusText}`);
        }

        const data = await response.json();
        return data;
    }

    async generateGoogleAIEmbedding(chunk, apiKey) {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/embedding-001:embedContent?key=${apiKey}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: 'models/embedding-001',
                content: {
                    parts: [{ text: chunk.text }]
                }
            })
        });

        if (!response.ok) {
            throw new Error(`Google AI API error: ${response.statusText}`);
        }

        const data = await response.json();
        return data.embedding.values;
    }

    // Get dynamic chunk size based on transcript length for optimal embedding performance
    getDynamicChunkSize(transcript) {
        const transcriptLength = transcript.length;
        
        // Dynamic chunking strategy for embeddings:
        // Short transcripts (< 50 segments): Smaller chunks for precision
        // Medium transcripts (50-200 segments): Balanced chunks
        // Long transcripts (200-500 segments): Larger chunks for efficiency
        // Very long transcripts (> 500 segments): Large chunks for performance
        
        let chunkSize, strategy;
        
        if (transcriptLength < 50) {
            chunkSize = 350;   // Small chunks for precision
            strategy = 'precise';
        } else if (transcriptLength < 200) {
            chunkSize = 500;   // Medium chunks
            strategy = 'balanced';
        } else if (transcriptLength < 500) {
            chunkSize = 750;   // Large chunks for efficiency
            strategy = 'efficient';
        } else {
            chunkSize = 1000;  // Very large chunks for performance
            strategy = 'performance';
        }
        
        return chunkSize;
    }

    // Process embeddings in batches for better performance
    async processEmbeddingsInBatches(chunks, embeddingModel, apiKeys) {
        const embeddings = [];
        const totalChunks = chunks.length;
        
        // Determine batch size based on number of chunks
        let batchSize;
        if (totalChunks < 50) {
            batchSize = 1;     // Sequential processing for small transcripts
        } else if (totalChunks < 200) {
            batchSize = 5;     // Small batches for medium transcripts
        } else if (totalChunks < 500) {
            batchSize = 10;    // Medium batches for long transcripts
        } else {
            batchSize = 15;    // Large batches for very long transcripts
        }
        
        // Process chunks in batches
        for (let i = 0; i < chunks.length; i += batchSize) {
            const batch = chunks.slice(i, i + batchSize);
            const batchNumber = Math.floor(i / batchSize) + 1;
            const totalBatches = Math.ceil(chunks.length / batchSize);
            
            this.showStatus(
                `Generating embeddings with ${embeddingModel.name}... Batch ${batchNumber}/${totalBatches} (${i + 1}-${Math.min(i + batchSize, totalChunks)}/${totalChunks})`, 
                'loading'
            );
            
            // Process batch concurrently for better performance
            const batchPromises = batch.map(async (chunk, batchIndex) => {
                try {
                    const embedding = await this.generateEmbedding(chunk, embeddingModel, apiKeys);
                    return {
                        text: chunk.text,
                        startTime: chunk.startTime,
                        endTime: chunk.endTime,
                        embedding: embedding,
                        originalIndex: i + batchIndex
                    };
                } catch (error) {
                    return null; // Skip failed chunks
                }
            });
            
            try {
                const batchResults = await Promise.all(batchPromises);
                
                // Add successful results to embeddings array
                batchResults.forEach(result => {
                    if (result) {
                        embeddings.push(result);
                    }
                });
                
                // Small delay between batches to avoid rate limiting
                if (i + batchSize < chunks.length) {
                    await new Promise(resolve => setTimeout(resolve, 100));
                }
                
            } catch (error) {
                // Continue with next batch
            }
        }
        
        // Sort embeddings by original index to maintain order
        embeddings.sort((a, b) => a.originalIndex - b.originalIndex);
        
        // Remove the originalIndex property
        embeddings.forEach(embedding => delete embedding.originalIndex);
        
        return embeddings;
    }

    splitTranscriptIntoChunks(transcript, maxChars = 350) {
        const chunks = [];
        let currentChunk = '';
        let currentStartTime = 0;
        let currentEndTime = 0;

        for (let i = 0; i < transcript.length; i++) {
            const entry = transcript[i];
            const entryText = entry.text.trim();
            
            // If adding this entry would exceed max chars, try to split intelligently
            if (currentChunk.length + entryText.length > maxChars && currentChunk.length > 0) {
                // Try to break at sentence boundaries if possible
                const sentences = currentChunk.split(/[.!?]+/).filter(s => s.trim().length > 0);
                
                if (sentences.length > 1) {
                    // Keep first sentences that fit, save the rest for next chunk
                    let partialChunk = '';
                    let remainingText = '';
                    
                    for (let j = 0; j < sentences.length; j++) {
                        const sentence = sentences[j].trim();
                        if (partialChunk.length + sentence.length <= maxChars * 0.8) {
                            partialChunk += sentence + '. ';
                        } else {
                            remainingText = sentences.slice(j).join('. ') + '. ';
                            break;
                        }
                    }
                    
                    if (partialChunk.trim().length > 0) {
                        chunks.push({
                            text: partialChunk.trim(),
                            startTime: currentStartTime,
                            endTime: currentEndTime
                        });
                    }
                    
                    // Reset chunk with remaining text and current entry's start time
                    currentChunk = remainingText;
                    currentStartTime = entry.startTime;
                } else {
                    // No sentence boundaries found, split as before
                    chunks.push({
                        text: currentChunk.trim(),
                        startTime: currentStartTime,
                        endTime: currentEndTime
                    });
                    currentChunk = '';
                    currentStartTime = entry.startTime;
                }
            }
            
            if (currentChunk.length === 0) {
                currentStartTime = entry.startTime;
            }
            
            currentChunk += entryText + ' ';
            currentEndTime = entry.endTime;
        }

        // Add the last chunk if it exists
        if (currentChunk.trim().length > 0) {
            chunks.push({
                text: currentChunk.trim(),
                startTime: currentStartTime,
                endTime: currentEndTime
            });
        }

        return chunks;
    }

    generateMockEmbedding(text) {
        // Remove this mock function - it's no longer needed
        throw new Error('Mock embedding removed. Please use real embeddings.');
    }

    async searchInVideo(query, transcript, embeddings) {
        const activeKey = await this.getActiveApiKey();
        
        if (activeKey.error) {
            throw new Error(activeKey.error);
        }

        // Generate embedding for the query using the active provider
        let queryEmbedding;
        switch (activeKey.provider) {
            case 'openai':
                queryEmbedding = await this.generateOpenAIEmbedding({ text: query }, activeKey.key);
                break;
            case 'gemini':
                queryEmbedding = await this.generateGoogleAIEmbedding({ text: query }, activeKey.key);
                break;
            case 'huggingface':
                queryEmbedding = await this.generateHuggingFaceEmbedding({ text: query }, activeKey.key);
                break;
            default:
                throw new Error(`Unsupported provider: ${activeKey.provider}`);
        }

        // Find the most similar embeddings
        const similarities = embeddings.map(item => ({
            ...item,
            similarity: this.cosineSimilarity(queryEmbedding, item.embedding)
        }));

        // Sort by similarity and return top results with intelligent filtering
        const sortedSimilarities = similarities.sort((a, b) => b.similarity - a.similarity);
        
        // Dynamic threshold - use a percentage of the best match
        const dynamicThreshold = sortedSimilarities.length > 0 ? 
            Math.max(0.3, sortedSimilarities[0].similarity * 0.6) : 0.3;
        
        const results = sortedSimilarities
            .filter(item => item.similarity > dynamicThreshold) // Intelligent similarity filtering
            .slice(0, 8) // Return more results for better coverage
            .map(item => ({
                startTime: item.startTime,
                endTime: item.endTime,
                text: item.text,
                similarity: item.similarity
            }));

        return results;
    }

    cosineSimilarity(a, b) {
        let dotProduct = 0;
        let magnitudeA = 0;
        let magnitudeB = 0;

        for (let i = 0; i < a.length; i++) {
            dotProduct += a[i] * b[i];
            magnitudeA += a[i] * a[i];
            magnitudeB += b[i] * b[i];
        }

        magnitudeA = Math.sqrt(magnitudeA);
        magnitudeB = Math.sqrt(magnitudeB);

        return dotProduct / (magnitudeA * magnitudeB);
    }

    displayResults(results) {
        this.elements.resultsContent.innerHTML = '';
        
        if (results.length === 0) {
            this.elements.resultsContent.innerHTML = '<div class="no-results">No relevant moments found. Try rephrasing your query.</div>';
        } else {
            results.forEach(result => {
                const resultElement = this.createResultElement(result);
                this.elements.resultsContent.appendChild(resultElement);
            });
            
            // Add pin buttons to results
            this.addPinButtonsToResults();
        }
        
        this.elements.results.classList.remove('hidden');
    }

    createResultElement(result) {
        const div = document.createElement('div');
        div.className = 'result-item';
        div.dataset.timestamp = result.startTime; // Add timestamp for pin functionality
        
        // Add similarity score styling
        const similarityClass = result.similarity > 0.8 ? 'high-similarity' : 
                               result.similarity > 0.6 ? 'medium-similarity' : 'low-similarity';
        
        // Truncate text for easier navigation
        const truncatedText = this.truncateText(result.text, 150); // Show first 150 characters
        
        div.innerHTML = `
            <div class="result-timestamp">${this.formatTime(result.startTime)} - ${this.formatTime(result.endTime)}</div>
            <div class="result-text">${truncatedText}</div>
            <div class="result-similarity ${similarityClass}">Match: ${Math.round(result.similarity * 100)}%</div>
        `;
        
        div.addEventListener('click', () => {
            this.navigateToTimestamp(result.startTime);
        });
        
        return div;
    }

    // Truncate text intelligently at word boundaries
    truncateText(text, maxLength = 150) {
        if (text.length <= maxLength) {
            return text;
        }
        
        // Find the last space before maxLength to avoid cutting words
        let truncated = text.substring(0, maxLength);
        const lastSpaceIndex = truncated.lastIndexOf(' ');
        
        if (lastSpaceIndex > maxLength * 0.8) { // If there's a space reasonably close
            truncated = truncated.substring(0, lastSpaceIndex);
        }
        
        return truncated + '...';
    }

    async navigateToTimestamp(timestamp) {
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            await chrome.tabs.sendMessage(tab.id, { 
                action: 'navigateToTimestamp', 
                timestamp 
            });
        } catch (error) {
            // Error navigating to timestamp
        }
    }

    showStatus(message, type = 'loading') {
        // Clear any existing timeouts to prevent conflicts
        if (this.statusTimeout) {
            clearTimeout(this.statusTimeout);
            this.statusTimeout = null;
        }
        
        // Simply update the text content
        this.elements.status.textContent = message;
        this.elements.status.className = `status ${type}`;
        this.elements.status.classList.remove('hidden');
        
        // Auto-hide success or error messages after 3 seconds
        if (type === 'success' || type === 'error') {
            this.statusTimeout = setTimeout(() => {
                if (this.elements.status) {
                    this.elements.status.classList.add('hidden');
                }
                this.statusTimeout = null;
            }, 3000);
        }
    }

    async clearCache() {
        try {
            // Clear transcripts and embeddings from storage
            await new Promise((resolve) => {
                chrome.storage.local.clear(() => {
                    resolve();
                });
            });
        } catch (error) {
            // Error clearing cache
        }
    }

    async showSettings() {
        // Check if encryption is enabled
        const isEncryptionEnabled = await new Promise((resolve) => {
            chrome.runtime.sendMessage({ action: 'isEncryptionEnabled' }, (response) => {
                resolve(response?.enabled || false);
            });
        });

        // Create settings modal with modern dark theme
        const modal = document.createElement('div');
        modal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.85);
            backdrop-filter: blur(20px);
            display: flex;
            justify-content: center;
            align-items: center;
            z-index: 2000;
            font-family: 'Inter', sans-serif;
            animation: fadeIn 0.2s ease;
        `;

        const settingsContent = document.createElement('div');
        settingsContent.style.cssText = `
            background: linear-gradient(135deg, #0f0f0f 0%, #212121 100%);
            backdrop-filter: blur(20px);
            border: 1px solid rgba(255, 255, 255, 0.08);
            border-radius: 20px;
            padding: 32px;
            width: 90%;
            max-width: 480px;
            max-height: 90vh;
            overflow-y: auto;
            box-shadow: 0 24px 48px rgba(0, 0, 0, 0.6);
            position: relative;
        `;

        settingsContent.innerHTML = `
            <style>
                @keyframes fadeIn {
                    from { opacity: 0; transform: scale(0.95); }
                    to { opacity: 1; transform: scale(1); }
                }
                
                .settings-modal {
                    position: relative;
                }
                
                .settings-modal::before {
                    content: '';
                    position: absolute;
                    top: 0;
                    left: 0;
                    right: 0;
                    bottom: 0;
                    background: 
                        radial-gradient(circle at 25% 25%, rgba(255, 0, 0, 0.05) 0%, transparent 50%),
                        radial-gradient(circle at 75% 75%, rgba(204, 0, 0, 0.03) 0%, transparent 50%);
                    pointer-events: none;
                    border-radius: 20px;
                }
                
                .settings-modal h3 {
                    color: #ffffff;
                    font-size: 24px;
                    font-weight: 700;
                    margin-bottom: 28px;
                    text-align: center;
                    background: linear-gradient(45deg, #ff0000 0%, #cc0000 100%);
                    -webkit-background-clip: text;
                    -webkit-text-fill-color: transparent;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 10px;
                }
                
                .api-provider-selector {
                    display: inline-flex;
                    gap: 4px;
                    margin: 0 auto 28px;
                    padding: 6px;
                    background: rgba(18, 18, 18, 0.8);
                    border-radius: 50px;
                    border: 1px solid rgba(255, 255, 255, 0.1);
                    position: relative;
                    left: 50%;
                    transform: translateX(-50%);
                    box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.3);
                }
                
                .provider-btn {
                    width: 52px;
                    height: 52px;
                    padding: 0;
                    background: transparent;
                    border: none;
                    border-radius: 50%;
                    cursor: pointer;
                    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                    position: relative;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                }
                
                .provider-btn:hover:not(.active) {
                    background: rgba(255, 255, 255, 0.05);
                }
                
                .provider-btn.active {
                    background: rgba(255, 255, 255, 0.08);
                    box-shadow: 
                        0 2px 8px rgba(0, 0, 0, 0.2),
                        inset 0 1px 2px rgba(255, 255, 255, 0.1);
                }
                
                .provider-btn .provider-icon {
                    font-size: 26px;
                    filter: grayscale(100%) opacity(0.5);
                    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                    user-select: none;
                }
                
                .provider-btn.active .provider-icon {
                    filter: grayscale(0%) opacity(1);
                    transform: scale(1.1);
                }
                
                .provider-btn:hover .provider-icon {
                    filter: grayscale(0%) opacity(0.9);
                }
                
                .api-form-container {
                    background: rgba(18, 18, 18, 0.6);
                    border: 1px solid rgba(255, 255, 255, 0.08);
                    border-radius: 16px;
                    padding: 24px;
                    margin-bottom: 24px;
                    transition: all 0.3s ease;
                }
                
                .api-form-header {
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    margin-bottom: 16px;
                }
                
                .api-provider-name {
                    font-size: 18px;
                    font-weight: 600;
                    color: #ffffff;
                }
                
                .api-provider-icon {
                    font-size: 24px;
                }
                
                .settings-modal .api-input {
                    width: 100%;
                    padding: 14px 18px;
                    background: rgba(255, 255, 255, 0.05);
                    border: 1px solid rgba(255, 255, 255, 0.15);
                    border-radius: 12px;
                    color: #ffffff;
                    font-size: 14px;
                    outline: none;
                    transition: all 0.3s ease;
                    font-family: 'Courier New', monospace;
                    letter-spacing: 0.5px;
                }
                
                .settings-modal .api-input:focus {
                    border-color: #e2e2e2;
                    box-shadow: 0 0 0 3px rgba(141, 141, 141, 0.2);
                    background: rgba(255, 255, 255, 0.08);
                }
                
                .settings-modal .api-input::placeholder {
                    color: rgba(255, 255, 255, 0.35);
                    font-family: 'Inter', sans-serif;
                    letter-spacing: normal;
                }
                
                .api-description {
                    color: rgba(255, 255, 255, 0.5);
                    font-size: 13px;
                    margin-top: 10px;
                    line-height: 1.5;
                    display: flex;
                    align-items: start;
                    gap: 6px;
                }
                
                .api-description .info-icon {
                    color: rgba(255, 255, 255, 0.3);
                    font-size: 14px;
                    margin-top: 1px;
                }
                .settings-modal .clear-cache-btn {
                    width: 100%;
                    padding: 14px 18px;
                    background: rgba(239, 68, 68, 0.15);
                    border: 1px solid rgba(239, 68, 68, 0.25);
                    border-radius: 12px;
                    color: #ef4444;
                    font-size: 14px;
                    font-weight: 600;
                    cursor: pointer;
                    transition: all 0.3s ease;
                    margin-bottom: 24px;
                    font-family: 'Inter', sans-serif;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 8px;
                }
                
                .settings-modal .clear-cache-btn:hover {
                    background: rgba(239, 68, 68, 0.25);
                    transform: translateY(-1px);
                    box-shadow: 0 4px 12px rgba(239, 68, 68, 0.2);
                }
                
                .settings-modal .button-group {
                    display: flex;
                    gap: 12px;
                }
                
                .settings-modal .btn {
                    flex: 1;
                    padding: 14px 20px;
                    border: none;
                    border-radius: 12px;
                    font-size: 14px;
                    font-weight: 600;
                    cursor: pointer;
                    transition: all 0.3s ease;
                    text-transform: uppercase;
                    letter-spacing: 0.5px;
                    font-family: 'Inter', sans-serif;
                }
                
                .settings-modal .btn-primary {
                    background: linear-gradient(45deg, #272727 0%, #3b3b3b 100%);
                    color: #ffffff;
                    box-shadow: 0 4px 16px rgba(68, 68, 68, 0.3);
                }
                
                .settings-modal .btn-primary:hover {
                    transform: translateY(-2px);
                    box-shadow: 0 6px 20px rgba(68, 68, 68, 0.4);
                }
                
                .settings-modal .btn-secondary {
                    background: rgba(255, 255, 255, 0.08);
                    color: rgba(255, 255, 255, 0.9);
                    border: 1px solid rgba(255, 255, 255, 0.15);
                }
                
                .settings-modal .btn-secondary:hover {
                    background: rgba(255, 255, 255, 0.12);
                    transform: translateY(-1px);
                }
                .settings-modal .pin-setup {
                    background: rgba(18, 18, 18, 0.6);
                    border: 1px solid rgba(255, 255, 255, 0.08);
                    border-radius: 16px;
                    padding: 20px;
                    margin-bottom: 24px;
                }
                
                .settings-modal .pin-setup-title {
                    color: #ffffff;
                    font-size: 16px;
                    font-weight: 600;
                    margin-bottom: 12px;
                    display: flex;
                    align-items: center;
                    gap: 8px;
                }
                
                .settings-modal .pin-setup-description {
                    color: rgba(255, 255, 255, 0.6);
                    font-size: 14px;
                    line-height: 1.5;
                    margin-bottom: 16px;
                }
                
                .settings-modal .pin-input-group {
                    display: flex;
                    gap: 10px;
                    align-items: center;
                    justify-content: center;
                    margin-bottom: 16px;
                }
                
                .settings-modal .pin-digit-input {
                    width: 50px;
                    height: 50px;
                    background: rgba(255, 255, 255, 0.05);
                    border: 2px solid rgba(255, 255, 255, 0.15);
                    border-radius: 10px;
                    color: #ffffff;
                    font-size: 20px;
                    font-weight: 600;
                    text-align: center;
                    outline: none;
                    transition: all 0.3s ease;
                }
                
                .settings-modal .pin-digit-input:focus {
                    border-color: #e2e2e2;
                    box-shadow: 0 0 0 3px rgba(141, 141, 141, 0.2);
                    background: rgba(255, 255, 255, 0.08);
                }
                
                .settings-modal .pin-checkbox-group {
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    margin-bottom: 16px;
                }
                
                .settings-modal .pin-checkbox {
                    width: 20px;
                    height: 20px;
                    accent-color: #666666;
                }
                
                .settings-modal .pin-checkbox-label {
                    color: rgba(255, 255, 255, 0.8);
                    font-size: 14px;
                }
                
                .settings-modal .pin-warning {
                    background: rgba(239, 68, 68, 0.08);
                    border: 1px solid rgba(239, 68, 68, 0.15);
                    border-radius: 10px;
                    padding: 12px 14px;
                    margin-top: 12px;
                }
                
                .settings-modal .pin-warning-text {
                    color: #ef4444;
                    font-size: 13px;
                    line-height: 1.5;
                    display: flex;
                    align-items: start;
                    gap: 6px;
                }
            </style>
            <div class="settings-modal">
                <h3>API Settings</h3>
                
                <!-- Provider Selector -->
                <div class="api-provider-selector">
                    <button class="provider-btn" data-provider="openai" title="OpenAI">
                        <span class="provider-icon">🚀</span>
                    </button>
                    <button class="provider-btn" data-provider="huggingface" title="Hugging Face">
                        <span class="provider-icon">🤗</span>
                    </button>
                    <button class="provider-btn active" data-provider="gemini" title="Google Gemini">
                        <span class="provider-icon">✨</span>
                    </button>
                </div>
                
                <!-- Unified API Form -->
                <div class="api-form-container">
                    <div class="api-form-header">
                        <span class="api-provider-icon" id="providerIcon">✨</span>
                        <span class="api-provider-name" id="providerName">Google Gemini</span>
                    </div>
                    <input type="password" id="unifiedApiKey" class="api-input" placeholder="Enter your API key...">
                    <div class="api-description">
                        <span class="info-icon">ℹ️</span>
                        <span id="providerDescription">Google's advanced AI model for high-quality embeddings and semantic search</span>
                    </div>
                </div>
                
                <!-- Hidden inputs for storing all keys -->
                <input type="hidden" id="openAiKey">
                <input type="hidden" id="huggingFaceKey">
                <input type="hidden" id="googleAiKey">
                
                ${!isEncryptionEnabled ? `
                <div class="pin-setup" style="margin-top: 20px; padding: 16px;">
                    <div class="pin-setup-title" style="font-size: 14px;">
                        🔐 Secure Your API Keys with a Passkey
                    </div>
                    <div class="pin-setup-description" style="font-size: 13px;">
                        Create a 4-digit passkey to encrypt your API keys. You'll enter this once per session.
                    </div>
                    <div class="pin-checkbox-group">
                        <input type="checkbox" id="enableEncryption" class="pin-checkbox">
                        <label for="enableEncryption" class="pin-checkbox-label">Enable passkey encryption for API keys</label>
                    </div>
                    <div id="pinSetupFields" style="display: none;">
                        <div class="pin-input-group">
                            <input type="password" class="pin-digit-input" maxlength="1" pattern="[0-9]" inputmode="numeric" id="pin1" style="width: 40px; height: 40px; font-size: 18px;">
                            <input type="password" class="pin-digit-input" maxlength="1" pattern="[0-9]" inputmode="numeric" id="pin2" style="width: 40px; height: 40px; font-size: 18px;">
                            <input type="password" class="pin-digit-input" maxlength="1" pattern="[0-9]" inputmode="numeric" id="pin3" style="width: 40px; height: 40px; font-size: 18px;">
                            <input type="password" class="pin-digit-input" maxlength="1" pattern="[0-9]" inputmode="numeric" id="pin4" style="width: 40px; height: 40px; font-size: 18px;">
                        </div>
                        <div class="pin-warning" style="margin-top: 10px; padding: 10px 12px;">
                            <div class="pin-warning-text" style="font-size: 12px;">
                                <span>⚠️</span>
                                <span>Important: Remember this passkey! If you forget it, you'll need to reset and re-enter your API keys.</span>
                            </div>
                        </div>
                    </div>
                </div>
                ` : `
                <div class="pin-setup" style="background: rgba(34, 197, 94, 0.08); border-color: rgba(34, 197, 94, 0.15); margin-top: 20px; padding: 16px;">
                    <div class="pin-setup-title" style="color: #22c55e; font-size: 14px;">
                        ✅ Passkey Protection Enabled
                    </div>
                    <div class="pin-setup-description" style="font-size: 13px;">
                        Your API keys are encrypted with your passkey. You can reset this by clearing the cache below.
                    </div>
                </div>
                `}
                
                <button id="clearCache" class="clear-cache-btn">
                    <span>🗑️</span>
                    <span>Clear Cache & Reset</span>
                </button>
                
                <div class="button-group">
                    <button id="saveSettings" class="btn btn-primary">Save Settings</button>
                    <button id="cancelSettings" class="btn btn-secondary">Cancel</button>
                </div>
            </div>
        `;

        modal.appendChild(settingsContent);
        document.body.appendChild(modal);

        // Provider data configuration
        const providerConfig = {
            openai: {
                name: 'OpenAI',
                icon: '🚀',
                displayName: 'OpenAI',
                placeholder: 'sk-...',
                description: 'Uses text-embedding-3-small model for best semantic search results',
                keyField: 'openAiKey'
            },
            huggingface: {
                name: 'Hugging Face',
                icon: '🤗',
                displayName: 'Hugging Face',
                placeholder: 'hf_...',
                description: 'State-of-the-art open-source BGE-base-en-v1.5 embedding model',
                keyField: 'huggingFaceKey'
            },
            gemini: {
                name: 'Google Gemini',
                icon: '✨',
                displayName: 'Google Gemini',
                placeholder: 'AIza...',
                description: 'Google\'s advanced AI model for high-quality embeddings and semantic search',
                keyField: 'googleAiKey'
            }
        };

        let currentProvider = 'gemini';
        const unifiedApiInput = document.getElementById('unifiedApiKey');
        const providerButtons = document.querySelectorAll('.provider-btn');
        const providerIcon = document.getElementById('providerIcon');
        const providerName = document.getElementById('providerName');
        const providerDescription = document.getElementById('providerDescription');

        // Load existing keys and store them in hidden inputs
        this.getApiKeys().then(async keys => {
            document.getElementById('openAiKey').value = keys.openAI || '';
            document.getElementById('huggingFaceKey').value = keys.huggingFace || '';
            document.getElementById('googleAiKey').value = keys.googleAI || '';
            
            // Load the saved provider preference
            const savedProvider = await new Promise((resolve) => {
                chrome.storage.local.get(['selectedProvider'], (result) => {
                    resolve(result.selectedProvider || 'gemini');
                });
            });
            currentProvider = savedProvider;
            
            // Update UI to show the saved provider
            providerButtons.forEach(btn => {
                if (btn.dataset.provider === currentProvider) {
                    btn.classList.add('active');
                } else {
                    btn.classList.remove('active');
                }
            });
            
            // Load the current provider's key into the unified input
            const config = providerConfig[currentProvider];
            const keyField = document.getElementById(config.keyField);
            unifiedApiInput.value = keyField.value;
            
            // Update provider info display
            providerIcon.textContent = config.icon;
            providerName.textContent = config.displayName;
            providerDescription.textContent = config.description;
            unifiedApiInput.placeholder = config.placeholder;
        });

        // Handle provider switching
        providerButtons.forEach(button => {
            button.addEventListener('click', () => {
                // Save current provider's key to hidden input before switching
                const currentConfig = providerConfig[currentProvider];
                const currentKeyField = document.getElementById(currentConfig.keyField);
                currentKeyField.value = unifiedApiInput.value;
                
                // Update active state
                providerButtons.forEach(btn => btn.classList.remove('active'));
                button.classList.add('active');
                
                // Switch to new provider
                currentProvider = button.dataset.provider;
                const config = providerConfig[currentProvider];
                
                // Update UI
                providerIcon.textContent = config.icon;
                providerName.textContent = config.displayName;
                providerDescription.textContent = config.description;
                unifiedApiInput.placeholder = config.placeholder;
                
                // Load the new provider's key from hidden input
                const keyField = document.getElementById(config.keyField);
                unifiedApiInput.value = keyField.value;
            });
        });

        // Setup PIN input handlers if encryption is not enabled
        if (!isEncryptionEnabled) {
            const enableEncryptionCheckbox = document.getElementById('enableEncryption');
            const pinSetupFields = document.getElementById('pinSetupFields');
            const pinInputs = []
            
            if (enableEncryptionCheckbox) {
                // Get PIN inputs
                for (let i = 1; i <= 4; i++) {
                    const input = document.getElementById(`pin${i}`);
                    if (input) pinInputs.push(input);
                }

                enableEncryptionCheckbox.addEventListener('change', (e) => {
                    pinSetupFields.style.display = e.target.checked ? 'block' : 'none';
                    if (e.target.checked && pinInputs[0]) {
                        pinInputs[0].focus();
                    }
                });

                // Setup PIN digit navigation
                pinInputs.forEach((input, index) => {
                    input.addEventListener('input', (e) => {
                        const value = e.target.value;
                        if (value && /^[0-9]$/.test(value)) {
                            if (index < pinInputs.length - 1) {
                                pinInputs[index + 1].focus();
                            }
                        } else {
                            e.target.value = '';
                        }
                    });

                    input.addEventListener('keydown', (e) => {
                        if (e.key === 'Backspace' && !e.target.value && index > 0) {
                            pinInputs[index - 1].focus();
                        }
                    });
                });
            }
        }

        // Handle save
        document.getElementById('saveSettings').addEventListener('click', async () => {
            // Save current provider's key to hidden input
            const currentConfig = providerConfig[currentProvider];
            const currentKeyField = document.getElementById(currentConfig.keyField);
            currentKeyField.value = unifiedApiInput.value;
            
            // Get all keys from hidden inputs
            const openAiKey = document.getElementById('openAiKey').value;
            const huggingFaceKey = document.getElementById('huggingFaceKey').value;
            const googleAiKey = document.getElementById('googleAiKey').value;
            
            // Save the selected provider preference
            await new Promise((resolve) => {
                chrome.storage.local.set({ selectedProvider: currentProvider }, () => {
                    resolve();
                });
            });
            
            let pin = null;
            let shouldSetupPin = false;

            // Check if we need to setup PIN
            if (!isEncryptionEnabled) {
                const enableEncryption = document.getElementById('enableEncryption')?.checked;
                if (enableEncryption) {
                    // Get PIN from inputs
                    pin = '';
                    for (let i = 1; i <= 4; i++) {
                        const digit = document.getElementById(`pin${i}`)?.value;
                        if (!digit || !/^[0-9]$/.test(digit)) {
                            alert('Please enter a valid 4-digit passkey');
                            return;
                        }
                        pin += digit;
                    }
                    shouldSetupPin = true;
                }
            }

            try {
                // Setup passkey if needed
                if (shouldSetupPin && pin) {
                    const setupResponse = await new Promise((resolve) => {
                        chrome.runtime.sendMessage({ 
                            action: 'setupPin', 
                            pin: pin 
                        }, (response) => {
                            resolve(response);
                        });
                    });

                    if (!setupResponse?.success) {
                        alert('Failed to setup passkey. Please try again.');
                        return;
                    }

                    // Unlock session with the new PIN
                    await new Promise((resolve) => {
                        chrome.runtime.sendMessage({ 
                            action: 'unlockSession', 
                            pin: pin 
                        }, (response) => {
                            resolve(response);
                        });
                    });

                    // Check for existing unencrypted API keys to migrate
                    const existingKeys = await new Promise((resolve) => {
                        chrome.storage.local.get(['apiKeys'], (result) => {
                            resolve(result.apiKeys || {});
                        });
                    });

                    // Merge existing keys with new ones
                    if (existingKeys && Object.keys(existingKeys).length > 0) {
                        // Preserve existing keys if new ones are empty
                        if (!openAiKey && existingKeys.openAI) {
                            document.getElementById('openAiKey').value = existingKeys.openAI;
                        }
                        if (!huggingFaceKey && existingKeys.huggingFace) {
                            document.getElementById('huggingFaceKey').value = existingKeys.huggingFace;
                        }
                        if (!googleAiKey && existingKeys.googleAI) {
                            document.getElementById('googleAiKey').value = existingKeys.googleAI;
                        }
                    }
                }

                // Save API keys (with PIN if encryption is enabled)
                await new Promise((resolve) => {
                    chrome.runtime.sendMessage({ 
                        action: 'saveApiKeys', 
                        apiKeys: { 
                            openAI: openAiKey,
                            huggingFace: huggingFaceKey,
                            googleAI: googleAiKey 
                        },
                        pin: pin // Pass PIN if we just set it up
                    }, (response) => {
                        resolve(response);
                    });
                });
                
                if (shouldSetupPin) {
                    // Show success message for passkey setup
                    const successModal = document.createElement('div');
                    successModal.style.cssText = `
                        position: fixed;
                        top: 50%;
                        left: 50%;
                        transform: translate(-50%, -50%);
                        background: rgba(34, 197, 94, 0.2);
                        border: 1px solid rgba(34, 197, 94, 0.3);
                        border-radius: 8px;
                        padding: 20px 32px;
                        color: #22c55e;
                        font-size: 16px;
                        font-weight: 600;
                        z-index: 2001;
                        backdrop-filter: blur(10px);
                    `;
                    successModal.innerHTML = '🔐 Passkey protection enabled successfully!';
                    document.body.appendChild(successModal);
                    
                    setTimeout(() => {
                        if (document.body.contains(successModal)) {
                            document.body.removeChild(successModal);
                        }
                    }, 3000);
                }
                
                document.body.removeChild(modal);
            } catch (error) {
                alert('Error saving settings: ' + error.message);
            }
        });

        // Handle clear cache
        document.getElementById('clearCache').addEventListener('click', async () => {
            // Check if encryption is enabled and offer to reset it
            const encryptionEnabled = await new Promise((resolve) => {
                chrome.runtime.sendMessage({ action: 'isEncryptionEnabled' }, (response) => {
                    resolve(response?.enabled || false);
                });
            });

            let confirmMessage = 'This will clear all cached transcripts and embeddings.';
            if (encryptionEnabled) {
                confirmMessage += ' It will also reset PIN protection and you\'ll need to re-enter your API keys.';
            }
            confirmMessage += ' Continue?';

            if (!confirm(confirmMessage)) {
                return;
            }

            await this.clearCache();
            
            // Reset encryption if enabled
            if (encryptionEnabled) {
                await new Promise((resolve) => {
                    chrome.runtime.sendMessage({ action: 'resetEncryption' }, (response) => {
                        resolve(response);
                    });
                });
            }

            // Clear the API key fields immediately after resetting encryption
            if (encryptionEnabled) {
                // Clear the visible unified API key input
                const unifiedApiInput = document.getElementById('unifiedApiKey');
                if (unifiedApiInput) {
                    unifiedApiInput.value = '';
                }
                
                // Clear all hidden API key inputs
                const openAiKeyInput = document.getElementById('openAiKey');
                const huggingFaceKeyInput = document.getElementById('huggingFaceKey');
                const googleAiKeyInput = document.getElementById('googleAiKey');
                
                if (openAiKeyInput) openAiKeyInput.value = '';
                if (huggingFaceKeyInput) huggingFaceKeyInput.value = '';
                if (googleAiKeyInput) googleAiKeyInput.value = '';
            }

            // Create a custom styled alert
            const alertModal = document.createElement('div');
            alertModal.style.cssText = `
                position: fixed;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                background: rgba(34, 197, 94, 0.2);
                border: 1px solid rgba(34, 197, 94, 0.3);
                border-radius: 8px;
                padding: 16px 24px;
                color: #22c55e;
                font-size: 14px;
                font-weight: 600;
                z-index: 2001;
                backdrop-filter: blur(10px);
            `;
            alertModal.textContent = encryptionEnabled ? 
                '✅ Cache cleared and PIN reset successfully!' : 
                '✅ Cache cleared successfully!';
            document.body.appendChild(alertModal);
            
            setTimeout(() => {
                if (document.body.contains(alertModal)) {
                    document.body.removeChild(alertModal);
                }
                // Reload the page if encryption was reset
                if (encryptionEnabled) {
                    window.location.reload();
                }
            }, 2000);
        });

        // Handle cancel
        document.getElementById('cancelSettings').addEventListener('click', () => {
            document.body.removeChild(modal);
        });

        // Handle click outside modal
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                document.body.removeChild(modal);
            }
        });
    }

    // Tab switching functionality
    switchTab(tabName) {
        this.currentTab = tabName;
        
        // Update tab buttons
        this.elements.tabBtns.forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tab === tabName);
        });

        // Update tab content - remove hidden class and toggle active
        this.elements.searchTab.classList.remove('hidden');
        this.elements.pinsTab.classList.remove('hidden');
        this.elements.searchTab.classList.toggle('active', tabName === 'search');
        this.elements.pinsTab.classList.toggle('active', tabName === 'pins');

        // Load pins if switching to pins tab
        if (tabName === 'pins') {
            this.loadPins();
            // Always hide create pin button when on pins tab
            this.elements.createPinBtn.classList.add('hidden');
        } else {
            // Update create pin button visibility for search tab
            this.updateCreatePinButtonVisibility();
        }
    }

    // Pin creation functionality
    async handleCreatePin() {
        if (!this.currentVideoInfo || !this.currentVideoInfo.isVideoPage) {
            return;
        }

        // Get current video timestamp
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        
        chrome.tabs.sendMessage(tab.id, { action: 'getCurrentTimestamp' }, (response) => {
            if (response && !response.error) {
                const timestamp = response.timestamp || 0;
                
                this.openPinForm({
                    videoId: this.currentVideoInfo.videoId,
                    timestamp: timestamp,
                    videoTitle: this.currentVideoInfo.title,
                    channelName: response.channelName || 'Unknown Channel'
                });
            }
        });
    }

    openPinForm(pinData) {
        this.pendingPinData = pinData;
        
        // Ensure we're on the search tab first
        if (this.currentTab !== 'search') {
            this.switchTab('search');
        }

        // Update current video info from pin data if needed
        if (!this.currentVideoInfo || !this.currentVideoInfo.isVideoPage) {
            this.currentVideoInfo = {
                isVideoPage: true,
                videoId: pinData.videoId,
                title: pinData.videoTitle,
                url: `https://www.youtube.com/watch?v=${pinData.videoId}`
            };
            this.showSearchInterface();
        }
        
        // Populate modal elements
        if (this.elements.pinTimestamp) {
            this.elements.pinTimestamp.textContent = this.formatTime(pinData.timestamp);
        }
        
        if (this.elements.pinVideoTitle) {
            this.elements.pinVideoTitle.textContent = pinData.videoTitle;
        }
        
        if (this.elements.pinTitle) {
            this.elements.pinTitle.value = '';
        }
        
        // Show modal
        if (this.elements.pinModal) {
            this.elements.pinModal.classList.remove('hidden');
        } else {
            return;
        }
        
        // Focus on title input with a small delay
        if (this.elements.pinTitle) {
            setTimeout(() => {
                try {
                    this.elements.pinTitle.focus();
                    this.elements.pinTitle.select();
                } catch (error) {
                    // Error focusing pin title input
                }
            }, 200);
        }
    }

    closePinModal() {
        if (this.elements.pinModal) {
            this.elements.pinModal.classList.add('hidden');
        }
        this.pendingPinData = null;
        if (this.elements.pinTitle) {
            this.elements.pinTitle.value = '';
        }
    }

    async savePinFromModal() {
        const title = this.elements.pinTitle.value.trim();
        
        if (!title || !this.pendingPinData) {
            return;
        }

        const pin = {
            videoId: this.pendingPinData.videoId,
            timestamp: this.pendingPinData.timestamp,
            title: title,
            videoTitle: this.pendingPinData.videoTitle,
            channelName: this.pendingPinData.channelName
        };

        try {
            // Save pin via background script
            await new Promise((resolve, reject) => {
                chrome.runtime.sendMessage({ action: 'savePin', pin: pin }, (response) => {
                    if (chrome.runtime.lastError) {
                        reject(chrome.runtime.lastError);
                    } else if (response && response.success) {
                        resolve();
                    } else {
                        reject(new Error(response?.error || 'Unknown error saving pin'));
                    }
                });
            });
            
            // Close modal
            this.closePinModal();

            // Refresh pins if on pins tab
            if (this.currentTab === 'pins') {
                this.loadPins();
            }

            // Show success message
            this.showStatus('Pin created successfully!', 'success');
        } catch (error) {
            this.showStatus('Error creating pin', 'error');
        }
    }

    // Load and display pins
    async loadPins() {
        try {
            // Get pins for current video
            const videoPins = this.currentVideoInfo && this.currentVideoInfo.isVideoPage
                ? await this.getPins(this.currentVideoInfo.videoId)
                : [];

            // Get all pins
            const allPins = await this.getAllPins();

            // Update UI
            this.displayVideoPins(videoPins);
            this.displayAllPins(allPins);
        } catch (error) {
            // Error loading pins
        }
    }

    async getPins(videoId) {
        return new Promise((resolve, reject) => {
            chrome.runtime.sendMessage({ action: 'getPins', videoId: videoId }, (response) => {
                if (chrome.runtime.lastError) {
                    reject(chrome.runtime.lastError);
                } else if (response.error) {
                    reject(new Error(response.error));
                } else {
                    resolve(response);
                }
            });
        });
    }

    async getAllPins() {
        return new Promise((resolve, reject) => {
            chrome.runtime.sendMessage({ action: 'getAllPins' }, (response) => {
                if (chrome.runtime.lastError) {
                    reject(chrome.runtime.lastError);
                } else if (response.error) {
                    reject(new Error(response.error));
                } else {
                    resolve(response);
                }
            });
        });
    }

    displayVideoPins(pins) {
        if (pins.length > 0) {
            this.elements.pinsFromVideo.classList.remove('hidden');
            this.elements.pinsFromVideoContent.innerHTML = pins.map(pin => this.createPinElement(pin)).join('');
            this.setupPinEventListeners(this.elements.pinsFromVideoContent);
        } else {
            this.elements.pinsFromVideo.classList.add('hidden');
        }
    }

    displayAllPins(pins) {
        if (pins.length > 0) {
            const pinElements = pins.map((pin, index) => {
                const element = this.createPinElement(pin);
                return element;
            });
            
            const joinedHTML = pinElements.join('');
            
            this.elements.allPinsContent.innerHTML = joinedHTML;
            
            this.setupPinEventListeners(this.elements.allPinsContent);
        } else {
            this.elements.allPinsContent.innerHTML = `
                <div class="no-pins">
                    <div class="icon">📌</div>
                    <div>No pins created yet</div>
                            </div>
        `;
        }
    }

    createPinElement(pin) {
        const isCurrentVideo = this.currentVideoInfo && pin.videoId === this.currentVideoInfo.videoId;
        
        return `
            <div class="pin-item" data-pin-id="${pin.id}" data-video-id="${pin.videoId}" data-timestamp="${pin.timestamp}">
                <div class="pin-title">${this.escapeHtml(pin.title)}</div>
                <div class="pin-meta">
                    <span class="pin-timestamp">${this.formatTime(pin.timestamp)}</span>
                    <span class="pin-video-info">${this.escapeHtml(pin.videoTitle)} • ${this.escapeHtml(pin.channelName || 'Unknown Channel')}</span>
                </div>
                <button class="pin-delete-btn" data-pin-id="${pin.id}" title="Delete pin">×</button>
            </div>
        `;
    }

    // Pin navigation and deletion
    setupPinEventListeners(container) {
        // Pin click to navigate
        container.addEventListener('click', async (e) => {
            const pinItem = e.target.closest('.pin-item');
            if (pinItem && !e.target.classList.contains('pin-delete-btn')) {
                const videoId = pinItem.dataset.videoId;
                const timestamp = parseInt(pinItem.dataset.timestamp);
                
                await this.navigateToPin(videoId, timestamp);
            }
        });

        // Delete button click
        container.addEventListener('click', async (e) => {
            if (e.target.classList.contains('pin-delete-btn')) {
                e.stopPropagation();
                const pinId = e.target.dataset.pinId;
                await this.deletePin(pinId);
            }
        });
    }

    async navigateToPin(videoId, timestamp) {
        try {
            // Get current tab
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            
            // If we're already on the right video, just navigate to timestamp
            if (tab.url.includes(`v=${videoId}`)) {
                chrome.tabs.sendMessage(tab.id, { 
                    action: 'navigateToTimestamp', 
                    timestamp: timestamp 
                });
            } else {
                // Navigate to video with timestamp
                const videoUrl = `https://www.youtube.com/watch?v=${videoId}&t=${timestamp}s`;
                chrome.tabs.update(tab.id, { url: videoUrl });
            }
            
            // Close popup
            window.close();
        } catch (error) {
            this.showStatus('Error navigating to pin', 'error');
        }
    }

    async deletePin(pinId) {
        try {
            await new Promise((resolve, reject) => {
                chrome.runtime.sendMessage({ action: 'deletePin', pinId: pinId }, (response) => {
                    if (chrome.runtime.lastError) {
                        reject(chrome.runtime.lastError);
                    } else if (response.success) {
                        resolve();
                    } else {
                        reject(new Error(response.error));
                    }
                });
            });

            // Reload pins
            this.loadPins();
            this.showStatus('Pin deleted', 'success');
        } catch (error) {
            this.showStatus('Error deleting pin', 'error');
        }
    }

    // Add pin buttons to search results
    addPinButtonsToResults() {
        const resultItems = this.elements.resultsContent.querySelectorAll('.result-item');
        
        resultItems.forEach(item => {
            // Check if pin button already exists
            if (item.querySelector('.result-pin-btn')) {
                return;
            }

            const pinBtn = document.createElement('button');
            pinBtn.className = 'result-pin-btn';
            pinBtn.innerHTML = '📌';
            pinBtn.title = 'Create pin for this moment';

            pinBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const timestamp = parseInt(item.dataset.timestamp);
                
                this.openPinForm({
                    videoId: this.currentVideoInfo.videoId,
                    timestamp: timestamp,
                    videoTitle: this.currentVideoInfo.title,
                    channelName: 'Unknown Channel' // Could get from video info
                });
            });

            item.appendChild(pinBtn);
        });
    }

    // Utility methods
    formatTime(seconds) {
        const hours = Math.floor(seconds / 3600);
        const mins = Math.floor((seconds % 3600) / 60);
        const secs = Math.floor(seconds % 60);
        
        if (hours > 0) {
            return `${hours}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        } else {
            return `${mins}:${secs.toString().padStart(2, '0')}`;
        }
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    handleVideoInfoUpdate(videoInfo) {
        const wasOnVideoPage = this.currentVideoInfo && this.currentVideoInfo.isVideoPage;
        const isNowOnVideoPage = videoInfo && videoInfo.isVideoPage;
        const previousVideoId = this.currentVideoInfo ? this.currentVideoInfo.videoId : null;
        
        this.currentVideoInfo = videoInfo;
        
        // Update UI based on whether we're on a video page
        if (isNowOnVideoPage) {
            this.showSearchInterface();
        } else {
            this.showNoVideoMessage();
        }
        
        // Update create pin button visibility
        this.updateCreatePinButtonVisibility();
        
        // If we are on the pins tab, reload pins to show the correct ones for the new video
        if (this.currentTab === 'pins') {
            this.loadPins();
        }
        
        // Clear any existing search results if video changed
        if (wasOnVideoPage && isNowOnVideoPage && 
            previousVideoId && videoInfo.videoId && 
            previousVideoId !== videoInfo.videoId) {
            this.elements.results.classList.add('hidden');
            this.elements.resultsContent.innerHTML = '';
        }
    }
}

// Initialize popup manager when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.popupManager = new PopupManager();
}); 