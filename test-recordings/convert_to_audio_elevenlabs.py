"""
Convert doctor-patient conversation scripts to audio using ElevenLabs API.
This produces MUCH better quality audio than Google TTS.

Requirements:
    pip install elevenlabs pydub requests

Get API key from: https://elevenlabs.io/
Free tier: 10,000 characters/month
"""

import os
import re
from pathlib import Path
from pydub import AudioSegment
import requests
import time

# Configuration
ELEVENLABS_API_KEY = "YOUR_API_KEY_HERE"  # Replace with your ElevenLabs API key

# Voice IDs from ElevenLabs (these are default voices, you can change them)
DOCTOR_VOICE_ID = "pNInz6obpgDQGcFmaJgB"  # Adam (male, professional)
PATIENT_VOICE_ID = "EXAVITQu4vr4xnSDxMaL"  # Bella (female, friendly)

# Alternative voice suggestions:
# Male voices: "pNInz6obpgDQGcFmaJgB" (Adam), "TxGEqnHWrfWFTfGW9XjX" (Josh)
# Female voices: "EXAVITQu4vr4xnSDxMaL" (Bella), "21m00Tcm4TlvDq8ikWAM" (Rachel)

OUTPUT_DIR = Path("audio_output")
PAUSE_DURATION = 500  # milliseconds between speakers
API_URL = "https://api.elevenlabs.io/v1/text-to-speech"


def parse_conversation(file_path):
    """
    Parse conversation file and extract doctor/patient lines.
    Returns list of tuples: [(speaker, text), ...]
    """
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()

    lines = []
    current_speaker = None
    current_text = []

    for line in content.split('\n'):
        line = line.strip()
        if not line:
            continue

        if line.startswith('Doctor:'):
            if current_speaker and current_text:
                lines.append((current_speaker, ' '.join(current_text)))
                current_text = []
            current_speaker = 'Doctor'
            text = line.replace('Doctor:', '').strip()
            if text:
                current_text.append(text)
        elif line.startswith('Patient:'):
            if current_speaker and current_text:
                lines.append((current_speaker, ' '.join(current_text)))
                current_text = []
            current_speaker = 'Patient'
            text = line.replace('Patient:', '').strip()
            if text:
                current_text.append(text)
        else:
            if current_speaker:
                current_text.append(line)

    if current_speaker and current_text:
        lines.append((current_speaker, ' '.join(current_text)))

    return lines


def text_to_speech_elevenlabs(text, voice_id, output_file):
    """
    Convert text to speech using ElevenLabs API.
    """
    url = f"{API_URL}/{voice_id}"

    headers = {
        "Accept": "audio/mpeg",
        "Content-Type": "application/json",
        "xi-api-key": ELEVENLABS_API_KEY
    }

    data = {
        "text": text,
        "model_id": "eleven_monolingual_v1",
        "voice_settings": {
            "stability": 0.5,
            "similarity_boost": 0.75
        }
    }

    response = requests.post(url, json=data, headers=headers)

    if response.status_code == 200:
        with open(output_file, 'wb') as f:
            f.write(response.content)
        return output_file
    else:
        raise Exception(f"ElevenLabs API error: {response.status_code} - {response.text}")


def combine_audio_segments(conversation_lines, output_file):
    """
    Generate audio for each line and combine them with pauses.
    """
    OUTPUT_DIR.mkdir(exist_ok=True)
    temp_dir = OUTPUT_DIR / "temp"
    temp_dir.mkdir(exist_ok=True)

    combined = AudioSegment.empty()
    pause = AudioSegment.silent(duration=PAUSE_DURATION)

    print(f"Processing {len(conversation_lines)} conversation segments...")

    total_chars = sum(len(text) for _, text in conversation_lines)
    print(f"Total characters: {total_chars} (using {total_chars} of your ElevenLabs quota)")

    for i, (speaker, text) in enumerate(conversation_lines):
        print(f"[{i+1}/{len(conversation_lines)}] {speaker}: {text[:60]}... ({len(text)} chars)")

        # Choose voice based on speaker
        voice_id = DOCTOR_VOICE_ID if speaker == 'Doctor' else PATIENT_VOICE_ID

        # Generate speech for this segment
        temp_file = temp_dir / f"segment_{i}_{speaker}.mp3"

        try:
            text_to_speech_elevenlabs(text, voice_id, str(temp_file))

            # Load and add to combined audio
            segment = AudioSegment.from_mp3(str(temp_file))
            combined += segment + pause

            # Clean up temp file
            temp_file.unlink()

            # Small delay to respect rate limits
            time.sleep(0.1)

        except Exception as e:
            print(f"  ✗ Error: {str(e)}")
            if "quota" in str(e).lower():
                print("\n  Your ElevenLabs quota may be exceeded.")
                print("  Check your usage at: https://elevenlabs.io/")
                raise

    # Export final audio
    print(f"Exporting final audio to {output_file}...")
    combined.export(output_file, format="mp3")
    print(f"✓ Audio file created: {output_file}")

    # Clean up temp directory
    if temp_dir.exists():
        temp_dir.rmdir()

    return output_file


def process_conversation_file(input_file):
    """
    Process a single conversation file and generate audio.
    """
    print(f"\n{'='*60}")
    print(f"Processing: {input_file.name}")
    print(f"{'='*60}\n")

    # Parse conversation
    conversation = parse_conversation(input_file)
    print(f"Found {len(conversation)} conversation segments")

    # Generate output filename
    output_file = OUTPUT_DIR / f"{input_file.stem}.mp3"

    # Generate audio
    combine_audio_segments(conversation, str(output_file))

    return output_file


def main():
    """
    Main function to process all conversation files.
    """
    print("Doctor-Patient Conversation to Audio Converter (ElevenLabs)")
    print("=" * 60)
    print()

    # Check API key
    if ELEVENLABS_API_KEY == "YOUR_API_KEY_HERE":
        print("ERROR: Please set your ElevenLabs API key in the script!")
        print("\n1. Go to: https://elevenlabs.io/")
        print("2. Sign up for free account")
        print("3. Get your API key from profile settings")
        print("4. Replace 'YOUR_API_KEY_HERE' in this script with your key")
        return

    # Find all patient meeting files
    conversation_files = list(Path('.').glob('patient*_meeting.txt'))

    if not conversation_files:
        print("ERROR: No conversation files found!")
        print("Please make sure you have files named like 'patient1_meeting.txt'")
        return

    print(f"Found {len(conversation_files)} conversation file(s):")
    for f in conversation_files:
        print(f"  - {f.name}")
    print()

    # Process each file
    for conv_file in conversation_files:
        try:
            output = process_conversation_file(conv_file)
            print(f"✓ Success! Created: {output}")
        except Exception as e:
            print(f"✗ Error processing {conv_file.name}: {str(e)}")
            import traceback
            traceback.print_exc()

            if "quota" in str(e).lower():
                print("\nStopping due to quota limit.")
                break

    print(f"\n{'='*60}")
    print(f"All audio files saved in: {OUTPUT_DIR.absolute()}")
    print(f"{'='*60}")


if __name__ == "__main__":
    # Check if required libraries are installed
    try:
        import pydub
        import requests
        print("✓ All required libraries are installed\n")
    except ImportError as e:
        print(f"✗ Missing required library: {e}")
        print("\nPlease install required libraries:")
        print("  pip install pydub requests")
        print("\nAlso install ffmpeg:")
        print("  Windows: Download from https://ffmpeg.org/download.html")
        print("  Mac: brew install ffmpeg")
        print("  Linux: sudo apt-get install ffmpeg")
        exit(1)

    main()
