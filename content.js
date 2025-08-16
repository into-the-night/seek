// Content script for YouTube pages
class YouTubeVideoExtractor {
    constructor() {
        this.currentVideoId = null;
        this.currentVideoTitle = null;
        this.currentVideoUrl = null;
        this.pinButton = null;
        this.setupMessageListener();
        this.observeVideoChanges();
        this.addPinButtonToPlayer();
    }

    setupMessageListener() {
        chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
            if (request.action === 'getVideoInfo') {
                this.extractVideoInfo().then(videoInfo => {
                    sendResponse(videoInfo);
                }).catch(error => {
                    sendResponse({ error: error.message });
                });
                return true; // Indicates we will send a response asynchronously
            }
        });
    }

    observeVideoChanges() {
        // Watch for URL changes (YouTube is a SPA)
        let lastUrl = location.href;
        new MutationObserver(() => {
            const url = location.href;
            if (url !== lastUrl) {
                lastUrl = url;
                this.onVideoChange();
            }
        }).observe(document, { subtree: true, childList: true });

        // Initial check
        this.onVideoChange();
    }

    onVideoChange() {
        // Small delay to ensure page has loaded
        setTimeout(() => {
            this.extractVideoInfo();
        }, 1000);
    }

    async extractVideoInfo() {
        try {
            // Check if we're on a video page
            const videoId = this.getVideoIdFromUrl();
            if (!videoId) {
                return { 
                    isVideoPage: false, 
                    error: 'Not on a video page' 
                };
            }

            // Get video title
            const titleElement = document.querySelector('h1.ytd-video-primary-info-renderer, h1.ytd-watch-metadata');
            const title = titleElement ? titleElement.textContent.trim() : 'Unknown Video';

            // Get video URL
            const videoUrl = window.location.href;

            // Store current video info
            this.currentVideoId = videoId;
            this.currentVideoTitle = title;
            this.currentVideoUrl = videoUrl;

            const videoInfo = {
                isVideoPage: true,
                videoId: videoId,
                title: title,
                url: videoUrl,
                timestamp: Date.now()
            };

            // Send to background script for storage
            chrome.runtime.sendMessage({
                action: 'updateVideoInfo',
                videoInfo: videoInfo
            });

            return videoInfo;
        } catch (error) {
            return { 
                isVideoPage: false, 
                error: error.message 
            };
        }
    }

    getVideoIdFromUrl() {
        const url = window.location.href;
        const regex = /[?&]v=([^&]+)/;
        const match = url.match(regex);
        return match ? match[1] : null;
    }

    // Get video duration if available
    getVideoDuration() {
        const durationElement = document.querySelector('.ytp-time-duration');
        return durationElement ? durationElement.textContent : null;
    }

    // Navigate to specific timestamp
    navigateToTimestamp(seconds) {
        const video = document.querySelector('video');
        if (video) {
            video.currentTime = seconds;
            
            // Ensure video is playing
            if (video.paused) {
                video.play();
            }
            
            // Also try to update the URL to include the timestamp
            const url = new URL(window.location.href);
            url.searchParams.set('t', Math.floor(seconds) + 's');
            window.history.replaceState({}, '', url);
        }
    }

    // Get YouTube transcript using built-in captions
    async getYouTubeTranscript(videoId) {
        try {
            // Method 1: Try to get transcript via YouTube's internal API
            const transcript = await this.extractTranscriptFromYouTubeAPI(videoId);
            if (transcript && transcript.length > 0) {
                return transcript;
            }
            
            // Method 2: Try to extract from DOM if captions are enabled
            const domTranscript = await this.extractTranscriptFromDOM();
            if (domTranscript && domTranscript.length > 0) {
                return domTranscript;
            }
            
            // Method 3: Fallback to audio extraction and Deepgram transcription
            const audioTranscript = await this.transcribeWithDeepgram(videoId);
            if (audioTranscript && audioTranscript.length > 0) {
                return audioTranscript;
            }
            
            throw new Error('No transcript available for this video');
        } catch (error) {
            throw error;
        }
    }

    async transcribeWithDeepgram(videoId) {
        try {
            // Extract audio stream URL from YouTube
            const audioStreamUrl = await this.extractAudioStreamUrl(videoId);
            if (!audioStreamUrl) {
                return null;
            }
            
            // Send to background script for Deepgram transcription
            const response = await chrome.runtime.sendMessage({
                action: 'transcribeWithDeepgram',
                audioStreamUrl: audioStreamUrl,
                videoId: videoId
            });
            
            if (response.error) {
                return null;
            }
            
            return response.transcript;
        } catch (error) {
            return null;
        }
    }

    async extractAudioStreamUrl(videoId) {
        try {
            // Try to get the audio stream URL from YouTube's player data
            const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
            
            // Look for player data in the page
            const scripts = document.querySelectorAll('script');
            for (const script of scripts) {
                const scriptContent = script.textContent;
                
                // Look for ytInitialPlayerResponse or similar player data
                if (scriptContent.includes('ytInitialPlayerResponse') || scriptContent.includes('streamingData')) {
                    try {
                        // Extract the player response JSON
                        let playerResponseMatch = scriptContent.match(/ytInitialPlayerResponse\s*=\s*({.+?});/);
                        if (!playerResponseMatch) {
                            playerResponseMatch = scriptContent.match(/var\s+ytInitialPlayerResponse\s*=\s*({.+?});/);
                        }
                        
                        if (playerResponseMatch) {
                            const playerResponse = JSON.parse(playerResponseMatch[1]);
                            
                            if (playerResponse.streamingData && playerResponse.streamingData.adaptiveFormats) {
                                // Find audio-only streams
                                const audioStreams = playerResponse.streamingData.adaptiveFormats.filter(format => 
                                    format.mimeType && format.mimeType.includes('audio') && format.url
                                );
                                
                                if (audioStreams.length > 0) {
                                    // Prefer higher quality audio streams
                                    const bestAudioStream = audioStreams.sort((a, b) => {
                                        const aQuality = parseInt(a.audioQuality?.replace('AUDIO_QUALITY_', '') || '0');
                                        const bQuality = parseInt(b.audioQuality?.replace('AUDIO_QUALITY_', '') || '0');
                                        return bQuality - aQuality;
                                    })[0];
                                    
                                    return bestAudioStream.url;
                                }
                            }
                        }
                    } catch (e) {
                        // Error parsing player response
                    }
                }
            }
            
            // Alternative approach: Try to access the video element's audio tracks
            const video = document.querySelector('video');
            if (video && video.src) {
                return video.src;
            }
            
            return null;
        } catch (error) {
            return null;
        }
    }

    async extractTranscriptFromYouTubeAPI(videoId) {
        try {
            // This would typically require the YouTube Data API v3
            // For now, we'll try to access the transcript through the player's internal API
            
            // Check if YouTube's internal transcript API is available
            if (window.yt && window.yt.config_ && window.yt.config_.INNERTUBE_API_KEY) {
                const response = await fetch(`https://www.youtube.com/youtubei/v1/get_transcript?key=${window.yt.config_.INNERTUBE_API_KEY}`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        context: {
                            client: {
                                clientName: 'WEB',
                                clientVersion: '2.0'
                            }
                        },
                        params: videoId
                    })
                });
                
                if (response.ok) {
                    const data = await response.json();
                    return this.parseYouTubeTranscriptResponse(data);
                }
            }
            
            return null;
        } catch (error) {
            return null;
        }
    }

    async extractTranscriptFromDOM() {
        try {
            // Look for transcript in the page (if user has opened transcript panel)
            let transcriptElements = document.querySelectorAll('ytd-transcript-segment-renderer');
            
            if (transcriptElements.length > 0) {
                return await this.parseTranscriptElements(transcriptElements);
            }
            
            // Check if transcript button is available but not clicked
            // Try multiple selectors for the transcript button
            const transcriptSelectors = [
                'button[aria-label*="transcript" i]',
                'button[aria-label*="Show transcript" i]',
                'button[title*="transcript" i]',
                'button[aria-label*="Transcript" i]',
                '[role="button"][aria-label*="transcript" i]',
                'yt-button-renderer[aria-label*="transcript" i]'
            ];
            
            let showTranscriptButton = null;
            for (const selector of transcriptSelectors) {
                showTranscriptButton = document.querySelector(selector);
                if (showTranscriptButton) {
                    break;
                }
            }
            
            if (showTranscriptButton) {
                // Try to click the transcript button to open it
                showTranscriptButton.click();
                
                // Wait for the transcript to load with retries
                const transcript = await this.waitForTranscriptToLoad();
                if (transcript && transcript.length > 0) {
                    return transcript;
                }
            }
            
            // Alternative: Try to access captions through the video player
            const captionTracks = await this.getCaptionTracks();
            if (captionTracks && captionTracks.length > 0) {
                return await this.fetchCaptionTrack(captionTracks[0]);
            }
            
            return null;
        } catch (error) {
            return null;
        }
    }

    async waitForTranscriptToLoad(maxRetries = 10) {
        for (let i = 0; i < maxRetries; i++) {
            // Wait progressively longer between attempts
            await new Promise(resolve => setTimeout(resolve, 1000 + (i * 500)));
            
            const transcriptElements = document.querySelectorAll('ytd-transcript-segment-renderer');
            
            if (transcriptElements.length > 0) {
                return await this.parseTranscriptElements(transcriptElements);
            }
            
            // Also check for alternative selectors
            const altSelectors = [
                '.ytd-transcript-segment-renderer',
                '[class*="transcript-segment"]',
                '[class*="caption-segment"]',
                '.segment-text'
            ];
            
            for (const selector of altSelectors) {
                const altElements = document.querySelectorAll(selector);
                if (altElements.length > 0) {
                    return await this.parseTranscriptElements(altElements);
                }
            }
        }
        
        return null;
    }

    async parseTranscriptElements(transcriptElements) {
        const transcript = [];
        
        // Get video duration to inform timestamp parsing
        const videoDuration = this.getVideoDuration();
        let isLongVideo = false;
        
        if (videoDuration) {
            // Parse duration to check if video is longer than 1 hour
            const durationParts = videoDuration.split(':').map(part => parseInt(part));
            let durationInSeconds = 0;
            
            if (durationParts.length === 2) {
                // MM:SS format
                durationInSeconds = durationParts[0] * 60 + durationParts[1];
            } else if (durationParts.length === 3) {
                // HH:MM:SS format  
                durationInSeconds = durationParts[0] * 3600 + durationParts[1] * 60 + durationParts[2];
            }
            
            isLongVideo = durationInSeconds >= 3600; // 1 hour or more
        }
        
        transcriptElements.forEach((element, index) => {
            // Try multiple selectors for time buttons
            const timeButtonSelectors = [
                'button[aria-label]',
                'button',
                '.ytd-transcript-segment-renderer button',
                '[role="button"]',
                'yt-formatted-string'
            ];
            
            let timeButton = null;
            let timeText = '';
            
            for (const selector of timeButtonSelectors) {
                timeButton = element.querySelector(selector);
                if (timeButton) {
                    timeText = timeButton.getAttribute('aria-label') || timeButton.textContent || '';
                    if (timeText.includes(':')) {
                        break;
                    }
                }
            }
            
            const textElement = element.querySelector('.segment-text') || element.querySelector('[class*="segment-text"]') || element.querySelector('yt-formatted-string');
            
            // If we still don't have a time button, let's look at the entire element structure
            if (!timeButton || !timeText.includes(':')) {
                
                // Try to find time in the element's text content
                const allText = element.textContent;
                const timeMatch = allText.match(/(\d+):(\d+)(?::(\d+))?/);
                if (timeMatch) {
                    timeText = timeMatch[0]; // This now captures HH:MM:SS or MM:SS
                }
                
                // Try to find time in data attributes
                const dataAttrs = ['data-start-time', 'data-time', 'start-time'];
                for (const attr of dataAttrs) {
                    const attrValue = element.getAttribute(attr);
                    if (attrValue) {
                        // Convert seconds to HH:MM:SS or MM:SS format based on duration
                        const seconds = parseInt(attrValue);
                        if (!isNaN(seconds)) {
                            const hours = Math.floor(seconds / 3600);
                            const mins = Math.floor((seconds % 3600) / 60);
                            const secs = seconds % 60;
                            
                            if (hours > 0) {
                                timeText = `${hours}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
                            } else {
                                timeText = `${mins}:${secs.toString().padStart(2, '0')}`;
                            }
                            break;
                        }
                    }
                }
            }
            
            if (timeText.includes(':') && textElement) {
                const text = textElement.textContent.trim();
                
                // Parse time format (e.g., "0:30", "1:23", or "1:14:13")
                let startTime = 0;
                
                // Handle both MM:SS and HH:MM:SS formats
                const timeMatch = timeText.match(/(\d+):(\d+)(?::(\d+))?/);
                if (timeMatch) {
                    if (timeMatch[3] !== undefined) {
                        // HH:MM:SS format
                        const hours = parseInt(timeMatch[1]);
                        const minutes = parseInt(timeMatch[2]);
                        const seconds = parseInt(timeMatch[3]);
                        startTime = hours * 3600 + minutes * 60 + seconds;
                    } else {
                        // MM:SS format - YouTube transcripts always use MM:SS for two-part timestamps
                        // regardless of video length
                        const firstNum = parseInt(timeMatch[1]);
                        const secondNum = parseInt(timeMatch[2]);
                        
                        // Always treat two-part timestamps as minutes:seconds
                        // Examples: "56:30" = 56m 30s, "120:45" = 120m 45s
                        startTime = firstNum * 60 + secondNum;
                    }
                    
                    transcript.push({
                        startTime: startTime,
                        endTime: startTime + 5, // Estimate 5 seconds per segment
                        text: text
                    });
                    
                    // Format for logging (handle hours properly)
                    const hours = Math.floor(startTime / 3600);
                    const mins = Math.floor((startTime % 3600) / 60);
                    const secs = Math.floor(startTime % 60);
                }
            }
        });
        
        if (transcript.length > 0) {
            // Format first segment time
            const firstTime = transcript[0].startTime;
            const firstHours = Math.floor(firstTime / 3600);
            const firstMins = Math.floor((firstTime % 3600) / 60);
            const firstSecs = Math.floor(firstTime % 60);
            const firstTimeStr = firstHours > 0 ? 
                `${firstHours}:${firstMins.toString().padStart(2, '0')}:${firstSecs.toString().padStart(2, '0')}` :
                `${firstMins}:${firstSecs.toString().padStart(2, '0')}`;
                
            // Format last segment time  
            const lastTime = transcript[transcript.length-1].startTime;
            const lastHours = Math.floor(lastTime / 3600);
            const lastMins = Math.floor((lastTime % 3600) / 60);
            const lastSecsVal = Math.floor(lastTime % 60);
            const lastTimeStr = lastHours > 0 ? 
                `${lastHours}:${lastMins.toString().padStart(2, '0')}:${lastSecsVal.toString().padStart(2, '0')}` :
                `${lastMins}:${lastSecsVal.toString().padStart(2, '0')}`;
        }
        
        return transcript;
    }

    async getCaptionTracks() {
        try {
            // Try to get caption tracks from the YouTube player
            const video = document.querySelector('video');
            if (video && video.textTracks) {
                const tracks = Array.from(video.textTracks).filter(track => track.kind === 'captions');
                return tracks;
            }
            
            // Alternative approach: Look for caption data in the page
            const scriptTags = document.querySelectorAll('script');
            for (const script of scriptTags) {
                if (script.textContent.includes('captionTracks')) {
                    const match = script.textContent.match(/"captionTracks":(\[.*?\])/);
                    if (match) {
                        try {
                            const captionTracks = JSON.parse(match[1]);
                            return captionTracks;
                        } catch (e) {
                            // Error parsing caption tracks
                        }
                    }
                }
            }
            
            return [];
        } catch (error) {
            return [];
        }
    }

    async fetchCaptionTrack(track) {
        try {
            if (track.baseUrl) {
                // Fetch the caption file
                const response = await fetch(track.baseUrl);
                if (response.ok) {
                    const xmlText = await response.text();
                    return this.parseXMLCaptions(xmlText);
                }
            }
            
            return null;
        } catch (error) {
            return null;
        }
    }

    parseXMLCaptions(xmlText) {
        try {
            const parser = new DOMParser();
            const xmlDoc = parser.parseFromString(xmlText, 'text/xml');
            const textElements = xmlDoc.querySelectorAll('text');
            
            const transcript = [];
            textElements.forEach(element => {
                const start = parseFloat(element.getAttribute('start') || '0');
                const duration = parseFloat(element.getAttribute('dur') || '5');
                const text = element.textContent.trim();
                
                if (text) {
                    transcript.push({
                        startTime: start,
                        endTime: start + duration,
                        text: text
                    });
                }
            });
            
            return transcript;
        } catch (error) {
            return null;
        }
    }

    parseYouTubeTranscriptResponse(data) {
        try {
            // Parse the YouTube transcript API response
            // This is a simplified implementation - actual structure may vary
            if (data.actions && data.actions[0] && data.actions[0].updateEngagementPanelAction) {
                const content = data.actions[0].updateEngagementPanelAction.content;
                // Extract transcript data from the response
                // Implementation depends on actual API response structure
                return this.extractTranscriptFromAPIResponse(content);
            }
            
            return null;
        } catch (error) {
            return null;
        }
    }

    extractTranscriptFromAPIResponse(content) {
        // This would need to be implemented based on actual API response structure
        // For now, return null to indicate it's not available
        return null;
    }

    // Pin button functionality
    addPinButtonToPlayer() {
        // Wait for player controls to load with multiple attempts
        let attempts = 0;
        const maxAttempts = 20;
        
        const checkForControls = () => {
            attempts++;
            
            // Updated selectors for current YouTube structure
            const possibleSelectors = [
                '.ytp-chrome-controls .ytp-right-controls',
                '.ytp-right-controls',
                '.ytp-chrome-bottom .ytp-right-controls',
                '.html5-video-player .ytp-right-controls',
                'div.ytp-right-controls',
                '.ytp-chrome-bottom div.ytp-right-controls',
                '.ytd-player .ytp-right-controls'
            ];
            
            let playerControls = null;
            for (const selector of possibleSelectors) {
                playerControls = document.querySelector(selector);
                if (playerControls) {
                    break;
                }
            }
            
            if (playerControls && !this.pinButton) {
                this.createPinButton(playerControls);
            } else if (!playerControls && attempts < maxAttempts) {
                // Retry after a short delay
                setTimeout(checkForControls, 1000);
            } else if (attempts >= maxAttempts) {
                // Try one more time with a more aggressive approach
                this.tryAlternativePinButtonPlacement();
            }
        };

        // Initial check with a small delay to ensure page has loaded
        setTimeout(checkForControls, 1000);

        // Also observe for navigation changes and DOM updates
        const observer = new MutationObserver((mutations) => {
            // Check if the pin button is still in the DOM
            if (this.pinButton && !document.contains(this.pinButton)) {
                this.pinButton = null;
                attempts = 0; // Reset attempts for new page
                setTimeout(checkForControls, 1000);
            }
            
            // Also check if YouTube player structure changed
            const hasRightControls = document.querySelector('.ytp-right-controls');
            if (hasRightControls && !this.pinButton) {
                attempts = 0;
                setTimeout(checkForControls, 500);
            }
        });

        observer.observe(document.body, { childList: true, subtree: true });

        // Fallback: Add keyboard shortcut for pin creation
        document.addEventListener('keydown', (e) => {
            // Ctrl/Cmd + P to create pin
            if ((e.ctrlKey || e.metaKey) && e.key === 'p' && !e.shiftKey) {
                // Check if we're on a video page
                if (this.getVideoIdFromUrl()) {
                    e.preventDefault();
                    e.stopPropagation();
                    this.handlePinButtonClick();
                }
            }
        });
    }

    // Alternative placement method if standard approach fails
    tryAlternativePinButtonPlacement() {
        // Look for any YouTube control button as a reference
        const existingButton = document.querySelector('.ytp-button') || 
                              document.querySelector('[class*="ytp-"][class*="button"]') ||
                              document.querySelector('.ytp-fullscreen-button') ||
                              document.querySelector('.ytp-settings-button');
        
        if (existingButton && existingButton.parentElement) {
            this.createPinButton(existingButton.parentElement);
        } else {
            // Last resort: create a floating pin button
            this.createFloatingPinButton();
        }
    }

    // Fallback: Create floating pin button
    createFloatingPinButton() {
        const videoPlayer = document.querySelector('#movie_player') || 
                           document.querySelector('.html5-video-player') ||
                           document.querySelector('video').closest('.html5-video-player');
        
        if (videoPlayer) {
            this.pinButton = document.createElement('div');
            this.pinButton.innerHTML = `
                <button class="floating-pin-btn" title="Create pin at current time">
                    📌
                </button>
            `;
            
            this.pinButton.style.cssText = `
                position: absolute !important;
                top: 16px !important;
                right: 16px !important;
                z-index: 9999 !important;
                background: rgba(0, 0, 0, 0.8) !important;
                border: none !important;
                border-radius: 50% !important;
                width: 44px !important;
                height: 44px !important;
                color: white !important;
                cursor: pointer !important;
                font-size: 18px !important;
                display: flex !important;
                align-items: center !important;
                justify-content: center !important;
                backdrop-filter: blur(8px) !important;
                transition: all 0.2s ease !important;
                opacity: 0.9 !important;
                box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3) !important;
            `;
            
            const button = this.pinButton.querySelector('.floating-pin-btn');
            button.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.handlePinButtonClick();
            });
            
            // Add hover effects to floating button
            button.addEventListener('mouseenter', () => {
                this.pinButton.style.opacity = '1';
                this.pinButton.style.transform = 'scale(1.05)';
                this.pinButton.style.background = 'rgba(255, 68, 68, 0.9)';
            });
            
            button.addEventListener('mouseleave', () => {
                this.pinButton.style.opacity = '0.9';
                this.pinButton.style.transform = 'scale(1)';
                this.pinButton.style.background = 'rgba(0, 0, 0, 0.8)';
            });
            
            videoPlayer.appendChild(this.pinButton);
        }
    }

    createPinButton(playerControls) {
        try {
            // Check if button already exists
            if (this.pinButton && document.contains(this.pinButton)) {
                return;
            }
            
            // Create pin button with better styling for YouTube integration
            this.pinButton = document.createElement('button');
            this.pinButton.className = 'ytp-button seek-pin-button';
            this.pinButton.setAttribute('title', 'Create pin at current time');
            this.pinButton.setAttribute('aria-label', 'Create pin at current time');
            this.pinButton.setAttribute('data-tooltip-text', 'Create pin at current time');
            
            // Use simple emoji icon with better styling
            this.pinButton.innerHTML = `
                <span style="font-size: 16px; line-height: 1; display: flex; align-items: center; justify-content: center;">📌</span>
            `;

            // Better styling that matches YouTube's native buttons more closely
            this.pinButton.style.cssText = `
                background: transparent !important;
                border: none !important;
                color: #fff !important;
                cursor: pointer !important;
                padding: 0 !important;
                margin: 0 !important;
                border-radius: 2px !important;
                opacity: 0.8 !important;
                transition: all 0.2s ease !important;
                display: inline-flex !important;
                align-items: center !important;
                justify-content: center !important;
                width: 40px !important;
                height: 40px !important;
                position: relative !important;
                vertical-align: top !important;
                min-width: 40px !important;
                flex-shrink: 0 !important;
                outline: none !important;
                box-sizing: border-box !important;
                font-family: YouTube Sans, Roboto, Arial, sans-serif !important;
                top: 0 !important;
            `;

            // Add hover and focus effects
            this.pinButton.addEventListener('mouseenter', () => {
                this.pinButton.style.opacity = '1';
                this.pinButton.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
            });

            this.pinButton.addEventListener('mouseleave', () => {
                this.pinButton.style.opacity = '0.8';
                this.pinButton.style.backgroundColor = 'transparent';
            });

            this.pinButton.addEventListener('focus', () => {
                this.pinButton.style.opacity = '1';
                this.pinButton.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
            });

            this.pinButton.addEventListener('blur', () => {
                this.pinButton.style.opacity = '0.8';
                this.pinButton.style.backgroundColor = 'transparent';
            });

            // Add click handler
            this.pinButton.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.handlePinButtonClick();
            });

            // Better insertion strategy - insert at the beginning of right controls
            // This puts it next to other control buttons in a consistent way
            const settingsButton = playerControls.querySelector('.ytp-settings-button');
            const fullscreenButton = playerControls.querySelector('.ytp-fullscreen-button');
            
            // Insert before settings button if it exists, otherwise before fullscreen button
            if (settingsButton) {
                playerControls.insertBefore(this.pinButton, settingsButton);
            } else if (fullscreenButton) {
                playerControls.insertBefore(this.pinButton, fullscreenButton);
            } else {
                // Fallback: append to the end
                playerControls.appendChild(this.pinButton);
            }
            
        } catch (error) {
            // If standard creation fails, try the floating button approach
            this.createFloatingPinButton();
        }
    }

    handlePinButtonClick() {
        try {
            const video = document.querySelector('video');
            if (!video) {
                this.showPinButtonFeedback('❌ No video found', 'error');
                return;
            }

            const currentTime = Math.floor(video.currentTime);
            const videoId = this.getVideoIdFromUrl();
            const videoTitle = this.currentVideoTitle || document.querySelector('h1.ytd-watch-metadata')?.textContent?.trim() || 'Unknown Video';
            const channelName = this.getChannelName();

            if (!videoId) {
                this.showPinButtonFeedback('❌ Could not get video ID', 'error');
                return;
            }

            // Show immediate feedback
            this.showPinButtonFeedback('📌 Creating pin...', 'loading');

            // Create in-page pin form overlay (more reliable than popup)
            this.showInPagePinForm({
                videoId: videoId,
                timestamp: currentTime,
                videoTitle: videoTitle,
                channelName: channelName
            });
            
        } catch (error) {
            this.showPinButtonFeedback('❌ Error creating pin', 'error');
        }
    }

    // Show visual feedback on the pin button
    showPinButtonFeedback(message, type) {
        if (!this.pinButton) return;
        
        // Store original content
        const originalContent = this.pinButton.innerHTML;
        const originalStyle = this.pinButton.style.cssText;
        
        // Show feedback
        let feedbackEmoji = '';
        let bgColor = '';
        
        switch (type) {
            case 'loading':
                feedbackEmoji = '⏳';
                bgColor = 'rgba(255, 193, 7, 0.3)';
                break;
            case 'success':
                feedbackEmoji = '✅';
                bgColor = 'rgba(40, 167, 69, 0.3)';
                break;
            case 'error':
                feedbackEmoji = '❌';
                bgColor = 'rgba(220, 53, 69, 0.3)';
                break;
            case 'normal':
                // Reset to original state immediately
                this.pinButton.innerHTML = originalContent;
                this.pinButton.style.cssText = originalStyle;
                return;
        }
        
        this.pinButton.innerHTML = `<span style="font-size: 18px; line-height: 1;">${feedbackEmoji}</span>`;
        this.pinButton.style.backgroundColor = bgColor;
        this.pinButton.style.transform = 'scale(1.1)';
        
        // Reset after delay
        setTimeout(() => {
            if (this.pinButton && document.contains(this.pinButton)) {
                this.pinButton.innerHTML = originalContent;
                this.pinButton.style.cssText = originalStyle;
            }
        }, type === 'loading' ? 3000 : 2000);
    }

    // Show in-page pin form overlay
    showInPagePinForm(pinData) {
        // Remove existing overlay if present
        const existingOverlay = document.getElementById('seek-pin-overlay');
        if (existingOverlay) {
            existingOverlay.remove();
        }
        
        // Create overlay container
        const overlay = document.createElement('div');
        overlay.id = 'seek-pin-overlay';
        overlay.style.cssText = `
            position: fixed !important;
            top: 0 !important;
            left: 0 !important;
            width: 100vw !important;
            height: 100vh !important;
            background: rgba(0, 0, 0, 0.8) !important;
            backdrop-filter: blur(8px) !important;
            z-index: 99999 !important;
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
        `;
        
        // Create form container
        const formContainer = document.createElement('div');
        formContainer.style.cssText = `
            background: linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%) !important;
            border: 1px solid rgba(255, 255, 255, 0.15) !important;
            border-radius: 20px !important;
            padding: 28px !important;
            width: 420px !important;
            max-width: 95vw !important;
            max-height: 90vh !important;
            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(255, 255, 255, 0.05) !important;
            position: relative !important;
            color: white !important;
            overflow: hidden !important;
            box-sizing: border-box !important;
        `;
        
        // Create form HTML
        formContainer.innerHTML = `
            <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 28px; padding-bottom: 16px; border-bottom: 1px solid rgba(255, 255, 255, 0.1);">
                <h2 style="margin: 0; font-size: 22px; font-weight: 700; color: #ffffff; display: flex; align-items: center; gap: 8px;">
                    <span style="font-size: 20px;">📌</span> Create Pin
                </h2>
                <button id="seek-close-pin-form" style="
                    background: rgba(255, 255, 255, 0.1); 
                    border: none; 
                    color: rgba(255,255,255,0.8); 
                    font-size: 20px; 
                    cursor: pointer; 
                    width: 36px; 
                    height: 36px; 
                    border-radius: 50%; 
                    display: flex; 
                    align-items: center; 
                    justify-content: center;
                    transition: all 0.2s ease;
                    font-weight: 300;
                ">×</button>
            </div>
            
            <div style="margin-bottom: 24px;">
                <label style="display: block; font-size: 14px; font-weight: 600; color: #ffffff; margin-bottom: 10px; letter-spacing: 0.3px;">Pin Title</label>
                <input type="text" id="seek-pin-title" placeholder="Enter a descriptive title..." maxlength="100" style="
                    width: 100%; 
                    padding: 14px 16px; 
                    background: rgba(255, 255, 255, 0.08); 
                    border: 1px solid rgba(255, 255, 255, 0.15); 
                    border-radius: 10px; 
                    color: #ffffff; 
                    font-size: 15px; 
                    outline: none;
                    font-family: inherit;
                    transition: all 0.2s ease;
                    box-sizing: border-box;
                " />
            </div>
            
            <div style="
                background: rgba(255, 68, 68, 0.08); 
                border: 1px solid rgba(255, 68, 68, 0.25); 
                border-radius: 12px; 
                padding: 20px; 
                text-align: center; 
                margin-bottom: 28px;
                position: relative;
                overflow: hidden;
            ">
                <div style="position: absolute; top: 0; left: 0; right: 0; height: 2px; background: linear-gradient(90deg, #ff4444, #ff6b6b);"></div>
                <div style="font-size: 24px; font-weight: 700; color: #ff5555; margin-bottom: 8px; font-family: 'SF Mono', monospace;">${this.formatTime(pinData.timestamp)}</div>
                <div style="
                    font-size: 14px; 
                    color: rgba(255, 255, 255, 0.9); 
                    margin-bottom: 6px; 
                    overflow: hidden; 
                    text-overflow: ellipsis; 
                    white-space: nowrap;
                    font-weight: 500;
                    max-width: 100%;
                ">${pinData.videoTitle}</div>
                <div style="font-size: 12px; color: rgba(255, 255, 255, 0.6); font-weight: 400;">${pinData.channelName}</div>
            </div>
            
            <div style="display: flex; gap: 14px; justify-content: flex-end; align-items: center;">
                <button id="seek-cancel-pin" style="
                    padding: 12px 24px; 
                    background: rgba(255, 255, 255, 0.08); 
                    border: 1px solid rgba(255, 255, 255, 0.2); 
                    border-radius: 10px; 
                    color: rgba(255, 255, 255, 0.9); 
                    cursor: pointer; 
                    font-size: 14px; 
                    font-weight: 600;
                    font-family: inherit;
                    transition: all 0.2s ease;
                    min-width: 80px;
                ">Cancel</button>
                <button id="seek-save-pin" style="
                    padding: 12px 24px; 
                    background: linear-gradient(135deg, #ff4444, #e73c3c); 
                    border: none; 
                    border-radius: 10px; 
                    color: #ffffff; 
                    cursor: pointer; 
                    font-size: 14px; 
                    font-weight: 600;
                    font-family: inherit;
                    transition: all 0.2s ease;
                    box-shadow: 0 4px 15px rgba(255, 68, 68, 0.3);
                    min-width: 100px;
                ">Save Pin</button>
            </div>
        `;
        
        overlay.appendChild(formContainer);
        document.body.appendChild(overlay);
        
        // Focus the title input
        const titleInput = document.getElementById('seek-pin-title');
        setTimeout(() => {
            titleInput.focus();
        }, 100);
        
        // Add enhanced input interactions
        titleInput.addEventListener('focus', () => {
            titleInput.style.borderColor = 'rgba(255, 68, 68, 0.6)';
            titleInput.style.backgroundColor = 'rgba(255, 255, 255, 0.12)';
            titleInput.style.boxShadow = '0 0 0 3px rgba(255, 68, 68, 0.1)';
        });
        
        titleInput.addEventListener('blur', () => {
            titleInput.style.borderColor = 'rgba(255, 255, 255, 0.15)';
            titleInput.style.backgroundColor = 'rgba(255, 255, 255, 0.08)';
            titleInput.style.boxShadow = 'none';
        });
        
        // Add event listeners
        const closeBtn = document.getElementById('seek-close-pin-form');
        const cancelBtn = document.getElementById('seek-cancel-pin');
        const saveBtn = document.getElementById('seek-save-pin');
        
        // Enhanced button interactions
        closeBtn.addEventListener('mouseenter', () => {
            closeBtn.style.backgroundColor = 'rgba(255, 255, 255, 0.2)';
            closeBtn.style.color = '#ffffff';
        });
        
        closeBtn.addEventListener('mouseleave', () => {
            closeBtn.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
            closeBtn.style.color = 'rgba(255,255,255,0.8)';
        });
        
        cancelBtn.addEventListener('mouseenter', () => {
            cancelBtn.style.backgroundColor = 'rgba(255, 255, 255, 0.15)';
            cancelBtn.style.borderColor = 'rgba(255, 255, 255, 0.3)';
            cancelBtn.style.transform = 'translateY(-1px)';
        });
        
        cancelBtn.addEventListener('mouseleave', () => {
            cancelBtn.style.backgroundColor = 'rgba(255, 255, 255, 0.08)';
            cancelBtn.style.borderColor = 'rgba(255, 255, 255, 0.2)';
            cancelBtn.style.transform = 'translateY(0)';
        });
        
        saveBtn.addEventListener('mouseenter', () => {
            saveBtn.style.background = 'linear-gradient(135deg, #ff5555, #ee4444)';
            saveBtn.style.boxShadow = '0 6px 20px rgba(255, 68, 68, 0.4)';
            saveBtn.style.transform = 'translateY(-1px)';
        });
        
        saveBtn.addEventListener('mouseleave', () => {
            saveBtn.style.background = 'linear-gradient(135deg, #ff4444, #e73c3c)';
            saveBtn.style.boxShadow = '0 4px 15px rgba(255, 68, 68, 0.3)';
            saveBtn.style.transform = 'translateY(0)';
        });
        
        const closeOverlay = () => {
            overlay.remove();
            this.showPinButtonFeedback('📌', 'normal');
        };
        
        const savePin = async () => {
            const title = titleInput.value.trim();
            if (!title) {
                titleInput.style.borderColor = '#ff4444';
                titleInput.focus();
                return;
            }
            
            const pin = {
                videoId: pinData.videoId,
                timestamp: pinData.timestamp,
                title: title,
                videoTitle: pinData.videoTitle,
                channelName: pinData.channelName
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
                
                this.showPinButtonFeedback('✅ Pin saved!', 'success');
                closeOverlay();
            } catch (error) {
                this.showPinButtonFeedback('❌ Error saving pin', 'error');
            }
        };
        
        closeBtn.addEventListener('click', closeOverlay);
        cancelBtn.addEventListener('click', closeOverlay);
        saveBtn.addEventListener('click', savePin);
        
        // Close on Escape key
        const handleKeyPress = (e) => {
            if (e.key === 'Escape') {
                closeOverlay();
                document.removeEventListener('keydown', handleKeyPress);
            } else if (e.key === 'Enter' && e.target === titleInput) {
                savePin();
            }
        };
        document.addEventListener('keydown', handleKeyPress);
        
        // Close on backdrop click
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                closeOverlay();
            }
        });
    }

    getChannelName() {
        const channelElement = document.querySelector('#owner #channel-name a') || 
                             document.querySelector('.ytd-channel-name a') ||
                             document.querySelector('[class*="channel-name"]');
        return channelElement ? channelElement.textContent.trim() : 'Unknown Channel';
    }

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
}

// Initialize the extractor
const videoExtractor = new YouTubeVideoExtractor();

// Listen for messages from popup to navigate to timestamps and get transcripts
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'navigateToTimestamp') {
        videoExtractor.navigateToTimestamp(request.timestamp);
        sendResponse({ success: true });
    } else if (request.action === 'getYouTubeTranscript') {
        videoExtractor.getYouTubeTranscript(request.videoId).then(transcript => {
            sendResponse({ transcript: transcript });
        }).catch(error => {
            sendResponse({ error: error.message });
        });
        return true; // Indicates we will send a response asynchronously
    } else if (request.action === 'getCurrentTimestamp') {
        const video = document.querySelector('video');
        const timestamp = video ? Math.floor(video.currentTime) : 0;
        const channelName = videoExtractor.getChannelName();
        sendResponse({ 
            timestamp: timestamp,
            channelName: channelName
        });
    } else if (request.action === 'getVideoDuration') {
        const duration = videoExtractor.getVideoDuration();
        sendResponse({ duration: duration });
    }
});

// Export for use in popup
window.youtubeVideoExtractor = videoExtractor; 