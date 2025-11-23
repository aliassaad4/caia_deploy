"""
Convert doctor-patient conversation scripts to audio files with different voices.

This script uses Google Text-to-Speech (free) or ElevenLabs API (better quality).
It automatically detects speaker labels and assigns different voices.

Requirements:
    pip install gtts pydub elevenlabs

Note: You need ffmpeg installed for pydub to work with MP3 files.
      Download from: https://ffmpeg.org/download.html
"""

import os
import re
from pathlib import Path
from gtts import gTTS
from pydub import AudioSegment
from pydub.playback import play
import time

# Configuration
DOCTOR_VOICE = "male"  # Google TTS doesn't have voice selection, but we can adjust
PATIENT_VOICE = "female"
OUTPUT_DIR = Path("audio_output")
PAUSE_DURATION = 500  # milliseconds between speakers

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

    # Split by lines and process
    for line in content.split('\n'):
        line = line.strip()
        if not line:
            continue

        # Check if line starts with speaker label
        if line.startswith('Doctor:'):
            # Save previous speaker's text
            if current_speaker and current_text:
                lines.append((current_speaker, ' '.join(current_text)))
                current_text = []
            current_speaker = 'Doctor'
            # Get text after "Doctor:"
            text = line.replace('Doctor:', '').strip()
            if text:
                current_text.append(text)
        elif line.startswith('Patient:'):
            # Save previous speaker's text
            if current_speaker and current_text:
                lines.append((current_speaker, ' '.join(current_text)))
                current_text = []
            current_speaker = 'Patient'
            # Get text after "Patient:"
            text = line.replace('Patient:', '').strip()
            if text:
                current_text.append(text)
        else:
            # Continuation of previous speaker
            if current_speaker:
                current_text.append(line)

    # Don't forget the last speaker
    if current_speaker and current_text:
        lines.append((current_speaker, ' '.join(current_text)))

    return lines


def text_to_speech_google(text, speaker, output_file):
    """
    Convert text to speech using Google TTS (free).
    """
    # Google TTS doesn't have true voice selection, but we can use different languages
    # or accents to differentiate
    if speaker == 'Doctor':
        # Use US English male-sounding accent
        tts = gTTS(text=text, lang='en', slow=False, tld='com')
    else:
        # Use UK English for different sound
        tts = gTTS(text=text, lang='en', slow=False, tld='co.uk')

    tts.save(output_file)
    return output_file


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

    for i, (speaker, text) in enumerate(conversation_lines):
        print(f"[{i+1}/{len(conversation_lines)}] {speaker}: {text[:50]}...")

        # Generate speech for this segment
        temp_file = temp_dir / f"segment_{i}_{speaker}.mp3"
        text_to_speech_google(text, speaker, str(temp_file))

        # Load and add to combined audio
        segment = AudioSegment.from_mp3(str(temp_file))
        combined += segment + pause

        # Clean up temp file
        temp_file.unlink()

    # Export final audio
    print(f"Exporting final audio to {output_file}...")
    combined.export(output_file, format="mp3")
    print(f"✓ Audio file created: {output_file}")

    # Clean up temp directory
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
    print("Doctor-Patient Conversation to Audio Converter")
    print("=" * 60)
    print()

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

    print(f"\n{'='*60}")
    print(f"All audio files saved in: {OUTPUT_DIR.absolute()}")
    print(f"{'='*60}")


if __name__ == "__main__":
    # Check if required libraries are installed
    try:
        import gtts
        import pydub
        print("✓ All required libraries are installed")
    except ImportError as e:
        print(f"✗ Missing required library: {e}")
        print("\nPlease install required libraries:")
        print("  pip install gtts pydub")
        print("\nAlso install ffmpeg:")
        print("  Windows: Download from https://ffmpeg.org/download.html")
        print("  Mac: brew install ffmpeg")
        print("  Linux: sudo apt-get install ffmpeg")
        exit(1)

    main()
