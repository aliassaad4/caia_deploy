"""
Convert patient5_meeting.txt to a single audio file using OpenAI TTS.
Generates individual segments, then combines them into one MP3.
"""

import os
from pathlib import Path
from openai import OpenAI

# Your OpenAI API key
API_KEY = "YOUR_OPENAI_API_KEY_HERE"

client = OpenAI(api_key=API_KEY)

# Voices
DOCTOR_VOICE = "onyx"   # Male professional
PATIENT_VOICE = "nova"  # Female warm

OUTPUT_DIR = Path("audio_output_simple")
COMBINED_DIR = Path("audio_output_combined")


def parse_conversation_file(file_path):
    """Parse conversation file."""
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
            if current_speaker and current_text:
                turns.append((current_speaker, ' '.join(current_text)))
                current_text = []
            current_speaker = "doctor"
            text = line.split(":", 1)[1].strip()
            if text:
                current_text.append(text)
        elif line.lower().startswith("patient:"):
            if current_speaker and current_text:
                turns.append((current_speaker, ' '.join(current_text)))
                current_text = []
            current_speaker = "patient"
            text = line.split(":", 1)[1].strip()
            if text:
                current_text.append(text)
        else:
            if current_speaker:
                current_text.append(line)

    if current_speaker and current_text:
        turns.append((current_speaker, ' '.join(current_text)))

    return turns


def generate_audio_segment(text, voice, output_file):
    """Generate a single audio segment."""
    try:
        response = client.audio.speech.create(
            model="tts-1",
            voice=voice,
            input=text,
            response_format="mp3"
        )

        # Save to file
        with open(output_file, 'wb') as f:
            f.write(response.content)

        return True
    except Exception as e:
        print(f"  [ERROR] {str(e)}")
        return False


def combine_mp3_files(input_dir, output_file):
    """Combine multiple MP3 files into one by concatenating them."""
    mp3_files = sorted(input_dir.glob("*.mp3"))

    if not mp3_files:
        print(f"  [ERROR] No MP3 files found in {input_dir}")
        return False

    print(f"  Found {len(mp3_files)} audio segments to combine")

    # Combine files by concatenating binary data
    with open(output_file, 'wb') as outfile:
        for i, mp3_file in enumerate(mp3_files, 1):
            print(f"  [{i}/{len(mp3_files)}] Adding {mp3_file.name}...")
            with open(mp3_file, 'rb') as infile:
                outfile.write(infile.read())

    # Get file size
    file_size_mb = output_file.stat().st_size / 1024 / 1024
    print(f"  [OK] Combined file size: {file_size_mb:.2f} MB")

    return True


def main():
    print("="*60)
    print("Patient 5 Conversation to Audio Converter")
    print("Using OpenAI Text-to-Speech API")
    print("="*60)
    print()

    # Create output directories
    OUTPUT_DIR.mkdir(exist_ok=True)
    COMBINED_DIR.mkdir(exist_ok=True)

    # Process patient5_meeting.txt
    conv_file = Path("patient5_meeting.txt")

    if not conv_file.exists():
        print(f"[ERROR] {conv_file} not found!")
        return

    print(f"Processing: {conv_file.name}")
    print("-"*60)

    # Parse
    turns = parse_conversation_file(conv_file)
    print(f"Found {len(turns)} conversation segments\n")

    # Create subfolder for this conversation
    conv_output_dir = OUTPUT_DIR / conv_file.stem
    conv_output_dir.mkdir(exist_ok=True)

    # Generate each segment
    for idx, (speaker, text) in enumerate(turns, start=1):
        print(f"[{idx}/{len(turns)}] {speaker.upper()}: {text[:50]}...")

        voice = DOCTOR_VOICE if speaker == "doctor" else PATIENT_VOICE
        output_file = conv_output_dir / f"{idx:03d}_{speaker}.mp3"

        if generate_audio_segment(text, voice, output_file):
            print(f"  [OK] Saved to {output_file.name}")

    print(f"\n[OK] All segments generated!")
    print(f"     Segments saved in: {conv_output_dir}")

    # Combine into one file
    print(f"\nCombining segments into single audio file...")
    print("-"*60)

    combined_file = COMBINED_DIR / "patient5_meeting.mp3"
    if combine_mp3_files(conv_output_dir, combined_file):
        print(f"\n{'='*60}")
        print(f"SUCCESS! Final audio file created:")
        print(f"  {combined_file.absolute()}")
        print(f"{'='*60}")
    else:
        print(f"\n[ERROR] Failed to combine audio segments")


if __name__ == "__main__":
    main()
