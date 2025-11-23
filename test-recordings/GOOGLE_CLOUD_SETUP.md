# Google Cloud Multi-Speaker TTS Setup Guide

This is the **BEST** option for converting your doctor-patient conversations to audio because:
- ✅ Natural conversation flow between speakers
- ✅ Realistic voice transitions
- ✅ Single API call generates entire conversation
- ✅ High-quality Studio voices
- ✅ **FREE tier**: $0 for first 4 million characters/month

---

## Step 1: Create Google Cloud Account

1. Go to: **https://console.cloud.google.com/**
2. Sign in with your Google account (or create one)
3. **New users get $300 free credits** for 90 days!

---

## Step 2: Create a Project

1. In Google Cloud Console, click **"Select a project"** at the top
2. Click **"NEW PROJECT"**
3. Project name: `CAIA-Clinic-TTS` (or any name you want)
4. Click **"CREATE"**
5. Wait a few seconds, then **select your new project**

---

## Step 3: Enable Text-to-Speech API

1. In the search bar at the top, type: **"Text-to-Speech API"**
2. Click on **"Cloud Text-to-Speech API"**
3. Click **"ENABLE"** button
4. Wait for it to enable (takes ~30 seconds)

---

## Step 4: Create Service Account & Download Credentials

### 4.1 Create Service Account:
1. In the left sidebar, go to: **IAM & Admin** → **Service Accounts**
   - Or use this link: https://console.cloud.google.com/iam-admin/serviceaccounts
2. Click **"+ CREATE SERVICE ACCOUNT"** at the top
3. Fill in:
   - **Service account name:** `tts-service-account`
   - **Service account ID:** (auto-filled)
   - **Description:** `Service account for Text-to-Speech API`
4. Click **"CREATE AND CONTINUE"**

### 4.2 Grant Permissions:
1. Under "Grant this service account access to project":
   - **Select a role:** Search for and select **"Cloud Text-to-Speech User"**
2. Click **"CONTINUE"**
3. Click **"DONE"**

### 4.3 Download JSON Key:
1. Find your newly created service account in the list
2. Click on the **three dots (⋮)** on the right → **"Manage keys"**
3. Click **"ADD KEY"** → **"Create new key"**
4. Choose **"JSON"**
5. Click **"CREATE"**
6. A JSON file will download automatically → **Save it somewhere safe!**
   - Example: `C:\Users\YourName\Documents\caia-clinic-tts-key.json`

---

## Step 5: Set Up Environment Variable

You need to tell Python where your credentials file is.

### Option A: Set Permanently (Recommended)

**Windows:**
1. Press `Win + R`, type `sysdm.cpl`, press Enter
2. Go to **"Advanced"** tab → **"Environment Variables"**
3. Under **"User variables"**, click **"New"**
4. Variable name: `GOOGLE_APPLICATION_CREDENTIALS`
5. Variable value: `C:\Users\YourName\Documents\caia-clinic-tts-key.json` (your actual path)
6. Click **OK** on all windows
7. **Restart your terminal/IDE**

### Option B: Set for Current Session Only

**PowerShell:**
```powershell
$env:GOOGLE_APPLICATION_CREDENTIALS="C:\Users\YourName\Documents\caia-clinic-tts-key.json"
```

**Command Prompt:**
```cmd
set GOOGLE_APPLICATION_CREDENTIALS=C:\Users\YourName\Documents\caia-clinic-tts-key.json
```

**Mac/Linux:**
```bash
export GOOGLE_APPLICATION_CREDENTIALS="/path/to/caia-clinic-tts-key.json"
```

---

## Step 6: Install Required Python Package

```bash
pip install google-cloud-texttospeech
```

---

## Step 7: Run the Conversion Script

```bash
cd "c:\AUB\fall 26\eece 503p\Project\Project\test-recordings"
python convert_google_multispeaker.py
```

This will:
1. Parse all `patient*_meeting.txt` files
2. Separate doctor/patient dialogue
3. Generate multi-speaker audio with Google Cloud TTS
4. Save MP3 files in `audio_output/` folder

---

## Pricing Information

### Free Tier (More than enough for your project!)
- **Standard voices:** 0-4 million characters/month = **FREE**
- **Studio voices:** 0-1 million characters/month = **FREE**

### Your Project Usage Estimate:
- Patient 1: ~11,000 characters
- Patient 2: ~10,500 characters
- Patient 3: ~12,000 characters
- Patient 4: ~11,500 characters
- **Total: ~45,000 characters**

✅ **This is FREE!** You're using ~4.5% of the free tier.

### Beyond Free Tier:
- Standard voices: $4 per 1 million characters
- Studio voices: $16 per 1 million characters

---

## Verify Your Setup

Test if everything is working:

```bash
cd test-recordings
python -c "from google.cloud import texttospeech_v1beta1; print('✓ Library installed successfully!')"
```

If you see the checkmark, you're good to go!

---

## Troubleshooting

### Error: "Could not automatically determine credentials"
**Solution:** Your `GOOGLE_APPLICATION_CREDENTIALS` environment variable is not set correctly.
- Double-check the file path
- Make sure you restarted your terminal after setting it
- Try setting it again using the commands above

### Error: "Permission denied" or "403 Forbidden"
**Solution:** Your service account doesn't have the right permissions.
- Go back to IAM & Admin → Service Accounts
- Make sure the account has "Cloud Text-to-Speech User" role

### Error: "API has not been used in project"
**Solution:** You haven't enabled the Text-to-Speech API yet.
- Go to: https://console.cloud.google.com/apis/library/texttospeech.googleapis.com
- Click "ENABLE"

### Error: "Quota exceeded"
**Solution:** You've used your free tier (unlikely for 4 conversations).
- Check your usage: https://console.cloud.google.com/apis/api/texttospeech.googleapis.com/quotas
- Upgrade to paid tier if needed (still very cheap)

---

## Alternative: Quick Test Without Setup

If you just want to test quickly without setting up Google Cloud, use the simpler Google TTS script I created earlier:

```bash
python convert_to_audio.py
```

This uses a different Google TTS library that doesn't require credentials, but:
- ❌ No multi-speaker support (you get separate files)
- ❌ Lower quality voices
- ✅ But it's FREE and works immediately!

---

## What You'll Get

After running the script successfully, you'll have:
- `audio_output/patient1_meeting.mp3` (~15-20 minutes)
- `audio_output/patient2_meeting.mp3` (~18 minutes)
- `audio_output/patient3_meeting.mp3` (~22 minutes)
- `audio_output/patient4_meeting.mp3` (~20 minutes)

Each file will have:
- Natural-sounding doctor voice (Speaker R)
- Natural-sounding patient voice (Speaker S)
- Smooth transitions between speakers
- Professional audio quality

---

## Next Steps After Generating Audio

1. Test one file first to verify quality
2. Upload it using the **"Upload File (Testing)"** feature in your app
3. Watch it get transcribed by AssemblyAI
4. Verify clinical note generation by OpenAI
5. Check approval queue for notes and patient profile updates

---

## Need Help?

If you get stuck at any point, let me know which step and I'll help you troubleshoot!
