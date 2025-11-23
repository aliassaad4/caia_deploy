import React, { useState, useRef } from 'react';
import axios from 'axios';
import './VisitRecorder.css';

const API_URL = 'http://localhost:3000/api';

interface VisitRecorderProps {
  visitId: string;
  patientName: string;
  token: string;
  onComplete: () => void;
  onCancel: () => void;
}

const VisitRecorder: React.FC<VisitRecorderProps> = ({
  visitId,
  patientName,
  token,
  onComplete,
  onCancel,
}) => {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [processingStage, setProcessingStage] = useState<string>('');
  const [uploadMode, setUploadMode] = useState<'record' | 'upload'>('record');

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const startRecording = async () => {
    try {
      setError(null);

      // Check if getUserMedia is supported
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Your browser does not support audio recording');
      }

      console.log('Requesting microphone access...');
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 44100,
        }
      });

      console.log('Microphone access granted, creating MediaRecorder...');

      // Check if MediaRecorder is supported
      if (!window.MediaRecorder) {
        throw new Error('MediaRecorder is not supported in your browser');
      }

      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
          console.log('Audio chunk recorded:', event.data.size, 'bytes');
        }
      };

      mediaRecorder.onerror = (event: any) => {
        console.error('MediaRecorder error:', event.error);
        setError(`Recording error: ${event.error.message || 'Unknown error'}`);
      };

      mediaRecorder.start(1000); // Collect data every second
      setIsRecording(true);
      setRecordingTime(0);

      console.log('Recording started successfully');

      // Start timer
      timerRef.current = setInterval(() => {
        setRecordingTime((prev) => prev + 1);
      }, 1000);
    } catch (err: any) {
      console.error('Error starting recording:', err);
      let errorMessage = 'Failed to access microphone. ';

      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        errorMessage += 'Permission denied. Please allow microphone access in your browser settings.';
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        errorMessage += 'No microphone found. Please connect a microphone and try again.';
      } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
        errorMessage += 'Microphone is already in use by another application.';
      } else if (err.name === 'OverconstrainedError' || err.name === 'ConstraintNotSatisfiedError') {
        errorMessage += 'Microphone does not meet the required constraints.';
      } else if (err.name === 'TypeError') {
        errorMessage += 'Browser does not support audio recording.';
      } else {
        errorMessage += err.message || 'Unknown error occurred.';
      }

      setError(errorMessage);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);

      if (timerRef.current) {
        clearInterval(timerRef.current);
      }

      // Stop all audio tracks
      mediaRecorderRef.current.stream.getTracks().forEach((track) => track.stop());

      // Process the recording
      mediaRecorderRef.current.onstop = () => {
        processRecording();
      };
    }
  };

  const processRecording = async (audioBlob?: Blob) => {
    try {
      setIsProcessing(true);
      setProcessingStage('Preparing audio file...');

      // Create audio blob from recorded chunks or use provided blob
      const blob = audioBlob || new Blob(audioChunksRef.current, { type: 'audio/webm' });

      setProcessingStage('Uploading...');

      // Create form data
      const formData = new FormData();
      formData.append('audio', blob, audioBlob ? 'uploaded-recording.mp3' : 'visit-recording.webm');

      // Send to backend for processing (returns immediately now!)
      await axios.post(
        `${API_URL}/doctor/visits/${visitId}/process-recording`,
        formData,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'multipart/form-data',
          },
          onUploadProgress: (progressEvent) => {
            const percentCompleted = progressEvent.total
              ? Math.round((progressEvent.loaded * 100) / progressEvent.total)
              : 0;
            setProcessingStage(`Uploading... ${percentCompleted}%`);
          },
        }
      );

      // Upload complete! Now processing in background
      setProcessingStage('Upload complete! Processing in background...');

      // Wait a moment to show the message
      await new Promise((resolve) => setTimeout(resolve, 1500));

      // Show success message and complete
      setIsProcessing(false);
      setProcessingStage('');
      onComplete();
    } catch (err: any) {
      console.error('Error processing recording:', err);
      setError(
        err.response?.data?.message ||
          'Failed to upload recording. Please try again.'
      );
      setIsProcessing(false);
    }
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setError(null);
      processRecording(file);
    }
  };

  const triggerFileUpload = () => {
    fileInputRef.current?.click();
  };

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="recorder-overlay">
      <div className="recorder-modal">
        <div className="recorder-header">
          <h2>Recording Visit</h2>
          <p className="patient-name">{patientName}</p>
        </div>

        <div className="recorder-content">
          {error && (
            <div className="error-message">
              <span className="error-icon">⚠️</span>
              {error}
            </div>
          )}

          {!isProcessing ? (
            <>
              {/* Mode selector */}
              <div className="mode-selector">
                <button
                  className={`mode-btn ${uploadMode === 'record' ? 'active' : ''}`}
                  onClick={() => setUploadMode('record')}
                >
                  🎙️ Record Live
                </button>
                <button
                  className={`mode-btn ${uploadMode === 'upload' ? 'active' : ''}`}
                  onClick={() => setUploadMode('upload')}
                >
                  📁 Upload File (Testing)
                </button>
              </div>

              {uploadMode === 'record' ? (
                <>
                  <div className="recording-display">
                    {isRecording && (
                      <div className="recording-indicator">
                        <span className="pulse-dot"></span>
                        <span className="recording-text">Recording</span>
                      </div>
                    )}
                    <div className="recording-time">{formatTime(recordingTime)}</div>
                  </div>

                  <div className="recorder-instructions">
                    {!isRecording ? (
                      <p>
                        Click "Start Recording" to begin capturing the doctor-patient
                        conversation.
                        <br />
                        The AI will transcribe and generate clinical notes automatically.
                      </p>
                    ) : (
                      <p>
                        Recording in progress... Click "Stop Recording" when the visit is
                        complete.
                      </p>
                    )}
                  </div>

                  <div className="recorder-actions">
                    {!isRecording ? (
                      <>
                        <button onClick={startRecording} className="btn-start-recording">
                          🎙️ Start Recording
                        </button>
                        <button onClick={onCancel} className="btn-cancel">
                          Cancel
                        </button>
                      </>
                    ) : (
                      <button onClick={stopRecording} className="btn-stop-recording">
                        ⏹️ Stop Recording
                      </button>
                    )}
                  </div>
                </>
              ) : (
                <>
                  <div className="upload-section">
                    <div className="upload-icon">📁</div>
                    <p className="upload-instructions">
                      Upload a pre-recorded audio file for testing purposes.
                      <br />
                      Supported formats: MP3, WAV, M4A, WEBM
                    </p>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="audio/*"
                      onChange={handleFileUpload}
                      style={{ display: 'none' }}
                    />
                    <div className="recorder-actions">
                      <button onClick={triggerFileUpload} className="btn-upload">
                        📤 Choose Audio File
                      </button>
                      <button onClick={onCancel} className="btn-cancel">
                        Cancel
                      </button>
                    </div>
                  </div>
                </>
              )}
            </>
          ) : (
            <div className="processing-display">
              <div className="spinner"></div>
              <p className="processing-stage">{processingStage}</p>
              <p className="processing-note">
                This may take a few moments while we transcribe the audio and generate
                clinical notes...
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default VisitRecorder;
