import React, { useState, useEffect } from 'react';
import axios from 'axios';
import Chat from './Chat';
import './Dashboard.css';

const API_URL = 'http://localhost:3000/api';

interface DashboardProps {
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    token: string;
  };
  onLogout: () => void;
}

interface Appointment {
  id: string;
  scheduledAt: string;
  visitType: string;
  reasonForVisit: string;
  status: string;
  durationMinutes: number;
}

interface CompletedVisit {
  id: string;
  scheduledAt: string;
  completedAt: string;
  visitType: string;
  reasonForVisit: string;
  status: string;
  durationMinutes: number;
  patientSummary: string | null;
  assessment: string | null;
  plan: string | null;
  provider: {
    id: string;
    firstName: string;
    lastName: string;
    specialty: string | null;
  } | null;
}

const Dashboard: React.FC<DashboardProps> = ({ user, onLogout }) => {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'chat' | 'appointments' | 'completed'>('dashboard');
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [completedVisits, setCompletedVisits] = useState<CompletedVisit[]>([]);
  const [pendingTasks, setPendingTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const [rescheduleModalOpen, setRescheduleModalOpen] = useState(false);
  const [selectedAppointment, setSelectedAppointment] = useState<Appointment | null>(null);
  const [cancelAppointment, setCancelAppointment] = useState<Appointment | null>(null);
  const [newDateTime, setNewDateTime] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [selectedVisit, setSelectedVisit] = useState<CompletedVisit | null>(null);
  const [summaryModalOpen, setSummaryModalOpen] = useState(false);

  useEffect(() => {
    fetchAppointments();
    fetchPendingTasks();
  }, [user.token]);

  useEffect(() => {
    if (activeTab === 'completed') {
      fetchCompletedVisits();
    }
  }, [activeTab]);

  const fetchAppointments = async () => {
    try {
      setLoading(true);
      const response = await axios.get(`${API_URL}/schedule/appointments`, {
        headers: {
          Authorization: `Bearer ${user.token}`,
        },
      });
      setAppointments(response.data.data || []);
    } catch (error) {
      console.error('Error fetching appointments:', error);
      setAppointments([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchCompletedVisits = async () => {
    try {
      setLoading(true);
      const response = await axios.get(`${API_URL}/schedule/completed-visits`, {
        headers: {
          Authorization: `Bearer ${user.token}`,
        },
      });
      setCompletedVisits(response.data.data || []);
    } catch (error) {
      console.error('Error fetching completed visits:', error);
      setCompletedVisits([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchPendingTasks = async () => {
    try {
      const response = await axios.get(`${API_URL}/patients/tasks/open`, {
        headers: {
          Authorization: `Bearer ${user.token}`,
        },
      });
      setPendingTasks(response.data.data || []);
    } catch (error) {
      console.error('Error fetching pending tasks:', error);
      setPendingTasks([]);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  };

  const handleCancelClick = (appointment: Appointment) => {
    // Open cancel confirmation modal
    setSelectedAppointment(appointment);
    setCancelModalOpen(true);
  };

  const handleRescheduleClick = (appointment: Appointment) => {
    // Redirect to AI assistant for conversational rescheduling
    setSelectedAppointment(appointment);
    setActiveTab('chat');
  };

  const handleCancelConfirm = async () => {
    if (!selectedAppointment) return;

    try {
      setActionLoading(true);
      await axios.delete(`${API_URL}/schedule/appointments/${selectedAppointment.id}`, {
        headers: { Authorization: `Bearer ${user.token}` },
      });

      // Refresh appointments
      await fetchAppointments();

      // Close modal
      setCancelModalOpen(false);
      setSelectedAppointment(null);

      alert('Appointment cancelled successfully');
    } catch (error: any) {
      console.error('Error cancelling appointment:', error);
      alert(error.response?.data?.message || 'Failed to cancel appointment. Please try again.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleRescheduleConfirm = async () => {
    if (!selectedAppointment || !newDateTime) return;

    try {
      setActionLoading(true);
      await axios.put(
        `${API_URL}/schedule/appointments/${selectedAppointment.id}`,
        { scheduledAt: new Date(newDateTime).toISOString() },
        { headers: { Authorization: `Bearer ${user.token}` } }
      );

      // Refresh appointments
      await fetchAppointments();

      // Close modal
      setRescheduleModalOpen(false);
      setSelectedAppointment(null);
      setNewDateTime('');

      alert('Appointment rescheduled successfully');
    } catch (error: any) {
      console.error('Error rescheduling appointment:', error);
      alert(error.response?.data?.message || 'Failed to reschedule appointment. Please try again.');
    } finally {
      setActionLoading(false);
    }
  };

  const closeModals = () => {
    setCancelModalOpen(false);
    setRescheduleModalOpen(false);
    setSelectedAppointment(null);
    setNewDateTime('');
  };

  return (
    <div className="dashboard">
      <nav className="navbar">
        <div className="nav-brand">
          <h1>🏥 CAIA Clinic</h1>
        </div>
        <div className="nav-user">
          <span>Welcome, {user.firstName}!</span>
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
            <li className={activeTab === 'chat' ? 'active' : ''}>
              <button onClick={() => setActiveTab('chat')}>
                💬 AI Assistant
              </button>
            </li>
            <li className={activeTab === 'appointments' ? 'active' : ''}>
              <button onClick={() => setActiveTab('appointments')}>
                📅 Appointments
              </button>
            </li>
            <li className={activeTab === 'completed' ? 'active' : ''}>
              <button onClick={() => setActiveTab('completed')}>
                ✅ Done Meetings
              </button>
            </li>
          </ul>
        </aside>

        <main className="main-content">
          {activeTab === 'dashboard' && (
            <div className="dashboard-content">
              <h2>Welcome to CAIA Clinic Portal</h2>
              <div className="stats-grid">
                <div className="stat-card">
                  <h3>📅 Upcoming Appointments</h3>
                  <p className="stat-number">{appointments.length}</p>
                  <small>
                    {appointments.length === 0
                      ? 'No appointments scheduled'
                      : appointments.length === 1
                      ? '1 appointment scheduled'
                      : `${appointments.length} appointments scheduled`}
                  </small>
                </div>

                <div className="stat-card">
                  <h3>📋 Pending Tasks</h3>
                  <p className="stat-number">{pendingTasks.length}</p>
                  <small>
                    {pendingTasks.length === 0
                      ? 'No pending tasks'
                      : pendingTasks.length === 1
                      ? '1 task from doctor'
                      : `${pendingTasks.length} tasks from doctor`}
                  </small>
                </div>

                <div className="stat-card">
                  <h3>💬 Messages</h3>
                  <p className="stat-number">0</p>
                  <small>No unread messages</small>
                </div>
              </div>

              <div className="quick-actions-modern">
                <h3 className="quick-actions-title">Quick Actions</h3>
                <div className="quick-actions-grid">
                  <button
                    onClick={() => setActiveTab('chat')}
                    className="quick-action-card"
                  >
                    <div className="quick-action-icon-wrapper" style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' }}>
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                      </svg>
                    </div>
                    <div className="quick-action-content">
                      <span className="quick-action-label">Talk with AI Assistant</span>
                      <span className="quick-action-description">Chat with our AI to book appointments or ask questions</span>
                    </div>
                    <svg className="quick-action-arrow" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="9 18 15 12 9 6"></polyline>
                    </svg>
                  </button>

                  <button
                    onClick={() => setActiveTab('appointments')}
                    className="quick-action-card"
                  >
                    <div className="quick-action-icon-wrapper" style={{ background: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)' }}>
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                        <line x1="16" y1="2" x2="16" y2="6"></line>
                        <line x1="8" y1="2" x2="8" y2="6"></line>
                        <line x1="3" y1="10" x2="21" y2="10"></line>
                      </svg>
                    </div>
                    <div className="quick-action-content">
                      <span className="quick-action-label">{appointments.length > 0 ? 'View Appointments' : 'Book Appointment'}</span>
                      <span className="quick-action-description">{appointments.length > 0 ? `You have ${appointments.length} upcoming appointment${appointments.length > 1 ? 's' : ''}` : 'Schedule your next visit with the doctor'}</span>
                    </div>
                    <svg className="quick-action-arrow" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="9 18 15 12 9 6"></polyline>
                    </svg>
                  </button>
                </div>
              </div>

              {/* Tasks Section - Split into Upload Tasks and Follow Tasks */}
              {pendingTasks.length > 0 && (() => {
                // Split tasks into categories
                const uploadTasks = pendingTasks.filter((t: any) =>
                  ['LAB_ORDER', 'IMAGING_ORDER'].includes(t.taskType)
                );
                const followTasks = pendingTasks.filter((t: any) =>
                  ['PRESCRIPTION', 'MEDICATION_ADHERENCE', 'FOLLOW_UP', 'PREP_INSTRUCTION'].includes(t.taskType)
                );
                const otherTasks = pendingTasks.filter((t: any) =>
                  !['LAB_ORDER', 'IMAGING_ORDER', 'PRESCRIPTION', 'MEDICATION_ADHERENCE', 'FOLLOW_UP', 'PREP_INSTRUCTION'].includes(t.taskType)
                );

                // Helper functions
                const getTaskIcon = (type: string) => {
                  switch (type) {
                    case 'LAB_ORDER': return '🧪';
                    case 'IMAGING_ORDER': return '🔬';
                    case 'PRESCRIPTION': return '💊';
                    case 'FOLLOW_UP': return '📅';
                    case 'MEDICATION_ADHERENCE': return '💉';
                    case 'PREP_INSTRUCTION': return '📝';
                    default: return '📋';
                  }
                };

                const getPriorityStyle = (priority: string) => {
                  switch (priority) {
                    case 'URGENT': return { bg: '#fef2f2', border: '#ef4444', text: '#dc2626' };
                    case 'HIGH': return { bg: '#fff7ed', border: '#f97316', text: '#ea580c' };
                    case 'MEDIUM': return { bg: '#fefce8', border: '#eab308', text: '#ca8a04' };
                    case 'LOW': return { bg: '#f0fdf4', border: '#22c55e', text: '#16a34a' };
                    default: return { bg: '#f8fafc', border: '#94a3b8', text: '#64748b' };
                  }
                };

                return (
                  <>
                    {/* Upload Tasks Section - Test Results */}
                    {uploadTasks.length > 0 && (
                      <div style={{
                        marginTop: '30px',
                        padding: '24px',
                        background: 'white',
                        borderRadius: '12px',
                        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)'
                      }}>
                        <h3 style={{
                          margin: '0 0 20px 0',
                          fontSize: '1.3rem',
                          color: '#1e293b',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '10px'
                        }}>
                          🔬 Test Results to Upload
                          <span style={{
                            background: '#3b82f6',
                            color: 'white',
                            padding: '4px 10px',
                            borderRadius: '12px',
                            fontSize: '0.85rem',
                            fontWeight: '600'
                          }}>
                            {uploadTasks.length}
                          </span>
                        </h3>

                        <div style={{
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '12px'
                        }}>
                          {uploadTasks.map((task: any) => {
                            const priorityStyle = getPriorityStyle(task.priority);
                            const isUploaded = !!task.resultUrl;

                            return (
                              <div
                                key={task.id}
                                style={{
                                  padding: '16px',
                                  background: isUploaded ? '#f0fdf4' : priorityStyle.bg,
                                  borderRadius: '10px',
                                  borderLeft: `4px solid ${isUploaded ? '#22c55e' : priorityStyle.border}`,
                                  transition: 'transform 0.2s ease, box-shadow 0.2s ease'
                                }}
                                onMouseEnter={(e) => {
                                  e.currentTarget.style.transform = 'translateX(4px)';
                                  e.currentTarget.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.1)';
                                }}
                                onMouseLeave={(e) => {
                                  e.currentTarget.style.transform = 'translateX(0)';
                                  e.currentTarget.style.boxShadow = 'none';
                                }}
                              >
                                <div style={{
                                  display: 'flex',
                                  justifyContent: 'space-between',
                                  alignItems: 'flex-start',
                                  marginBottom: '8px'
                                }}>
                                  <div style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '10px'
                                  }}>
                                    <span style={{ fontSize: '1.4rem' }}>{getTaskIcon(task.taskType)}</span>
                                    <div>
                                      <h4 style={{
                                        margin: 0,
                                        fontSize: '1rem',
                                        fontWeight: '600',
                                        color: '#1e293b'
                                      }}>
                                        {task.title}
                                      </h4>
                                      <span style={{
                                        fontSize: '0.75rem',
                                        color: '#64748b',
                                        textTransform: 'capitalize'
                                      }}>
                                        {task.taskType.replace(/_/g, ' ').toLowerCase()}
                                      </span>
                                    </div>
                                  </div>
                                  <span style={{
                                    padding: '4px 8px',
                                    borderRadius: '6px',
                                    fontSize: '0.7rem',
                                    fontWeight: '600',
                                    background: isUploaded ? '#22c55e' : priorityStyle.border,
                                    color: 'white',
                                    textTransform: 'uppercase'
                                  }}>
                                    {isUploaded ? '✓ UPLOADED' : task.priority}
                                  </span>
                                </div>

                                {task.description && (
                                  <p style={{
                                    margin: '8px 0 0 0',
                                    fontSize: '0.9rem',
                                    color: '#475569',
                                    lineHeight: '1.5'
                                  }}>
                                    {task.description}
                                  </p>
                                )}

                                {task.dueDate && !isUploaded && (
                                  <div style={{
                                    marginTop: '10px',
                                    fontSize: '0.8rem',
                                    color: new Date(task.dueDate) < new Date() ? '#dc2626' : '#64748b',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '4px'
                                  }}>
                                    ⏰ Due: {new Date(task.dueDate).toLocaleDateString('en-US', {
                                      month: 'short',
                                      day: 'numeric',
                                      year: 'numeric'
                                    })}
                                    {new Date(task.dueDate) < new Date() && (
                                      <span style={{
                                        marginLeft: '8px',
                                        padding: '2px 6px',
                                        background: '#fef2f2',
                                        color: '#dc2626',
                                        borderRadius: '4px',
                                        fontWeight: '600'
                                      }}>
                                        OVERDUE
                                      </span>
                                    )}
                                  </div>
                                )}

                                {task.orderDetails?.instructions && (
                                  <div style={{
                                    marginTop: '10px',
                                    padding: '8px 12px',
                                    background: 'rgba(255, 255, 255, 0.7)',
                                    borderRadius: '6px',
                                    fontSize: '0.85rem',
                                    color: '#475569'
                                  }}>
                                    <strong>Instructions:</strong> {task.orderDetails.instructions}
                                  </div>
                                )}

                                {isUploaded && (
                                  <div style={{
                                    marginTop: '10px',
                                    padding: '8px 12px',
                                    background: '#dcfce7',
                                    borderRadius: '6px',
                                    fontSize: '0.85rem',
                                    color: '#166534',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '6px'
                                  }}>
                                    ✅ File uploaded successfully - awaiting doctor review
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Follow Tasks Section - Things to Follow */}
                    {followTasks.length > 0 && (
                      <div style={{
                        marginTop: '30px',
                        padding: '24px',
                        background: 'white',
                        borderRadius: '12px',
                        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)'
                      }}>
                        <h3 style={{
                          margin: '0 0 20px 0',
                          fontSize: '1.3rem',
                          color: '#1e293b',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '10px'
                        }}>
                          📝 Things to Follow
                          <span style={{
                            background: '#8b5cf6',
                            color: 'white',
                            padding: '4px 10px',
                            borderRadius: '12px',
                            fontSize: '0.85rem',
                            fontWeight: '600'
                          }}>
                            {followTasks.length}
                          </span>
                        </h3>

                        <div style={{
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '12px'
                        }}>
                          {followTasks.map((task: any) => {
                            return (
                              <div
                                key={task.id}
                                style={{
                                  padding: '16px',
                                  background: '#f5f3ff',
                                  borderRadius: '10px',
                                  borderLeft: '4px solid #8b5cf6',
                                  transition: 'transform 0.2s ease, box-shadow 0.2s ease'
                                }}
                                onMouseEnter={(e) => {
                                  e.currentTarget.style.transform = 'translateX(4px)';
                                  e.currentTarget.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.1)';
                                }}
                                onMouseLeave={(e) => {
                                  e.currentTarget.style.transform = 'translateX(0)';
                                  e.currentTarget.style.boxShadow = 'none';
                                }}
                              >
                                <div style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '10px',
                                  marginBottom: '8px'
                                }}>
                                  <span style={{ fontSize: '1.4rem' }}>{getTaskIcon(task.taskType)}</span>
                                  <div>
                                    <h4 style={{
                                      margin: 0,
                                      fontSize: '1rem',
                                      fontWeight: '600',
                                      color: '#1e293b'
                                    }}>
                                      {task.title}
                                    </h4>
                                    <span style={{
                                      fontSize: '0.75rem',
                                      color: '#7c3aed',
                                      fontWeight: '500'
                                    }}>
                                      {task.taskType === 'PRESCRIPTION' ? 'Medication' :
                                       task.taskType === 'MEDICATION_ADHERENCE' ? 'Daily Reminder' :
                                       task.taskType === 'FOLLOW_UP' ? 'Follow-up Required' :
                                       'Instructions'}
                                    </span>
                                  </div>
                                </div>

                                {task.description && (
                                  <p style={{
                                    margin: '8px 0 0 0',
                                    fontSize: '0.9rem',
                                    color: '#475569',
                                    lineHeight: '1.5',
                                    paddingLeft: '34px'
                                  }}>
                                    {task.description}
                                  </p>
                                )}

                                {task.orderDetails?.instructions && (
                                  <div style={{
                                    marginTop: '10px',
                                    marginLeft: '34px',
                                    padding: '8px 12px',
                                    background: 'rgba(255, 255, 255, 0.7)',
                                    borderRadius: '6px',
                                    fontSize: '0.85rem',
                                    color: '#475569'
                                  }}>
                                    <strong>How to follow:</strong> {task.orderDetails.instructions}
                                  </div>
                                )}

                                {task.orderDetails?.medication && (
                                  <div style={{
                                    marginTop: '10px',
                                    marginLeft: '34px',
                                    padding: '10px 12px',
                                    background: 'rgba(255, 255, 255, 0.8)',
                                    borderRadius: '6px',
                                    fontSize: '0.85rem',
                                    color: '#475569'
                                  }}>
                                    <div><strong>Medication:</strong> {task.orderDetails.medication.name}</div>
                                    {task.orderDetails.medication.dosage && (
                                      <div><strong>Dosage:</strong> {task.orderDetails.medication.dosage}</div>
                                    )}
                                    {task.orderDetails.medication.frequency && (
                                      <div><strong>Frequency:</strong> {task.orderDetails.medication.frequency}</div>
                                    )}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Other Tasks */}
                    {otherTasks.length > 0 && (
                      <div style={{
                        marginTop: '30px',
                        padding: '24px',
                        background: 'white',
                        borderRadius: '12px',
                        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)'
                      }}>
                        <h3 style={{
                          margin: '0 0 20px 0',
                          fontSize: '1.3rem',
                          color: '#1e293b',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '10px'
                        }}>
                          📋 Other Tasks
                          <span style={{
                            background: '#64748b',
                            color: 'white',
                            padding: '4px 10px',
                            borderRadius: '12px',
                            fontSize: '0.85rem',
                            fontWeight: '600'
                          }}>
                            {otherTasks.length}
                          </span>
                        </h3>

                        <div style={{
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '12px'
                        }}>
                          {otherTasks.map((task: any) => {
                            const priorityStyle = getPriorityStyle(task.priority);

                            return (
                              <div
                                key={task.id}
                                style={{
                                  padding: '16px',
                                  background: priorityStyle.bg,
                                  borderRadius: '10px',
                                  borderLeft: `4px solid ${priorityStyle.border}`,
                                  transition: 'transform 0.2s ease, box-shadow 0.2s ease'
                                }}
                                onMouseEnter={(e) => {
                                  e.currentTarget.style.transform = 'translateX(4px)';
                                  e.currentTarget.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.1)';
                                }}
                                onMouseLeave={(e) => {
                                  e.currentTarget.style.transform = 'translateX(0)';
                                  e.currentTarget.style.boxShadow = 'none';
                                }}
                              >
                                <div style={{
                                  display: 'flex',
                                  justifyContent: 'space-between',
                                  alignItems: 'flex-start',
                                  marginBottom: '8px'
                                }}>
                                  <div style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '10px'
                                  }}>
                                    <span style={{ fontSize: '1.4rem' }}>{getTaskIcon(task.taskType)}</span>
                                    <div>
                                      <h4 style={{
                                        margin: 0,
                                        fontSize: '1rem',
                                        fontWeight: '600',
                                        color: '#1e293b'
                                      }}>
                                        {task.title}
                                      </h4>
                                    </div>
                                  </div>
                                  <span style={{
                                    padding: '4px 8px',
                                    borderRadius: '6px',
                                    fontSize: '0.7rem',
                                    fontWeight: '600',
                                    background: priorityStyle.border,
                                    color: 'white',
                                    textTransform: 'uppercase'
                                  }}>
                                    {task.priority}
                                  </span>
                                </div>

                                {task.description && (
                                  <p style={{
                                    margin: '8px 0 0 0',
                                    fontSize: '0.9rem',
                                    color: '#475569',
                                    lineHeight: '1.5'
                                  }}>
                                    {task.description}
                                  </p>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </>
                );
              })()}
            </div>
          )}

          {activeTab === 'chat' && (
            <div className="chat-content">
              <Chat
                user={user}
                onAppointmentBooked={fetchAppointments}
                rescheduleAppointment={selectedAppointment}
                onRescheduleComplete={() => {
                  setSelectedAppointment(null);
                  fetchAppointments();
                }}
                cancelAppointment={cancelAppointment}
                onCancelComplete={() => {
                  setCancelAppointment(null);
                  fetchAppointments();
                }}
              />
            </div>
          )}

          {activeTab === 'appointments' && (
            <div className="appointments-content">
              <div className="appointments-header">
                <h2>My Appointments</h2>
                <button onClick={() => setActiveTab('chat')} className="btn-book-new">
                  + Book New Appointment
                </button>
              </div>

              {loading ? (
                <div className="loading-state">
                  <div className="spinner"></div>
                  <p>Loading appointments...</p>
                </div>
              ) : appointments.length === 0 ? (
                <div className="empty-state">
                  <div className="empty-icon">📅</div>
                  <h3>No Appointments Scheduled</h3>
                  <p>You don't have any upcoming appointments at the moment.</p>
                  <p className="empty-hint">
                    Book your first appointment by chatting with our AI Assistant.
                  </p>
                  <button onClick={() => setActiveTab('chat')} className="btn-primary-large">
                    💬 Talk to AI Assistant
                  </button>
                </div>
              ) : (
                <div className="appointments-grid">
                  {appointments.map((apt) => (
                    <div key={apt.id} className="appointment-item">
                      <div className="appointment-left">
                        <div className="appointment-date-box">
                          <div className="date-month">
                            {new Date(apt.scheduledAt).toLocaleDateString('en-US', { month: 'short' }).toUpperCase()}
                          </div>
                          <div className="date-day">
                            {new Date(apt.scheduledAt).getDate()}
                          </div>
                          <div className="date-year">
                            {new Date(apt.scheduledAt).getFullYear()}
                          </div>
                        </div>
                      </div>

                      <div className="appointment-middle">
                        <div className="appointment-time">
                          <span className="time-icon">🕐</span>
                          {formatTime(apt.scheduledAt)}
                        </div>
                        <h3 className="appointment-title">{apt.reasonForVisit}</h3>
                        <div className="appointment-meta">
                          <span className="meta-item">
                            <span className="meta-icon">📋</span>
                            {apt.visitType.replace(/_/g, ' ')}
                          </span>
                          <span className="meta-item">
                            <span className="meta-icon">⏱️</span>
                            {apt.durationMinutes} min
                          </span>
                        </div>
                      </div>

                      <div className="appointment-right">
                        <span className={`status-pill status-${apt.status.toLowerCase()}`}>
                          {apt.status}
                        </span>
                        <div className="appointment-actions">
                          <button
                            className="btn-action-secondary"
                            title="Reschedule"
                            onClick={() => handleRescheduleClick(apt)}
                          >
                            Reschedule
                          </button>
                          <button
                            className="btn-action-danger"
                            title="Cancel"
                            onClick={() => handleCancelClick(apt)}
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'completed' && (
            <div className="appointments-content">
              <div className="appointments-header">
                <h2>Done Meetings</h2>
                <div className="appointments-count">{completedVisits.length} completed visits</div>
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
                <div className="appointments-grid">
                  {completedVisits.map((visit) => (
                    <div key={visit.id} className="appointment-item completed-item">
                      <div className="appointment-left">
                        <div className="appointment-date-box completed-box">
                          <div className="date-month">
                            {new Date(visit.completedAt).toLocaleDateString('en-US', { month: 'short' }).toUpperCase()}
                          </div>
                          <div className="date-day">
                            {new Date(visit.completedAt).getDate()}
                          </div>
                          <div className="date-year">
                            {new Date(visit.completedAt).getFullYear()}
                          </div>
                        </div>
                      </div>

                      <div className="appointment-middle">
                        <div className="appointment-time">
                          <span className="time-icon">🕐</span>
                          {formatTime(visit.scheduledAt)}
                        </div>
                        <h3 className="appointment-title">{visit.reasonForVisit}</h3>
                        <div className="appointment-meta">
                          <span className="meta-item">
                            <span className="meta-icon">📋</span>
                            {visit.visitType.replace(/_/g, ' ')}
                          </span>
                          <span className="meta-item">
                            <span className="meta-icon">⏱️</span>
                            {visit.durationMinutes} min
                          </span>
                          {visit.provider && (
                            <span className="meta-item">
                              <span className="meta-icon">👨‍⚕️</span>
                              Dr. {visit.provider.firstName} {visit.provider.lastName}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="appointment-right">
                        <span className="status-pill status-completed">
                          COMPLETED
                        </span>
                        <div className="appointment-actions">
                          <button
                            onClick={() => {
                              setSelectedVisit(visit);
                              setSummaryModalOpen(true);
                            }}
                            style={{
                              padding: '12px 24px',
                              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                              color: 'white',
                              border: 'none',
                              borderRadius: '10px',
                              fontSize: '0.95rem',
                              fontWeight: '600',
                              cursor: 'pointer',
                              transition: 'all 0.3s ease',
                              boxShadow: '0 4px 15px rgba(102, 126, 234, 0.3)',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '8px'
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.transform = 'translateY(-2px)';
                              e.currentTarget.style.boxShadow = '0 6px 20px rgba(102, 126, 234, 0.4)';
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.transform = 'translateY(0)';
                              e.currentTarget.style.boxShadow = '0 4px 15px rgba(102, 126, 234, 0.3)';
                            }}
                          >
                            <span style={{ fontSize: '1.1rem' }}>📋</span>
                            View Summary
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </main>
      </div>

      {/* Cancel Confirmation Modal */}
      {cancelModalOpen && selectedAppointment && (
        <div className="modal-overlay" onClick={closeModals}>
          <div className="modal-container" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Cancel Appointment</h3>
              <button className="modal-close" onClick={closeModals}>
                ×
              </button>
            </div>
            <div className="modal-body">
              <div className="modal-warning">
                <span className="warning-icon">⚠️</span>
                <p>Are you sure you want to cancel this appointment?</p>
              </div>
              <div className="appointment-details-modal">
                <p>
                  <strong>Date:</strong> {formatDate(selectedAppointment.scheduledAt)}
                </p>
                <p>
                  <strong>Time:</strong> {formatTime(selectedAppointment.scheduledAt)}
                </p>
                <p>
                  <strong>Reason:</strong> {selectedAppointment.reasonForVisit}
                </p>
              </div>
              <p className="modal-note">
                This action cannot be undone. You'll need to book a new appointment if you change your mind.
              </p>
            </div>
            <div className="modal-footer">
              <button className="btn-modal-secondary" onClick={closeModals} disabled={actionLoading}>
                Keep Appointment
              </button>
              <button
                className="btn-modal-danger"
                onClick={handleCancelConfirm}
                disabled={actionLoading}
              >
                {actionLoading ? 'Cancelling...' : 'Yes, Cancel Appointment'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reschedule Modal */}
      {rescheduleModalOpen && selectedAppointment && (
        <div className="modal-overlay" onClick={closeModals}>
          <div className="modal-container" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Reschedule Appointment</h3>
              <button className="modal-close" onClick={closeModals}>
                ×
              </button>
            </div>
            <div className="modal-body">
              <div className="appointment-details-modal">
                <p>
                  <strong>Current Date:</strong> {formatDate(selectedAppointment.scheduledAt)}
                </p>
                <p>
                  <strong>Current Time:</strong> {formatTime(selectedAppointment.scheduledAt)}
                </p>
                <p>
                  <strong>Reason:</strong> {selectedAppointment.reasonForVisit}
                </p>
              </div>

              <div className="form-group">
                <label htmlFor="newDateTime">Select New Date & Time:</label>
                <input
                  type="datetime-local"
                  id="newDateTime"
                  value={newDateTime}
                  onChange={(e) => setNewDateTime(e.target.value)}
                  min={new Date().toISOString().slice(0, 16)}
                  className="datetime-input"
                />
              </div>

              <p className="modal-note">
                Please select a new date and time for your appointment. Make sure to choose a time during business hours (9 AM - 5 PM, Monday-Friday).
              </p>
            </div>
            <div className="modal-footer">
              <button className="btn-modal-secondary" onClick={closeModals} disabled={actionLoading}>
                Cancel
              </button>
              <button
                className="btn-modal-primary"
                onClick={handleRescheduleConfirm}
                disabled={actionLoading || !newDateTime}
              >
                {actionLoading ? 'Rescheduling...' : 'Reschedule Appointment'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Visit Summary Modal - Improved Design */}
      {summaryModalOpen && selectedVisit && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10000,
            padding: '20px'
          }}
          onClick={() => setSummaryModalOpen(false)}
        >
          <div
            style={{
              background: 'white',
              borderRadius: '16px',
              maxWidth: '800px',
              width: '100%',
              maxHeight: '90vh',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.3)',
              overflow: 'hidden'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header with gradient */}
            <div style={{
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              padding: '24px 28px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              color: 'white'
            }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 'bold' }}>
                  📋 Visit Summary
                </h3>
                <p style={{ margin: '4px 0 0 0', fontSize: '0.9rem', opacity: 0.9 }}>
                  {formatDate(selectedVisit.scheduledAt)} • {formatTime(selectedVisit.scheduledAt)}
                </p>
              </div>
              <button
                onClick={() => setSummaryModalOpen(false)}
                style={{
                  background: 'rgba(255, 255, 255, 0.2)',
                  border: 'none',
                  width: '36px',
                  height: '36px',
                  borderRadius: '50%',
                  fontSize: '1.5rem',
                  cursor: 'pointer',
                  color: 'white',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'background 0.2s'
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.3)'}
                onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)'}
              >
                ×
              </button>
            </div>

            {/* Scrollable Body */}
            <div style={{
              padding: '28px',
              overflowY: 'auto',
              flex: 1
            }}>
              {/* Visit Details Card */}
              <div style={{
                background: '#f8f9fa',
                borderRadius: '12px',
                padding: '20px',
                marginBottom: '24px',
                border: '1px solid #e9ecef'
              }}>
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                  gap: '16px'
                }}>
                  <div>
                    <div style={{ fontSize: '0.85rem', color: '#6c757d', marginBottom: '4px' }}>
                      Reason for Visit
                    </div>
                    <div style={{ fontSize: '1rem', fontWeight: '600', color: '#212529' }}>
                      {selectedVisit.reasonForVisit}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.85rem', color: '#6c757d', marginBottom: '4px' }}>
                      Duration
                    </div>
                    <div style={{ fontSize: '1rem', fontWeight: '600', color: '#212529' }}>
                      {selectedVisit.durationMinutes} minutes
                    </div>
                  </div>
                  {selectedVisit.provider && (
                    <div>
                      <div style={{ fontSize: '0.85rem', color: '#6c757d', marginBottom: '4px' }}>
                        Provider
                      </div>
                      <div style={{ fontSize: '1rem', fontWeight: '600', color: '#212529' }}>
                        Dr. {selectedVisit.provider.firstName} {selectedVisit.provider.lastName}
                      </div>
                      {selectedVisit.provider.specialty && (
                        <div style={{ fontSize: '0.85rem', color: '#6c757d', marginTop: '2px' }}>
                          {selectedVisit.provider.specialty}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Patient Summary */}
              {selectedVisit.patientSummary && (
                <div style={{ marginBottom: '24px' }}>
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    marginBottom: '12px',
                    paddingBottom: '8px',
                    borderBottom: '2px solid #e3f2fd'
                  }}>
                    <span style={{ fontSize: '1.3rem' }}>💬</span>
                    <h4 style={{ margin: 0, fontSize: '1.15rem', color: '#1976d2', fontWeight: 'bold' }}>
                      Summary for You
                    </h4>
                  </div>
                  <div style={{
                    background: '#e3f2fd',
                    padding: '18px',
                    borderRadius: '10px',
                    borderLeft: '4px solid #1976d2',
                    fontSize: '0.95rem',
                    lineHeight: '1.7',
                    color: '#1565c0'
                  }}>
                    {selectedVisit.patientSummary}
                  </div>
                </div>
              )}

              {/* Assessment */}
              {selectedVisit.assessment && (
                <div style={{ marginBottom: '24px' }}>
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    marginBottom: '12px',
                    paddingBottom: '8px',
                    borderBottom: '2px solid #fff3e0'
                  }}>
                    <span style={{ fontSize: '1.3rem' }}>🩺</span>
                    <h4 style={{ margin: 0, fontSize: '1.15rem', color: '#f57c00', fontWeight: 'bold' }}>
                      Assessment
                    </h4>
                  </div>
                  <div style={{
                    background: '#fff3e0',
                    padding: '18px',
                    borderRadius: '10px',
                    borderLeft: '4px solid #f57c00',
                    fontSize: '0.95rem',
                    lineHeight: '1.7',
                    color: '#e65100'
                  }}>
                    {selectedVisit.assessment}
                  </div>
                </div>
              )}

              {/* Treatment Plan */}
              {selectedVisit.plan && (
                <div style={{ marginBottom: '24px' }}>
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    marginBottom: '12px',
                    paddingBottom: '8px',
                    borderBottom: '2px solid #e8f5e9'
                  }}>
                    <span style={{ fontSize: '1.3rem' }}>📊</span>
                    <h4 style={{ margin: 0, fontSize: '1.15rem', color: '#388e3c', fontWeight: 'bold' }}>
                      Treatment Plan
                    </h4>
                  </div>
                  <div style={{
                    background: '#e8f5e9',
                    padding: '18px',
                    borderRadius: '10px',
                    borderLeft: '4px solid #388e3c',
                    fontSize: '0.95rem',
                    lineHeight: '1.7',
                    color: '#2e7d32',
                    whiteSpace: 'pre-wrap'
                  }}>
                    {selectedVisit.plan}
                  </div>
                </div>
              )}

              {/* Empty State */}
              {!selectedVisit.patientSummary && !selectedVisit.assessment && !selectedVisit.plan && (
                <div style={{
                  textAlign: 'center',
                  padding: '40px 20px',
                  color: '#9ca3af'
                }}>
                  <div style={{ fontSize: '3rem', marginBottom: '16px' }}>📋</div>
                  <p style={{ fontSize: '1.1rem', fontWeight: '500', color: '#6b7280' }}>
                    No detailed summary available
                  </p>
                  <p style={{ fontSize: '0.9rem', margin: '8px 0 0 0' }}>
                    The doctor hasn't added visit notes yet.
                  </p>
                </div>
              )}
            </div>

            {/* Footer */}
            <div style={{
              padding: '20px 28px',
              borderTop: '1px solid #e9ecef',
              display: 'flex',
              justifyContent: 'flex-end',
              background: '#f8f9fa'
            }}>
              <button
                onClick={() => setSummaryModalOpen(false)}
                style={{
                  padding: '12px 32px',
                  background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '1rem',
                  fontWeight: '600',
                  cursor: 'pointer',
                  transition: 'transform 0.2s, box-shadow 0.2s',
                  boxShadow: '0 4px 6px rgba(102, 126, 234, 0.3)'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'translateY(-2px)';
                  e.currentTarget.style.boxShadow = '0 6px 12px rgba(102, 126, 234, 0.4)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = '0 4px 6px rgba(102, 126, 234, 0.3)';
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;
