import React, { useState, useEffect, useRef } from 'react';
import { Socket } from 'socket.io-client';
import axios from 'axios';
import './FileNotificationBell.css';

interface FileNotification {
  id: string;
  fileId: string;
  file: {
    id: string;
    fileName: string;
    fileCategory: string;
    fileSize: number;
    createdAt: string;
  };
  patient: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
  };
  status: 'PENDING' | 'READ' | 'ARCHIVED';
  createdAt: string;
}

interface FileNotificationBellProps {
  user: {
    id: string;
    token: string;
  };
  socket?: Socket | null;
  onNotificationClick?: (notification: FileNotification) => void;
}

const FileNotificationBell: React.FC<FileNotificationBellProps> = ({
  user,
  socket,
  onNotificationClick,
}) => {
  const [notifications, setNotifications] = useState<FileNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showDropdown, setShowDropdown] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const bellRef = useRef<HTMLButtonElement>(null);

  const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3000/api';

  // Load initial notifications
  useEffect(() => {
    loadNotifications();
  }, [user.token]);

  // Subscribe to real-time file upload events
  useEffect(() => {
    if (!socket) return;

    // Subscribe to file notifications
    socket.emit('subscribe:file-notifications');

    // Listen for new file uploads
    socket.on('file:uploaded', (data) => {
      console.log('New file uploaded:', data);
      // Add notification to top of list
      setNotifications((prev) => [
        {
          id: data.notificationId,
          fileId: data.fileId,
          file: {
            id: data.fileId,
            fileName: data.fileName,
            fileCategory: data.fileCategory,
            fileSize: data.fileSize,
            createdAt: data.uploadedAt,
          },
          patient: {
            id: data.patientId,
            firstName: data.patientName.split(' ')[0],
            lastName: data.patientName.split(' ')[1] || '',
            email: '',
          },
          status: 'PENDING',
          createdAt: data.uploadedAt,
        },
        ...prev,
      ]);
      setUnreadCount((prev) => prev + 1);

      // Play notification sound if available
      playNotificationSound();
    });

    // Listen for annotation updates
    socket.on('file:annotation:added', (data) => {
      console.log('Annotation added:', data);
      // Could add a secondary notification here
    });

    return () => {
      socket.off('file:uploaded');
      socket.off('file:annotation:added');
    };
  }, [socket]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node) &&
        bellRef.current &&
        !bellRef.current.contains(event.target as Node)
      ) {
        setShowDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Load notifications from API
  const loadNotifications = async () => {
    try {
      setIsLoading(true);
      const response = await axios.get(`${API_URL}/doctor/files/notifications?status=PENDING&limit=10`, {
        headers: {
          Authorization: `Bearer ${user.token}`,
        },
      });

      setNotifications(response.data.data || []);
      setUnreadCount(response.data.pagination?.unreadCount || 0);
    } catch (error) {
      console.error('Error loading notifications:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Mark notification as read
  const markAsRead = async (notificationId: string) => {
    try {
      // Update locally first
      setNotifications((prev) =>
        prev.map((n) =>
          n.id === notificationId ? { ...n, status: 'READ' } : n
        )
      );

      setUnreadCount((prev) => Math.max(0, prev - 1));

      // Update on server
      await axios.put(
        `${API_URL}/doctor/files/notifications/${notificationId}/read`,
        {},
        {
          headers: {
            Authorization: `Bearer ${user.token}`,
          },
        }
      );

      // Emit via WebSocket for real-time sync
      if (socket) {
        socket.emit('file:notification:mark-read', notificationId);
      }
    } catch (error) {
      console.error('Error marking notification as read:', error);
      // Revert local change on error
      loadNotifications();
    }
  };

  // Archive notification
  const archiveNotification = async (notificationId: string) => {
    try {
      // Update locally first
      setNotifications((prev) => prev.filter((n) => n.id !== notificationId));

      // Update on server
      await axios.put(
        `${API_URL}/doctor/files/notifications/${notificationId}/archive`,
        {},
        {
          headers: {
            Authorization: `Bearer ${user.token}`,
          },
        }
      );

      // Emit via WebSocket
      if (socket) {
        socket.emit('file:notification:archive', notificationId);
      }
    } catch (error) {
      console.error('Error archiving notification:', error);
      // Revert local change on error
      loadNotifications();
    }
  };

  // Play notification sound
  const playNotificationSound = () => {
    // Create a simple beep sound using Web Audio API
    try {
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);

      oscillator.frequency.value = 800;
      oscillator.type = 'sine';

      gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);

      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.5);
    } catch (error) {
      // Audio context not available, skip
      console.log('Audio context not available for notification sound');
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

  // Format date
  const formatDate = (dateString: string): string => {
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

  return (
    <div className="file-notification-bell">
      <button
        ref={bellRef}
        onClick={() => setShowDropdown(!showDropdown)}
        className={`bell-button ${unreadCount > 0 ? 'has-notifications' : ''}`}
        title={`${unreadCount} new file notifications`}
      >
        📄
        {unreadCount > 0 && <span className="notification-badge">{unreadCount}</span>}
      </button>

      {/* Dropdown Menu */}
      {showDropdown && (
        <div ref={dropdownRef} className="notification-dropdown">
          <div className="dropdown-header">
            <h3>📁 File Notifications</h3>
            {unreadCount > 0 && (
              <span className="unread-count">{unreadCount} new</span>
            )}
          </div>

          {/* Notifications List */}
          <div className="notifications-list">
            {isLoading ? (
              <div className="loading-state">
                <p>Loading notifications...</p>
              </div>
            ) : notifications.length === 0 ? (
              <div className="empty-state">
                <p>No file notifications</p>
              </div>
            ) : (
              notifications.map((notification) => (
                <div
                  key={notification.id}
                  className={`notification-item ${notification.status === 'PENDING' ? 'unread' : 'read'}`}
                >
                  {/* Patient Info */}
                  <div
                    className="notification-content"
                    onClick={() => {
                      onNotificationClick?.(notification);
                      setShowDropdown(false);
                    }}
                  >
                    <div className="patient-info">
                      <p className="patient-name">
                        {notification.patient.firstName} {notification.patient.lastName}
                      </p>
                      <p className="file-info">
                        📄 {notification.file.fileName}
                      </p>
                      <div className="notification-meta">
                        <span className="file-category">
                          {notification.file.fileCategory}
                        </span>
                        <span className="file-size">
                          {formatFileSize(notification.file.fileSize)}
                        </span>
                        <span className="time-ago">
                          {formatDate(notification.createdAt)}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="notification-actions">
                    {notification.status === 'PENDING' && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          markAsRead(notification.id);
                        }}
                        className="action-btn mark-read"
                        title="Mark as read"
                      >
                        ✓
                      </button>
                    )}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        archiveNotification(notification.id);
                      }}
                      className="action-btn archive"
                      title="Archive"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Footer */}
          {notifications.length > 0 && (
            <div className="dropdown-footer">
              <button
                onClick={() => {
                  loadNotifications();
                }}
                className="btn-refresh"
              >
                🔄 Refresh
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default FileNotificationBell;
