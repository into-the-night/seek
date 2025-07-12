// Popup script for YouTube Video Search extension
class PopupManager {
    constructor() {
        this.currentVideoInfo = null;
        this.isProcessing = false;
        this.initializeUI();
        this.setupEventListeners();
        this.checkCurrentVideo();
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
            settingsBtn: document.getElementById('settingsBtn')
        };
    }

    setupEventListeners() {
        // Search button click
        this.elements.searchButton.addEventListener('click', () => {
            this.handleSearch();
        });

        // Enter key on search input
        this.elements.searchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.handleSearch();
            }
        });

        // Settings button
        this.elements.settingsBtn.addEventListener('click', (e) => {
            e.preventDefault();
            this.showSettings();
        });
    }

    async checkCurrentVideo() {
        try {
            console.log('🔍 Checking current video...');
            // Get current tab
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            console.log('📍 Current tab URL:', tab.url);
            
            // Check if we're on YouTube
            if (!tab.url.includes('youtube.com/watch')) {
                console.log('❌ Not on YouTube video page');
                this.showNoVideoMessage();
                return;
            }

            // Get video info from content script
            console.log('📨 Sending message to content script...');
            const response = await chrome.tabs.sendMessage(tab.id, { action: 'getVideoInfo' });
            console.log('📬 Response from content script:', response);
            
            if (response && response.isVideoPage) {
                this.currentVideoInfo = response;
                console.log('✅ Video detected:', response.title);
                this.showSearchInterface();
            } else {
                console.log('❌ No video info received');
                this.showNoVideoMessage();
            }
        } catch (error) {
            console.error('❌ Error checking video:', error);
            this.showNoVideoMessage();
        }
    }

    showNoVideoMessage() {
        this.elements.noVideoMessage.classList.remove('hidden');
        this.elements.searchInterface.classList.add('hidden');
    }

    showSearchInterface() {
        this.elements.noVideoMessage.classList.add('hidden');
        this.elements.searchInterface.classList.remove('hidden');
        this.elements.searchInput.focus();
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
        
        // For debugging, let's skip cache and always try fresh extraction
        // TODO: Re-enable caching after debugging
        console.log('Generating fresh transcript for debugging...');
        return await this.generateTranscript(videoId);
        
        // Check if we have cached transcript
        const cachedTranscript = await new Promise((resolve) => {
            chrome.runtime.sendMessage({ action: 'getTranscript', videoId }, (response) => {
                if (chrome.runtime.lastError) {
                    console.error('Error getting transcript:', chrome.runtime.lastError);
                    resolve(null);
                } else {
                    console.log('Cached transcript response:', response);
                    resolve(response && !response.error ? response : null);
                }
            });
        });

        if (cachedTranscript) {
            console.log('Using cached transcript:', cachedTranscript.transcript);
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
            console.warn('YouTube transcript not available, trying Deepgram...', error);
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
            
            console.log('Requesting transcript for video:', videoId);
            
            // Send message to content script to extract transcript
            const response = await chrome.tabs.sendMessage(tab.id, { 
                action: 'getYouTubeTranscript',
                videoId: videoId
            });
            
            console.log('Content script response:', response);
            
            if (response && response.transcript) {
                console.log('Transcript received:', response.transcript);
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
            
            console.log('Requesting Deepgram transcription for video:', videoId);
            
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
        }
        
        this.elements.results.classList.remove('hidden');
    }

    createResultElement(result) {
        const div = document.createElement('div');
        div.className = 'result-item';
        
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
        let statusHTML = message;
        
        if (type === 'loading') {
            statusHTML = `<div class="loading-spinner"></div>${message}`;
        }
        
        this.elements.status.innerHTML = statusHTML;
        this.elements.status.className = `status ${type}`;
        this.elements.status.classList.remove('hidden');
        
        if (type === 'success' || type === 'error') {
            setTimeout(() => {
                this.elements.status.classList.add('hidden');
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
                    } else {
                        console.log('Cache cleared successfully');
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
}

// Initialize popup manager when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new PopupManager();
}); 