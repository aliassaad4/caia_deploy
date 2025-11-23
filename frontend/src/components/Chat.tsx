import React, { useState, useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import axios from 'axios';
import Toast from './Toast';
import FileUploadEnhanced from './FileUploadEnhanced';
import FilePreviewModal from './FilePreviewModal';
import './Chat.css';

const API_URL = 'http://localhost:3000/api';

interface Message {
  id: string;
  content: string;
  sender: 'PATIENT' | 'AI_ASSISTANT';
  timestamp: Date;
}

interface Appointment {
  id: string;
  scheduledAt: string;
  visitType: string;
  reasonForVisit: string;
  status: string;
  durationMinutes: number;
}

// Updated to support rescheduling and cancellation flow
interface ChatProps {
  user: {
    id: string;
    token: string;
    firstName: string;
  };
  onAppointmentBooked?: () => void | Promise<void>;
  rescheduleAppointment?: Appointment | null;
  onRescheduleComplete?: () => void | Promise<void>;
  cancelAppointment?: (Appointment | null);
  onCancelComplete?: () => void | Promise<void>;
}

interface ToastState {
  show: boolean;
  message: string;
  type: 'success' | 'error' | 'info';
}

interface PatientFile {
  id: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  fileCategory: string;
  description?: string;
  createdAt: string;
  reviewStatus: string;
  aiSummary?: string;
}

const Chat: React.FC<ChatProps> = ({ user, onAppointmentBooked, rescheduleAppointment, onRescheduleComplete, cancelAppointment, onCancelComplete }) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastState>({ show: false, message: '', type: 'success' });
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [userFiles, setUserFiles] = useState<PatientFile[]>([]);
  const [isLoadingFiles, setIsLoadingFiles] = useState(false);
  const [showFilesList, setShowFilesList] = useState(false);
  const [previewingFile, setPreviewingFile] = useState<PatientFile | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const clearTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const CHAT_STORAGE_KEY = `chat_messages_${user.id}`;
  const CHAT_TIMESTAMP_KEY = `chat_timestamp_${user.id}`;
  const CHAT_TIMEOUT_MS = 7 * 60 * 1000; // 7 minutes of inactivity before clearing

  const showWelcomeMessage = () => {
    setMessages([
      {
        id: 'welcome',
        content: `Hello ${user.firstName}! I'm your AI medical concierge. I can help you with:\n\n• Booking appointments\n• Answering health questions\n• Accessing your medical records\n• Managing tasks and follow-ups\n\nHow can I assist you today?`,
        sender: 'AI_ASSISTANT',
        timestamp: new Date(),
      },
    ]);
  };

  const fetchUserFiles = async () => {
    try {
      setIsLoadingFiles(true);
      const response = await axios.get(
        `${API_URL}/files/patient/files`,
        {
          headers: {
            Authorization: `Bearer ${user.token}`,
          },
        }
      );
      setUserFiles(response.data.data || []);
    } catch (error) {
      console.error('Error fetching user files:', error);
      setUserFiles([]);
    } finally {
      setIsLoadingFiles(false);
    }
  };

  const clearChatHistory = async () => {
    console.log('🗑️ CLEARING CHAT HISTORY - Stack trace:', new Error().stack);
    try {
      // Delete old messages from database
      await axios.delete(
        `${API_URL}/llm/messages`,
        {
          headers: {
            Authorization: `Bearer ${user.token}`,
          },
        }
      );
    } catch (error) {
      console.error('Error clearing messages from database:', error);
    }

    localStorage.removeItem(CHAT_STORAGE_KEY);
    localStorage.removeItem(CHAT_TIMESTAMP_KEY);
    setConversationId(null);
    showWelcomeMessage();
    if (clearTimeoutRef.current) {
      clearTimeout(clearTimeoutRef.current);
      clearTimeoutRef.current = null;
    }
  };

  // Load messages from localStorage and fetch user files on mount
  useEffect(() => {
    const savedMessages = localStorage.getItem(CHAT_STORAGE_KEY);
    const savedTimestamp = localStorage.getItem(CHAT_TIMESTAMP_KEY);

    if (savedMessages && savedTimestamp) {
      const timeSinceLastActivity = Date.now() - parseInt(savedTimestamp);

      if (timeSinceLastActivity < CHAT_TIMEOUT_MS) {
        // Messages are still valid, load them
        const parsedMessages = JSON.parse(savedMessages);
        setMessages(parsedMessages);
        // DISABLED: Auto-clearing after inactivity
        // Set timeout to clear messages after remaining time
        // const remainingTime = CHAT_TIMEOUT_MS - timeSinceLastActivity;
        // clearTimeoutRef.current = setTimeout(() => {
        //   clearChatHistory();
        // }, remainingTime);
      } else {
        // Messages expired, show welcome message
        showWelcomeMessage();
      }
    } else {
      // No saved messages, show welcome message
      showWelcomeMessage();
    }

    // Fetch user files on mount
    fetchUserFiles();
  }, []);

  useEffect(() => {
    // Connect to WebSocket
    const newSocket = io('http://localhost:3000', {
      auth: {
        token: user.token,
      },
    });

    newSocket.on('connect', () => {
      setIsConnected(true);
      console.log('Connected to WebSocket');
    });

    newSocket.on('disconnect', () => {
      setIsConnected(false);
      console.log('Disconnected from WebSocket');
    });

    setSocket(newSocket);

    return () => {
      newSocket.disconnect();
    };
  }, [user.token]);

  // Save messages to localStorage whenever they change
  useEffect(() => {
    if (messages.length > 0) {
      localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(messages));
      localStorage.setItem(CHAT_TIMESTAMP_KEY, Date.now().toString());

      // DISABLED: Auto-clearing after inactivity was causing chat to disappear after booking
      // Users should manually clear chat if they want to start fresh
      // Reset the clear timeout
      // if (clearTimeoutRef.current) {
      //   clearTimeout(clearTimeoutRef.current);
      // }
      // clearTimeoutRef.current = setTimeout(() => {
      //   clearChatHistory();
      // }, CHAT_TIMEOUT_MS);
    }
  }, [messages]);

  useEffect(() => {
    // Scroll to bottom when new messages arrive
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  // Handle reschedule appointment request
  useEffect(() => {
    if (rescheduleAppointment && isConnected) {
      const formatDate = (dateString: string) => {
        const date = new Date(dateString);
        return date.toLocaleString('en-US', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
          hour12: true,
        });
      };

      // Send a message to the AI requesting reschedule assistance
      const rescheduleRequest = `I need to reschedule my appointment that's scheduled for ${formatDate(rescheduleAppointment.scheduledAt)}`;

      setInputMessage(rescheduleRequest);

      // Trigger send after a brief delay
      setTimeout(() => {
        const sendButton = document.querySelector<HTMLButtonElement>('button[type="submit"]');
        if (sendButton) {
          sendButton.click();
        }
      }, 100);
    }
  }, [rescheduleAppointment, isConnected]);

  // Handle cancel appointment request
  // Note: Cancellation is handled by Dashboard with a proper confirmation modal
  // This useEffect just notifies the parent when cancel prop is set
  useEffect(() => {
    if (cancelAppointment) {
      // Just notify parent that we received the cancel request
      // The actual cancellation UI is handled in Dashboard component
      onCancelComplete?.();
    }
  }, [cancelAppointment]);

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
    setToast({ show: true, message, type });
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Validate file size (max 10MB)
      if (file.size > 10 * 1024 * 1024) {
        showToast('File size must be less than 10MB', 'error');
        return;
      }
      setSelectedFile(file);
      showToast(`File "${file.name}" selected. Click Send to upload.`, 'info');
    }
  };

  const handleUploadFile = async (file: File) => {
    try {
      setIsUploading(true);
      const formData = new FormData();
      formData.append('file', file);
      formData.append('fileCategory', 'OTHER'); // Default category - matches Prisma FileCategory enum

      const response = await axios.post(
        `${API_URL}/files/upload`,
        formData,
        {
          headers: {
            Authorization: `Bearer ${user.token}`,
            'Content-Type': 'multipart/form-data',
          },
        }
      );

      showToast(`File "${file.name}" uploaded successfully!`, 'success');

      // Add a system message confirming the upload
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now().toString(),
          content: `📎 File uploaded: ${file.name}\n\nThe file has been added to your medical records and your doctor will review it.`,
          sender: 'AI_ASSISTANT',
          timestamp: new Date(),
        },
      ]);

      // Refresh user files list
      await fetchUserFiles();

      return response.data.data;
    } catch (error: any) {
      console.error('Error uploading file:', error);
      showToast(
        error.response?.data?.message || 'Failed to upload file. Please try again.',
        'error'
      );
      throw error;
    } finally {
      setIsUploading(false);
    }
  };

  const handleDeleteFile = async (fileId: string) => {
    try {
      await axios.delete(
        `${API_URL}/files/${fileId}`,
        {
          headers: {
            Authorization: `Bearer ${localStorage.getItem('token')}`
          }
        }
      );

      showToast('File deleted successfully', 'success');

      // Remove from local state
      setUserFiles((prev) => prev.filter((f) => f.id !== fileId));

      // Refresh the file list
      await fetchUserFiles();
    } catch (error: any) {
      console.error('Error deleting file:', error);
      showToast(
        error.response?.data?.message || 'Failed to delete file. Please try again.',
        'error'
      );
    }
  };

  const handleDownloadFile = async (fileId: string, fileName: string) => {
    try {
      const response = await axios.get(
        `${API_URL}/files/${fileId}`,
        {
          headers: {
            Authorization: `Bearer ${user.token}`,
          },
          responseType: 'blob',
        }
      );

      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', fileName);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);

      showToast(`File "${fileName}" downloaded successfully!`, 'success');
    } catch (error: any) {
      console.error('Error downloading file:', error);
      showToast(
        error.response?.data?.message || 'Failed to download file',
        'error'
      );
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();

    // Handle file upload if a file is selected
    if (selectedFile) {
      try {
        await handleUploadFile(selectedFile);
        setSelectedFile(null);
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
      } catch (error) {
        // Error already handled in handleUploadFile
      }
      return;
    }

    if (!inputMessage.trim() || !isConnected) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      content: inputMessage,
      sender: 'PATIENT',
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputMessage('');
    setIsTyping(true);

    try {
      // Send message via HTTP to get AI response with potential actions
      const response = await axios.post(
        `${API_URL}/llm/chat`,
        {
          message: inputMessage,
          conversationId,
        },
        {
          headers: {
            Authorization: `Bearer ${user.token}`,
          },
          timeout: 120000, // 2 minute timeout for AI processing (includes function calls)
        }
      );

      const { message: aiMessage, conversationId: newConvId, action } = response.data.data;

      // Update conversation ID
      if (!conversationId && newConvId) {
        setConversationId(newConvId);
      }

      // Add AI response to messages
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now().toString(),
          content: aiMessage,
          sender: 'AI_ASSISTANT',
          timestamp: new Date(),
        },
      ]);

      // Show toast if appointment was booked
      if (action && action.id) {
        console.log('✅ Appointment action received:', action);
        const appointmentDate = new Date(action.scheduledAt);
        showToast(
          `Appointment booked successfully for ${appointmentDate.toLocaleDateString()} at ${appointmentDate.toLocaleTimeString()}!`,
          'success'
        );
        // Wait a moment for database to be fully committed, then trigger callback to refresh appointments in Dashboard
        // IMPORTANT: Do NOT clear chat after booking - the chat should persist to show the booking confirmation
        setTimeout(async () => {
          console.log('🔄 Calling onAppointmentBooked callback...');
          await onAppointmentBooked?.();
          console.log('✅ Callback complete - chat history is preserved');
        }, 500);
      } else {
        console.log('ℹ️ No appointment action received (expected for non-booking messages)');
      }
    } catch (error: any) {
      console.error('Error sending message:', error);

      // Check if it's a timeout error
      if (error.code === 'ECONNABORTED') {
        showToast(
          'Request took too long. The AI might still be processing. Please wait a moment and try again.',
          'error'
        );
      } else {
        showToast(
          error.response?.data?.message || 'Failed to send message. Please try again.',
          'error'
        );
      }

      // Don't add an error message to the chat - just show the toast
      // This prevents confusing error messages in the conversation
    } finally {
      setIsTyping(false);
    }
  };

  return (
    <div className="chat-container">
      <div className="chat-header">
        <div className="chat-header-left">
          <h2>💬 AI Medical Assistant</h2>
        </div>
        <div className="chat-header-right">
          <div className="connection-status">
            <span className={`status-dot ${isConnected ? 'connected' : 'disconnected'}`}></span>
            <span>{isConnected ? 'Connected' : 'Connecting...'}</span>
          </div>
          <button
            className="btn-clear-chat"
            onClick={clearChatHistory}
            title="Clear chat history"
          >
            🗑️ Clear
          </button>
        </div>
      </div>

      <div className="chat-messages">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`message ${msg.sender === 'PATIENT' ? 'message-sent' : 'message-received'}`}
          >
            <div className="message-content">
              <p style={{ whiteSpace: 'pre-wrap' }}>{msg.content}</p>
              <small className="message-time">
                {new Date(msg.timestamp).toLocaleTimeString()}
              </small>
            </div>
          </div>
        ))}

        {isTyping && (
          <div className="message message-received">
            <div className="message-content typing-indicator">
              <span></span>
              <span></span>
              <span></span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Your Files Section - Modern Professional Design */}
      <div className="files-section-modern">
        <div
          className="files-header"
          onClick={() => setShowFilesList(!showFilesList)}
        >
          <div className="files-header-left">
            <svg className="files-icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
            </svg>
            <span className="files-title">My Documents</span>
            {userFiles.length > 0 && (
              <span className="files-count">{userFiles.length}</span>
            )}
          </div>
          <svg className={`files-chevron-svg ${showFilesList ? 'open' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="6 9 12 15 18 9"/>
          </svg>
        </div>

        {showFilesList && (
          <div className="files-content">
            {isLoadingFiles ? (
              <div className="files-loading-modern">
                <div className="loading-spinner"></div>
                <span>Loading documents...</span>
              </div>
            ) : userFiles.length === 0 ? (
              <div className="files-empty-modern">
                <svg className="empty-icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                  <polyline points="14 2 14 8 20 8"/>
                  <line x1="12" y1="18" x2="12" y2="12"/>
                  <line x1="9" y1="15" x2="15" y2="15"/>
                </svg>
                <h4>No documents yet</h4>
                <p>Upload your medical files using the attachment button above</p>
              </div>
            ) : (
              <div className="files-list-modern">
                {userFiles.map((file) => (
                  <div key={file.id} className="file-item">
                    <div className="file-item-icon">
                      {file.fileCategory === 'LAB_RESULT' && (
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/>
                          <polyline points="14 2 14 8 20 8"/>
                          <path d="M10 13l-2 2 2 2"/>
                          <path d="M14 17l2-2-2-2"/>
                        </svg>
                      )}
                      {file.fileCategory === 'IMAGING' && (
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                          <circle cx="8.5" cy="8.5" r="1.5"/>
                          <polyline points="21 15 16 10 5 21"/>
                        </svg>
                      )}
                      {file.fileCategory === 'PRESCRIPTION' && (
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>
                        </svg>
                      )}
                      {!['LAB_RESULT', 'IMAGING', 'PRESCRIPTION'].includes(file.fileCategory) && (
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/>
                          <polyline points="14 2 14 8 20 8"/>
                        </svg>
                      )}
                    </div>
                    <div className="file-item-info">
                      <div className="file-item-name" title={file.fileName}>{file.fileName}</div>
                      <div className="file-item-meta">
                        <span className="file-item-category">{file.fileCategory.replace(/_/g, ' ')}</span>
                        <span className="file-item-dot">•</span>
                        <span className="file-item-date">
                          {new Date(file.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        </span>
                      </div>
                    </div>
                    <div className="file-item-status">
                      <span className={`status-badge ${file.reviewStatus.toLowerCase()}`}>
                        {file.reviewStatus === 'PENDING' && 'Pending'}
                        {file.reviewStatus === 'REVIEWED' && 'Reviewed'}
                        {file.reviewStatus === 'APPROVED' && 'Approved'}
                      </span>
                    </div>
                    <div className="file-item-actions">
                      <button
                        className="action-btn-labeled preview"
                        onClick={() => setPreviewingFile(file)}
                      >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                          <circle cx="12" cy="12" r="3"/>
                        </svg>
                        <span>Preview</span>
                      </button>
                      <button
                        className="action-btn-labeled download"
                        onClick={() => handleDownloadFile(file.id, file.fileName)}
                      >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                          <polyline points="7 10 12 15 17 10"/>
                          <line x1="12" y1="15" x2="12" y2="3"/>
                        </svg>
                        <span>Download</span>
                      </button>
                      <button
                        className="action-btn-labeled delete"
                        onClick={() => handleDeleteFile(file.id)}
                      >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <polyline points="3 6 5 6 21 6"/>
                          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                        </svg>
                        <span>Delete</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* File Upload Section */}
      {selectedFile && (
        <FileUploadEnhanced
          user={user}
          categoryFilter="OTHER"
          compact={false}
          showProgress={true}
          onFileUploaded={() => {
            setSelectedFile(null);
            setInputMessage('');
            if (fileInputRef.current) {
              fileInputRef.current.value = '';
            }
          }}
          onCancel={() => {
            setSelectedFile(null);
            if (fileInputRef.current) {
              fileInputRef.current.value = '';
            }
          }}
        />
      )}

      {/* Message Input Form */}
      <form className="chat-input-form" onSubmit={handleSendMessage}>
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileSelect}
          style={{ display: 'none' }}
          accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={!isConnected || isUploading || !!selectedFile}
          className="btn-upload"
          title="Upload file"
        >
          📎
        </button>
        <input
          type="text"
          value={inputMessage}
          onChange={(e) => setInputMessage(e.target.value)}
          placeholder={selectedFile ? 'File selected - scroll up to upload' : 'Type your message...'}
          disabled={!isConnected || !!selectedFile}
          className="chat-input"
        />
        <button
          type="submit"
          disabled={!isConnected || !inputMessage.trim()}
          className="btn-send"
        >
          Send
        </button>
      </form>

      <div className="chat-disclaimer">
        <small>
          ⚠️ This AI assistant is not a doctor and cannot provide medical diagnoses.
          For emergencies, call 911 or visit your nearest emergency room.
        </small>
      </div>

      {toast.show && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast({ ...toast, show: false })}
        />
      )}

      {previewingFile && (
        <FilePreviewModal
          fileId={previewingFile.id}
          fileName={previewingFile.fileName}
          fileType={previewingFile.fileType}
          fileSize={previewingFile.fileSize}
          fileCategory={previewingFile.fileCategory}
          isOpen={true}
          user={user}
          onClose={() => setPreviewingFile(null)}
        />
      )}
    </div>
  );
};

export default Chat;
