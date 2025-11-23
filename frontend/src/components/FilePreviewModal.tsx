import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './FilePreviewModal.css';

interface FilePreviewModalProps {
  fileId: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  fileCategory: string;
  isOpen: boolean;
  user: {
    id: string;
    token: string;
  };
  onClose: () => void;
  onAnnotate?: (annotation: any) => void;
  notificationId?: string;
  initialReadStatus?: boolean;
  onMarkAsRead?: (notificationId: string) => void;
}

interface Annotation {
  id: string;
  annotationType: string;
  content: string;
  createdAt: string;
  doctor?: {
    firstName: string;
    lastName: string;
  };
}

interface Comment {
  id: string;
  content: string;
  createdAt: string;
  doctor?: {
    firstName: string;
    lastName: string;
  };
}

type NoteType = 'note' | 'flag' | 'highlight' | 'correction';

const FilePreviewModal: React.FC<FilePreviewModalProps> = ({
  fileId,
  fileName,
  fileType,
  fileSize,
  fileCategory,
  isOpen,
  user,
  onClose,
  onAnnotate,
  notificationId,
  initialReadStatus = false,
  onMarkAsRead,
}) => {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(100);

  // Notes & Annotations state
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [comments, setComments] = useState<Comment[]>([]);
  const [newNote, setNewNote] = useState('');
  const [noteType, setNoteType] = useState<NoteType>('note');
  const [isAddingNote, setIsAddingNote] = useState(false);
  const [isLoadingNotes, setIsLoadingNotes] = useState(false);

  // Mark as read state
  const [isMarkedAsRead, setIsMarkedAsRead] = useState(initialReadStatus);
  const [isMarkingAsRead, setIsMarkingAsRead] = useState(false);

  const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3000/api';

  // Load file preview
  useEffect(() => {
    if (!isOpen) return;

    const loadPreview = async () => {
      try {
        setIsLoading(true);
        setError(null);

        const isImage = fileType?.startsWith('image/') ||
                       fileName?.match(/\.(jpg|jpeg|png|gif|bmp|webp|svg)$/i);

        if (isImage) {
          const imageResponse = await axios.get(`${API_URL}/files/serve/${fileId}`, {
            headers: {
              Authorization: `Bearer ${user.token}`,
            },
            responseType: 'blob',
          });
          const imageUrl = URL.createObjectURL(imageResponse.data);
          setPreviewUrl(imageUrl);
        } else {
          setPreviewUrl(null);
        }
      } catch (err: any) {
        console.error('Error loading preview:', err);
        setError(err.response?.data?.message || 'Failed to load file preview');
      } finally {
        setIsLoading(false);
      }
    };

    loadPreview();
  }, [isOpen, fileId, user.token, fileType, fileName, API_URL]);

  // Load existing annotations and comments
  useEffect(() => {
    if (!isOpen) return;

    const loadNotes = async () => {
      try {
        setIsLoadingNotes(true);
        const response = await axios.get(`${API_URL}/doctor/files/${fileId}/details`, {
          headers: {
            Authorization: `Bearer ${user.token}`,
          },
        });

        if (response.data.status === 'success') {
          setAnnotations(response.data.data.annotations || []);
          setComments(response.data.data.comments || []);
        }
      } catch (err: any) {
        console.error('Error loading notes:', err);
      } finally {
        setIsLoadingNotes(false);
      }
    };

    loadNotes();
  }, [isOpen, fileId, user.token, API_URL]);

  // Add new annotation
  const handleAddNote = async () => {
    if (!newNote.trim()) return;

    try {
      setIsAddingNote(true);

      const response = await axios.post(
        `${API_URL}/doctor/files/${fileId}/annotate`,
        {
          annotationType: noteType,
          content: newNote.trim(),
        },
        {
          headers: {
            Authorization: `Bearer ${user.token}`,
          },
        }
      );

      if (response.data.status === 'success') {
        // Add the new annotation to the list
        setAnnotations(prev => [response.data.data, ...prev]);
        setNewNote('');
        onAnnotate?.(response.data.data);
      }
    } catch (err: any) {
      console.error('Error adding note:', err);
      alert(err.response?.data?.message || 'Failed to add note');
    } finally {
      setIsAddingNote(false);
    }
  };

  // Download file with authentication
  const handleDownload = async () => {
    try {
      const response = await axios.get(`${API_URL}/files/${fileId}`, {
        headers: {
          Authorization: `Bearer ${user.token}`,
        },
        responseType: 'blob',
      });

      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', fileName);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error: any) {
      console.error('Error downloading file:', error);
      alert(error.response?.data?.message || 'Failed to download file');
    }
  };

  // Mark notification as read
  const handleMarkAsRead = async () => {
    if (!notificationId || isMarkedAsRead) return;

    try {
      setIsMarkingAsRead(true);
      await axios.put(
        `${API_URL}/doctor/files/notifications/${notificationId}/read`,
        {},
        {
          headers: {
            Authorization: `Bearer ${user.token}`,
          },
        }
      );

      setIsMarkedAsRead(true);
      onMarkAsRead?.(notificationId);
    } catch (error: any) {
      console.error('Error marking as read:', error);
      alert(error.response?.data?.message || 'Failed to mark as read');
    } finally {
      setIsMarkingAsRead(false);
    }
  };

  // Format file size
  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  };

  // Format relative time
  const formatTimeAgo = (dateString: string): string => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  // Get note type info
  const getNoteTypeInfo = (type: string) => {
    switch (type) {
      case 'flag':
        return { icon: '🚩', label: 'Flag', className: 'type-flag' };
      case 'highlight':
        return { icon: '🔆', label: 'Highlight', className: 'type-highlight' };
      case 'correction':
        return { icon: '✏️', label: 'Correction', className: 'type-correction' };
      default:
        return { icon: '📝', label: 'Note', className: 'type-note' };
    }
  };

  // Zoom handlers
  const handleZoomIn = () => setZoom(prev => Math.min(prev + 25, 200));
  const handleZoomOut = () => setZoom(prev => Math.max(prev - 25, 50));
  const handleZoomReset = () => setZoom(100);

  // Combine and sort all notes
  const allNotes = [
    ...annotations.map(a => ({ ...a, isAnnotation: true })),
    ...comments.map(c => ({ ...c, annotationType: 'comment', isAnnotation: false })),
  ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  if (!isOpen) return null;

  return (
    <div className="file-preview-modal-overlay" onClick={onClose}>
      <div className="file-preview-modal" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="modal-header">
          <div className="header-info">
            <h2>{fileName}</h2>
            <div className="file-meta">
              <span className="badge">{fileCategory}</span>
              <span className="file-size">{formatFileSize(fileSize)}</span>
            </div>
          </div>
          <button onClick={onClose} className="btn-close">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="modal-content">
          {/* Preview Section */}
          <div className="preview-section">
            {isLoading ? (
              <div className="loading-state">
                <div className="loading-spinner-large"></div>
                <p>Loading preview...</p>
              </div>
            ) : error ? (
              <div className="error-state">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="error-icon">
                  <circle cx="12" cy="12" r="10"/>
                  <line x1="12" y1="8" x2="12" y2="12"/>
                  <line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
                <p>{error}</p>
                <p className="error-help">
                  File preview is not available. You can still download the file to view it.
                </p>
              </div>
            ) : previewUrl ? (
              <>
                {/* Zoom Controls */}
                <div className="zoom-controls">
                  <button onClick={handleZoomOut} disabled={zoom <= 50} className="zoom-btn" title="Zoom Out">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="11" cy="11" r="8"/>
                      <line x1="21" y1="21" x2="16.65" y2="16.65"/>
                      <line x1="8" y1="11" x2="14" y2="11"/>
                    </svg>
                  </button>
                  <div className="zoom-level">{zoom}%</div>
                  <button onClick={handleZoomReset} className="zoom-btn" title="Reset Zoom">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
                      <path d="M3 3v5h5"/>
                    </svg>
                  </button>
                  <button onClick={handleZoomIn} disabled={zoom >= 200} className="zoom-btn" title="Zoom In">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="11" cy="11" r="8"/>
                      <line x1="21" y1="21" x2="16.65" y2="16.65"/>
                      <line x1="11" y1="8" x2="11" y2="14"/>
                      <line x1="8" y1="11" x2="14" y2="11"/>
                    </svg>
                  </button>
                </div>
                <div className="image-preview">
                  <img
                    src={previewUrl}
                    alt={fileName}
                    style={{ transform: `scale(${zoom / 100})` }}
                  />
                </div>
              </>
            ) : (
              <div className="no-preview">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="no-preview-icon">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                  <polyline points="14 2 14 8 20 8"/>
                  <line x1="16" y1="13" x2="8" y2="13"/>
                  <line x1="16" y1="17" x2="8" y2="17"/>
                  <polyline points="10 9 9 9 8 9"/>
                </svg>
                <p>No preview available for this file type</p>
                <span className="file-type-badge">{fileType || 'Unknown'}</span>
              </div>
            )}
          </div>

          {/* Notes & Annotations Section */}
          <div className="notes-section">
            <div className="notes-header">
              <div className="notes-header-content">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="notes-icon">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                </svg>
                <div>
                  <h3>Notes & Annotations</h3>
                  <p className="notes-subtitle">Add clinical notes and mark important findings</p>
                </div>
              </div>
              <span className="notes-count">{allNotes.length}</span>
            </div>

            {/* Note Type Selector */}
            <div className="note-type-selector">
              {(['note', 'flag', 'highlight', 'correction'] as NoteType[]).map((type) => {
                const info = getNoteTypeInfo(type);
                return (
                  <button
                    key={type}
                    onClick={() => setNoteType(type)}
                    className={`note-type-btn ${noteType === type ? 'active' : ''} ${info.className}`}
                  >
                    <span>{info.icon}</span>
                    <span>{info.label}</span>
                  </button>
                );
              })}
            </div>

            {/* Add Note Input */}
            <div className="add-note-form">
              <textarea
                value={newNote}
                onChange={(e) => setNewNote(e.target.value)}
                placeholder={`Add a ${noteType}...`}
                className="note-input"
                rows={3}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey && newNote.trim()) {
                    e.preventDefault();
                    handleAddNote();
                  }
                }}
              />
              <button
                onClick={handleAddNote}
                disabled={!newNote.trim() || isAddingNote}
                className="add-note-btn"
              >
                {isAddingNote ? (
                  <>
                    <span className="btn-spinner"></span>
                    Adding...
                  </>
                ) : (
                  <>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <line x1="12" y1="5" x2="12" y2="19"/>
                      <line x1="5" y1="12" x2="19" y2="12"/>
                    </svg>
                    Add {getNoteTypeInfo(noteType).label}
                  </>
                )}
              </button>
            </div>

            {/* Notes List */}
            <div className="notes-list">
              {isLoadingNotes ? (
                <div className="notes-loading">
                  <div className="loading-spinner-small"></div>
                  <span>Loading notes...</span>
                </div>
              ) : allNotes.length === 0 ? (
                <div className="notes-empty">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="empty-icon">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                    <polyline points="14 2 14 8 20 8"/>
                    <line x1="12" y1="18" x2="12" y2="12"/>
                    <line x1="9" y1="15" x2="15" y2="15"/>
                  </svg>
                  <p>No notes yet</p>
                  <span>Add your first note above</span>
                </div>
              ) : (
                allNotes.map((note) => {
                  const typeInfo = getNoteTypeInfo(note.annotationType);
                  return (
                    <div key={note.id} className={`note-item ${typeInfo.className}`}>
                      <div className="note-item-header">
                        <span className={`note-type-badge ${typeInfo.className}`}>
                          {typeInfo.icon} {typeInfo.label}
                        </span>
                        <span className="note-time">{formatTimeAgo(note.createdAt)}</span>
                      </div>
                      <p className="note-content">{note.content}</p>
                      {note.doctor && (
                        <div className="note-author">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                            <circle cx="12" cy="7" r="4"/>
                          </svg>
                          Dr. {note.doctor.firstName} {note.doctor.lastName}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="modal-footer">
          {notificationId && (
            <button
              onClick={handleMarkAsRead}
              disabled={isMarkedAsRead || isMarkingAsRead}
              className={`btn-mark-read ${isMarkedAsRead ? 'marked' : ''}`}
            >
              {isMarkingAsRead ? (
                <>
                  <span className="btn-spinner"></span>
                  Marking...
                </>
              ) : isMarkedAsRead ? (
                <>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                  Marked as Read
                </>
              ) : (
                <>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10"/>
                    <polyline points="12 6 12 12 16 14"/>
                  </svg>
                  Mark as Read
                </>
              )}
            </button>
          )}
          <button onClick={handleDownload} className="btn-download">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="7 10 12 15 17 10"/>
              <line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            Download
          </button>
          <button onClick={onClose} className="btn-close-footer">
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default FilePreviewModal;
