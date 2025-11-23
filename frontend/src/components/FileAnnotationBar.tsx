import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './FileAnnotationBar.css';

interface FileAnnotationBarProps {
  fileId: string;
  isDoctorView: boolean;
  user: {
    id: string;
    token: string;
  };
  onAnnotationAdded?: (annotation: any) => void;
  compact?: boolean;
}

const FileAnnotationBar: React.FC<FileAnnotationBarProps> = ({
  fileId,
  isDoctorView,
  user,
  onAnnotationAdded,
  compact = false,
}) => {
  const [activeMode, setActiveMode] = useState<'highlight' | 'note' | 'flag' | 'correction' | null>(null);
  const [annotationText, setAnnotationText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [annotationCount, setAnnotationCount] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3000/api';

  // Load annotation count
  useEffect(() => {
    if (!isDoctorView) return;

    const loadCount = async () => {
      try {
        const response = await axios.get(`${API_URL}/files/${fileId}/details`, {
          headers: {
            Authorization: `Bearer ${user.token}`,
          },
        });

        setAnnotationCount(response.data.data.annotations?.length || 0);
      } catch (error) {
        console.error('Error loading annotation count:', error);
      }
    };

    loadCount();
  }, [fileId, isDoctorView, user.token]);

  // Submit annotation
  const handleSubmitAnnotation = async () => {
    if (!activeMode || !annotationText.trim()) {
      setError('Please enter annotation text');
      return;
    }

    try {
      setIsSubmitting(true);
      setError(null);

      const response = await axios.post(
        `${API_URL}/files/${fileId}/annotate`,
        {
          annotationType: activeMode,
          content: annotationText,
        },
        {
          headers: {
            Authorization: `Bearer ${user.token}`,
          },
        }
      );

      // Reset form
      setActiveMode(null);
      setAnnotationText('');
      setAnnotationCount((prev) => prev + 1);

      if (onAnnotationAdded) {
        onAnnotationAdded(response.data.data);
      }
    } catch (err: any) {
      console.error('Error submitting annotation:', err);
      setError(err.response?.data?.message || 'Failed to add annotation');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isDoctorView) {
    return null;
  }

  // Compact mode
  if (compact) {
    return (
      <div className="annotation-bar-compact">
        <button
          onClick={() => setActiveMode(activeMode === 'note' ? null : 'note')}
          className={`btn-compact ${activeMode === 'note' ? 'active' : ''}`}
          title="Add note"
        >
          📝
        </button>
        <button
          onClick={() => setActiveMode(activeMode === 'highlight' ? null : 'highlight')}
          className={`btn-compact ${activeMode === 'highlight' ? 'active' : ''}`}
          title="Highlight"
        >
          🟨
        </button>
        <button
          onClick={() => setActiveMode(activeMode === 'flag' ? null : 'flag')}
          className={`btn-compact ${activeMode === 'flag' ? 'active' : ''}`}
          title="Flag issue"
        >
          🚩
        </button>
        {annotationCount > 0 && (
          <span className="annotation-count" title="Total annotations">
            {annotationCount}
          </span>
        )}
      </div>
    );
  }

  // Full mode
  return (
    <div className="annotation-bar">
      <div className="bar-header">
        <h4>Add Annotation</h4>
        {annotationCount > 0 && (
          <span className="annotation-badge">{annotationCount} annotations</span>
        )}
      </div>

      {/* Annotation Mode Selector */}
      {!activeMode ? (
        <div className="mode-selector">
          <button
            onClick={() => setActiveMode('highlight')}
            className="mode-btn highlight"
            title="Highlight important text"
          >
            <span className="icon">🟨</span>
            <span className="label">Highlight</span>
          </button>
          <button
            onClick={() => setActiveMode('note')}
            className="mode-btn note"
            title="Add a note or comment"
          >
            <span className="icon">📝</span>
            <span className="label">Note</span>
          </button>
          <button
            onClick={() => setActiveMode('flag')}
            className="mode-btn flag"
            title="Flag an issue or concern"
          >
            <span className="icon">🚩</span>
            <span className="label">Flag Issue</span>
          </button>
          <button
            onClick={() => setActiveMode('correction')}
            className="mode-btn correction"
            title="Suggest a correction"
          >
            <span className="icon">✏️</span>
            <span className="label">Correction</span>
          </button>
        </div>
      ) : (
        <>
          {/* Active Mode Header */}
          <div className="active-mode-header">
            <span className="mode-badge">
              {activeMode === 'highlight' && '🟨 Highlight'}
              {activeMode === 'note' && '📝 Note'}
              {activeMode === 'flag' && '🚩 Flag'}
              {activeMode === 'correction' && '✏️ Correction'}
            </span>
            <button
              onClick={() => {
                setActiveMode(null);
                setAnnotationText('');
              }}
              className="btn-cancel-mode"
              title="Cancel"
            >
              ✕
            </button>
          </div>

          {/* Input Area */}
          <div className="input-area">
            <textarea
              value={annotationText}
              onChange={(e) => {
                setAnnotationText(e.target.value);
                setError(null);
              }}
              placeholder={`Enter your ${activeMode}...`}
              className="annotation-textarea"
              rows={4}
              disabled={isSubmitting}
            />

            {/* Error Message */}
            {error && <p className="error-message">{error}</p>}

            {/* Character Count */}
            <div className="char-count">
              {annotationText.length} characters
            </div>

            {/* Submit Actions */}
            <div className="submit-actions">
              <button
                onClick={handleSubmitAnnotation}
                disabled={!annotationText.trim() || isSubmitting}
                className="btn-submit"
              >
                {isSubmitting ? 'Adding...' : 'Add ' + activeMode}
              </button>
              <button
                onClick={() => {
                  setActiveMode(null);
                  setAnnotationText('');
                  setError(null);
                }}
                disabled={isSubmitting}
                className="btn-cancel"
              >
                Cancel
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default FileAnnotationBar;
