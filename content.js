// Content script for YouTube pages
class YouTubeVideoExtractor {
    constructor() {
        this.currentVideoId = null;
        this.currentVideoTitle = null;
        this.currentVideoUrl = null;
        this.setupMessageListener();
        this.observeVideoChanges();
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
            console.error('Error extracting video info:', error);
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
            console.log('Starting transcript extraction for video:', videoId);
            
            // Method 1: Try to get transcript via YouTube's internal API
            console.log('Trying YouTube internal API...');
            const transcript = await this.extractTranscriptFromYouTubeAPI(videoId);
            if (transcript && transcript.length > 0) {
                console.log('Successfully extracted transcript via API:', transcript.length, 'segments');
                return transcript;
            }
            
            // Method 2: Try to extract from DOM if captions are enabled
            console.log('Trying DOM extraction...');
            const domTranscript = await this.extractTranscriptFromDOM();
            if (domTranscript && domTranscript.length > 0) {
                console.log('Successfully extracted transcript via DOM:', domTranscript.length, 'segments');
                return domTranscript;
            }
            
            // Method 3: Fallback to audio extraction and Deepgram transcription
            console.log('Trying audio extraction and Deepgram transcription...');
            const audioTranscript = await this.transcribeWithDeepgram(videoId);
            if (audioTranscript && audioTranscript.length > 0) {
                console.log('Successfully extracted transcript via Deepgram:', audioTranscript.length, 'segments');
                return audioTranscript;
            }
            
            console.log('No transcript found via any method');
            throw new Error('No transcript available for this video');
        } catch (error) {
            console.error('Error getting YouTube transcript:', error);
            throw error;
        }
    }

    async transcribeWithDeepgram(videoId) {
        try {
            console.log('Starting Deepgram transcription for video:', videoId);
            
            // Extract audio stream URL from YouTube
            const audioStreamUrl = await this.extractAudioStreamUrl(videoId);
            if (!audioStreamUrl) {
                console.log('Could not extract audio stream URL');
                return null;
            }
            
            console.log('Found audio stream URL, sending to background script for transcription');
            
            // Send to background script for Deepgram transcription
            const response = await chrome.runtime.sendMessage({
                action: 'transcribeWithDeepgram',
                audioStreamUrl: audioStreamUrl,
                videoId: videoId
            });
            
            if (response.error) {
                console.error('Deepgram transcription failed:', response.error);
                return null;
            }
            
            return response.transcript;
        } catch (error) {
            console.error('Error in Deepgram transcription:', error);
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
                                    
                                    console.log('Found audio stream:', bestAudioStream.mimeType, bestAudioStream.audioQuality);
                                    return bestAudioStream.url;
                                }
                            }
                        }
                    } catch (e) {
                        console.warn('Error parsing player response:', e);
                    }
                }
            }
            
            // Alternative approach: Try to access the video element's audio tracks
            const video = document.querySelector('video');
            if (video && video.src) {
                console.log('Using video element src as fallback');
                return video.src;
            }
            
            console.log('Could not find audio stream URL');
            return null;
        } catch (error) {
            console.error('Error extracting audio stream URL:', error);
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
            console.error('Failed to get transcript from YouTube API:', error);
            return null;
        }
    }

    async extractTranscriptFromDOM() {
        try {
            console.log('Extracting transcript from DOM...');
            
            // Look for transcript in the page (if user has opened transcript panel)
            let transcriptElements = document.querySelectorAll('ytd-transcript-segment-renderer');
            console.log('Found transcript elements:', transcriptElements.length);
            
            if (transcriptElements.length > 0) {
                return await this.parseTranscriptElements(transcriptElements);
            }
            
            // Check if transcript button is available but not clicked
            console.log('Looking for transcript button...');
            
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
                    console.log('Found transcript button with selector:', selector);
                    break;
                }
            }
            
            console.log('Transcript button found:', showTranscriptButton);
            
            if (showTranscriptButton) {
                // Try to click the transcript button to open it
                console.log('Found transcript button, attempting to open transcript...');
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
            console.error('Failed to extract transcript from DOM:', error);
            return null;
        }
    }

    async waitForTranscriptToLoad(maxRetries = 10) {
        for (let i = 0; i < maxRetries; i++) {
            console.log(`Waiting for transcript to load... attempt ${i + 1}/${maxRetries}`);
            
            // Wait progressively longer between attempts
            await new Promise(resolve => setTimeout(resolve, 1000 + (i * 500)));
            
            const transcriptElements = document.querySelectorAll('ytd-transcript-segment-renderer');
            console.log(`Found ${transcriptElements.length} transcript elements on attempt ${i + 1}`);
            
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
                    console.log(`Found elements with alternative selector: ${selector}`);
                    return await this.parseTranscriptElements(altElements);
                }
            }
        }
        
        console.log('Transcript failed to load after all retries');
        return null;
    }

    async parseTranscriptElements(transcriptElements) {
        const transcript = [];
        
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
                const timeMatch = allText.match(/(\d+):(\d+)/);
                if (timeMatch) {
                    timeText = timeMatch[0];
                }
                
                // Try to find time in data attributes
                const dataAttrs = ['data-start-time', 'data-time', 'start-time'];
                for (const attr of dataAttrs) {
                    const attrValue = element.getAttribute(attr);
                    if (attrValue) {
                        // Convert seconds to MM:SS format
                        const seconds = parseInt(attrValue);
                        if (!isNaN(seconds)) {
                            const mins = Math.floor(seconds / 60);
                            const secs = seconds % 60;
                            timeText = `${mins}:${secs.toString().padStart(2, '0')}`;
                            break;
                        }
                    }
                }
            }
            
            if (timeText.includes(':') && textElement) {
                const text = textElement.textContent.trim();
                
                // Parse time format (e.g., "0:30" or "1:23")
                const timeMatch = timeText.match(/(\d+):(\d+)/);
                if (timeMatch) {
                    const minutes = parseInt(timeMatch[1]);
                    const seconds = parseInt(timeMatch[2]);
                    const startTime = minutes * 60 + seconds;
                    
                    transcript.push({
                        startTime: startTime,
                        endTime: startTime + 5, // Estimate 5 seconds per segment
                        text: text
                    });
                }
            }
        });
        
        console.log('Extracted transcript:', transcript);
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
                            console.error('Error parsing caption tracks:', e);
                        }
                    }
                }
            }
            
            return [];
        } catch (error) {
            console.error('Error getting caption tracks:', error);
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
            console.error('Error fetching caption track:', error);
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
            console.error('Error parsing XML captions:', error);
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
            console.error('Error parsing YouTube transcript response:', error);
            return null;
        }
    }

    extractTranscriptFromAPIResponse(content) {
        // This would need to be implemented based on actual API response structure
        // For now, return null to indicate it's not available
        return null;
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
    }
});

// Export for use in popup
window.youtubeVideoExtractor = videoExtractor; 