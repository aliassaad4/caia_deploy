"""
Simple converter - generates audio WITHOUT ffmpeg dependency.
This creates separate files for each speaker line, then you can combine manually or use online tools.
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


def main():
    print("="*60)
    print("OpenAI TTS Converter (Simple Version - No ffmpeg needed)")
    print("="*60)
    print()

    # Create output directory
    OUTPUT_DIR.mkdir(exist_ok=True)

    # Find conversation files
    conversation_files = list(Path('.').glob('patient*_meeting.txt'))

    if not conversation_files:
        print("[ERROR] No conversation files found!")
        return

    print(f"Found {len(conversation_files)} file(s)\n")

    # Process each file
    for conv_file in conversation_files:
        print(f"\nProcessing: {conv_file.name}")
        print("-"*60)

        # Parse
        turns = parse_conversation_file(conv_file)
        print(f"Found {len(turns)} segments")

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

        print(f"\n[OK] Completed {conv_file.stem}")
        print(f"     Files saved in: {conv_output_dir}")

    print(f"\n{'='*60}")
    print(f"All audio segments saved in: {OUTPUT_DIR.absolute()}")
    print(f"{'='*60}")
    print()
    print("NOTE: Each line is a separate MP3 file.")
    print("To combine them into one file:")
    print("1. Use online tool: https://audiotrimmer.com/audio-joiner/")
    print("2. Or install ffmpeg and use the full script")


if __name__ == "__main__":
    main()
