import React, { useState, useRef, useCallback } from 'react';
import axios from 'axios';
import './FileUploadEnhanced.css';

interface FileUploadEnhancedProps {
  user: {
    id: string;
    token: string;
  };
  onFileUploaded?: (file: any) => void | Promise<void>;
  onCancel?: () => void;
  categoryFilter?: string;
  compact?: boolean;
  showProgress?: boolean;
}

const FileUploadEnhanced: React.FC<FileUploadEnhancedProps> = ({
  user,
  onFileUploaded,
  onCancel,
  categoryFilter = 'OTHER',
  compact = false,
  showProgress = true,
}) => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [dragActive, setDragActive] = useState(false);
  const [filePreview, setFilePreview] = useState<string | null>(null);
  const [category, setCategory] = useState(categoryFilter);
  const [description, setDescription] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3000/api';

  const ALLOWED_TYPES = {
    PDF: 'application/pdf',
    JPEG: 'image/jpeg',
    JPG: 'image/jpg',
    PNG: 'image/png',
    DOC: 'application/msword',
    DOCX: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  };

  const CATEGORY_OPTIONS = [
    { value: 'LAB_RESULT', label: '🔬 Lab Result' },
    { value: 'IMAGING', label: '📸 Imaging (MRI/X-Ray)' },
    { value: 'PRESCRIPTION', label: '💊 Prescription' },
    { value: 'INSURANCE', label: '📋 Insurance' },
    { value: 'ID_DOCUMENT', label: '🆔 ID Document' },
    { value: 'CONSENT_FORM', label: '✍️ Consent Form' },
    { value: 'AUDIO_RECORDING', label: '🎙️ Audio Recording' },
    { value: 'OTHER', label: '📁 Other' },
  ];

  // Generate file preview
  const generatePreview = useCallback((file: File) => {
    if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (e) => {
        setFilePreview(e.target?.result as string);
      };
      reader.readAsDataURL(file);
    } else {
      // For non-image files, show file icon
      setFilePreview(null);
    }
  }, []);

  // Validate file
  const validateFile = (file: File): string | null => {
    if (!file) return 'No file selected';
    if (file.size > 10 * 1024 * 1024) return 'File size must be less than 10MB';
    if (!Object.values(ALLOWED_TYPES).includes(file.type)) {
      return 'Invalid file type. Allowed: PDF, JPG, PNG, DOC, DOCX';
    }
    return null;
  };

  // Handle file selection
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const error = validateFile(file);
      if (error) {
        alert(error);
        return;
      }
      setSelectedFile(file);
      generatePreview(file);
    }
  };

  // Handle drag and drop
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    const file = e.dataTransfer.files?.[0];
    if (file) {
      const error = validateFile(file);
      if (error) {
        alert(error);
        return;
      }
      setSelectedFile(file);
      generatePreview(file);
    }
  };

  // Upload file
  const handleUploadFile = async () => {
    if (!selectedFile) return;

    const fileName = selectedFile.name; // Store filename before reset

    try {
      setIsUploading(true);
      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('fileCategory', category);
      formData.append('description', description);

      console.log('📤 Uploading file:', fileName, 'Category:', category);

      const response = await axios.post(
        `${API_URL}/files/upload`,
        formData,
        {
          headers: {
            Authorization: `Bearer ${user.token}`,
            // DO NOT set Content-Type - Axios will set it automatically with FormData
          },
          onUploadProgress: (progressEvent) => {
            if (progressEvent.total) {
              const progress = Math.round((progressEvent.loaded / progressEvent.total) * 100);
              setUploadProgress(progress);
            }
          },
        }
      );

      console.log('✅ Upload response:', response.data);

      if (onFileUploaded) {
        await onFileUploaded(response.data.file);
      }

      // Reset form
      setSelectedFile(null);
      setFilePreview(null);
      setDescription('');
      setUploadProgress(0);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }

      alert(`File "${fileName}" uploaded successfully!`);
    } catch (error: any) {
      console.error('❌ Error uploading file:', error);
      const errorMsg = error.response?.data?.message || error.message || 'Failed to upload file. Please try again.';
      alert(errorMsg);
    } finally {
      setIsUploading(false);
    }
  };

  // Clear selection
  const handleClearSelection = () => {
    setSelectedFile(null);
    setFilePreview(null);
    setDescription('');
    setUploadProgress(0);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    if (onCancel) {
      onCancel();
    }
  };

  if (compact) {
    return (
      <div className="file-upload-compact">
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileSelect}
          style={{ display: 'none' }}
          accept={Object.keys(ALLOWED_TYPES).map(k => `.${k.toLowerCase()}`).join(',')}
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={isUploading}
          className="btn-upload-compact"
          title="Upload file"
        >
          📎
        </button>
        {selectedFile && (
          <span className="file-name-compact" title={selectedFile.name}>
            {selectedFile.name}
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="file-upload-enhanced">
      <div className="upload-area">
        {/* Drag and Drop Zone */}
        <div
          className={`drag-drop-zone ${dragActive ? 'active' : ''}`}
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
          onClick={() => !selectedFile && fileInputRef.current?.click()}
        >
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileSelect}
            style={{ display: 'none' }}
            accept={Object.keys(ALLOWED_TYPES).map(k => `.${k.toLowerCase()}`).join(',')}
            disabled={isUploading}
          />

          {selectedFile ? (
            <>
              {/* File Preview */}
              {filePreview && (
                <div className="file-preview-thumbnail">
                  <img src={filePreview} alt="Preview" />
                </div>
              )}

              <div className="file-info">
                <p className="file-name">{selectedFile.name}</p>
                <p className="file-size">
                  {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                </p>

                {/* Upload Progress */}
                {showProgress && isUploading && (
                  <div className="progress-bar">
                    <div className="progress-fill" style={{ width: `${uploadProgress}%` }}>
                      <span className="progress-text">{uploadProgress}%</span>
                    </div>
                  </div>
                )}
              </div>

              <button
                onClick={handleClearSelection}
                disabled={isUploading}
                className="btn-clear-file"
                title="Clear file"
              >
                ✖
              </button>
            </>
          ) : (
            <>
              <p className="upload-icon">📄</p>
              <p className="upload-text">
                {dragActive ? 'Drop your file here' : 'Drag and drop your file here'}
              </p>
              <p className="upload-subtext">or click to browse</p>
              <p className="upload-allowed">
                Allowed: PDF, JPG, PNG, DOC, DOCX (max 10MB)
              </p>
            </>
          )}
        </div>

        {/* File Category Selector */}
        {selectedFile && (
          <div className="upload-form">
            <div className="form-group">
              <label htmlFor="category">File Category</label>
              <select
                id="category"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                disabled={isUploading}
                className="form-select"
              >
                {CATEGORY_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="description">Description (Optional)</label>
              <textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Add a description for this file..."
                disabled={isUploading}
                className="form-textarea"
                rows={3}
              />
            </div>

            <div className="upload-actions">
              <button
                onClick={handleUploadFile}
                disabled={!selectedFile || isUploading}
                className="btn-upload-submit"
              >
                {isUploading ? `Uploading... ${uploadProgress}%` : 'Upload File'}
              </button>
              <button
                onClick={handleClearSelection}
                disabled={isUploading}
                className="btn-cancel"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default FileUploadEnhanced;
