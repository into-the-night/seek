// Popup script for YouTube Video Search extension
class PopupManager {
    constructor() {
        this.currentVideoInfo = null;
        this.isProcessing = false;
        this.statusTimeout = null;
        this.initializeUI();
        this.setupEventListeners();
        // Add a small delay before checking video to ensure proper initialization
        setTimeout(() => {
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

        // Verify all modal elements exist for debugging
        if (!this.elements.closePinModal) {
            console.warn('Close pin modal button not found');
        }
        if (!this.elements.cancelPin) {
            console.warn('Cancel pin button not found');
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
                console.log('Received openPinForm message:', request.pinData);
                // Open pin form with the provided data, even if currentVideoInfo isn't loaded yet
                this.openPinForm(request.pinData);
            } else if (request.action === 'videoInfoUpdated') {
                console.log('Received videoInfoUpdated message:', request.videoInfo);
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
                        console.error('Error getting pending pin data:', chrome.runtime.lastError);
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
                    console.log('Found recent pending pin data:', result);
                    
                    // Clear the pending data
                    chrome.storage.local.remove(['pendingPinData']);
                    
                    // Open the pin form with this data
                    setTimeout(() => {
                        this.openPinForm(result);
                    }, 500); // Small delay to ensure UI is ready
                } else {
                    console.log('Pending pin data is too old, ignoring');
                    chrome.storage.local.remove(['pendingPinData']);
                }
            }
        } catch (error) {
            console.error('Error checking pending pin data:', error);
        }
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
            console.error('Error checking video:', error);
            this.showNoVideoMessage();
        }
    }

    updateCreatePinButtonVisibility() {
        if (this.currentTab === 'search' && this.currentVideoInfo && this.currentVideoInfo.isVideoPage) {
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
            // Check if we have API keys
            const apiKeys = await this.getApiKeys();
            if (!apiKeys.googleAI) {
                this.showStatus('Please configure Google AI API key in settings', 'error');
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
            console.error('Search error:', error);
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
                    reject(new Error(chrome.runtime.lastError.message));
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
                    console.error('Error getting transcript:', chrome.runtime.lastError);
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
        return await this.generateTranscript(videoId);
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
                        if (chrome.runtime.lastError) {
                            console.error('Error saving transcript:', chrome.runtime.lastError);
                        }
                        resolve(response);
                    });
                });
                
                return transcript;
            }
        } catch (error) {
            // YouTube transcript not available, try Deepgram
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
                        if (chrome.runtime.lastError) {
                            console.error('Error saving transcript:', chrome.runtime.lastError);
                        }
                        resolve(response);
                    });
                });
                
                return transcript;
            } catch (error) {
                console.error('Deepgram transcription failed:', error);
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
            console.error('Error getting YouTube transcript:', error);
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
            console.error('Error getting Deepgram transcript:', error);
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
                    console.error('Error getting embeddings:', chrome.runtime.lastError);
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
                if (chrome.runtime.lastError) {
                    console.error('Error saving embeddings:', chrome.runtime.lastError);
                }
                resolve(response);
            });
        });

        return embeddings;
    }

    async generateEmbeddings(transcript) {
        const apiKeys = await this.getApiKeys();
        
        // Check which embedding model to use based on available API keys
        const embeddingModel = this.getPreferredEmbeddingModel(apiKeys);
        
        if (!embeddingModel) {
            throw new Error('No embedding API key configured. Please configure OpenAI, Hugging Face, or Google AI API key.');
        }

        // Split transcript into chunks with smaller size for better precision
        const chunks = this.splitTranscriptIntoChunks(transcript, 350); // 350 chars per chunk
        const embeddings = [];

        for (let i = 0; i < chunks.length; i++) {
            this.showStatus(`Generating embeddings with ${embeddingModel.name}... (${i + 1}/${chunks.length})`, 'loading');
            
            try {
                const embedding = await this.generateEmbedding(chunks[i], embeddingModel, apiKeys);
                embeddings.push({
                    text: chunks[i].text,
                    startTime: chunks[i].startTime,
                    endTime: chunks[i].endTime,
                    embedding: embedding
                });
            } catch (error) {
                console.error('Error generating embedding for chunk:', error);
                // Continue with other chunks
            }
        }

        return embeddings;
    }

    getPreferredEmbeddingModel(apiKeys) {
        // Priority order: OpenAI > Hugging Face > Google AI
        if (apiKeys.openAI) {
            return { name: 'OpenAI', type: 'openai', apiKey: apiKeys.openAI };
        }
        if (apiKeys.huggingFace) {
            return { name: 'BGE-base-en-v1.5', type: 'huggingface', apiKey: apiKeys.huggingFace };
        }
        if (apiKeys.googleAI) {
            return { name: 'Google AI', type: 'google', apiKey: apiKeys.googleAI };
        }
        return null;
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
                    
                    currentChunk = remainingText;
                } else {
                    // No sentence boundaries found, split as before
                    chunks.push({
                        text: currentChunk.trim(),
                        startTime: currentStartTime,
                        endTime: currentEndTime
                    });
                    currentChunk = '';
                }
                
                currentStartTime = entry.startTime;
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
        const apiKeys = await this.getApiKeys();
        
        if (!apiKeys.googleAI) {
            throw new Error('Google AI API key not configured');
        }

        // Generate embedding for the query
        const queryEmbedding = await this.generateGoogleAIEmbedding({ text: query }, apiKeys.googleAI);

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
        
        return sortedSimilarities
            .filter(item => item.similarity > dynamicThreshold) // Intelligent similarity filtering
            .slice(0, 8) // Return more results for better coverage
            .map(item => ({
                startTime: item.startTime,
                endTime: item.endTime,
                text: item.text,
                similarity: item.similarity
            }));
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
        
        div.innerHTML = `
            <div class="result-timestamp">${this.formatTime(result.startTime)} - ${this.formatTime(result.endTime)}</div>
            <div class="result-text">${result.text}</div>
            <div class="result-similarity ${similarityClass}">Match: ${Math.round(result.similarity * 100)}%</div>
        `;
        
        div.addEventListener('click', () => {
            this.navigateToTimestamp(result.startTime);
        });
        
        return div;
    }

    formatTime(seconds) {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    }

    async navigateToTimestamp(timestamp) {
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            await chrome.tabs.sendMessage(tab.id, { 
                action: 'navigateToTimestamp', 
                timestamp 
            });
        } catch (error) {
            console.error('Error navigating to timestamp:', error);
        }
    }

    showStatus(message, type = 'loading') {
        // Clear any existing timeouts to prevent conflicts
        if (this.statusTimeout) {
            clearTimeout(this.statusTimeout);
            this.statusTimeout = null;
        }
        
        let statusHTML = message;
        
        if (type === 'loading') {
            statusHTML = `<div class="loading-spinner"></div>${message}`;
        }
        
        this.elements.status.innerHTML = statusHTML;
        this.elements.status.className = `status ${type}`;
        this.elements.status.classList.remove('hidden');
        
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
                    if (chrome.runtime.lastError) {
                        console.error('Error clearing cache:', chrome.runtime.lastError);
                    }
                    resolve();
                });
            });
        } catch (error) {
            console.error('Error clearing cache:', error);
        }
    }

    showSettings() {
        // Create settings modal with futuristic dark theme
        const modal = document.createElement('div');
        modal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.8);
            backdrop-filter: blur(10px);
            display: flex;
            justify-content: center;
            align-items: center;
            z-index: 2000;
            font-family: 'Inter', sans-serif;
        `;

        const settingsContent = document.createElement('div');
        settingsContent.style.cssText = `
            background: rgba(26, 26, 26, 0.95);
            backdrop-filter: blur(20px);
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: 16px;
            padding: 32px;
            width: 90%;
            max-width: 480px;
            max-height: 90vh;
            overflow-y: auto;
            box-shadow: 0 24px 48px rgba(0, 0, 0, 0.5);
        `;

        settingsContent.innerHTML = `
            <style>
                .settings-modal h3 {
                    color: #ffffff;
                    font-size: 24px;
                    font-weight: 700;
                    margin-bottom: 24px;
                    text-align: center;
                    background: linear-gradient(45deg,rgb(234, 122, 102) 0%,rgb(66, 66, 66) 100%);
                    -webkit-background-clip: text;
                    -webkit-text-fill-color: transparent;
                }
                .settings-modal .api-section {
                    margin-bottom: 24px;
                }
                .settings-modal .api-label {
                    display: block;
                    color: rgba(255, 255, 255, 0.9);
                    font-size: 14px;
                    font-weight: 600;
                    margin-bottom: 8px;
                }
                .settings-modal .api-input {
                    width: 100%;
                    padding: 12px 16px;
                    background: rgba(255, 255, 255, 0.08);
                    border: 1px solid rgba(255, 255, 255, 0.2);
                    border-radius: 8px;
                    color: #ffffff;
                    font-size: 14px;
                    outline: none;
                    transition: all 0.3s ease;
                    font-family: 'Inter', sans-serif;
                }
                .settings-modal .api-input:focus {
                    border-color:rgb(234, 102, 102);
                    box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.2);
                    background: rgba(255, 255, 255, 0.12);
                }
                .settings-modal .api-input::placeholder {
                    color: rgba(255, 255, 255, 0.4);
                }
                .settings-modal .api-description {
                    color: rgba(255, 255, 255, 0.6);
                    font-size: 12px;
                    margin-top: 4px;
                    line-height: 1.4;
                }
                .settings-modal .clear-cache-btn {
                    width: 100%;
                    padding: 12px 16px;
                    background: rgba(239, 68, 68, 0.2);
                    border: 1px solid rgba(239, 68, 68, 0.3);
                    border-radius: 8px;
                    color: #ef4444;
                    font-size: 14px;
                    font-weight: 600;
                    cursor: pointer;
                    transition: all 0.3s ease;
                    margin-bottom: 24px;
                    font-family: 'Inter', sans-serif;
                }
                .settings-modal .clear-cache-btn:hover {
                    background: rgba(239, 68, 68, 0.3);
                    transform: translateY(-1px);
                }
                .settings-modal .button-group {
                    display: flex;
                    gap: 12px;
                }
                .settings-modal .btn {
                    flex: 1;
                    padding: 14px 20px;
                    border: none;
                    border-radius: 8px;
                    font-size: 14px;
                    font-weight: 600;
                    cursor: pointer;
                    transition: all 0.3s ease;
                    text-transform: uppercase;
                    letter-spacing: 0.5px;
                    font-family: 'Inter', sans-serif;
                }
                .settings-modal .btn-primary {
                    background: linear-gradient(45deg,rgb(247, 168, 78) 0%,rgb(162, 92, 75) 100%);
                    color: #ffffff;
                    box-shadow: 0 4px 16px rgba(235, 163, 141, 0.3);
                }
                .settings-modal .btn-primary:hover {
                    transform: translateY(-2px);
                    box-shadow: 0 6px 20px rgba(235, 163, 141, 0.3);
                }
                .settings-modal .btn-secondary {
                    background: rgba(255, 255, 255, 0.1);
                    color: rgba(255, 255, 255, 0.9);
                    border: 1px solid rgba(255, 255, 255, 0.2);
                }
                .settings-modal .btn-secondary:hover {
                    background: rgba(255, 255, 255, 0.2);
                    transform: translateY(-1px);
                }
            </style>
            <div class="settings-modal">
                <h3>⚙️ API Settings</h3>
                
                <div class="api-section">
                    <label class="api-label">🚀 OpenAI API Key (Recommended)</label>
                    <input type="password" id="openAiKey" class="api-input" placeholder="sk-...">
                    <div class="api-description">Uses text-embedding-3-small model for best semantic search results</div>
                </div>
                
                <div class="api-section">
                    <label class="api-label">🤗 Hugging Face API Key</label>
                    <input type="password" id="huggingFaceKey" class="api-input" placeholder="hf_...">
                    <div class="api-description">State-of-the-art open-source BGE-base-en-v1.5 embedding model</div>
                </div>
                
                <div class="api-section">
                    <label class="api-label">🔍 Google AI API Key (Fallback)</label>
                    <input type="password" id="googleAiKey" class="api-input" placeholder="AIza...">
                    <div class="api-description">Backup option if other embedding services aren't available</div>
                </div>
                
                <button id="clearCache" class="clear-cache-btn">🗑️ Clear Cache & Reset</button>
                
                <div class="button-group">
                    <button id="saveSettings" class="btn btn-primary">Save Settings</button>
                    <button id="cancelSettings" class="btn btn-secondary">Cancel</button>
                </div>
            </div>
        `;

        modal.appendChild(settingsContent);
        document.body.appendChild(modal);

        // Load existing keys
        this.getApiKeys().then(keys => {
            document.getElementById('openAiKey').value = keys.openAI || '';
            document.getElementById('huggingFaceKey').value = keys.huggingFace || '';
            document.getElementById('googleAiKey').value = keys.googleAI || '';
        });

        // Handle save
        document.getElementById('saveSettings').addEventListener('click', async () => {
            const openAiKey = document.getElementById('openAiKey').value;
            const huggingFaceKey = document.getElementById('huggingFaceKey').value;
            const googleAiKey = document.getElementById('googleAiKey').value;
            
            await new Promise((resolve) => {
                chrome.runtime.sendMessage({ 
                    action: 'saveApiKeys', 
                    apiKeys: { 
                        openAI: openAiKey,
                        huggingFace: huggingFaceKey,
                        googleAI: googleAiKey 
                    } 
                }, (response) => {
                    if (chrome.runtime.lastError) {
                        console.error('Error saving API keys:', chrome.runtime.lastError);
                    }
                    resolve(response);
                });
            });
            
            document.body.removeChild(modal);
        });

        // Handle clear cache
        document.getElementById('clearCache').addEventListener('click', async () => {
            await this.clearCache();
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
            alertModal.textContent = '✅ Cache cleared successfully!';
            document.body.appendChild(alertModal);
            
            setTimeout(() => {
                if (document.body.contains(alertModal)) {
                    document.body.removeChild(alertModal);
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
        }

        // Update create pin button visibility
        this.updateCreatePinButtonVisibility();
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
        console.log('=== OPENING PIN FORM ===');
        console.log('Pin data received:', pinData);
        this.pendingPinData = pinData;
        
        // Ensure we're on the search tab first
        if (this.currentTab !== 'search') {
            console.log('Switching to search tab first');
            this.switchTab('search');
        }

        // Update current video info from pin data if needed
        if (!this.currentVideoInfo || !this.currentVideoInfo.isVideoPage) {
            console.log('Updating current video info from pin data');
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
            console.log('Set timestamp to:', this.formatTime(pinData.timestamp));
        } else {
            console.error('Pin timestamp element not found');
        }
        
        if (this.elements.pinVideoTitle) {
            this.elements.pinVideoTitle.textContent = pinData.videoTitle;
            console.log('Set video title to:', pinData.videoTitle);
        } else {
            console.error('Pin video title element not found');
        }
        
        if (this.elements.pinTitle) {
            this.elements.pinTitle.value = '';
            console.log('Cleared pin title input');
        } else {
            console.error('Pin title input element not found');
        }
        
        // Show modal
        if (this.elements.pinModal) {
            this.elements.pinModal.classList.remove('hidden');
            console.log('Pin modal made visible');
            console.log('Modal classes after show:', this.elements.pinModal.className);
        } else {
            console.error('Pin modal element not found!');
            return;
        }
        
        // Focus on title input with a small delay
        if (this.elements.pinTitle) {
            setTimeout(() => {
                try {
                    this.elements.pinTitle.focus();
                    this.elements.pinTitle.select();
                    console.log('Focused pin title input');
                } catch (error) {
                    console.error('Error focusing pin title input:', error);
                }
            }, 200);
        }
        
        console.log('=== PIN FORM OPENED SUCCESSFULLY ===');
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
        console.log('Attempting to save pin with title:', title);
        
        if (!title || !this.pendingPinData) {
            console.log('Cannot save pin - missing title or pending data:', { title, pendingPinData: this.pendingPinData });
            return;
        }

        const pin = {
            videoId: this.pendingPinData.videoId,
            timestamp: this.pendingPinData.timestamp,
            title: title,
            videoTitle: this.pendingPinData.videoTitle,
            channelName: this.pendingPinData.channelName
        };
        
        console.log('Saving pin:', pin);

        try {
            // Save pin via background script
            await new Promise((resolve, reject) => {
                chrome.runtime.sendMessage({ action: 'savePin', pin: pin }, (response) => {
                    console.log('Save pin response:', response);
                    if (chrome.runtime.lastError) {
                        reject(chrome.runtime.lastError);
                    } else if (response && response.success) {
                        resolve();
                    } else {
                        reject(new Error(response?.error || 'Unknown error saving pin'));
                    }
                });
            });

            console.log('Pin saved successfully - now testing retrieval');
            
            // Test if we can retrieve the pin immediately after saving
            const testAllPins = await this.getAllPins();
            console.log('Pins after save:', testAllPins);
            
            // Close modal
            this.closePinModal();

            // Refresh pins if on pins tab
            if (this.currentTab === 'pins') {
                console.log('Refreshing pins display since we are on pins tab');
                this.loadPins();
            } else {
                console.log('Not on pins tab, current tab:', this.currentTab);
            }

            // Show success message
            this.showStatus('Pin created successfully!', 'success');
        } catch (error) {
            console.error('Error saving pin:', error);
            this.showStatus('Error creating pin', 'error');
        }
    }

    // Load and display pins
    async loadPins() {
        try {
            console.log('=== LOADING PINS ===');
            console.log('Current video info:', this.currentVideoInfo);
            console.log('Current tab:', this.currentTab);
            console.log('Pins tab element:', this.elements.pinsTab);
            console.log('All pins content element:', this.elements.allPinsContent);
            
            // Get pins for current video
            const videoPins = this.currentVideoInfo && this.currentVideoInfo.isVideoPage
                ? await this.getPins(this.currentVideoInfo.videoId)
                : [];

            console.log('Video pins retrieved:', videoPins);

            // Get all pins
            console.log('Requesting all pins...');
            const allPins = await this.getAllPins();
            console.log('All pins retrieved:', allPins);

            // Update UI
            console.log('Updating video pins display...');
            this.displayVideoPins(videoPins);
            
            console.log('Updating all pins display...');
            this.displayAllPins(allPins);
            
            console.log('=== PINS LOADING COMPLETED ===');
        } catch (error) {
            console.error('Error loading pins:', error);
            console.error('Error stack:', error.stack);
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
        console.log('=== DISPLAYING ALL PINS ===');
        console.log('Pins data:', pins);
        console.log('Pins count:', pins.length);
        console.log('All pins container element:', this.elements.allPinsContent);
        console.log('Container innerHTML before:', this.elements.allPinsContent?.innerHTML);
        
        if (pins.length > 0) {
            console.log('Creating pin elements for', pins.length, 'pins');
            const pinElements = pins.map((pin, index) => {
                console.log(`Creating element for pin ${index}:`, pin);
                const element = this.createPinElement(pin);
                console.log(`Generated HTML for pin ${index}:`, element);
                return element;
            });
            
            const joinedHTML = pinElements.join('');
            console.log('Final joined HTML:', joinedHTML);
            
            this.elements.allPinsContent.innerHTML = joinedHTML;
            console.log('Container innerHTML after:', this.elements.allPinsContent.innerHTML);
            
            // Check if elements are actually in the DOM
            const renderedPins = this.elements.allPinsContent.querySelectorAll('.pin-item');
            console.log('Rendered pins count in DOM:', renderedPins.length);
            renderedPins.forEach((pin, index) => {
                const rect = pin.getBoundingClientRect();
                console.log(`Pin ${index} dimensions:`, rect.width, 'x', rect.height, 'visible:', rect.width > 0 && rect.height > 0);
            });
            
            this.setupPinEventListeners(this.elements.allPinsContent);
        } else {
            console.log('No pins to display, showing empty state');
            this.elements.allPinsContent.innerHTML = `
                <div class="no-pins">
                    <div class="icon">📌</div>
                    <div>No pins created yet</div>
                </div>
            `;
        }
        
        console.log('=== DISPLAY ALL PINS COMPLETED ===');
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
            console.error('Error navigating to pin:', error);
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
            console.error('Error deleting pin:', error);
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
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = seconds % 60;
        return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    showStatus(message, type = 'info') {
        if (this.elements.status) {
            this.elements.status.textContent = message;
            this.elements.status.className = `status ${type}`;
            this.elements.status.classList.remove('hidden');
            
            setTimeout(() => {
                this.elements.status.classList.add('hidden');
            }, 3000);
        }
    }

    // Debug function to test modal functionality
    debugTestModal() {
        console.log('Testing modal functionality...');
        console.log('Modal element:', this.elements.pinModal);
        console.log('Modal classes before:', this.elements.pinModal?.className);
        
        this.openPinForm({
            videoId: 'test123',
            timestamp: 60,
            videoTitle: 'Test Video',
            channelName: 'Test Channel'
        });
        
        console.log('Modal classes after openPinForm:', this.elements.pinModal?.className);
    }

    // Debug function to create a test pin immediately
    async debugCreateTestPin() {
        console.log('=== CREATING TEST PIN ===');
        
        const testPin = {
            videoId: 'debug_test_video_' + Date.now(),
            timestamp: 42,
            title: 'Debug Test Pin ' + Date.now(),
            videoTitle: 'Debug Test Video Title',
            channelName: 'Debug Test Channel'
        };

        try {
            console.log('Sending test pin to background script:', testPin);
            const response = await new Promise((resolve, reject) => {
                chrome.runtime.sendMessage({ action: 'savePin', pin: testPin }, (response) => {
                    if (chrome.runtime.lastError) {
                        reject(chrome.runtime.lastError);
                    } else {
                        resolve(response);
                    }
                });
            });
            
            console.log('Test pin save response:', response);
            
            if (response && response.success) {
                console.log('✅ Test pin created successfully');
                
                // Switch to pins tab
                console.log('Switching to pins tab...');
                this.switchTab('pins');
                
                // Wait a moment for the tab switch to complete
                await new Promise(resolve => setTimeout(resolve, 100));
                
                // Check all pins directly
                console.log('Testing getAllPins directly...');
                const allPins = await this.getAllPins();
                console.log('All pins after test creation:', allPins);
                
                // Force reload pins
                console.log('Force reloading pins...');
                await this.loadPins();
                
                return true;
            } else {
                console.error('❌ Test pin creation failed:', response);
                return false;
            }
        } catch (error) {
            console.error('❌ Error creating test pin:', error);
            console.error('Error stack:', error.stack);
            return false;
        }
    }

    // Quick test function that can be called from console
    async quickTest() {
        console.log('=== QUICK PIN TEST ===');
        
        // Test 1: Create a test pin
        console.log('Step 1: Creating test pin...');
        const created = await this.debugCreateTestPin();
        
        if (created) {
            console.log('✅ Test completed successfully');
        } else {
            console.log('❌ Test failed');
        }
        
        // Test 2: Check if container exists and is visible
        console.log('Step 2: Checking container...');
        console.log('All pins container:', this.elements.allPinsContent);
        console.log('Container classes:', this.elements.allPinsContent?.className);
        console.log('Container style:', this.elements.allPinsContent?.style?.cssText);
        
        const rect = this.elements.allPinsContent?.getBoundingClientRect();
        console.log('Container dimensions:', rect?.width, 'x', rect?.height);
        
        return created;
    }

    // Debug function to test pin storage functionality
    async debugTestPinStorage() {
        console.log('Testing pin storage functionality...');
        
        const testPin = {
            videoId: 'test123',
            timestamp: 60,
            title: 'Test Pin Storage',
            videoTitle: 'Test Video',
            channelName: 'Test Channel'
        };

        try {
            // Test save pin
            console.log('Testing save pin...');
            const saveResponse = await new Promise((resolve, reject) => {
                chrome.runtime.sendMessage({ action: 'savePin', pin: testPin }, (response) => {
                    if (chrome.runtime.lastError) {
                        reject(chrome.runtime.lastError);
                    } else {
                        resolve(response);
                    }
                });
            });
            
            console.log('Save pin response:', saveResponse);
            
            if (saveResponse && saveResponse.success) {
                console.log('✓ Save pin test passed');
                
                // Test get all pins
                console.log('Testing get all pins...');
                const allPins = await new Promise((resolve, reject) => {
                    chrome.runtime.sendMessage({ action: 'getAllPins' }, (response) => {
                        if (chrome.runtime.lastError) {
                            reject(chrome.runtime.lastError);
                        } else {
                            resolve(response);
                        }
                    });
                });
                
                console.log('All pins response:', allPins);
                
                if (allPins && Array.isArray(allPins)) {
                    console.log('✓ Get all pins test passed');
                    console.log('Current pins count:', allPins.length);
                    
                    // Find our test pin
                    const testPinFound = allPins.find(pin => pin.title === 'Test Pin Storage');
                    if (testPinFound) {
                        console.log('✓ Test pin found in storage:', testPinFound);
                        
                        // Test delete pin
                        console.log('Testing delete pin...');
                        const deleteResponse = await new Promise((resolve, reject) => {
                            chrome.runtime.sendMessage({ action: 'deletePin', pinId: testPinFound.id }, (response) => {
                                if (chrome.runtime.lastError) {
                                    reject(chrome.runtime.lastError);
                                } else {
                                    resolve(response);
                                }
                            });
                        });
                        
                        console.log('Delete pin response:', deleteResponse);
                        
                        if (deleteResponse && deleteResponse.success) {
                            console.log('✓ Delete pin test passed');
                            console.log('✅ All pin storage tests completed successfully!');
                        } else {
                            console.error('✗ Delete pin test failed');
                        }
                    } else {
                        console.error('✗ Test pin not found in storage');
                    }
                } else {
                    console.error('✗ Get all pins test failed');
                }
            } else {
                console.error('✗ Save pin test failed');
            }
        } catch (error) {
            console.error('Pin storage test error:', error);
        }
    }

    handleVideoInfoUpdate(videoInfo) {
        console.log('Updating video info from:', this.currentVideoInfo, 'to:', videoInfo);
        
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
    console.log('=== POPUP MANAGER INITIALIZED ===');
    console.log('Popup manager:', window.popupManager);
    console.log('\n🔧 Debug functions available:');
    console.log('- window.popupManager.quickTest() // Quick comprehensive test');
    console.log('- window.popupManager.debugCreateTestPin() // Creates a test pin');
    console.log('- window.popupManager.loadPins() // Manually reload pins');
    console.log('- window.popupManager.debugTestPinStorage() // Run full storage tests');
    console.log('- window.popupManager.switchTab("pins") // Switch to pins tab');
    console.log('\n💡 To test pins quickly, run: window.popupManager.quickTest()');
    
    // Run storage tests if in debug mode (check URL parameter or localStorage)
    const urlParams = new URLSearchParams(window.location.search);
    const isDebugMode = urlParams.get('debug') === 'true' || localStorage.getItem('debug') === 'true';
    
    if (isDebugMode) {
        console.log('Debug mode enabled - running pin storage tests');
        setTimeout(() => {
            window.popupManager.debugTestPinStorage();
        }, 1000);
    }
}); 