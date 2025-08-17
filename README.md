<p align="center">
  <img src="https://raw.githubusercontent.com/into-the-night/seek/refs/heads/main/assets/hero.png">
</p>

> A search extension for AI-powered semantic search from YouTube videos. Find any moment!

## ✨ Features

- 🔍 **Natural Language Search**: Ask questions in plain English to find specific moments
- 🎯 **Semantic Understanding**: AI-powered search that understands context and meaning
- 🧠 **Smart Caching**: Local storage for faster subsequent searches

## 🚀 Quick Start

1. **Install the Extension**
   - Download the latest release and extract it
   - Open Chrome/Edge and go to `chrome://extensions/`
   - Enable "Developer mode"
   - Click "Load unpacked" and select the extension directory
2. **Configure API Keys**
   - Click the extension icon and open settings (⚙️)
   - Add your API keys:
     - Google AI API Key (Free) - Get it [here](https://aistudio.google.com/apikey)
     - OpenAI API Key (Recommended) - Get it [here](https://platform.openai.com/api-keys)
     - Hugging Face Access Token - Get it [here](https://huggingface.co/settings/tokens)
3. **Start Searching**
   - Navigate to any YouTube video
   - Click the extension icon
   - Type your query in natural language
   - Click on any result to jump to that moment

## 🤚 Read before you use:
- The video **must have closed captions** enabled for the extension to work. ( Fix coming soon, star 🌟 the repo for updates!!!! )
- First search on a video takes a little longer as it processes the transcript but subsequent searches will be faster due to caching. ( Looking for a fix!! )

## ⚠️ Troubleshooting 

#### "Not on a video page" Error
- Make sure you're on a YouTube video page (URL contains `/watch?v=`)
- Refresh the page and try again

#### "No transcript available" Error
- Verify the video has closed captions enabled (CC button should be available)
- Try manually clicking the "Show transcript" button below the video

#### Extension not working
- Reload the extension in `chrome://extensions/`
- Clear the extension's storage data
- Check that the extension has the necessary permissions

## 🕵️ Privacy & Security

- API keys are stored locally in your browser only
- Transcripts and embeddings are cached locally
- No usage tracking or analytics

## 🤝 Contributing

Contributions welcome! Fork, work, test, push -> PR!

## 📜 License

MIT @ Abhay Shukla (into-the-night)
