import React, { useState, useRef } from 'react';
import { Upload, X, File, FileText, Image, AlertCircle, CheckCircle2 } from 'lucide-react';
import './FileUploadWidget.css';

interface FileUploadWidgetProps {
  onFileSelected?: (file: File, category: string, description: string) => void;
  isUploading?: boolean;
}

type FileCategory = 'LAB_RESULT' | 'IMAGING' | 'PRESCRIPTION' | 'INSURANCE' | 'ID_DOCUMENT' | 'CONSENT_FORM' | 'OTHER';

const FileUploadWidget: React.FC<FileUploadWidgetProps> = ({
  onFileSelected,
  isUploading = false,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [category, setCategory] = useState<FileCategory>('LAB_RESULT');
  const [description, setDescription] = useState('');
  const [preview, setPreview] = useState<string>('');
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showForm, setShowForm] = useState(false);

  const categoryLabels: Record<FileCategory, { label: string; icon: React.ReactNode; color: string }> = {
    LAB_RESULT: { label: 'Lab Results', icon: <FileText className="w-4 h-4" />, color: 'bg-blue-50 border-blue-200' },
    IMAGING: { label: 'Medical Imaging', icon: <Image className="w-4 h-4" />, color: 'bg-purple-50 border-purple-200' },
    PRESCRIPTION: { label: 'Prescription', icon: <File className="w-4 h-4" />, color: 'bg-green-50 border-green-200' },
    INSURANCE: { label: 'Insurance', icon: <File className="w-4 h-4" />, color: 'bg-yellow-50 border-yellow-200' },
    ID_DOCUMENT: { label: 'ID Document', icon: <File className="w-4 h-4" />, color: 'bg-red-50 border-red-200' },
    CONSENT_FORM: { label: 'Consent Form', icon: <FileText className="w-4 h-4" />, color: 'bg-pink-50 border-pink-200' },
    OTHER: { label: 'Other Document', icon: <File className="w-4 h-4" />, color: 'bg-gray-50 border-gray-200' },
  };

  const validateFile = (file: File) => {
    const maxSize = 10 * 1024 * 1024; // 10MB
    const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];

    if (file.size > maxSize) {
      setError('File size must be less than 10MB');
      return false;
    }

    if (!allowedTypes.includes(file.type)) {
      setError('Please upload a PDF, JPG, PNG, or DOC file');
      return false;
    }

    setError('');
    return true;
  };

  const handleFileSelect = (file: File) => {
    if (!validateFile(file)) return;

    setSelectedFile(file);
    setShowForm(true);

    // Create preview for images
    if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (e) => setPreview(e.target?.result as string);
      reader.readAsDataURL(file);
    } else {
      setPreview('');
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      handleFileSelect(files[0]);
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.currentTarget.files;
    if (files && files.length > 0) {
      handleFileSelect(files[0]);
    }
  };

  const handleSubmit = () => {
    if (!selectedFile || !description.trim()) {
      setError('Please add a description for your file');
      return;
    }

    onFileSelected?.(selectedFile, category, description);

    // Reset form
    setSelectedFile(null);
    setCategory('LAB_RESULT');
    setDescription('');
    setPreview('');
    setShowForm(false);
  };

  const handleCancel = () => {
    setSelectedFile(null);
    setCategory('LAB_RESULT');
    setDescription('');
    setPreview('');
    setError('');
    setShowForm(false);
  };

  const categoryInfo = categoryLabels[category];

  if (!showForm) {
    return (
      <div className="w-full">
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={isUploading}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-gray-300 hover:border-blue-500 hover:bg-blue-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Upload className="w-4 h-4" />
          <span className="text-sm font-medium">Upload File</span>
        </button>
        <input
          ref={fileInputRef}
          type="file"
          onChange={handleFileInput}
          className="hidden"
          accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
          disabled={isUploading}
        />
      </div>
    );
  }

  return (
    <div className="w-full bg-white rounded-lg border border-gray-200 shadow-sm p-6 space-y-4">
      {/* File Preview Section */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-gray-900">Upload Medical Document</h3>
          <button
            onClick={handleCancel}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* File Info */}
        {selectedFile && (
          <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
            {preview ? (
              <img src={preview} alt="preview" className="w-12 h-12 object-cover rounded" />
            ) : (
              <FileText className="w-10 h-10 text-gray-400" />
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">{selectedFile.name}</p>
              <p className="text-xs text-gray-500">{(selectedFile.size / 1024 / 1024).toFixed(2)} MB</p>
            </div>
            {!isUploading && (
              <button
                onClick={() => {
                  setSelectedFile(null);
                  setPreview('');
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        )}
      </div>

      {/* Category Selection */}
      <div className="space-y-2">
        <label className="block text-sm font-medium text-gray-700">Document Type</label>
        <div className="grid grid-cols-2 gap-2">
          {Object.entries(categoryLabels).map(([key, { label, color }]) => (
            <button
              key={key}
              onClick={() => setCategory(key as FileCategory)}
              disabled={isUploading}
              className={`p-3 rounded-lg border-2 transition-all text-left ${
                category === key
                  ? 'border-blue-500 bg-blue-50'
                  : `border-gray-200 ${color} hover:border-blue-300`
              } disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              <p className="text-sm font-medium text-gray-900">{label}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Description */}
      <div className="space-y-2">
        <label className="block text-sm font-medium text-gray-700">
          Description <span className="text-red-500">*</span>
        </label>
        <textarea
          value={description}
          onChange={(e) => {
            setDescription(e.target.value);
            if (e.target.value.trim()) {
              setError('');
            }
          }}
          disabled={isUploading}
          placeholder="e.g., Recent blood work from Quest Lab, July 2025"
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none disabled:bg-gray-50 disabled:text-gray-500"
          rows={3}
        />
        <p className="text-xs text-gray-500">Describe what this document contains to help the doctor understand its context</p>
      </div>

      {/* Error Message */}
      {error && (
        <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
          <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex gap-3 pt-2">
        <button
          onClick={handleSubmit}
          disabled={isUploading || !selectedFile || !description.trim()}
          className="flex-1 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {isUploading ? (
            <>
              <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
              <span>Uploading...</span>
            </>
          ) : (
            <>
              <Upload className="w-4 h-4" />
              <span>Upload & Send to Doctor</span>
            </>
          )}
        </button>
        <button
          onClick={handleCancel}
          disabled={isUploading}
          className="px-4 py-2.5 border border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Cancel
        </button>
      </div>
    </div>
  );
};

export default FileUploadWidget;
