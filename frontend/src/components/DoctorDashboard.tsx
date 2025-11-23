import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { io, Socket } from 'socket.io-client';
import VisitRecorder from './VisitRecorder';
import PatientsList from './PatientsList';
import DoctorSettings from './DoctorSettings';
import FileNotificationBell from './FileNotificationBell';
import FilePreviewModal from './FilePreviewModal';
import './DoctorDashboard.css';

const API_URL = 'http://localhost:3000/api';
const SOCKET_URL = 'http://localhost:3000';

interface DoctorDashboardProps {
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    token: string;
  };
  onLogout: () => void;
}

interface Stats {
  todayAppointments: number;
  pendingApprovals: number;
  qBoardItems: number;
}

interface ApprovalItem {
  id: string;
  contentType: string;
  draftContent: any;
  patientId: string;
  createdAt: string;
}

interface QBoardItem {
  id: string;
  question: string;
  context: string;
  category: string;
  urgency: number;
  patientId: string;
  createdAt: string;
}

interface TodayPatient {
  id: string;
  scheduledAt: string;
  visitType: string;
  reasonForVisit: string;
  status: string;
  durationMinutes: number;
  priorityScore: number;
  patient: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    phone: string | null;
  };
}

const DoctorDashboard: React.FC<DoctorDashboardProps> = ({ user, onLogout }) => {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'approvals' | 'qboard' | 'patients' | 'completed' | 'all-patients' | 'settings' | 'files'>('dashboard');
  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(null);
  const [stats, setStats] = useState<Stats>({ todayAppointments: 0, pendingApprovals: 0, qBoardItems: 0 });
  const [approvals, setApprovals] = useState<ApprovalItem[]>([]);
  const [qBoard, setQBoard] = useState<QBoardItem[]>([]);
  const [todayPatients, setTodayPatients] = useState<TodayPatient[]>([]);
  const [completedVisits, setCompletedVisits] = useState<TodayPatient[]>([]);
  const [recordingVisit, setRecordingVisit] = useState<TodayPatient | null>(null);
  const [loading, setLoading] = useState(false);
  const [responseText, setResponseText] = useState<{ [key: string]: string }>({});

  // Visit Summary Modal
  const [selectedSummaryVisit, setSelectedSummaryVisit] = useState<TodayPatient | null>(null);

  // Manual visit creation
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [creatingVisit, setCreatingVisit] = useState(false);

  // WebSocket
  const socketRef = useRef<Socket | null>(null);
  const [showNotification, setShowNotification] = useState(false);
  const [notificationMessage, setNotificationMessage] = useState('');

  // Custom Modal
  const [modalConfig, setModalConfig] = useState<{
    show: boolean;
    title: string;
    message: string;
    type: 'alert' | 'confirm' | 'prompt';
    inputValue?: string;
    onConfirm?: (value?: string) => void;
    onCancel?: () => void;
  }>({
    show: false,
    title: '',
    message: '',
    type: 'alert',
  });

  // Edit Dialog State
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingApproval, setEditingApproval] = useState<ApprovalItem | null>(null);
  const [editChatMessages, setEditChatMessages] = useState<Array<{ role: 'user' | 'assistant'; content: string }>>([]);
  const [editInstructions, setEditInstructions] = useState('');
  const [editProcessing, setEditProcessing] = useState(false);

  // File Management State
  const [patientFiles, setPatientFiles] = useState<any[]>([]);
  const [previewingFile, setPreviewingFile] = useState<any | null>(null);
  const [filesLoading, setFilesLoading] = useState(false);
  const [selectedPatientFiles, setSelectedPatientFiles] = useState<{
    patientId: string;
    patientName: string;
    files: any[];
  } | null>(null);

  // Group files by patient
  const groupedPatientFiles = React.useMemo(() => {
    const grouped: { [key: string]: { patient: any; files: any[]; unreadCount: number } } = {};

    patientFiles.forEach((notification) => {
      const patientId = notification.patient?.id;
      if (!patientId) return;

      if (!grouped[patientId]) {
        grouped[patientId] = {
          patient: notification.patient,
          files: [],
          unreadCount: 0,
        };
      }

      grouped[patientId].files.push(notification);
      if (notification.status !== 'READ') {
        grouped[patientId].unreadCount++;
      }
    });

    return Object.values(grouped).sort((a, b) => b.unreadCount - a.unreadCount);
  }, [patientFiles]);

  const showModal = (title: string, message: string, type: 'alert' | 'confirm' | 'prompt' = 'alert', onConfirm?: (value?: string) => void) => {
    return new Promise<string | boolean>((resolve) => {
      setModalConfig({
        show: true,
        title,
        message,
        type,
        inputValue: type === 'prompt' ? '' : undefined,
        onConfirm: (value?: string) => {
          setModalConfig(prev => ({ ...prev, show: false }));
          if (onConfirm) onConfirm(value);
          resolve(type === 'prompt' ? (value || '') : true);
        },
        onCancel: () => {
          setModalConfig(prev => ({ ...prev, show: false }));
          resolve(type === 'prompt' ? '' : false);
        },
      });
    });
  };

  // Initialize WebSocket connection
  useEffect(() => {
    const socket = io(SOCKET_URL, {
      auth: {
        token: user.token,
      },
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('WebSocket connected');
    });

    socket.on('visit_processing_complete', (data: { visitId: string; patientId: string; status: string }) => {
      console.log('Visit processing complete:', data);

      // Show notification
      setNotificationMessage('✅ Visit processing complete! Check the approval queue.');
      setShowNotification(true);
      setTimeout(() => setShowNotification(false), 5000);

      // Refresh data
      loadTodayPatients();
      loadCompletedVisits();
      loadDashboardStats();
      if (activeTab === 'approvals') {
        loadApprovals();
      }
    });

    socket.on('visit_processing_failed', (data: { visitId: string; patientId: string; status: string; error: string }) => {
      console.error('Visit processing failed:', data);

      // Show error notification
      setNotificationMessage(`❌ Visit processing failed: ${data.error}`);
      setShowNotification(true);
      setTimeout(() => setShowNotification(false), 5000);

      // Refresh data
      loadTodayPatients();
      loadDashboardStats();
    });

    // File upload notification listener
    socket.on('file:uploaded', (data: any) => {
      console.log('File uploaded notification:', data);
      setNotificationMessage(`📁 New file uploaded: ${data.fileName} from ${data.patient?.firstName}`);
      setShowNotification(true);
      setTimeout(() => setShowNotification(false), 5000);

      // Refresh files if on files tab
      if (activeTab === 'files') {
        loadPatientFiles();
      }
    });

    socket.on('disconnect', () => {
      console.log('WebSocket disconnected');
    });

    return () => {
      socket.disconnect();
    };
  }, [user.token]);

  useEffect(() => {
    loadDashboardStats();
  }, []);

  useEffect(() => {
    if (activeTab === 'approvals') {
      loadApprovals();
    } else if (activeTab === 'qboard') {
      loadQBoard();
    } else if (activeTab === 'patients') {
      loadTodayPatients();
    } else if (activeTab === 'completed') {
      loadCompletedVisits();
    } else if (activeTab === 'files') {
      loadPatientFiles();
    }
  }, [activeTab]);

  const loadDashboardStats = async () => {
    try {
      const response = await axios.get(`${API_URL}/doctor/dashboard/stats`, {
        headers: { Authorization: `Bearer ${user.token}` },
      });
      setStats(response.data.data);
    } catch (error) {
      console.error('Error loading stats:', error);
    }
  };

  const loadTodayPatients = async () => {
    try {
      setLoading(true);
      const response = await axios.get(`${API_URL}/doctor/today-patients`, {
        headers: { Authorization: `Bearer ${user.token}` },
      });
      setTodayPatients(response.data.data);
    } catch (error) {
      console.error('Error loading today\'s patients:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadCompletedVisits = async () => {
    try {
      setLoading(true);
      const response = await axios.get(`${API_URL}/doctor/completed-visits`, {
        headers: { Authorization: `Bearer ${user.token}` },
      });
      setCompletedVisits(response.data.data);
    } catch (error) {
      console.error('Error loading completed visits:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadApprovals = async () => {
    try {
      setLoading(true);
      const response = await axios.get(`${API_URL}/doctor/approvals`, {
        headers: { Authorization: `Bearer ${user.token}` },
      });
      setApprovals(response.data.data);
    } catch (error) {
      console.error('Error loading approvals:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadQBoard = async () => {
    try {
      setLoading(true);
      const response = await axios.get(`${API_URL}/doctor/qboard`, {
        headers: { Authorization: `Bearer ${user.token}` },
      });
      setQBoard(response.data.data);
    } catch (error) {
      console.error('Error loading Q-Board:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadPatientFiles = async () => {
    try {
      setFilesLoading(true);
      // Show all patient files (both PENDING and READ)
      const response = await axios.get(`${API_URL}/doctor/files/notifications?limit=50&offset=0`, {
        headers: { Authorization: `Bearer ${user.token}` },
      });
      setPatientFiles(response.data.data || []);
    } catch (error) {
      console.error('Error loading patient files:', error);
      setNotificationMessage('❌ Error loading patient files');
      setShowNotification(true);
      setTimeout(() => setShowNotification(false), 3000);
    } finally {
      setFilesLoading(false);
    }
  };

  // Search for patients
  const handleSearchPatients = async () => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }

    try {
      setSearching(true);
      const response = await axios.get(`${API_URL}/doctor/search-patients?q=${encodeURIComponent(searchQuery)}`, {
        headers: { Authorization: `Bearer ${user.token}` },
      });
      setSearchResults(response.data.data || []);
    } catch (error) {
      console.error('Error searching patients:', error);
      alert('Error searching for patients');
    } finally {
      setSearching(false);
    }
  };

  // Manually create and start a visit
  const handleManualStartVisit = async (patient: any) => {
    try {
      setCreatingVisit(true);

      // Create a manual visit
      const response = await axios.post(
        `${API_URL}/doctor/manual-visit`,
        {
          patientId: patient.id,
          reasonForVisit: 'Urgent visit',
          visitType: 'urgent',
          durationMinutes: 30,
        },
        {
          headers: { Authorization: `Bearer ${user.token}` },
        }
      );

      const newVisit = response.data.data;

      // Add to today's patients list
      setTodayPatients([...todayPatients, newVisit]);

      // Clear search
      setSearchQuery('');
      setSearchResults([]);

      // Automatically start recording for this visit
      setRecordingVisit(newVisit);

      alert(`Visit created successfully for ${patient.firstName} ${patient.lastName}! You can now start recording.`);
    } catch (error: any) {
      console.error('Error creating manual visit:', error);
      alert(error.response?.data?.message || 'Error creating visit');
    } finally {
      setCreatingVisit(false);
    }
  };

  const handleApprove = async (id: string) => {
    try {
      await axios.post(
        `${API_URL}/doctor/approvals/${id}/approve`,
        {},
        { headers: { Authorization: `Bearer ${user.token}` } }
      );
      setNotificationMessage('✅ Content approved successfully!');
      setShowNotification(true);
      setTimeout(() => setShowNotification(false), 3000);
      loadApprovals();
      loadDashboardStats();
    } catch (error) {
      setNotificationMessage('❌ Error approving content');
      setShowNotification(true);
      setTimeout(() => setShowNotification(false), 3000);
      console.error(error);
    }
  };

  const handleReject = async (id: string) => {
    const reason = await showModal(
      'Reject Content',
      'Please provide a reason for rejection (optional):',
      'prompt'
    ) as string;

    try {
      await axios.post(
        `${API_URL}/doctor/approvals/${id}/reject`,
        { reason },
        { headers: { Authorization: `Bearer ${user.token}` } }
      );
      setNotificationMessage('✅ Content rejected successfully!');
      setShowNotification(true);
      setTimeout(() => setShowNotification(false), 3000);
      loadApprovals();
      loadDashboardStats();
    } catch (error) {
      setNotificationMessage('❌ Error rejecting content');
      setShowNotification(true);
      setTimeout(() => setShowNotification(false), 3000);
      console.error(error);
    }
  };

  const handleEditContent = (approval: ApprovalItem) => {
    setEditingApproval(approval);
    setEditChatMessages([]);
    setEditInstructions('');
    setEditDialogOpen(true);
  };

  const handleSendEditInstruction = async () => {
    if (!editInstructions.trim() || !editingApproval) return;

    const userMessage = { role: 'user' as const, content: editInstructions };
    setEditChatMessages(prev => [...prev, userMessage]);
    setEditProcessing(true);
    setEditInstructions('');

    try {
      const response = await axios.post(
        `${API_URL}/doctor/approvals/${editingApproval.id}/edit-with-ai`,
        {
          instruction: editInstructions,
          currentContent: editingApproval.draftContent
        },
        { headers: { Authorization: `Bearer ${user.token}` } }
      );

      const aiMessage = { role: 'assistant' as const, content: response.data.data.updatedContent };
      setEditChatMessages(prev => [...prev, aiMessage]);

      // Update the approval with new content
      setEditingApproval(prev => prev ? {
        ...prev,
        draftContent: response.data.data.parsedContent || prev.draftContent
      } : null);

      setEditProcessing(false);
    } catch (error) {
      console.error('Error processing edit instruction:', error);
      const errorMessage = { role: 'assistant' as const, content: 'Error: Could not process your edit request. Please try again.' };
      setEditChatMessages(prev => [...prev, errorMessage]);
      setEditProcessing(false);
    }
  };

  const handleApplyEdits = async () => {
    if (!editingApproval) return;

    try {
      // First update the content
      await axios.put(
        `${API_URL}/doctor/approvals/${editingApproval.id}`,
        { draftContent: editingApproval.draftContent },
        { headers: { Authorization: `Bearer ${user.token}` } }
      );

      // Then automatically approve it
      await axios.post(
        `${API_URL}/doctor/approvals/${editingApproval.id}/approve`,
        {},
        { headers: { Authorization: `Bearer ${user.token}` } }
      );

      setNotificationMessage('✅ Changes confirmed and approved successfully!');
      setShowNotification(true);
      setTimeout(() => setShowNotification(false), 3000);

      setEditDialogOpen(false);
      setEditingApproval(null);
      setEditChatMessages([]);
      loadApprovals();
      loadDashboardStats();
    } catch (error) {
      setNotificationMessage('❌ Error confirming changes');
      setShowNotification(true);
      setTimeout(() => setShowNotification(false), 3000);
      console.error(error);
    }
  };

  const handleQBoardResponse = async (id: string) => {
    const response = responseText[id];
    if (!response || !response.trim()) {
      alert('Please enter a response');
      return;
    }

    try {
      await axios.post(
        `${API_URL}/doctor/qboard/${id}/respond`,
        { response },
        { headers: { Authorization: `Bearer ${user.token}` } }
      );
      alert('Response sent to patient!');
      setResponseText({ ...responseText, [id]: '' });
      loadQBoard();
      loadDashboardStats();
    } catch (error) {
      alert('Error sending response');
      console.error(error);
    }
  };

  const renderClinicalNote = (draftContent: any) => {
    if (!draftContent) return null;

    const renderSection = (title: string, content: any, icon: string = '📝') => {
      if (!content) return null;

      return (
        <div style={{ marginBottom: '24px' }}>
          <h4 style={{
            fontSize: '1.1em',
            fontWeight: 'bold',
            color: '#2563eb',
            marginBottom: '8px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            borderBottom: '2px solid #dbeafe',
            paddingBottom: '6px'
          }}>
            <span>{icon}</span> {title}
          </h4>
          <div style={{
            fontSize: '0.95em',
            lineHeight: '1.7',
            color: '#374151',
            whiteSpace: 'pre-wrap',
            padding: '12px',
            backgroundColor: '#f9fafb',
            borderRadius: '6px',
            border: '1px solid #e5e7eb'
          }}>
            {typeof content === 'string' ? content : JSON.stringify(content, null, 2)}
          </div>
        </div>
      );
    };

    const renderOrders = (orders: any[]) => {
      if (!orders || orders.length === 0) return null;

      return (
        <div style={{ marginBottom: '24px' }}>
          <h4 style={{
            fontSize: '1.1em',
            fontWeight: 'bold',
            color: '#2563eb',
            marginBottom: '12px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            borderBottom: '2px solid #dbeafe',
            paddingBottom: '6px'
          }}>
            <span>📋</span> Orders & Follow-ups
          </h4>
          {orders.map((order, idx) => (
            <div key={idx} style={{
              marginBottom: '12px',
              padding: '14px',
              backgroundColor: '#eff6ff',
              borderRadius: '8px',
              border: '1px solid #bfdbfe'
            }}>
              <div style={{
                fontWeight: 'bold',
                color: '#1e40af',
                marginBottom: '6px',
                fontSize: '0.95em'
              }}>
                {order.type?.replace(/_/g, ' ') || 'Order'}
              </div>
              {order.medication && (
                <div style={{ marginBottom: '8px' }}>
                  <strong>Medication:</strong> {order.medication.name} {order.medication.dosage}
                  {order.medication.route && ` (${order.medication.route})`}
                  <br />
                  <strong>Frequency:</strong> {order.medication.frequency}
                  {order.medication.duration && ` for ${order.medication.duration}`}
                </div>
              )}
              <div style={{ fontSize: '0.9em', color: '#1e293b' }}>
                <strong>Description:</strong> {order.description}
              </div>
              {order.instructions && (
                <div style={{
                  marginTop: '6px',
                  fontSize: '0.9em',
                  color: '#475569',
                  fontStyle: 'italic'
                }}>
                  📌 {order.instructions}
                </div>
              )}
            </div>
          ))}
        </div>
      );
    };

    const renderSafetyFlags = (flags: string[]) => {
      if (!flags || flags.length === 0) return null;

      return (
        <div style={{ marginBottom: '24px' }}>
          <h4 style={{
            fontSize: '1.1em',
            fontWeight: 'bold',
            color: '#dc2626',
            marginBottom: '12px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}>
            <span>⚠️</span> Safety Alerts
          </h4>
          {flags.map((flag, idx) => (
            <div key={idx} style={{
              padding: '12px',
              backgroundColor: '#fef2f2',
              borderLeft: '4px solid #dc2626',
              marginBottom: '8px',
              borderRadius: '4px',
              color: '#7f1d1d',
              fontSize: '0.9em'
            }}>
              {flag}
            </div>
          ))}
        </div>
      );
    };

    return (
      <div style={{ padding: '16px' }}>
        {draftContent.assessment && renderSection('Assessment', draftContent.assessment, '🩺')}
        {draftContent.hpi && renderSection('History of Present Illness (HPI)', draftContent.hpi, '📖')}
        {draftContent.physicalExam && renderSection('Physical Examination', draftContent.physicalExam, '👨‍⚕️')}
        {draftContent.ros && renderSection('Review of Systems (ROS)', draftContent.ros, '🔍')}
        {draftContent.plan && renderSection('Plan', draftContent.plan, '📊')}
        {draftContent.orders && renderOrders(draftContent.orders)}
        {draftContent.safetyFlags && renderSafetyFlags(draftContent.safetyFlags)}
        {draftContent.patientSummary && renderSection('Patient Summary', draftContent.patientSummary, '💬')}

        {draftContent.confidenceScore !== undefined && (
          <div style={{
            marginTop: '20px',
            padding: '12px',
            backgroundColor: '#f0fdf4',
            borderRadius: '8px',
            border: '1px solid #86efac',
            fontSize: '0.9em',
            color: '#166534'
          }}>
            <strong>AI Confidence Score:</strong> {(draftContent.confidenceScore * 100).toFixed(0)}%
          </div>
        )}
      </div>
    );
  };

  const renderProfileUpdates = (draftContent: any) => {
    const { currentProfile, proposedUpdates } = draftContent;
    if (!proposedUpdates) return null;

    const renderField = (label: string, current: any, proposed: any) => {
      if (!proposed && (!current || (Array.isArray(current) && current.length === 0))) {
        return null;
      }

      const formatValue = (val: any) => {
        if (val === null || val === undefined) return 'Not set';
        if (Array.isArray(val)) return val.length > 0 ? val.join(', ') : 'None';
        if (typeof val === 'object') return JSON.stringify(val, null, 2);
        return val.toString();
      };

      return (
        <div key={label} className="profile-field-update">
          <div className="field-label">{label}</div>
          <div className="field-comparison">
            <div className="field-current">
              <strong>Current:</strong>
              <span>{formatValue(current)}</span>
            </div>
            {proposed && (
              <div className="field-proposed">
                <strong>Proposed:</strong>
                <span className="highlight">{formatValue(proposed)}</span>
              </div>
            )}
          </div>
        </div>
      );
    };

    return (
      <div className="profile-updates-grid">
        {renderField('Blood Type', currentProfile.bloodType, proposedUpdates.bloodType)}
        {renderField('Allergies', currentProfile.allergies, proposedUpdates.newAllergies)}
        {renderField('Medications', currentProfile.currentMedications, proposedUpdates.newMedications)}
        {renderField('Chronic Conditions', currentProfile.chronicConditions, proposedUpdates.newChronicConditions)}
        {renderField('Past Surgeries', currentProfile.pastSurgeries, proposedUpdates.pastSurgeries)}
        {renderField('Past Hospitalizations', currentProfile.pastHospitalizations, proposedUpdates.pastHospitalizations)}
        {renderField('Active Problems', currentProfile.activeProblems, proposedUpdates.updatedProblems)}
        {renderField('Family History', currentProfile.familyHistory, proposedUpdates.familyHistory)}
        {renderField('Smoking Status', currentProfile.smokingStatus, proposedUpdates.smokingStatus)}
        {renderField('Alcohol Use', currentProfile.alcoholUse, proposedUpdates.alcoholUse)}
        {renderField('Exercise Habits', currentProfile.exerciseHabits, proposedUpdates.exerciseHabits)}
        {renderField('Occupation', currentProfile.occupation, proposedUpdates.occupation)}
        {renderField('Vaccination History', currentProfile.vaccinationHistory, proposedUpdates.vaccinationHistory)}
      </div>
    );
  };

  return (
    <div className="doctor-dashboard">
      {/* Custom Notification Toast */}
      {showNotification && (
        <div style={{
          position: 'fixed',
          top: '20px',
          right: '20px',
          background: notificationMessage.startsWith('✅') ? '#10b981' : '#ef4444',
          color: 'white',
          padding: '16px 24px',
          borderRadius: '8px',
          boxShadow: '0 10px 25px rgba(0,0,0,0.3)',
          zIndex: 10000,
          fontSize: '15px',
          fontWeight: '500',
          animation: 'slideIn 0.3s ease-out',
          maxWidth: '400px'
        }}>
          {notificationMessage}
        </div>
      )}

      <nav className="navbar">
        <div className="nav-brand">
          <h1>🏥 CAIA Clinic - Doctor Portal</h1>
        </div>
        <div className="nav-user">
          <FileNotificationBell
            user={user}
            socket={socketRef.current}
            onNotificationClick={(notification) => {
              // Could open file preview here if needed
              console.log('Notification clicked:', notification);
            }}
          />
          <span>Dr. {user.firstName} {user.lastName}</span>
          <button onClick={onLogout} className="btn-logout">Logout</button>
        </div>
      </nav>

      <div className="dashboard-container">
        <aside className="sidebar">
          <ul>
            <li className={activeTab === 'dashboard' ? 'active' : ''}>
              <button onClick={() => setActiveTab('dashboard')}>
                📊 Dashboard
              </button>
            </li>
            <li className={activeTab === 'approvals' ? 'active' : ''}>
              <button onClick={() => setActiveTab('approvals')}>
                ✓ Approval Queue {stats.pendingApprovals > 0 && <span className="badge">{stats.pendingApprovals}</span>}
              </button>
            </li>
            <li className={activeTab === 'qboard' ? 'active' : ''}>
              <button onClick={() => setActiveTab('qboard')}>
                ❓ Q-Board {stats.qBoardItems > 0 && <span className="badge">{stats.qBoardItems}</span>}
              </button>
            </li>
            <li className={activeTab === 'patients' ? 'active' : ''}>
              <button onClick={() => setActiveTab('patients')}>
                👥 Today's Patients
              </button>
            </li>
            <li className={activeTab === 'all-patients' ? 'active' : ''}>
              <button onClick={() => setActiveTab('all-patients')}>
                📋 All Patients
              </button>
            </li>
            <li className={activeTab === 'completed' ? 'active' : ''}>
              <button onClick={() => setActiveTab('completed')}>
                ✅ Done Meetings
              </button>
            </li>
            <li className={activeTab === 'files' ? 'active' : ''}>
              <button onClick={() => setActiveTab('files')}>
                📁 Patient Files
              </button>
            </li>
            <li className={activeTab === 'settings' ? 'active' : ''}>
              <button onClick={() => setActiveTab('settings')}>
                ⚙️ Settings
              </button>
            </li>
          </ul>
        </aside>

        <main className="main-content">
          {activeTab === 'dashboard' && (
            <div className="dashboard-content">
              <h2>Doctor Dashboard</h2>
              <div className="stats-grid">
                <div className="stat-card">
                  <h3>📅 Today's Appointments</h3>
                  <p className="stat-number">{stats.todayAppointments}</p>
                  <small>Scheduled for today</small>
                </div>

                <div className="stat-card urgent">
                  <h3>✓ Pending Approvals</h3>
                  <p className="stat-number">{stats.pendingApprovals}</p>
                  <small>Awaiting review</small>
                </div>

                <div className="stat-card">
                  <h3>❓ Q-Board Items</h3>
                  <p className="stat-number">{stats.qBoardItems}</p>
                  <small>Patient questions</small>
                </div>
              </div>

              <div className="quick-actions-modern">
                <h3 className="quick-actions-title">Quick Actions</h3>
                <div className="quick-actions-grid">
                  {stats.pendingApprovals > 0 && (
                    <button onClick={() => setActiveTab('approvals')} className="quick-action-card">
                      <div className="quick-action-icon-wrapper" style={{ background: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)' }}>
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="9 11 12 14 22 4"></polyline>
                          <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path>
                        </svg>
                      </div>
                      <div className="quick-action-content">
                        <span className="quick-action-label">Review Approvals</span>
                        <span className="quick-action-description">{stats.pendingApprovals} item{stats.pendingApprovals > 1 ? 's' : ''} awaiting your review</span>
                      </div>
                      <div className="quick-action-badge">{stats.pendingApprovals}</div>
                      <svg className="quick-action-arrow" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="9 18 15 12 9 6"></polyline>
                      </svg>
                    </button>
                  )}

                  {stats.qBoardItems > 0 && (
                    <button onClick={() => setActiveTab('qboard')} className="quick-action-card">
                      <div className="quick-action-icon-wrapper" style={{ background: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)' }}>
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <circle cx="12" cy="12" r="10"></circle>
                          <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path>
                          <line x1="12" y1="17" x2="12.01" y2="17"></line>
                        </svg>
                      </div>
                      <div className="quick-action-content">
                        <span className="quick-action-label">Answer Questions</span>
                        <span className="quick-action-description">{stats.qBoardItems} patient question{stats.qBoardItems > 1 ? 's' : ''} pending</span>
                      </div>
                      <div className="quick-action-badge" style={{ background: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)' }}>{stats.qBoardItems}</div>
                      <svg className="quick-action-arrow" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="9 18 15 12 9 6"></polyline>
                      </svg>
                    </button>
                  )}

                  <button onClick={() => setActiveTab('patients')} className="quick-action-card">
                    <div className="quick-action-icon-wrapper" style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' }}>
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                        <circle cx="9" cy="7" r="4"></circle>
                        <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
                        <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
                      </svg>
                    </div>
                    <div className="quick-action-content">
                      <span className="quick-action-label">Today's Patients</span>
                      <span className="quick-action-description">View and manage today's appointments</span>
                    </div>
                    <svg className="quick-action-arrow" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="9 18 15 12 9 6"></polyline>
                    </svg>
                  </button>

                  <button onClick={() => setActiveTab('settings')} className="quick-action-card">
                    <div className="quick-action-icon-wrapper" style={{ background: 'linear-gradient(135deg, #a8edea 0%, #fed6e3 100%)' }}>
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#666" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="3"></circle>
                        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
                      </svg>
                    </div>
                    <div className="quick-action-content">
                      <span className="quick-action-label">Settings</span>
                      <span className="quick-action-description">Configure calendar and preferences</span>
                    </div>
                    <svg className="quick-action-arrow" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="9 18 15 12 9 6"></polyline>
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'approvals' && (
            <div className="approvals-content">
              <h2>Approval Queue</h2>
              {loading ? (
                <p>Loading...</p>
              ) : approvals.length === 0 ? (
                <p className="empty-state">No pending approvals</p>
              ) : (
                <div className="approval-list">
                  {approvals.map((item) => (
                    <div key={item.id} className="approval-card">
                      <div className="approval-header">
                        <span className="approval-type">{item.contentType.replace(/_/g, ' ')}</span>
                        <span className="approval-date">
                          {new Date(item.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                      <div className="approval-content">
                        {item.contentType === 'PATIENT_PROFILE_UPDATE' ? (
                          <div className="profile-update-view">
                            <h4>
                              {(item.draftContent as any).isFirstVisit &&
                                <span className="first-visit-badge">FIRST VISIT</span>
                              }
                              Patient Profile Updates
                            </h4>

                            {/* Display Comprehensive Patient Narrative */}
                            {(item.draftContent as any).comprehensiveNarrative && (
                              <div className="comprehensive-narrative-section">
                                <h5 style={{
                                  marginTop: '20px',
                                  marginBottom: '10px',
                                  borderBottom: '2px solid #2c3e50',
                                  paddingBottom: '8px',
                                  color: '#2c3e50',
                                  fontSize: '1.1em'
                                }}>
                                  📋 Comprehensive Patient Narrative
                                </h5>
                                <div style={{
                                  backgroundColor: '#f8f9fa',
                                  padding: '20px',
                                  borderRadius: '8px',
                                  border: '1px solid #dee2e6',
                                  fontFamily: 'Georgia, serif',
                                  lineHeight: '1.8',
                                  fontSize: '0.95em',
                                  whiteSpace: 'pre-wrap',
                                  maxHeight: '600px',
                                  overflowY: 'auto',
                                  color: '#333'
                                }}>
                                  {(item.draftContent as any).comprehensiveNarrative}
                                </div>
                              </div>
                            )}

                            {/* Display Structured Field Updates */}
                            <details style={{ marginTop: '20px' }}>
                              <summary style={{
                                cursor: 'pointer',
                                fontWeight: 'bold',
                                padding: '10px',
                                backgroundColor: '#e9ecef',
                                borderRadius: '4px',
                                marginBottom: '10px'
                              }}>
                                📊 View Structured Field Updates
                              </summary>
                              {renderProfileUpdates(item.draftContent as any)}
                            </details>
                          </div>
                        ) : item.contentType === 'CLINICAL_NOTE' ? (
                          renderClinicalNote(item.draftContent)
                        ) : (
                          <pre>{JSON.stringify(item.draftContent, null, 2)}</pre>
                        )}
                      </div>
                      <div className="approval-actions">
                        <button
                          onClick={() => handleApprove(item.id)}
                          className="btn-approve"
                        >
                          ✓ Approve
                        </button>
                        <button
                          onClick={() => handleEditContent(item)}
                          className="btn-edit"
                        >
                          ✏️ Edit
                        </button>
                        <button
                          onClick={() => handleReject(item.id)}
                          className="btn-reject"
                        >
                          ✗ Reject
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'qboard' && (
            <div className="qboard-content">
              <h2>Q-Board - Patient Questions</h2>
              {loading ? (
                <p>Loading...</p>
              ) : qBoard.length === 0 ? (
                <p className="empty-state">No pending questions</p>
              ) : (
                <div className="qboard-list">
                  {qBoard.map((item) => (
                    <div key={item.id} className="qboard-card">
                      <div className="qboard-header">
                        <span className="urgency-badge urgency-{item.urgency}">
                          Urgency: {item.urgency}/10
                        </span>
                        <span className="qboard-category">{item.category}</span>
                        <span className="qboard-date">
                          {new Date(item.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                      <div className="qboard-question">
                        <h4>Question:</h4>
                        <p>{item.question}</p>
                        {item.context && (
                          <>
                            <h4>Context:</h4>
                            <p>{item.context}</p>
                          </>
                        )}
                      </div>
                      <div className="qboard-response">
                        <textarea
                          placeholder="Type your response to the patient..."
                          value={responseText[item.id] || ''}
                          onChange={(e) =>
                            setResponseText({ ...responseText, [item.id]: e.target.value })
                          }
                          rows={4}
                        />
                        <button
                          onClick={() => handleQBoardResponse(item.id)}
                          className="btn-respond"
                        >
                          Send Response
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'patients' && (
            <div className="patients-content">
              <div className="patients-header">
                <h2>Today's Patients</h2>
                <div className="patients-count">{todayPatients.length} appointments</div>
              </div>

              {/* Manual Visit Creation - Search for any patient */}
              <div style={{
                background: '#f0f9ff',
                border: '2px solid #3b82f6',
                borderRadius: '8px',
                padding: '20px',
                marginBottom: '20px'
              }}>
                <h3 style={{ margin: '0 0 15px 0', color: '#1e40af', fontSize: '16px' }}>
                  🔍 Start Urgent Visit with Any Patient
                </h3>
                <div style={{ display: 'flex', gap: '10px', marginBottom: '15px' }}>
                  <input
                    type="text"
                    placeholder="Search patient by name or email..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && handleSearchPatients()}
                    style={{
                      flex: 1,
                      padding: '10px',
                      border: '1px solid #d1d5db',
                      borderRadius: '6px',
                      fontSize: '14px'
                    }}
                  />
                  <button
                    onClick={handleSearchPatients}
                    disabled={searching || !searchQuery.trim()}
                    style={{
                      padding: '10px 20px',
                      background: '#3b82f6',
                      color: 'white',
                      border: 'none',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      fontWeight: '500'
                    }}
                  >
                    {searching ? 'Searching...' : 'Search'}
                  </button>
                </div>

                {/* Search Results */}
                {searchResults.length > 0 && (
                  <div style={{
                    background: 'white',
                    borderRadius: '6px',
                    padding: '10px',
                    maxHeight: '300px',
                    overflowY: 'auto'
                  }}>
                    <h4 style={{ margin: '0 0 10px 0', fontSize: '14px', color: '#6b7280' }}>
                      Found {searchResults.length} patient(s):
                    </h4>
                    {searchResults.map((patient) => (
                      <div key={patient.id} style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: '10px',
                        background: '#f9fafb',
                        borderRadius: '4px',
                        marginBottom: '8px',
                        border: '1px solid #e5e7eb'
                      }}>
                        <div>
                          <strong>{patient.firstName} {patient.lastName}</strong>
                          <div style={{ fontSize: '13px', color: '#6b7280' }}>
                            {patient.email} • {patient.phone || 'No phone'}
                          </div>
                        </div>
                        <button
                          onClick={() => handleManualStartVisit(patient)}
                          disabled={creatingVisit}
                          style={{
                            padding: '8px 16px',
                            background: '#10b981',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            fontWeight: '500',
                            fontSize: '14px'
                          }}
                        >
                          {creatingVisit ? 'Creating...' : '▶ Start Visit'}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {loading ? (
                <div className="loading-state">
                  <div className="spinner"></div>
                  <p>Loading today's patients...</p>
                </div>
              ) : todayPatients.length === 0 ? (
                <div className="empty-state">
                  <div className="empty-icon">👥</div>
                  <h3>No Appointments Today</h3>
                  <p>You don't have any scheduled appointments for today.</p>
                  <p style={{ fontSize: '14px', color: '#6b7280', marginTop: '10px' }}>
                    💡 Use the search box above to manually start a visit with any patient
                  </p>
                </div>
              ) : (
                <div className="patients-grid">
                  {todayPatients.map((visit) => (
                    <div key={visit.id} className="patient-card">
                      <div className="patient-time-block">
                        <div className="patient-time">
                          {new Date(visit.scheduledAt).toLocaleTimeString('en-US', {
                            hour: 'numeric',
                            minute: '2-digit',
                            hour12: true,
                          })}
                        </div>
                        <div className="patient-duration">{visit.durationMinutes} min</div>
                      </div>

                      <div className="patient-info">
                        <div className="patient-name-row">
                          <h3 className="patient-name">
                            {visit.patient.firstName} {visit.patient.lastName}
                          </h3>
                          <span className={`priority-badge priority-${visit.priorityScore >= 7 ? 'high' : visit.priorityScore >= 4 ? 'medium' : 'low'}`}>
                            Priority: {visit.priorityScore}
                          </span>
                        </div>

                        <div className="patient-contact">
                          <span className="contact-item">
                            <span className="contact-icon">📧</span>
                            {visit.patient.email}
                          </span>
                          {visit.patient.phone && (
                            <span className="contact-item">
                              <span className="contact-icon">📞</span>
                              {visit.patient.phone}
                            </span>
                          )}
                        </div>

                        <div className="visit-details">
                          <div className="visit-reason">
                            <strong>Reason:</strong> {visit.reasonForVisit}
                          </div>
                          <div className="visit-type-status">
                            <span className="visit-type-tag">
                              {visit.visitType.replace(/_/g, ' ')}
                            </span>
                            <span className={`status-pill status-${visit.status.toLowerCase()}`}>
                              {visit.status}
                            </span>
                          </div>
                          {(visit as any).processingStatus && (visit as any).processingStatus !== 'completed' && (
                            <div style={{
                              marginTop: '8px',
                              padding: '6px 12px',
                              background: '#fef3c7',
                              border: '1px solid #fbbf24',
                              borderRadius: '6px',
                              fontSize: '13px',
                              color: '#92400e',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '6px'
                            }}>
                              <span style={{ animation: 'spin 1s linear infinite' }}>⏳</span>
                              Processing: {(visit as any).processingStatus === 'uploading' ? 'Uploading...' :
                                (visit as any).processingStatus === 'transcribing' ? 'Transcribing audio...' :
                                (visit as any).processingStatus === 'generating_notes' ? 'Generating notes...' :
                                (visit as any).processingStatus === 'failed' ? '❌ Failed' : 'Processing...'}
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="patient-actions">
                        <button
                          className="btn-view-chart"
                          onClick={() => setSelectedPatientId(visit.patient.id)}
                        >
                          View Profile
                        </button>
                        <button
                          className="btn-start-visit"
                          onClick={() => setRecordingVisit(visit)}
                        >
                          Start Visit
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'completed' && (
            <div className="patients-content">
              <div className="patients-header">
                <h2>Done Meetings</h2>
                <div className="patients-count">{completedVisits.length} completed visits</div>
              </div>

              {loading ? (
                <div className="loading-state">
                  <div className="spinner"></div>
                  <p>Loading completed visits...</p>
                </div>
              ) : completedVisits.length === 0 ? (
                <div className="empty-state">
                  <div className="empty-icon">✅</div>
                  <h3>No Completed Visits</h3>
                  <p>You don't have any completed visits yet.</p>
                </div>
              ) : (
                <div className="patients-grid">
                  {completedVisits.map((visit) => (
                    <div key={visit.id} className="patient-card completed-card">
                      <div className="patient-time-block">
                        <div className="patient-date">
                          {new Date(visit.scheduledAt).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                          })}
                        </div>
                        <div className="patient-time">
                          {new Date(visit.scheduledAt).toLocaleTimeString('en-US', {
                            hour: 'numeric',
                            minute: '2-digit',
                            hour12: true,
                          })}
                        </div>
                        <div className="patient-duration">{visit.durationMinutes} min</div>
                      </div>

                      <div className="patient-info">
                        <div className="patient-name-row">
                          <h3 className="patient-name">
                            {visit.patient.firstName} {visit.patient.lastName}
                          </h3>
                          <span className="status-pill status-completed">
                            COMPLETED
                          </span>
                        </div>

                        <div className="patient-contact">
                          <span className="contact-item">
                            <span className="contact-icon">📧</span>
                            {visit.patient.email}
                          </span>
                          {visit.patient.phone && (
                            <span className="contact-item">
                              <span className="contact-icon">📞</span>
                              {visit.patient.phone}
                            </span>
                          )}
                        </div>

                        <div className="visit-details">
                          <div className="visit-reason">
                            <strong>Reason:</strong> {visit.reasonForVisit}
                          </div>
                          <div className="visit-type-status">
                            <span className="visit-type-tag">
                              {visit.visitType.replace(/_/g, ' ')}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="patient-actions">
                        <button
                          className="btn-view-chart"
                          onClick={() => setSelectedPatientId(visit.patient.id)}
                        >
                          View Profile
                        </button>
                        <button
                          className="btn-view-chart"
                          onClick={() => setSelectedSummaryVisit(visit)}
                        >
                          View Summary
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'all-patients' && <PatientsList user={user} />}

          {activeTab === 'settings' && (
            <DoctorSettings
              user={user}
              onBack={() => setActiveTab('dashboard')}
            />
          )}

          {/* Patient Files Tab */}
          {activeTab === 'files' && (
            <div className="files-content">
              <h2>📁 Patient Files</h2>
              <p style={{ color: '#6b7280', marginBottom: '24px', fontSize: '14px' }}>
                Files uploaded by patients through the AI assistant
              </p>
              {filesLoading ? (
                <div style={{ textAlign: 'center', padding: '40px', color: '#6b7280' }}>
                  <p>Loading patient files...</p>
                </div>
              ) : groupedPatientFiles.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px', color: '#9ca3af' }}>
                  <p>No patient files uploaded yet</p>
                </div>
              ) : (
                <div className="patient-files-grid">
                  {groupedPatientFiles.map((group) => (
                    <div
                      key={group.patient.id}
                      className="patient-file-card"
                      onClick={() => setSelectedPatientFiles({
                        patientId: group.patient.id,
                        patientName: `${group.patient.firstName} ${group.patient.lastName}`,
                        files: group.files,
                      })}
                    >
                      <div className="patient-file-card-header">
                        <div className="patient-avatar">
                          {group.patient.firstName?.[0]}{group.patient.lastName?.[0]}
                        </div>
                        <div className="patient-info">
                          <h4>{group.patient.firstName} {group.patient.lastName}</h4>
                          <p>{group.patient.email}</p>
                        </div>
                        {group.unreadCount > 0 && (
                          <span className="unread-badge">{group.unreadCount} new</span>
                        )}
                      </div>
                      <div className="patient-file-card-stats">
                        <div className="stat">
                          <span className="stat-value">{group.files.length}</span>
                          <span className="stat-label">{group.files.length === 1 ? 'File' : 'Files'}</span>
                        </div>
                        <div className="stat">
                          <span className="stat-value">{group.files.filter(f => f.status === 'READ').length}</span>
                          <span className="stat-label">Reviewed</span>
                        </div>
                        <div className="stat">
                          <span className="stat-value">{group.unreadCount}</span>
                          <span className="stat-label">Pending</span>
                        </div>
                      </div>
                      <div className="patient-file-card-footer">
                        <span className="view-files-link">View Files →</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Patient Files Detail Modal */}
          {selectedPatientFiles && (
            <div className="patient-files-modal-overlay" onClick={() => setSelectedPatientFiles(null)}>
              <div className="patient-files-modal" onClick={(e) => e.stopPropagation()}>
                <div className="patient-files-modal-header">
                  <div>
                    <h3>📁 Files from {selectedPatientFiles.patientName}</h3>
                    <p>{selectedPatientFiles.files.length} file{selectedPatientFiles.files.length !== 1 ? 's' : ''} uploaded</p>
                  </div>
                  <button className="close-btn" onClick={() => setSelectedPatientFiles(null)}>×</button>
                </div>
                <div className="patient-files-modal-content">
                  {selectedPatientFiles.files.map((notification) => (
                    <div key={notification.id} className="file-item">
                      <div className="file-item-icon">
                        {notification.file?.fileType?.startsWith('image/') ? '🖼️' :
                         notification.file?.fileType?.includes('pdf') ? '📄' :
                         notification.file?.fileType?.includes('audio') ? '🎵' : '📎'}
                      </div>
                      <div className="file-item-info">
                        <h4>{notification.file?.fileName || 'Unknown File'}</h4>
                        <div className="file-item-meta">
                          <span className="category-tag">{notification.file?.fileCategory || 'OTHER'}</span>
                          <span>{notification.file?.fileSize ? `${Math.round(notification.file.fileSize / 1024)} KB` : ''}</span>
                          <span>{new Date(notification.createdAt).toLocaleDateString()}</span>
                        </div>
                      </div>
                      <div className="file-item-status">
                        <span className={`status-pill ${notification.status?.toLowerCase() || 'pending'}`}>
                          {notification.status === 'READ' ? '✓ Read' : 'Pending'}
                        </span>
                      </div>
                      <div className="file-item-actions">
                        <button
                          className="btn-icon"
                          title="Preview"
                          onClick={() => {
                            setSelectedPatientFiles(null);
                            setPreviewingFile({
                              ...notification.file,
                              notificationId: notification.id,
                              isRead: !!notification.readAt
                            });
                          }}
                        >
                          👁️
                        </button>
                        <button
                          className="btn-icon"
                          title="Download"
                          onClick={async () => {
                            try {
                              const response = await axios.get(
                                `${API_URL}/files/${notification.file?.id}`,
                                {
                                  headers: { Authorization: `Bearer ${user.token}` },
                                  responseType: 'blob',
                                }
                              );
                              const url = window.URL.createObjectURL(new Blob([response.data]));
                              const link = document.createElement('a');
                              link.href = url;
                              link.setAttribute('download', notification.file?.fileName || 'file');
                              document.body.appendChild(link);
                              link.click();
                              link.remove();
                              window.URL.revokeObjectURL(url);
                              setNotificationMessage('✅ File downloaded');
                              setShowNotification(true);
                              setTimeout(() => setShowNotification(false), 3000);
                            } catch (error) {
                              console.error('Error downloading file:', error);
                              setNotificationMessage('❌ Failed to download file');
                              setShowNotification(true);
                              setTimeout(() => setShowNotification(false), 3000);
                            }
                          }}
                        >
                          ⬇️
                        </button>
                        <button
                          className="btn-icon btn-mark"
                          title="Mark as Read"
                          disabled={notification.status === 'READ'}
                          onClick={async () => {
                            try {
                              await axios.put(
                                `${API_URL}/doctor/files/notifications/${notification.id}/read`,
                                {},
                                { headers: { Authorization: `Bearer ${user.token}` } }
                              );
                              setNotificationMessage('✅ Marked as read');
                              setShowNotification(true);
                              setTimeout(() => setShowNotification(false), 3000);
                              loadPatientFiles();
                              // Update local state
                              setSelectedPatientFiles(prev => prev ? {
                                ...prev,
                                files: prev.files.map(f =>
                                  f.id === notification.id ? { ...f, status: 'READ', readAt: new Date().toISOString() } : f
                                )
                              } : null);
                            } catch (error) {
                              console.error('Error marking as read:', error);
                            }
                          }}
                        >
                          ✓
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* File Preview Modal */}
          {previewingFile && (
            <FilePreviewModal
              fileId={previewingFile.id}
              fileName={previewingFile.fileName}
              fileType={previewingFile.fileType}
              fileSize={previewingFile.fileSize}
              fileCategory={previewingFile.fileCategory}
              isOpen={!!previewingFile}
              user={user}
              onClose={() => setPreviewingFile(null)}
              onAnnotate={(annotation) => {
                setNotificationMessage('✅ Annotation added successfully');
                setShowNotification(true);
                setTimeout(() => setShowNotification(false), 3000);
              }}
              notificationId={previewingFile.notificationId}
              initialReadStatus={previewingFile.isRead}
              onMarkAsRead={(notificationId) => {
                // Update the file notification in the list
                setPatientFiles(prev => prev.map(n =>
                  n.id === notificationId ? { ...n, readAt: new Date().toISOString(), status: 'READ' } : n
                ));
                setNotificationMessage('✅ Marked as read');
                setShowNotification(true);
                setTimeout(() => setShowNotification(false), 3000);
              }}
            />
          )}
        </main>
      </div>

      {recordingVisit && (
        <VisitRecorder
          visitId={recordingVisit.id}
          patientName={`${recordingVisit.patient.firstName} ${recordingVisit.patient.lastName}`}
          token={user.token}
          onComplete={() => {
            setRecordingVisit(null);
            loadTodayPatients();
            loadDashboardStats();
          }}
          onCancel={() => setRecordingVisit(null)}
        />
      )}

      {selectedPatientId && (
        <QuickPatientProfile
          patientId={selectedPatientId}
          token={user.token}
          onClose={() => setSelectedPatientId(null)}
        />
      )}

      {/* Visit Summary Modal */}
      {selectedSummaryVisit && (
        <VisitSummaryModal
          visit={selectedSummaryVisit}
          token={user.token}
          onClose={() => setSelectedSummaryVisit(null)}
        />
      )}

      {/* Custom Modal */}
      {modalConfig.show && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 10001,
        }} onClick={() => modalConfig.onCancel?.()}>
          <div style={{
            background: 'white',
            borderRadius: '12px',
            padding: '24px',
            maxWidth: '500px',
            width: '90%',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2)',
          }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 16px 0', fontSize: '1.25rem', color: '#1f2937' }}>
              {modalConfig.title}
            </h3>
            <p style={{ margin: '0 0 24px 0', color: '#6b7280', lineHeight: '1.6' }}>
              {modalConfig.message}
            </p>
            {modalConfig.type === 'prompt' && (
              <input
                type="text"
                value={modalConfig.inputValue || ''}
                onChange={(e) => setModalConfig(prev => ({ ...prev, inputValue: e.target.value }))}
                style={{
                  width: '100%',
                  padding: '12px',
                  border: '2px solid #e5e7eb',
                  borderRadius: '8px',
                  fontSize: '15px',
                  marginBottom: '20px',
                }}
                placeholder="Enter your response..."
                autoFocus
                onKeyPress={(e) => {
                  if (e.key === 'Enter') {
                    modalConfig.onConfirm?.(modalConfig.inputValue);
                  }
                }}
              />
            )}
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              {modalConfig.type !== 'alert' && (
                <button
                  onClick={() => modalConfig.onCancel?.()}
                  style={{
                    padding: '10px 20px',
                    background: '#f3f4f6',
                    border: 'none',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontSize: '15px',
                    fontWeight: '500',
                    color: '#374151',
                  }}
                >
                  Cancel
                </button>
              )}
              <button
                onClick={() => modalConfig.onConfirm?.(modalConfig.type === 'prompt' ? modalConfig.inputValue : undefined)}
                style={{
                  padding: '10px 20px',
                  background: '#3b82f6',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontSize: '15px',
                  fontWeight: '500',
                }}
              >
                {modalConfig.type === 'alert' ? 'OK' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Dialog with AI Chat */}
      {editDialogOpen && editingApproval && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 10002,
          padding: '20px',
        }} onClick={() => setEditDialogOpen(false)}>
          <div style={{
            background: 'white',
            borderRadius: '12px',
            maxWidth: '900px',
            width: '100%',
            maxHeight: '90vh',
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2)',
          }} onClick={(e) => e.stopPropagation()}>

            {/* Header */}
            <div style={{
              padding: '20px 24px',
              borderBottom: '1px solid #e5e7eb',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}>
              <h3 style={{ margin: 0, fontSize: '1.25rem', color: '#1f2937' }}>
                ✏️ Edit Content with AI Assistant
              </h3>
              <button
                onClick={() => setEditDialogOpen(false)}
                style={{
                  background: '#f3f4f6',
                  border: 'none',
                  width: '32px',
                  height: '32px',
                  borderRadius: '50%',
                  fontSize: '1.25rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                ×
              </button>
            </div>

            {/* Content Area */}
            <div style={{
              display: 'flex',
              flex: 1,
              overflow: 'hidden',
            }}>
              {/* Left: Current Content Preview */}
              <div style={{
                flex: 1,
                padding: '20px',
                borderRight: '1px solid #e5e7eb',
                overflowY: 'auto',
                background: '#f9fafb',
              }}>
                <h4 style={{ margin: '0 0 12px 0', fontSize: '1rem', color: '#374151' }}>
                  📄 Current Content
                </h4>
                <div style={{
                  background: 'white',
                  padding: '16px',
                  borderRadius: '8px',
                  fontSize: '14px',
                  lineHeight: '1.6',
                  border: '1px solid #e5e7eb',
                  maxHeight: '600px',
                  overflowY: 'auto'
                }}>
                  {editingApproval.contentType === 'CLINICAL_NOTE' ? (
                    renderClinicalNote(editingApproval.draftContent)
                  ) : editingApproval.draftContent?.comprehensiveNarrative ? (
                    <div style={{ whiteSpace: 'pre-wrap' }}>
                      {editingApproval.draftContent.comprehensiveNarrative}
                    </div>
                  ) : (
                    <pre style={{ margin: 0 }}>{JSON.stringify(editingApproval.draftContent, null, 2)}</pre>
                  )}
                </div>
              </div>

              {/* Right: AI Chat Interface */}
              <div style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                background: 'white',
              }}>
                {/* Chat Messages */}
                <div style={{
                  flex: 1,
                  padding: '20px',
                  overflowY: 'auto',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px',
                }}>
                  <div style={{
                    padding: '12px',
                    background: '#eff6ff',
                    borderRadius: '8px',
                    fontSize: '14px',
                    color: '#1e40af',
                    border: '1px solid #dbeafe',
                  }}>
                    💬 Tell me what changes you'd like to make to the content. I'll help you edit it.
                  </div>

                  {editChatMessages.map((msg, idx) => (
                    <div
                      key={idx}
                      style={{
                        padding: '12px 16px',
                        borderRadius: '8px',
                        maxWidth: '85%',
                        alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
                        background: msg.role === 'user' ? '#3b82f6' : '#f3f4f6',
                        color: msg.role === 'user' ? 'white' : '#1f2937',
                        fontSize: '14px',
                        lineHeight: '1.5',
                        whiteSpace: 'pre-wrap',
                      }}
                    >
                      {msg.content}
                    </div>
                  ))}

                  {editProcessing && (
                    <div style={{
                      padding: '12px 16px',
                      borderRadius: '8px',
                      maxWidth: '85%',
                      background: '#f3f4f6',
                      color: '#6b7280',
                      fontSize: '14px',
                    }}>
                      AI is processing your request...
                    </div>
                  )}
                </div>

                {/* Chat Input */}
                <div style={{
                  padding: '16px 20px',
                  borderTop: '1px solid #e5e7eb',
                }}>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <input
                      type="text"
                      value={editInstructions}
                      onChange={(e) => setEditInstructions(e.target.value)}
                      onKeyPress={(e) => {
                        if (e.key === 'Enter' && !editProcessing) {
                          handleSendEditInstruction();
                        }
                      }}
                      placeholder="e.g., 'Change the diagnosis section to be more detailed'"
                      disabled={editProcessing}
                      style={{
                        flex: 1,
                        padding: '10px 12px',
                        border: '2px solid #e5e7eb',
                        borderRadius: '8px',
                        fontSize: '14px',
                      }}
                    />
                    <button
                      onClick={handleSendEditInstruction}
                      disabled={editProcessing || !editInstructions.trim()}
                      style={{
                        padding: '10px 20px',
                        background: editProcessing || !editInstructions.trim() ? '#9ca3af' : '#3b82f6',
                        color: 'white',
                        border: 'none',
                        borderRadius: '8px',
                        fontSize: '14px',
                        fontWeight: '500',
                        cursor: editProcessing || !editInstructions.trim() ? 'not-allowed' : 'pointer',
                      }}
                    >
                      Send
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Footer Actions */}
            <div style={{
              padding: '16px 24px',
              borderTop: '1px solid #e5e7eb',
              display: 'flex',
              gap: '12px',
              justifyContent: 'flex-end',
            }}>
              <button
                onClick={() => setEditDialogOpen(false)}
                style={{
                  padding: '10px 20px',
                  background: '#f3f4f6',
                  color: '#374151',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '14px',
                  fontWeight: '500',
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleApplyEdits}
                disabled={editChatMessages.length === 0}
                style={{
                  padding: '10px 20px',
                  background: editChatMessages.length === 0 ? '#9ca3af' : '#10b981',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '14px',
                  fontWeight: '500',
                  cursor: editChatMessages.length === 0 ? 'not-allowed' : 'pointer',
                }}
              >
                ✓ Confirm & Approve
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Chart Section Component
const ChartSection: React.FC<{
  title: string;
  icon: string;
  fields: Array<{ label: string; key: string; multiline?: boolean; rows?: number }>;
  chart: any;
  isEditing: boolean;
  onChange: (key: string, value: string) => void;
}> = ({ title, icon, fields, chart, isEditing, onChange }) => {
  return (
    <div style={{ background: '#f9fafb', padding: '15px', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
      <h4 style={{ margin: '0 0 15px 0', color: '#374151', fontSize: '16px', fontWeight: '600' }}>
        {icon} {title}
      </h4>
      {fields.map((field) => (
        <div key={field.key} style={{ marginBottom: '15px' }}>
          <label style={{ display: 'block', marginBottom: '5px', fontWeight: '500', color: '#4b5563', fontSize: '14px' }}>
            {field.label}
          </label>
          {isEditing ? (
            field.multiline ? (
              <textarea
                value={chart?.[field.key] || ''}
                onChange={(e) => onChange(field.key, e.target.value)}
                rows={field.rows || 3}
                style={{
                  width: '100%',
                  padding: '10px',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  fontSize: '14px',
                  fontFamily: 'inherit',
                  resize: 'vertical',
                }}
                placeholder={`Enter ${field.label.toLowerCase()}...`}
              />
            ) : (
              <input
                type="text"
                value={chart?.[field.key] || ''}
                onChange={(e) => onChange(field.key, e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  fontSize: '14px',
                }}
                placeholder={`Enter ${field.label.toLowerCase()}...`}
              />
            )
          ) : (
            <div style={{
              padding: '10px',
              background: 'white',
              borderRadius: '6px',
              minHeight: '40px',
              whiteSpace: 'pre-wrap',
              fontSize: '14px',
              color: chart?.[field.key] ? '#1f2937' : '#9ca3af',
            }}>
              {chart?.[field.key] || 'No information recorded'}
            </div>
          )}
        </div>
      ))}
    </div>
  );
};

// Patient Chart View Component
const PatientChartView: React.FC<{
  patientData: any;
  token: string;
  onUpdate: () => void;
}> = ({ patientData, token, onUpdate }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editedChart, setEditedChart] = useState<any>(null);
  const [saving, setSaving] = useState(false);

  const chart = patientData?.patientChart;
  const clinicalProfile = patientData?.clinicalProfile;

  useEffect(() => {
    if (chart) {
      setEditedChart({ ...chart });
    }
  }, [chart]);

  const handleSave = async () => {
    try {
      setSaving(true);
      await axios.put(
        `${API_URL}/patient-chart/update`,
        {
          patientId: patientData.patientInfo.id || patientData.patientInfo.patientId,
          updates: editedChart,
        },
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      setIsEditing(false);
      onUpdate();
    } catch (error) {
      console.error('Error updating chart:', error);
      alert('Failed to update chart');
    } finally {
      setSaving(false);
    }
  };

  if (!chart) {
    return (
      <div style={{ padding: '20px', textAlign: 'center', color: '#666' }}>
        <p>No medical chart created yet. Chart will be created automatically.</p>
        <div className="profile-grid" style={{ marginTop: '20px', textAlign: 'left' }}>
          {clinicalProfile?.bloodType && (
            <div className="profile-field">
              <strong>Blood Type:</strong> {clinicalProfile.bloodType}
            </div>
          )}
          {clinicalProfile?.allergies && clinicalProfile.allergies.length > 0 && (
            <div className="profile-field">
              <strong>Allergies:</strong> {clinicalProfile.allergies.join(', ')}
            </div>
          )}
          {clinicalProfile?.currentMedications && clinicalProfile.currentMedications.length > 0 && (
            <div className="profile-field">
              <strong>Current Medications:</strong> {clinicalProfile.currentMedications.join(', ')}
            </div>
          )}
          {clinicalProfile?.chronicConditions && clinicalProfile.chronicConditions.length > 0 && (
            <div className="profile-field">
              <strong>Chronic Conditions:</strong> {clinicalProfile.chronicConditions.join(', ')}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="patient-chart-container">
      <div style={{ marginBottom: '15px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        {!isEditing ? (
          <button
            onClick={() => setIsEditing(true)}
            style={{
              padding: '8px 16px',
              background: '#667eea',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontWeight: '500',
            }}
          >
            ✏️ Edit Chart
          </button>
        ) : (
          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              onClick={handleSave}
              disabled={saving}
              style={{
                padding: '8px 16px',
                background: '#10b981',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                fontWeight: '500',
              }}
            >
              {saving ? 'Saving...' : '💾 Save Changes'}
            </button>
            <button
              onClick={() => {
                setIsEditing(false);
                setEditedChart({ ...chart });
              }}
              style={{
                padding: '8px 16px',
                background: '#6b7280',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                fontWeight: '500',
              }}
            >
              ✖ Cancel
            </button>
          </div>
        )}
        <small style={{ color: '#6b7280' }}>
          Last updated: {chart.updatedAt ? new Date(chart.updatedAt).toLocaleString() : 'Never'}
        </small>
      </div>

      <div className="chart-sections" style={{ display: 'grid', gap: '20px' }}>
        {/* Chief Complaint & Presentation */}
        <ChartSection
          title="Chief Complaint & Presentation"
          icon="🎯"
          fields={[
            { label: 'Primary Complaint', key: 'primaryComplaint', multiline: true },
            { label: 'Presenting Symptoms', key: 'presentingSymptoms', multiline: true },
          ]}
          chart={isEditing ? editedChart : chart}
          isEditing={isEditing}
          onChange={(key, value) => setEditedChart({ ...editedChart, [key]: value })}
        />

        {/* Medical History Summary */}
        <ChartSection
          title="Medical History Summary"
          icon="📖"
          fields={[
            { label: 'Comprehensive Medical Background', key: 'medicalHistorySummary', multiline: true, rows: 6 },
          ]}
          chart={isEditing ? editedChart : chart}
          isEditing={isEditing}
          onChange={(key, value) => setEditedChart({ ...editedChart, [key]: value })}
        />

        {/* Current Clinical Status */}
        <ChartSection
          title="Current Clinical Status"
          icon="🔬"
          fields={[
            { label: 'Current Treatment Plan', key: 'currentTreatmentPlan', multiline: true, rows: 5 },
          ]}
          chart={isEditing ? editedChart : chart}
          isEditing={isEditing}
          onChange={(key, value) => setEditedChart({ ...editedChart, [key]: value })}
        />

        {/* Clinical Progress Notes */}
        <ChartSection
          title="Clinical Progress Notes"
          icon="📝"
          fields={[
            { label: 'Progress Notes', key: 'progressNotes', multiline: true, rows: 6 },
            { label: 'Treatment Response', key: 'treatmentResponse', multiline: true, rows: 4 },
          ]}
          chart={isEditing ? editedChart : chart}
          isEditing={isEditing}
          onChange={(key, value) => setEditedChart({ ...editedChart, [key]: value })}
        />

        {/* Follow-up & Future Plans */}
        <ChartSection
          title="Follow-up & Future Plans"
          icon="📅"
          fields={[
            { label: 'Follow-up Plan', key: 'followUpPlan', multiline: true, rows: 4 },
          ]}
          chart={isEditing ? editedChart : chart}
          isEditing={isEditing}
          onChange={(key, value) => setEditedChart({ ...editedChart, [key]: value })}
        />

        {/* Patient Education & Instructions */}
        <ChartSection
          title="Patient Education & Home Instructions"
          icon="📚"
          fields={[
            { label: 'Patient Education Provided', key: 'patientEducation', multiline: true, rows: 4 },
            { label: 'Home Care Instructions', key: 'homeInstructions', multiline: true, rows: 4 },
          ]}
          chart={isEditing ? editedChart : chart}
          isEditing={isEditing}
          onChange={(key, value) => setEditedChart({ ...editedChart, [key]: value })}
        />
      </div>
    </div>
  );
};

// Visit Summary Modal Component
interface VisitSummaryModalProps {
  visit: TodayPatient;
  token: string;
  onClose: () => void;
}

interface VisitSummaryData {
  visitInfo: {
    date: string;
    visitType: string;
    reasonForVisit: string;
    duration: number;
    provider: string;
    specialty: string;
  };
  patient: {
    name: string;
    email: string;
    phone: string | null;
  };
  clinicalSummary: {
    chiefComplaint: string;
    diagnosis: string;
    diagnosisSimple: string;
  };
  medications: Array<{ name: string; instructions: string }>;
  tests: Array<{ name: string; prepInstructions: string }>;
  instructions: {
    plan: string;
    patientInstructions: string;
  };
  faqs: Array<{ question: string; answer: string }>;
  warningSignsAndFollowUp: {
    warningSigns: string[];
    followUp: string;
  };
  patientSummary: string;
}

const VisitSummaryModal: React.FC<VisitSummaryModalProps> = ({ visit, token, onClose }) => {
  const [summaryData, setSummaryData] = useState<VisitSummaryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadVisitSummary();
  }, [visit.id]);

  const loadVisitSummary = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await axios.get(
        `${API_URL}/doctor/visits/${visit.id}/summary`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setSummaryData(response.data.data);
    } catch (err: any) {
      console.error('Error loading visit summary:', err);
      setError(err.response?.data?.message || 'Failed to load visit summary');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content visit-summary-modal" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose}>x</button>

        <div className="summary-header">
          <div className="summary-icon">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
              <polyline points="14 2 14 8 20 8"></polyline>
              <line x1="16" y1="13" x2="8" y2="13"></line>
              <line x1="16" y1="17" x2="8" y2="17"></line>
              <polyline points="10 9 9 9 8 9"></polyline>
            </svg>
          </div>
          <div>
            <h2>After-Visit Summary</h2>
            <p className="summary-subtitle">
              {visit.patient.firstName} {visit.patient.lastName} - {new Date(visit.scheduledAt).toLocaleDateString()}
            </p>
          </div>
        </div>

        {loading ? (
          <div className="summary-loading">
            <div className="spinner"></div>
            <p>Loading visit summary...</p>
          </div>
        ) : error ? (
          <div className="summary-error">
            <p>{error}</p>
            <button onClick={loadVisitSummary}>Try Again</button>
          </div>
        ) : summaryData ? (
          <div className="summary-content">
            {/* Visit Information */}
            <section className="summary-section visit-info-section">
              <h3>Visit Information</h3>
              <div className="info-grid">
                <div className="info-item">
                  <span className="info-label">Date</span>
                  <span className="info-value">{new Date(summaryData.visitInfo.date).toLocaleDateString()}</span>
                </div>
                <div className="info-item">
                  <span className="info-label">Provider</span>
                  <span className="info-value">{summaryData.visitInfo.provider}</span>
                </div>
                <div className="info-item">
                  <span className="info-label">Visit Type</span>
                  <span className="info-value">{summaryData.visitInfo.visitType.replace(/_/g, ' ')}</span>
                </div>
                <div className="info-item">
                  <span className="info-label">Reason</span>
                  <span className="info-value">{summaryData.visitInfo.reasonForVisit}</span>
                </div>
              </div>
            </section>

            {/* Diagnosis */}
            <section className="summary-section diagnosis-section">
              <h3>Diagnosis</h3>
              <div className="diagnosis-card">
                <p className="diagnosis-simple">{summaryData.clinicalSummary.diagnosisSimple}</p>
                {summaryData.clinicalSummary.diagnosis !== summaryData.clinicalSummary.diagnosisSimple && (
                  <details className="diagnosis-details">
                    <summary>View Clinical Details</summary>
                    <p>{summaryData.clinicalSummary.diagnosis}</p>
                  </details>
                )}
              </div>
            </section>

            {/* Medications */}
            <section className="summary-section medications-section">
              <h3>Medications</h3>
              <div className="medications-list">
                {summaryData.medications.map((med, index) => (
                  <div key={index} className="medication-item">
                    <div className="med-icon">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M10.5 20.5L3.5 13.5L13.5 3.5L20.5 10.5L10.5 20.5Z"></path>
                        <line x1="8.5" y1="15.5" x2="15.5" y2="8.5"></line>
                      </svg>
                    </div>
                    <div className="med-content">
                      <span className="med-name">{med.name}</span>
                      <span className="med-instructions">{med.instructions}</span>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* Tests Ordered */}
            <section className="summary-section tests-section">
              <h3>Tests & Labs</h3>
              <div className="tests-list">
                {summaryData.tests.map((test, index) => (
                  <div key={index} className="test-item">
                    <div className="test-icon">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M9 3L9 14L6 17L18 17L15 14L15 3"></path>
                        <path d="M6 3L18 3"></path>
                      </svg>
                    </div>
                    <div className="test-content">
                      <span className="test-name">{test.name}</span>
                      <span className="test-prep">{test.prepInstructions}</span>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* FAQs */}
            <section className="summary-section faqs-section">
              <h3>Frequently Asked Questions</h3>
              <div className="faqs-list">
                {summaryData.faqs.map((faq, index) => (
                  <details key={index} className="faq-item">
                    <summary>{faq.question}</summary>
                    <p>{faq.answer}</p>
                  </details>
                ))}
              </div>
            </section>

            {/* Warning Signs */}
            <section className="summary-section warning-section">
              <h3>Warning Signs - Seek Immediate Care If:</h3>
              <ul className="warning-list">
                {summaryData.warningSignsAndFollowUp.warningSigns.map((sign, index) => (
                  <li key={index}>{sign}</li>
                ))}
              </ul>
              <p className="follow-up-note">{summaryData.warningSignsAndFollowUp.followUp}</p>
            </section>

            {/* Instructions */}
            <section className="summary-section instructions-section">
              <h3>Instructions</h3>
              <p>{summaryData.instructions.patientInstructions}</p>
            </section>
          </div>
        ) : null}
      </div>
    </div>
  );
};

// Quick Patient Profile Modal Component
interface QuickPatientProfileProps {
  patientId: string;
  token: string;
  onClose: () => void;
}

const QuickPatientProfile: React.FC<QuickPatientProfileProps> = ({ patientId, token, onClose }) => {
  const [patientData, setPatientData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [question, setQuestion] = useState('');
  const [aiResponse, setAiResponse] = useState('');
  const [askingQuestion, setAskingQuestion] = useState(false);

  useEffect(() => {
    loadPatientProfile();
  }, [patientId]);

  const loadPatientProfile = async () => {
    try {
      const response = await axios.get(
        `${API_URL}/doctor/patients/${patientId}/full-profile`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setPatientData(response.data.data);
      setLoading(false);
    } catch (error) {
      console.error('Error loading patient profile:', error);
      setLoading(false);
    }
  };

  const handleAskQuestion = async () => {
    if (!question.trim()) return;

    setAskingQuestion(true);
    try {
      const response = await axios.post(
        `${API_URL}/doctor/patients/${patientId}/ask`,
        { question },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setAiResponse(response.data.data.answer);
    } catch (error) {
      console.error('Error asking question:', error);
      setAiResponse('Error: Could not get answer. Please try again.');
    } finally {
      setAskingQuestion(false);
    }
  };

  if (loading) {
    return (
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal-content patient-details-modal" onClick={(e) => e.stopPropagation()}>
          <div className="loading">Loading patient details...</div>
        </div>
      </div>
    );
  }

  if (!patientData) {
    return null;
  }

  const { patientInfo, clinicalProfile, visitSummary, allVisits } = patientData;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content patient-details-modal" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose}>×</button>

        <div className="patient-details-header">
          <div className="patient-avatar-large">
            {patientInfo.name.split(' ').map((n: string) => n[0]).join('')}
          </div>
          <div>
            <h2>{patientInfo.name}</h2>
            <p>DOB: {new Date(patientInfo.dateOfBirth).toLocaleDateString()}</p>
            <p>📧 {patientInfo.email} | 📞 {patientInfo.phone}</p>
          </div>
        </div>

        <div className="patient-details-body">
          {/* AI Summary Section */}
          <div className="detail-section ai-summary-section">
            <h3>🤖 AI Patient Summary</h3>
            <div className="summary-card">
              <p><strong>Total Visits:</strong> {visitSummary.totalVisits}</p>
              {visitSummary.lastVisit && (
                <>
                  <p><strong>Last Visit:</strong> {new Date(visitSummary.lastVisit.date).toLocaleDateString()}</p>
                  <p><strong>Reason:</strong> {visitSummary.lastVisit.reason}</p>
                  {visitSummary.lastVisit.assessment && (
                    <p><strong>Assessment:</strong> {visitSummary.lastVisit.assessment}</p>
                  )}
                </>
              )}
            </div>

            {/* Ask AI Questions */}
            <div className="ai-question-section">
              <h4>💬 Ask About Patient</h4>
              <div className="question-input-group">
                <input
                  type="text"
                  placeholder="e.g., What is his blood type?"
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleAskQuestion()}
                />
                <button
                  onClick={handleAskQuestion}
                  disabled={askingQuestion || !question.trim()}
                  className="btn-ask"
                >
                  {askingQuestion ? 'Asking...' : 'Ask'}
                </button>
              </div>
              {aiResponse && (
                <div className="ai-response">
                  <strong>AI Response:</strong>
                  <p>{aiResponse}</p>
                </div>
              )}
            </div>
          </div>

          {/* Initial Consultation */}
          {patientData.patientInfo.initialConsultationReason && (
            <div className="detail-section" style={{ background: '#fef3c7', borderLeft: '4px solid #f59e0b' }}>
              <h3>📝 Initial Consultation</h3>
              <div style={{ padding: '15px' }}>
                <p><strong>Date:</strong> {new Date(patientData.patientInfo.initialConsultationDate).toLocaleString()}</p>
                <p><strong>Reason for First Contact:</strong></p>
                <p style={{ padding: '10px', background: 'white', borderRadius: '6px', marginTop: '8px' }}>
                  {patientData.patientInfo.initialConsultationReason}
                </p>
                {patientData.patientInfo.initialConsultationNotes && (
                  <>
                    <p style={{ marginTop: '15px' }}><strong>Notes:</strong></p>
                    <p style={{ padding: '10px', background: 'white', borderRadius: '6px', marginTop: '8px', whiteSpace: 'pre-wrap' }}>
                      {patientData.patientInfo.initialConsultationNotes}
                    </p>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Next Meeting */}
          <div className="detail-section" style={{ background: '#dbeafe', borderLeft: '4px solid #3b82f6' }}>
            <h3>📅 Next Meeting</h3>
            <div style={{ padding: '15px' }}>
              {patientData.nextMeeting.scheduled ? (
                <>
                  <p><strong>Scheduled:</strong> {new Date(patientData.nextMeeting.scheduled).toLocaleString()}</p>
                  {patientData.nextMeeting.reason && (
                    <p><strong>Reason:</strong> {patientData.nextMeeting.reason}</p>
                  )}
                </>
              ) : patientData.nextMeeting.recommendedAfter ? (
                <>
                  <p><strong>Recommended Follow-up:</strong> After {patientData.nextMeeting.recommendedAfter}</p>
                  {patientData.nextMeeting.reason && (
                    <p><strong>Reason:</strong> {patientData.nextMeeting.reason}</p>
                  )}
                  <p style={{ color: '#6b7280', fontSize: '14px', marginTop: '10px' }}>
                    ⏰ Patient has not scheduled yet
                  </p>
                </>
              ) : (
                <p style={{ color: '#6b7280' }}>No upcoming meeting scheduled or recommended</p>
              )}
            </div>
          </div>

          {/* Comprehensive Patient File */}
          {patientData.patientChart?.comprehensivePatientFile && (
            <div className="detail-section">
              <h3>📁 Comprehensive Patient File</h3>
              <div style={{
                background: '#f9fafb',
                padding: '20px',
                borderRadius: '8px',
                fontFamily: 'monospace',
                fontSize: '14px',
                whiteSpace: 'pre-wrap',
                maxHeight: '600px',
                overflowY: 'auto',
                border: '1px solid #e5e7eb'
              }}>
                {patientData.patientChart.comprehensivePatientFile}
              </div>
              <p style={{ fontSize: '12px', color: '#6b7280', marginTop: '10px' }}>
                Last updated from: {patientData.patientChart.fileLastUpdatedFrom || 'Unknown'}
              </p>
            </div>
          )}

          {/* Test Results */}
          {patientData.patientChart?.testResults && Array.isArray(patientData.patientChart.testResults) && patientData.patientChart.testResults.length > 0 && (
            <div className="detail-section">
              <h3>🔬 Test Results</h3>
              <div style={{ display: 'grid', gap: '15px' }}>
                {patientData.patientChart.testResults.map((test: any, index: number) => (
                  <div key={index} style={{
                    background: '#f9fafb',
                    padding: '15px',
                    borderRadius: '8px',
                    border: '1px solid #e5e7eb'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
                      <strong style={{ color: '#1f2937' }}>{test.name}</strong>
                      <span style={{
                        padding: '4px 8px',
                        background: test.type === 'lab' ? '#dbeafe' : test.type === 'imaging' ? '#fce7f3' : '#e0e7ff',
                        borderRadius: '4px',
                        fontSize: '12px',
                        fontWeight: '500'
                      }}>
                        {test.type.toUpperCase()}
                      </span>
                    </div>
                    <p style={{ fontSize: '14px', color: '#6b7280', marginBottom: '8px' }}>
                      Date: {new Date(test.date).toLocaleDateString()}
                    </p>
                    {test.summary && (
                      <p style={{ fontSize: '14px', marginBottom: '8px' }}>
                        <strong>Summary:</strong> {test.summary}
                      </p>
                    )}
                    {test.fileUrl && (
                      <a
                        href={test.fileUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          display: 'inline-block',
                          padding: '6px 12px',
                          background: '#667eea',
                          color: 'white',
                          borderRadius: '4px',
                          textDecoration: 'none',
                          fontSize: '14px',
                          marginTop: '8px'
                        }}
                      >
                        📄 View File
                      </a>
                    )}
                    <p style={{ fontSize: '12px', color: '#9ca3af', marginTop: '10px' }}>
                      Uploaded by: {test.uploadedBy}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Uploaded Files Section */}
          {patientData.files && patientData.files.length > 0 && (
            <div className="detail-section">
              <h3>📁 Uploaded Files ({patientData.files.length})</h3>
              <div style={{ display: 'grid', gap: '12px' }}>
                {patientData.files.map((file: any) => {
                  // Get category styling
                  const getCategoryStyle = (category: string) => {
                    switch (category) {
                      case 'LAB_RESULT': return { bg: '#dbeafe', color: '#1e40af', icon: '🧪', label: 'Lab Result' };
                      case 'IMAGING': return { bg: '#fce7f3', color: '#9d174d', icon: '🔬', label: 'Imaging' };
                      case 'PRESCRIPTION': return { bg: '#d1fae5', color: '#065f46', icon: '💊', label: 'Prescription' };
                      case 'INSURANCE': return { bg: '#fef3c7', color: '#92400e', icon: '📋', label: 'Insurance' };
                      case 'ID_DOCUMENT': return { bg: '#e0e7ff', color: '#3730a3', icon: '🪪', label: 'ID Document' };
                      case 'CONSENT_FORM': return { bg: '#f3e8ff', color: '#6b21a8', icon: '✍️', label: 'Consent Form' };
                      default: return { bg: '#f3f4f6', color: '#374151', icon: '📄', label: category };
                    }
                  };

                  const categoryStyle = getCategoryStyle(file.fileCategory);

                  // Format file size
                  const formatFileSize = (bytes: number) => {
                    if (bytes < 1024) return `${bytes} B`;
                    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
                    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
                  };

                  return (
                    <div key={file.id} style={{
                      background: '#ffffff',
                      padding: '16px',
                      borderRadius: '10px',
                      border: '1px solid #e5e7eb',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      transition: 'box-shadow 0.2s ease',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.1)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.boxShadow = 'none';
                    }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1 }}>
                        <span style={{ fontSize: '1.5rem' }}>{categoryStyle.icon}</span>
                        <div style={{ flex: 1 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                            <strong style={{ color: '#1f2937', fontSize: '0.95rem' }}>
                              {file.fileName}
                            </strong>
                            <span style={{
                              padding: '2px 8px',
                              background: categoryStyle.bg,
                              color: categoryStyle.color,
                              borderRadius: '4px',
                              fontSize: '11px',
                              fontWeight: '600'
                            }}>
                              {categoryStyle.label}
                            </span>
                          </div>
                          <div style={{ display: 'flex', gap: '12px', fontSize: '12px', color: '#6b7280' }}>
                            <span>{formatFileSize(file.fileSize)}</span>
                            <span>•</span>
                            <span>{new Date(file.createdAt).toLocaleDateString('en-US', {
                              month: 'short',
                              day: 'numeric',
                              year: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit'
                            })}</span>
                          </div>
                          {file.description && (
                            <p style={{ fontSize: '13px', color: '#4b5563', marginTop: '6px', margin: '6px 0 0 0' }}>
                              {file.description}
                            </p>
                          )}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button
                          onClick={async () => {
                            try {
                              console.log('Opening file:', file.id);
                              console.log('API URL:', `${API_URL}/files/${file.id}`);
                              console.log('Token exists:', !!token);

                              const response = await fetch(`${API_URL}/files/${file.id}`, {
                                headers: {
                                  'Authorization': `Bearer ${token}`
                                }
                              });

                              console.log('Response status:', response.status);
                              console.log('Response ok:', response.ok);

                              if (!response.ok) {
                                const errorText = await response.text();
                                console.error('Error response:', errorText);
                                throw new Error(`Failed to fetch file: ${response.status} - ${errorText}`);
                              }

                              const blob = await response.blob();
                              console.log('Blob size:', blob.size, 'Blob type:', blob.type);
                              const url = window.URL.createObjectURL(blob);
                              window.open(url, '_blank');

                              // Clean up after a delay to ensure file opens
                              setTimeout(() => {
                                window.URL.revokeObjectURL(url);
                              }, 1000);
                            } catch (error: any) {
                              console.error('Open error:', error);
                              alert(`Failed to open file: ${error.message || error}`);
                            }
                          }}
                          style={{
                            padding: '8px 16px',
                            background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                            color: 'white',
                            border: 'none',
                            borderRadius: '6px',
                            fontSize: '13px',
                            fontWeight: '500',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            transition: 'transform 0.2s ease',
                            cursor: 'pointer',
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.transform = 'scale(1.05)';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.transform = 'scale(1)';
                          }}
                        >
                          👁️ Open
                        </button>
                        <button
                          onClick={async () => {
                            try {
                              console.log('Downloading file:', file.id);
                              console.log('API URL:', `${API_URL}/files/${file.id}`);
                              console.log('Token exists:', !!token);

                              const response = await fetch(`${API_URL}/files/${file.id}`, {
                                headers: {
                                  'Authorization': `Bearer ${token}`
                                }
                              });

                              console.log('Response status:', response.status);
                              console.log('Response ok:', response.ok);

                              if (!response.ok) {
                                const errorText = await response.text();
                                console.error('Error response:', errorText);
                                throw new Error(`Failed to fetch file: ${response.status} - ${errorText}`);
                              }

                              const blob = await response.blob();
                              console.log('Blob size:', blob.size, 'Blob type:', blob.type);
                              const url = window.URL.createObjectURL(blob);
                              const a = document.createElement('a');
                              a.href = url;
                              a.download = file.fileName;
                              document.body.appendChild(a);
                              a.click();
                              window.URL.revokeObjectURL(url);
                              document.body.removeChild(a);
                            } catch (error: any) {
                              console.error('Download error:', error);
                              alert(`Failed to download file: ${error.message || error}`);
                            }
                          }}
                          style={{
                            padding: '8px 16px',
                            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                            color: 'white',
                            border: 'none',
                            borderRadius: '6px',
                            fontSize: '13px',
                            fontWeight: '500',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            transition: 'transform 0.2s ease',
                            cursor: 'pointer',
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.transform = 'scale(1.05)';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.transform = 'scale(1)';
                          }}
                        >
                          📥 Download
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Comprehensive Patient Chart */}
          <div className="detail-section">
            <h3>📋 Comprehensive Medical Chart</h3>
            <PatientChartView
              patientData={patientData}
              token={token}
              onUpdate={loadPatientProfile}
            />
          </div>

          {/* Visit History Section */}
          <div className="detail-section">
            <h3>📅 Recent Visits ({Math.min(3, allVisits.length)} of {allVisits.length})</h3>
            <div className="visits-timeline">
              {allVisits.slice(0, 3).map((visit: any, index: number) => (
                <div key={visit.id} className="visit-item">
                  <div className="visit-number">Visit {allVisits.length - index}</div>
                  <div className="visit-details">
                    <p className="visit-date">
                      {new Date(visit.completedAt).toLocaleDateString()} at{' '}
                      {new Date(visit.completedAt).toLocaleTimeString()}
                    </p>
                    <p><strong>Reason:</strong> {visit.reasonForVisit}</p>
                    {visit.assessment && (
                      <p><strong>Assessment:</strong> {visit.assessment}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
export default DoctorDashboard;
