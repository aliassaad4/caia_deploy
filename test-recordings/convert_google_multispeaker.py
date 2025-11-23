"""
Convert doctor-patient conversation scripts to audio using Google Cloud Multi-Speaker TTS.
This is the BEST option - natural conversation flow with different voices in one file!

Setup Instructions:
1. Create a Google Cloud account: https://console.cloud.google.com/
2. Enable Cloud Text-to-Speech API
3. Create a service account and download JSON key
4. Set environment variable: GOOGLE_APPLICATION_CREDENTIALS=path/to/key.json
5. Install: pip install google-cloud-texttospeech

Requirements:
    pip install google-cloud-texttospeech
"""

from pathlib import Path
from google.cloud import texttospeech_v1beta1 as texttospeech


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


def create_multispeaker_markup(conversation_lines):
    """
    Create Google Cloud Multi-Speaker Markup from conversation lines.

    Args:
        conversation_lines: List of (speaker, text) tuples

    Returns:
        MultiSpeakerMarkup object
    """
    turns = []

    for speaker, text in conversation_lines:
        # Use 'R' for Doctor (Role/Doctor), 'S' for Patient (Subject/Patient)
        # Or use actual names if you prefer
        speaker_code = 'R' if speaker == 'Doctor' else 'S'

        turn = texttospeech.MultiSpeakerMarkup.Turn(
            text=text,
            speaker=speaker_code
        )
        turns.append(turn)

    return texttospeech.MultiSpeakerMarkup(turns=turns)


def convert_to_audio(input_file, output_file):
    """
    Convert a conversation file to multi-speaker audio using Google Cloud TTS.

    Args:
        input_file: Path to input text file
        output_file: Path to output MP3 file
    """
    print(f"\n{'='*60}")
    print(f"Processing: {input_file.name}")
    print(f"{'='*60}\n")

    # Parse conversation
    conversation = parse_conversation(input_file)
    print(f"Found {len(conversation)} conversation segments")

    # Create multi-speaker markup
    multi_speaker_markup = create_multispeaker_markup(conversation)

    # Instantiate client
    print("Connecting to Google Cloud Text-to-Speech API...")
    client = texttospeech.TextToSpeechClient()

    # Set the text input to be synthesized
    synthesis_input = texttospeech.SynthesisInput(
        multi_speaker_markup=multi_speaker_markup
    )

    # Build the voice request - use the multi-speaker voice
    voice = texttospeech.VoiceSelectionParams(
        language_code="en-US",
        name="en-US-Studio-MultiSpeaker"
    )

    # Select the audio file type (MP3)
    audio_config = texttospeech.AudioConfig(
        audio_encoding=texttospeech.AudioEncoding.MP3
    )

    # Perform the text-to-speech request
    print("Generating audio... (this may take a minute)")
    response = client.synthesize_speech(
        input=synthesis_input,
        voice=voice,
        audio_config=audio_config
    )

    # Write the response to the output file
    with open(output_file, "wb") as out:
        out.write(response.audio_content)

    print(f"✓ Audio content written to: {output_file}")
    print(f"  File size: {len(response.audio_content) / 1024 / 1024:.2f} MB")

    return output_file


def main():
    """
    Main function to process all conversation files.
    """
    print("=" * 60)
    print("Doctor-Patient Conversation to Audio Converter")
    print("Using Google Cloud Multi-Speaker Text-to-Speech")
    print("=" * 60)
    print()

    # Check if credentials are set
    import os
    if 'GOOGLE_APPLICATION_CREDENTIALS' not in os.environ:
        print("⚠️  WARNING: GOOGLE_APPLICATION_CREDENTIALS not set!")
        print("\nPlease set up Google Cloud credentials:")
        print("1. Go to: https://console.cloud.google.com/")
        print("2. Create a project (or use existing)")
        print("3. Enable 'Cloud Text-to-Speech API'")
        print("4. Create Service Account → Download JSON key")
        print("5. Set environment variable:")
        print("   Windows (PowerShell):")
        print('     $env:GOOGLE_APPLICATION_CREDENTIALS="C:\\path\\to\\key.json"')
        print("   Windows (CMD):")
        print('     set GOOGLE_APPLICATION_CREDENTIALS=C:\\path\\to\\key.json')
        print("   Mac/Linux:")
        print('     export GOOGLE_APPLICATION_CREDENTIALS="/path/to/key.json"')
        print("\nOr run this script with credentials path:")
        print("   python script.py --credentials path/to/key.json")
        print()

        # Ask if they want to proceed anyway (might have default credentials)
        response = input("Do you want to try anyway? (y/n): ")
        if response.lower() != 'y':
            return

    # Create output directory
    output_dir = Path("audio_output")
    output_dir.mkdir(exist_ok=True)

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
    success_count = 0
    for conv_file in conversation_files:
        try:
            output_file = output_dir / f"{conv_file.stem}.mp3"
            convert_to_audio(conv_file, output_file)
            success_count += 1
        except Exception as e:
            print(f"✗ Error processing {conv_file.name}: {str(e)}")
            import traceback
            traceback.print_exc()
            print()

    print(f"\n{'='*60}")
    print(f"Completed: {success_count}/{len(conversation_files)} files converted")
    print(f"Audio files saved in: {output_dir.absolute()}")
    print(f"{'='*60}")


if __name__ == "__main__":
    # Check if required library is installed
    try:
        from google.cloud import texttospeech_v1beta1 as texttospeech
        print("✓ google-cloud-texttospeech library is installed\n")
    except ImportError:
        print("✗ Missing required library!")
        print("\nPlease install:")
        print("  pip install google-cloud-texttospeech")
        exit(1)

    main()
