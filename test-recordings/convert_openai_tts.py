"""
Convert doctor-patient conversation to audio using OpenAI TTS API.
Uses different voices for doctor and patient for natural conversation.

Requirements:
    pip install openai pydub
"""

import os
import io
import textwrap
from pathlib import Path
from openai import OpenAI
from pydub import AudioSegment

# =========================
# CONFIG
# =========================
# Your OpenAI API key - REPLACE THIS with your actual key
API_KEY = "YOUR_OPENAI_API_KEY_HERE"

if not API_KEY or API_KEY.startswith("YOUR_"):
    raise SystemExit("❌ Please set your OpenAI API key in the script!")

client = OpenAI(api_key=API_KEY)

# OpenAI TTS available voices: alloy, echo, fable, onyx, nova, shimmer
# Doctor voice (professional, clear)
DOCTOR_VOICE = "onyx"     # Male, professional voice
# Patient voice (friendly, conversational)
PATIENT_VOICE = "nova"    # Female, warm voice

OUTPUT_DIR = Path("audio_output")
PAUSE_BETWEEN_SPEAKERS = 800  # milliseconds


# =========================
# HELPERS
# =========================

def parse_conversation_file(file_path):
    """
    Parse conversation file and extract doctor/patient lines.
    Returns list of tuples: [(speaker, text), ...]
    """
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()

    turns = []
    current_speaker = None
    current_text = []

    for line in content.splitlines():
        line = line.strip()
        if not line:
            continue

        if line.lower().startswith("doctor:"):
            # Save previous speaker's text
            if current_speaker and current_text:
                turns.append((current_speaker, ' '.join(current_text)))
                current_text = []
            current_speaker = "doctor"
            text = line.split(":", 1)[1].strip()
            if text:
                current_text.append(text)
        elif line.lower().startswith("patient:"):
            # Save previous speaker's text
            if current_speaker and current_text:
                turns.append((current_speaker, ' '.join(current_text)))
                current_text = []
            current_speaker = "patient"
            text = line.split(":", 1)[1].strip()
            if text:
                current_text.append(text)
        else:
            # Continuation of previous speaker
            if current_speaker:
                current_text.append(line)

    # Don't forget the last speaker
    if current_speaker and current_text:
        turns.append((current_speaker, ' '.join(current_text)))

    return turns


def text_to_speech(text, voice):
    """
    Convert text to speech using OpenAI TTS API.
    Handles long text by chunking if necessary.
    """
    # OpenAI TTS can handle up to 4096 characters per request
    # If text is longer, split it into chunks
    max_chars = 4000

    if len(text) <= max_chars:
        chunks = [text]
    else:
        # Split into sentences and group them
        chunks = textwrap.wrap(text, width=max_chars, break_long_words=False, break_on_hyphens=False)

    audio = AudioSegment.silent(duration=0)

    for chunk in chunks:
        try:
            response = client.audio.speech.create(
                model="tts-1",  # or "tts-1-hd" for higher quality (costs more)
                voice=voice,
                input=chunk,
                response_format="mp3"
            )

            # Read audio data
            audio_bytes = response.read()
            segment = AudioSegment.from_file(io.BytesIO(audio_bytes), format="mp3")
            audio += segment

            # Small pause between chunks of same speaker
            if len(chunks) > 1:
                audio += AudioSegment.silent(duration=200)

        except Exception as e:
            print(f"  [WARNING]  Error generating audio for chunk: {str(e)}")
            continue

    return audio


def convert_conversation_to_audio(input_file, output_file):
    """
    Convert a conversation file to audio with different voices.
    """
    print(f"\n{'='*60}")
    print(f"Processing: {input_file.name}")
    print(f"{'='*60}\n")

    # Parse conversation
    print(" Parsing dialogue...")
    turns = parse_conversation_file(input_file)
    print(f"[OK] Found {len(turns)} conversation segments\n")

    # Generate audio for each turn
    final_audio = AudioSegment.silent(duration=500)  # Start with small silence
    pause = AudioSegment.silent(duration=PAUSE_BETWEEN_SPEAKERS)

    for idx, (speaker, text) in enumerate(turns, start=1):
        # Show progress
        print(f" [{idx}/{len(turns)}] {speaker.upper()}: {text[:60]}...")

        # Choose voice
        voice = DOCTOR_VOICE if speaker == "doctor" else PATIENT_VOICE

        # Generate speech
        try:
            segment = text_to_speech(text, voice)
            final_audio += segment + pause
            print(f"   [OK] Generated ({len(segment)/1000:.1f}s)")
        except Exception as e:
            print(f"   [X] Error: {str(e)}")
            continue

    # Export final audio
    print(f"\n Exporting to {output_file}...")
    final_audio.export(str(output_file), format="mp3")

    duration_minutes = len(final_audio) / 1000 / 60
    file_size_mb = output_file.stat().st_size / 1024 / 1024

    print(f"[OK] Audio file created!")
    print(f"  Duration: {duration_minutes:.1f} minutes")
    print(f"  File size: {file_size_mb:.2f} MB")
    print(f"  Location: {output_file}")

    return output_file


def main():
    """
    Main function to process all conversation files.
    """
    print("=" * 60)
    print("Doctor-Patient Conversation to Audio Converter")
    print("Using OpenAI Text-to-Speech API")
    print("=" * 60)
    print()

    # Create output directory
    OUTPUT_DIR.mkdir(exist_ok=True)

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

    print(f"Voice settings:")
    print(f"  Doctor: {DOCTOR_VOICE}")
    print(f"  Patient: {PATIENT_VOICE}")
    print()

    # Process each file
    success_count = 0
    for conv_file in conversation_files:
        try:
            output_file = OUTPUT_DIR / f"{conv_file.stem}.mp3"
            convert_conversation_to_audio(conv_file, output_file)
            success_count += 1
        except Exception as e:
            print(f"\n[X] Error processing {conv_file.name}: {str(e)}")
            import traceback
            traceback.print_exc()
            print()

    print(f"\n{'='*60}")
    print(f"Completed: {success_count}/{len(conversation_files)} files converted")
    print(f"Audio files saved in: {OUTPUT_DIR.absolute()}")
    print(f"{'='*60}")


if __name__ == "__main__":
    # Check if required libraries are installed
    try:
        from openai import OpenAI
        from pydub import AudioSegment
        print("[OK] Required libraries are installed\n")
    except ImportError as e:
        print(f"[ERROR] Missing required library: {e}")
        print("\nPlease install:")
        print("  pip install openai pydub")
        exit(1)

    main()
