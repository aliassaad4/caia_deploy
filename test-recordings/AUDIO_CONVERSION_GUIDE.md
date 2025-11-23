# Audio Conversion Guide

This guide explains how to convert the text conversation scripts to audio files with different voices for doctor and patient.

---

## Method 1: Automated Script (Recommended) ✅

I've created two Python scripts to automatically convert the text files to audio:

### Option A: Google Text-to-Speech (FREE, Good Quality)
**File:** `convert_to_audio.py`

#### Setup:
```bash
# Install required packages
pip install gtts pydub

# Install ffmpeg (required for audio processing)
# Windows: Download from https://ffmpeg.org/download.html and add to PATH
# Mac: brew install ffmpeg
# Linux: sudo apt-get install ffmpeg
```

#### Usage:
```bash
cd test-recordings
python convert_to_audio.py
```

**Output:** Creates MP3 files in `audio_output/` folder
- Doctor voice: US English accent
- Patient voice: UK English accent (slightly different for distinction)

---

### Option B: ElevenLabs API (BEST Quality, FREE Tier Available)
**File:** `convert_to_audio_elevenlabs.py`

#### Setup:
1. **Get API Key:**
   - Go to https://elevenlabs.io/
   - Sign up for FREE account (10,000 characters/month)
   - Go to Profile → API Keys
   - Copy your API key

2. **Install packages:**
```bash
pip install pydub requests
```

3. **Configure script:**
   - Open `convert_to_audio_elevenlabs.py`
   - Replace `YOUR_API_KEY_HERE` with your actual API key
   - (Optional) Change voice IDs for different voices

#### Usage:
```bash
cd test-recordings
python convert_to_audio_elevenlabs.py
```

**Output:** Creates high-quality MP3 files in `audio_output/` folder
- Doctor voice: Adam (professional male voice)
- Patient voice: Bella (friendly female voice)

---

## Method 2: Manual Online Tools (No Coding)

### Using TTSMaker (Free, No Account Required)
1. Go to https://ttsmaker.com/
2. For each conversation file:
   - Copy all **Doctor's lines** (remove "Doctor:" labels)
   - Select "English (US)" and a male voice
   - Generate and download as MP3 → name it `patient1_doctor.mp3`
   - Copy all **Patient's lines** (remove "Patient:" labels)
   - Select "English (US)" and a female voice
   - Generate and download as MP3 → name it `patient1_patient.mp3`
3. Use audio editing software (Audacity, free) to combine them

### Using Natural Reader (Free Tier)
1. Go to https://www.naturalreaders.com/online/
2. Same process as TTSMaker above
3. Better voice quality but has character limits

---

## Method 3: Use ElevenLabs Web Interface (Easiest)

### Steps:
1. Go to https://elevenlabs.io/ and sign up (free)
2. Go to "Speech Synthesis" page
3. **For Doctor's lines:**
   - Select "Adam" voice (or any professional male voice)
   - Copy/paste ONLY the doctor's dialogue (without "Doctor:" labels)
   - Generate and download
   - Repeat for each chunk if text is too long
4. **For Patient's lines:**
   - Select "Bella" voice (or any female voice)
   - Copy/paste ONLY the patient's dialogue
   - Generate and download
5. **Combine audio files:**
   - Use online tool: https://audiotrimmer.com/audio-joiner/
   - OR use Audacity (free): https://www.audacityteam.org/

---

## Method 4: Quick Testing with Text Files

If you just want to test the system without audio:

1. I can help you use the **backend directly** to test the OpenAI clinical note generation
2. Create a simple test script that sends the formatted transcript directly
3. This bypasses AssemblyAI transcription (for testing only)

---

## Recommended Approach for You

Based on your use case, I recommend:

### **Option 1: ElevenLabs Python Script** (Best for production testing)
- Highest quality
- Fully automated
- Different realistic voices
- Free tier should be enough for all 4 conversations

### **Option 2: Google TTS Python Script** (Best if you want completely free)
- Good quality
- Fully automated
- No API keys needed
- Slightly less realistic than ElevenLabs

---

## Character Count Estimate

For your ElevenLabs quota planning:
- **Patient 1 (Ali Assad):** ~11,000 characters
- **Patient 2 (Maya Hassan):** ~10,500 characters
- **Patient 3 (Omar Khalil):** ~12,000 characters
- **Patient 4 (Layla Nasser):** ~11,500 characters

**Total:** ~45,000 characters

**Note:** Free ElevenLabs tier = 10,000 chars/month, so you'd need to:
- Process 1 conversation per month, OR
- Upgrade to paid tier ($5/month for 30,000 chars), OR
- Use Google TTS (unlimited and free)

---

## Troubleshooting

### "ModuleNotFoundError: No module named 'gtts'"
```bash
pip install gtts pydub requests
```

### "FileNotFoundError: [Errno 2] No such file or directory: 'ffmpeg'"
You need to install ffmpeg:
- **Windows:** Download from https://ffmpeg.org/download.html
  - Extract the zip
  - Add the `bin` folder to your system PATH
- **Mac:** `brew install ffmpeg`
- **Linux:** `sudo apt-get install ffmpeg`

### "ElevenLabs API error: 401"
Your API key is invalid. Get a new one from https://elevenlabs.io/

### "ElevenLabs API error: 429" or "quota exceeded"
You've used your monthly character limit. Wait until next month or upgrade your plan.

---

## What I Recommend RIGHT NOW

Since you want to test quickly, here's the fastest path:

1. **Install Python packages:**
```bash
pip install gtts pydub
```

2. **Install ffmpeg** (if you don't have it):
   - Windows: Download from https://ffmpeg.org/download.html
   - Or use Chocolatey: `choco install ffmpeg`

3. **Run the Google TTS script:**
```bash
cd "c:\AUB\fall 26\eece 503p\Project\Project\test-recordings"
python convert_to_audio.py
```

4. **Check the `audio_output` folder** for your MP3 files

5. **Upload them** using the new "Upload File" feature in the Visit Recorder!

This will work immediately with no API keys required, and the quality is good enough for testing your system.

---

## Need Help?

If you encounter any issues or want me to modify the scripts, just let me know!
