import React, { useState } from 'react';
import { X, Download, Flag, MessageSquare, Eye, CheckCircle2, Clock, User, FileText } from 'lucide-react';
import './DoctorFileViewer.css';

interface FileComment {
  id: string;
  from: string;
  comment: string;
  date: string;
}

interface FileAnnotation {
  id: string;
  type: string;
  note: string;
  by: string;
  date: string;
}

interface DoctorFileViewerProps {
  file?: {
    fileId: string;
    fileName: string;
    category: string;
    description?: string;
    uploadedAt: string;
    reviewStatus: string;
    reviewedAt?: string;
    aiSummary?: string;
    comments: FileComment[];
    annotations: FileAnnotation[];
    storageUrl?: string;
  };
  onClose?: () => void;
  onAddComment?: (comment: string) => Promise<void>;
  onAddAnnotation?: (type: string, note: string) => Promise<void>;
}

const DoctorFileViewer: React.FC<DoctorFileViewerProps> = ({
  file,
  onClose,
  onAddComment,
  onAddAnnotation,
}) => {
  const [activeTab, setActiveTab] = useState<'preview' | 'comments' | 'annotations' | 'summary'>('preview');
  const [newComment, setNewComment] = useState('');
  const [isSubmittingComment, setIsSubmittingComment] = useState(false);
  const [newAnnotation, setNewAnnotation] = useState('');
  const [annotationType, setAnnotationType] = useState<'highlight' | 'note' | 'flag' | 'correction'>('note');
  const [isSubmittingAnnotation, setIsSubmittingAnnotation] = useState(false);

  if (!file) {
    return null;
  }

  const categoryColors: Record<string, string> = {
    LAB_RESULT: 'bg-blue-100 text-blue-800 border-blue-300',
    IMAGING: 'bg-purple-100 text-purple-800 border-purple-300',
    PRESCRIPTION: 'bg-green-100 text-green-800 border-green-300',
    INSURANCE: 'bg-yellow-100 text-yellow-800 border-yellow-300',
    ID_DOCUMENT: 'bg-red-100 text-red-800 border-red-300',
    CONSENT_FORM: 'bg-pink-100 text-pink-800 border-pink-300',
    OTHER: 'bg-gray-100 text-gray-800 border-gray-300',
  };

  const annotationTypeIcons: Record<string, string> = {
    highlight: '🟨',
    note: '📝',
    flag: '🚩',
    correction: '✏️',
  };

  const handleAddComment = async () => {
    if (!newComment.trim()) return;

    setIsSubmittingComment(true);
    try {
      await onAddComment?.(newComment);
      setNewComment('');
    } finally {
      setIsSubmittingComment(false);
    }
  };

  const handleAddAnnotation = async () => {
    if (!newAnnotation.trim()) return;

    setIsSubmittingAnnotation(true);
    try {
      await onAddAnnotation?.(annotationType, newAnnotation);
      setNewAnnotation('');
    } finally {
      setIsSubmittingAnnotation(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="bg-gradient-to-r from-slate-50 to-slate-100 border-b border-slate-200 p-6">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-2">
                <FileText className="w-5 h-5 text-slate-600" />
                <h2 className="text-xl font-bold text-slate-900">{file.fileName}</h2>
              </div>
              <p className="text-sm text-slate-600 mb-3">{file.description}</p>
              <div className="flex flex-wrap items-center gap-3">
                <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium border ${categoryColors[file.category] || categoryColors.OTHER}`}>
                  {file.category.replace(/_/g, ' ')}
                </span>
                {file.reviewStatus === 'REVIEWED' && (
                  <span className="inline-flex items-center gap-1 text-green-700 bg-green-50 px-3 py-1 rounded-full text-sm font-medium border border-green-300">
                    <CheckCircle2 className="w-4 h-4" />
                    Reviewed
                  </span>
                )}
                {file.reviewStatus === 'PENDING' && (
                  <span className="inline-flex items-center gap-1 text-amber-700 bg-amber-50 px-3 py-1 rounded-full text-sm font-medium border border-amber-300">
                    <Clock className="w-4 h-4" />
                    Pending Review
                  </span>
                )}
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-slate-200 rounded-lg transition-colors text-slate-600"
            >
              <X className="w-6 h-6" />
            </button>
          </div>
        </div>

        {/* Metadata */}
        <div className="px-6 py-3 bg-white border-b border-slate-100 text-sm text-slate-600 flex items-center justify-between">
          <div>
            Uploaded on {new Date(file.uploadedAt).toLocaleDateString()} at {new Date(file.uploadedAt).toLocaleTimeString()}
          </div>
          {file.storageUrl && (
            <button className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-700">
              <Download className="w-4 h-4" />
              Download
            </button>
          )}
        </div>

        {/* Tabs */}
        <div className="border-b border-slate-200 bg-white">
          <div className="flex">
            {['preview', 'comments', 'annotations', 'summary'].map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab as any)}
                className={`flex-1 px-4 py-3 font-medium text-sm transition-colors ${
                  activeTab === tab
                    ? 'border-b-2 border-blue-600 text-blue-600'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
                {tab === 'comments' && file.comments.length > 0 && (
                  <span className="ml-1 text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
                    {file.comments.length}
                  </span>
                )}
                {tab === 'annotations' && file.annotations.length > 0 && (
                  <span className="ml-1 text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
                    {file.annotations.length}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {activeTab === 'preview' && (
            <div className="p-6 bg-white">
              {file.storageUrl && file.fileName.toLowerCase().match(/\.(jpg|jpeg|png|gif)$/i) ? (
                <img src={file.storageUrl} alt={file.fileName} className="max-w-full h-auto rounded-lg" />
              ) : (
                <div className="bg-slate-50 border-2 border-dashed border-slate-300 rounded-lg p-12 text-center">
                  <FileText className="w-16 h-16 text-slate-400 mx-auto mb-4" />
                  <p className="text-slate-600">File preview not available</p>
                  <p className="text-sm text-slate-500 mt-2">Download the file to view it</p>
                </div>
              )}
            </div>
          )}

          {activeTab === 'comments' && (
            <div className="p-6 space-y-4">
              {/* Add Comment Form */}
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
                <label className="block text-sm font-medium text-slate-900 mb-2">
                  Add Comment for Patient
                </label>
                <textarea
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  placeholder="Write a comment visible to the patient..."
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none mb-3"
                  rows={3}
                  disabled={isSubmittingComment}
                />
                <button
                  onClick={handleAddComment}
                  disabled={!newComment.trim() || isSubmittingComment}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:bg-slate-300 disabled:cursor-not-allowed font-medium text-sm flex items-center gap-2"
                >
                  <MessageSquare className="w-4 h-4" />
                  {isSubmittingComment ? 'Posting...' : 'Post Comment'}
                </button>
              </div>

              {/* Comments List */}
              <div className="space-y-3">
                {file.comments.length === 0 ? (
                  <p className="text-slate-500 text-center py-8">No comments yet</p>
                ) : (
                  file.comments.map((comment) => (
                    <div key={comment.id} className="bg-slate-50 border border-slate-200 rounded-lg p-4">
                      <div className="flex items-center justify-between mb-2">
                        <p className="font-medium text-slate-900 flex items-center gap-2">
                          <User className="w-4 h-4" />
                          {comment.from}
                        </p>
                        <p className="text-xs text-slate-500">
                          {new Date(comment.date).toLocaleDateString()}
                        </p>
                      </div>
                      <p className="text-slate-700 whitespace-pre-wrap">{comment.comment}</p>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {activeTab === 'annotations' && (
            <div className="p-6 space-y-4">
              {/* Add Annotation Form */}
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
                <label className="block text-sm font-medium text-slate-900 mb-2">
                  Add Private Annotation
                </label>
                <div className="mb-3">
                  <label className="block text-xs font-medium text-slate-700 mb-2">Type</label>
                  <div className="grid grid-cols-2 gap-2">
                    {['highlight', 'note', 'flag', 'correction'].map((type) => (
                      <button
                        key={type}
                        onClick={() => setAnnotationType(type as any)}
                        className={`p-2 rounded-lg border-2 transition-all text-sm font-medium ${
                          annotationType === type
                            ? 'border-blue-500 bg-blue-50'
                            : 'border-slate-300 bg-white hover:border-slate-400'
                        }`}
                      >
                        <span className="mr-2">{annotationTypeIcons[type]}</span>
                        {type.charAt(0).toUpperCase() + type.slice(1)}
                      </button>
                    ))}
                  </div>
                </div>
                <textarea
                  value={newAnnotation}
                  onChange={(e) => setNewAnnotation(e.target.value)}
                  placeholder="Add your annotation..."
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none mb-3"
                  rows={3}
                  disabled={isSubmittingAnnotation}
                />
                <button
                  onClick={handleAddAnnotation}
                  disabled={!newAnnotation.trim() || isSubmittingAnnotation}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:bg-slate-300 disabled:cursor-not-allowed font-medium text-sm flex items-center gap-2"
                >
                  <Flag className="w-4 h-4" />
                  {isSubmittingAnnotation ? 'Saving...' : 'Add Annotation'}
                </button>
              </div>

              {/* Annotations List */}
              <div className="space-y-3">
                {file.annotations.length === 0 ? (
                  <p className="text-slate-500 text-center py-8">No annotations yet</p>
                ) : (
                  file.annotations.map((annotation) => (
                    <div key={annotation.id} className="bg-slate-50 border border-slate-200 rounded-lg p-4">
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className="text-lg">{annotationTypeIcons[annotation.type] || '📝'}</span>
                          <p className="font-medium text-slate-900">
                            {annotation.type.charAt(0).toUpperCase() + annotation.type.slice(1)}
                          </p>
                        </div>
                        <p className="text-xs text-slate-500">
                          {new Date(annotation.date).toLocaleDateString()}
                        </p>
                      </div>
                      <p className="text-slate-600 text-sm mb-2">{annotation.note}</p>
                      <p className="text-xs text-slate-500">By: {annotation.by}</p>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {activeTab === 'summary' && (
            <div className="p-6">
              {file.aiSummary ? (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <h3 className="font-semibold text-blue-900 mb-3">AI-Generated Summary</h3>
                  <p className="text-blue-800 whitespace-pre-wrap text-sm">{file.aiSummary}</p>
                </div>
              ) : (
                <div className="bg-slate-50 border border-dashed border-slate-300 rounded-lg p-8 text-center">
                  <p className="text-slate-600">AI summary not yet available</p>
                  <p className="text-sm text-slate-500 mt-2">Summary will be generated when the file is processed</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default DoctorFileViewer;
