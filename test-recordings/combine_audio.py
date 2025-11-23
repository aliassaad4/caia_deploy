"""
Combine individual audio segments into a single conversation file.
Works WITHOUT ffmpeg by simply concatenating MP3 files.
"""

import os
from pathlib import Path

OUTPUT_DIR = Path("audio_output_simple")
COMBINED_DIR = Path("audio_output_combined")


def combine_mp3_files(input_dir, output_file):
    """
    Combine multiple MP3 files into one by concatenating them.
    This works for MP3 files without needing ffmpeg.
    """
    # Get all MP3 files in order
    mp3_files = sorted(input_dir.glob("*.mp3"))

    if not mp3_files:
        print(f"  [ERROR] No MP3 files found in {input_dir}")
        return False

    print(f"  Found {len(mp3_files)} audio segments")

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
    print("Audio Combiner - Merge conversation segments")
    print("="*60)
    print()

    # Create output directory
    COMBINED_DIR.mkdir(exist_ok=True)

    # Process only patient 1 and patient 2 as requested
    target_folders = ["patient1_meeting", "patient2_meeting"]
    conversation_folders = [OUTPUT_DIR / folder_name for folder_name in target_folders if (OUTPUT_DIR / folder_name).exists()]

    if not conversation_folders:
        print(f"[ERROR] No conversation folders found in {OUTPUT_DIR}")
        print("Please run convert_simple.py first!")
        return

    print(f"Processing {len(conversation_folders)} conversation(s) (Patient 1 and Patient 2 only):\n")
    for folder in conversation_folders:
        print(f"  - {folder.name}")
    print()

    # Process each conversation
    for conv_folder in conversation_folders:
        print(f"\nProcessing: {conv_folder.name}")
        print("-"*60)

        output_file = COMBINED_DIR / f"{conv_folder.name}.mp3"

        if combine_mp3_files(conv_folder, output_file):
            print(f"  [OK] Saved to: {output_file}")
        else:
            print(f"  [X] Failed to combine {conv_folder.name}")

    print(f"\n{'='*60}")
    print(f"All combined files saved in: {COMBINED_DIR.absolute()}")
    print(f"{'='*60}")


if __name__ == "__main__":
    main()
