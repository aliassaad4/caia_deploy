import { AssemblyAI, Transcript } from 'assemblyai';
import FormData from 'form-data';
import axios from 'axios';
import fs from 'fs';

console.log('AssemblyAI API Key from env:', process.env.ASSEMBLYAI_API_KEY?.substring(0, 10) + '...');

const client = new AssemblyAI({
  apiKey: process.env.ASSEMBLYAI_API_KEY || '',
});

export interface TranscriptResult {
  text: string;
  words: Array<{
    text: string;
    start: number;
    end: number;
    speaker: string | null;
  }>;
  utterances: Array<{
    speaker: string;
    text: string;
    start: number;
    end: number;
  }>;
  confidence: number;
}

/**
 * Transcribe audio with speaker diarization
 * @param audioUrl - URL to audio file or file buffer
 * @returns Transcript with speaker identification
 */
export async function transcribeAudio(
  audioUrl: string
): Promise<TranscriptResult> {
  try {
    console.log('Starting transcription with AssemblyAI...');

    // Configure transcription with speaker diarization
    const params = {
      audio: audioUrl,
      speaker_labels: true,
      speakers_expected: 2, // Doctor + Patient
      punctuate: true,
      format_text: true,
    };

    // Create transcript
    const transcript = await client.transcripts.transcribe(params);

    if (transcript.status === 'error') {
      throw new Error(`Transcription failed: ${transcript.error}`);
    }

    console.log('Transcription completed successfully');

    // Extract words with speaker labels
    const words = (transcript.words || []).map((word) => ({
      text: word.text,
      start: word.start,
      end: word.end,
      speaker: word.speaker ? `Speaker ${word.speaker}` : null,
    }));

    // Extract utterances (speaker turns)
    const utterances = (transcript.utterances || []).map((utterance) => ({
      speaker: `Speaker ${utterance.speaker}`,
      text: utterance.text,
      start: utterance.start,
      end: utterance.end,
    }));

    return {
      text: transcript.text || '',
      words,
      utterances,
      confidence: transcript.confidence || 0,
    };
  } catch (error: any) {
    console.error('AssemblyAI transcription error:', error);
    throw new Error(`Failed to transcribe audio: ${error.message}`);
  }
}

/**
 * Upload audio file to storage and get URL for AssemblyAI
 * @param audioBuffer - Audio file buffer
 * @returns URL to uploaded audio
 */
export async function uploadAudioForTranscription(
  audioBuffer: Buffer
): Promise<string> {
  try {
    console.log('Uploading audio to AssemblyAI...');
    console.log('ASSEMBLYAI_API_KEY at upload time:', process.env.ASSEMBLYAI_API_KEY?.substring(0, 30) + '...');

    // AssemblyAI provides an upload endpoint
    const uploadUrl = 'https://api.assemblyai.com/v2/upload';

    const response = await axios.post(uploadUrl, audioBuffer, {
      headers: {
        authorization: process.env.ASSEMBLYAI_API_KEY,
        'Content-Type': 'application/octet-stream',
      },
    });

    console.log('Audio uploaded successfully:', response.data.upload_url);
    return response.data.upload_url;
  } catch (error: any) {
    console.error('Audio upload error:', error);
    throw new Error(`Failed to upload audio: ${error.message}`);
  }
}

/**
 * Format transcript for GPT processing
 * Organizes by speaker turns
 */
export function formatTranscriptForGPT(result: TranscriptResult): string {
  let formatted = 'TRANSCRIPT WITH SPEAKER DIARIZATION:\n\n';

  for (const utterance of result.utterances) {
    const timestamp = formatTime(utterance.start);
    formatted += `[${timestamp}] ${utterance.speaker}: ${utterance.text}\n\n`;
  }

  formatted += `\n---\nTranscription Confidence: ${(result.confidence * 100).toFixed(1)}%`;

  return formatted;
}

function formatTime(milliseconds: number): string {
  const totalSeconds = Math.floor(milliseconds / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}
