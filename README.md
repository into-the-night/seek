# Seek

> AI-powered semantic search for YouTube videos. Find any moment using natural language.

[Insert hero image/gif showing the extension in action]

## ✨ Features

- 🔍 **Natural Language Search**: Ask questions in plain English to find specific moments
- 🎯 **Semantic Understanding**: AI-powered search that understands context and meaning
- ⚡ **Instant Results**: Get timestamped links to jump directly to relevant moments
- 🧠 **Smart Caching**: Local storage for faster subsequent searches
- 🎨 **Modern UI**: Clean, minimal dark mode interface with a futuristic design
- 🔒 **Privacy First**: All processing happens locally - no data sent to servers

[Insert screenshot of search results with timestamps]

## 🚀 Quick Start

1. **Install the Extension**
   - Clone this repo
   - Open Chrome/Edge and go to `chrome://extensions/`
   - Enable "Developer mode"
   - Click "Load unpacked" and select the extension directory
2. **Configure API Keys**
   - Click the extension icon and open settings (⚙️)
   - Add your API keys:
     - OpenAI API Key (Recommended) - For best semantic search
     - Hugging Face API Key - Alternative embedding model
     - Deepgram API Key - For videos without captions
     - Google AI API Key (Free) - Fallback option

[Insert screenshot of settings modal]

3. **Start Searching**
   - Navigate to any YouTube video
   - Click the extension icon
   - Type your query in natural language
   - Click on any result to jump to that moment

## 🛠️ Development

```bash
# Clone the repository
git clone https://github.com/yourusername/seek.git

# Install dependencies (if any are added in future)
npm install

# Load in Chrome
1. Open chrome://extensions
2. Enable Developer Mode
3. Load unpacked extension
```

## 🧩 Usage

1. **Navigate to a YouTube video** that has closed captions/subtitles enabled
2. **Click the extension icon** to open the search popup
3. **Configure API keys** (first time only):
   - Click the settings gear (⚙️) in the popup
   - Enter your Google AI API key (required for semantic search)
   - Optionally enter Deepgram API key (for future audio transcription)
4. **Search the video**:
   - Type your search query in natural language (e.g., "machine learning basics", "how to solve the problem", "what is discussed about AI")
   - Click Search or press Enter
5. **View results**: The extension will show up to 5 relevant moments with timestamps
6. **Click any result** to jump directly to that moment in the video

## 🤚 Read before you use:
- The video **must have closed captions** enabled for the extension to work. ( Fix coming soon, star 🌟 the repo for updates!!!! )
- First search on a video takes longer as it processes the transcript but subsequent searches will be faster due to caching.


## File Structure

```
yt-extension/
├── manifest.json          # Extension manifest
├── popup.html             # Popup interface
├── popup.js               # Popup logic
├── content.js             # Content script for YouTube pages
├── background.js          # Background service worker
└── README.md              # This file
```

## ⚠️ Troubleshooting 

### "Not on a video page" Error
- Make sure you're on a YouTube video page (URL contains `/watch?v=`)
- Refresh the page and try again

### "No transcript available" Error
- Verify the video has closed captions enabled (CC button should be available)
- Try manually clicking the "Show transcript" button below the video

### Extension not working
- Reload the extension in `chrome://extensions/`
- Clear the extension's storage data
- Check that the extension has the necessary permissions

## 🕵️ Privacy & Security

- API keys are stored locally in your browser only
- No video data is sent to external servers (except for transcription)
- Transcripts and embeddings are cached locally
- No usage tracking or analytics


## 🤝 Contributing

Contributions welcome!

1. Fork the repository
2. Create a feature branch
3. Implement your changes
4. Test thoroughly
5. Submit a pull request

## 📜 License

MIT @ Abhay Shukla (into-the-night)
