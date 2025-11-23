import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './PatientsList.css';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3000/api';

interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  token: string;
}

interface PatientsListProps {
  user: User;
}

interface Patient {
  id: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  email: string;
  phone: string;
  clinicalProfile?: {
    bloodType?: string;
    allergies: string[];
    chronicConditions: string[];
  };
  visits: Array<{
    id: string;
    scheduledAt: string;
    completedAt?: string;
    reasonForVisit: string;
  }>;
}

const PatientsList: React.FC<PatientsListProps> = ({ user }) => {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedPatient, setSelectedPatient] = useState<string | null>(null);

  useEffect(() => {
    loadPatients();
  }, [user]);

  const loadPatients = async () => {
    try {
      const response = await axios.get(`${API_URL}/doctor/patients`, {
        headers: { Authorization: `Bearer ${user?.token}` },
      });
      setPatients(response.data.data);
      setLoading(false);
    } catch (error) {
      console.error('Error loading patients:', error);
      setLoading(false);
    }
  };

  const filteredPatients = patients.filter((patient) => {
    const fullName = `${patient.firstName} ${patient.lastName}`.toLowerCase();
    return fullName.includes(searchTerm.toLowerCase());
  });

  const handlePatientClick = (patientId: string) => {
    setSelectedPatient(patientId);
  };

  const closePatientDetails = () => {
    setSelectedPatient(null);
  };

  if (loading) {
    return (
      <div className="patients-list-container">
        <div className="loading-state-modern">
          <div className="loading-spinner"></div>
          <p>Loading patients...</p>
        </div>
      </div>
    );
  }

  // Calculate stats
  const patientsWithVisits = patients.filter(p => p.visits.length > 0).length;
  const totalVisits = patients.reduce((sum, p) => sum + p.visits.length, 0);

  return (
    <div className="patients-list-container">
      <div className="patients-header-modern">
        <div className="header-top">
          <div className="header-title-section">
            <h1>All Patients</h1>
            <p className="header-subtitle">Manage and view your patient database</p>
          </div>
          <div className="header-actions">
            <div className="search-bar-modern">
              <svg className="search-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8"></circle>
                <path d="m21 21-4.35-4.35"></path>
              </svg>
              <input
                type="text"
                placeholder="Search patients by name..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
              {searchTerm && (
                <button className="clear-search" onClick={() => setSearchTerm('')}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                  </svg>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="patients-stats-modern">
        <div className="stat-card-modern">
          <div className="stat-icon" style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
              <circle cx="9" cy="7" r="4"></circle>
              <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
              <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
            </svg>
          </div>
          <div className="stat-content">
            <div className="stat-value-modern">{patients.length}</div>
            <div className="stat-label-modern">Total Patients</div>
          </div>
        </div>

        <div className="stat-card-modern">
          <div className="stat-icon" style={{ background: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)' }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path>
              <circle cx="9" cy="7" r="4"></circle>
              <polyline points="16 11 18 13 22 9"></polyline>
            </svg>
          </div>
          <div className="stat-content">
            <div className="stat-value-modern">{patientsWithVisits}</div>
            <div className="stat-label-modern">Active Patients</div>
          </div>
        </div>

        <div className="stat-card-modern">
          <div className="stat-icon" style={{ background: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)' }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
              <line x1="16" y1="2" x2="16" y2="6"></line>
              <line x1="8" y1="2" x2="8" y2="6"></line>
              <line x1="3" y1="10" x2="21" y2="10"></line>
            </svg>
          </div>
          <div className="stat-content">
            <div className="stat-value-modern">{totalVisits}</div>
            <div className="stat-label-modern">Total Visits</div>
          </div>
        </div>
      </div>

      {searchTerm && (
        <div className="search-results-info">
          Found <strong>{filteredPatients.length}</strong> patient{filteredPatients.length !== 1 ? 's' : ''} matching "<strong>{searchTerm}</strong>"
        </div>
      )}

      <div className="patients-grid">
        {filteredPatients.length === 0 ? (
          <div className="no-patients-modern">
            <div className="empty-icon">
              <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                <circle cx="9" cy="7" r="4"></circle>
                <line x1="23" y1="11" x2="17" y2="11"></line>
              </svg>
            </div>
            <h3>No patients found</h3>
            <p>{searchTerm ? `No patients match "${searchTerm}"` : 'No patients in the system yet'}</p>
            {searchTerm && (
              <button className="btn-clear-search" onClick={() => setSearchTerm('')}>
                Clear search
              </button>
            )}
          </div>
        ) : (
          filteredPatients.map((patient) => (
            <div
              key={patient.id}
              className="patient-card-modern"
              onClick={() => handlePatientClick(patient.id)}
            >
              <div className="patient-card-header-modern">
                <div className="patient-avatar-modern">
                  {patient.firstName[0]}{patient.lastName[0]}
                </div>
                <div className="patient-info-modern">
                  <h3>{patient.firstName} {patient.lastName}</h3>
                  <div className="patient-meta">
                    <span className="meta-item">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                        <line x1="16" y1="2" x2="16" y2="6"></line>
                        <line x1="8" y1="2" x2="8" y2="6"></line>
                        <line x1="3" y1="10" x2="21" y2="10"></line>
                      </svg>
                      {new Date(patient.dateOfBirth).toLocaleDateString()}
                    </span>
                  </div>
                </div>
                {patient.clinicalProfile?.bloodType && (
                  <div className="blood-type-badge">
                    {patient.clinicalProfile.bloodType}
                  </div>
                )}
              </div>

              <div className="patient-card-body-modern">
                <div className="info-grid">
                  {patient.clinicalProfile?.chronicConditions &&
                   patient.clinicalProfile.chronicConditions.length > 0 && (
                    <div className="info-item">
                      <div className="info-label">Conditions</div>
                      <div className="info-value">
                        {patient.clinicalProfile.chronicConditions.slice(0, 2).join(', ')}
                        {patient.clinicalProfile.chronicConditions.length > 2 && (
                          <span className="more-badge">+{patient.clinicalProfile.chronicConditions.length - 2}</span>
                        )}
                      </div>
                    </div>
                  )}

                  {patient.clinicalProfile?.allergies &&
                   patient.clinicalProfile.allergies.length > 0 && (
                    <div className="info-item allergy-item">
                      <div className="info-label">Allergies</div>
                      <div className="info-value allergy-value">
                        {patient.clinicalProfile.allergies.slice(0, 2).join(', ')}
                        {patient.clinicalProfile.allergies.length > 2 && (
                          <span className="more-badge">+{patient.clinicalProfile.allergies.length - 2}</span>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                <div className="visit-stats">
                  <div className="visit-stat">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                      <line x1="16" y1="2" x2="16" y2="6"></line>
                      <line x1="8" y1="2" x2="8" y2="6"></line>
                      <line x1="3" y1="10" x2="21" y2="10"></line>
                    </svg>
                    <span>{patient.visits.length} visit{patient.visits.length !== 1 ? 's' : ''}</span>
                  </div>
                  {patient.visits.length > 0 && patient.visits[0].completedAt && (
                    <div className="visit-stat last-visit">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="10"></circle>
                        <polyline points="12 6 12 12 16 14"></polyline>
                      </svg>
                      <span>Last: {new Date(patient.visits[0].completedAt).toLocaleDateString()}</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="patient-card-footer-modern">
                <button className="btn-view-profile-modern">
                  <span>View Profile</span>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="9 18 15 12 9 6"></polyline>
                  </svg>
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {selectedPatient && (
        <PatientDetailsModal
          patientId={selectedPatient}
          token={user.token}
          onClose={closePatientDetails}
        />
      )}
    </div>
  );
};

// Patient Details Modal Component
interface PatientDetailsModalProps {
  patientId: string;
  token: string;
  onClose: () => void;
}

const PatientDetailsModal: React.FC<PatientDetailsModalProps> = ({
  patientId,
  token,
  onClose,
}) => {
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

  const { patientInfo, clinicalProfile, visitSummary, allVisits, patientChart } = patientData;

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

          {/* Comprehensive Patient File - Show First */}
          {patientChart?.comprehensivePatientFile && (
            <div className="detail-section" style={{ background: '#f0f9ff', borderLeft: '4px solid #0ea5e9' }}>
              <h3>📋 Comprehensive Patient Narrative</h3>
              <div style={{
                background: 'white',
                padding: '24px',
                borderRadius: '8px',
                fontFamily: 'Georgia, serif',
                fontSize: '15px',
                lineHeight: '1.8',
                whiteSpace: 'pre-wrap',
                maxHeight: '500px',
                overflowY: 'auto',
                border: '1px solid #bae6fd',
                color: '#1e293b'
              }}>
                {patientChart.comprehensivePatientFile}
              </div>
              <p style={{ fontSize: '12px', color: '#64748b', marginTop: '12px', fontStyle: 'italic' }}>
                📅 Last updated: {patientChart.fileLastUpdatedFrom || 'Unknown'}
              </p>
            </div>
          )}

          {/* Clinical Profile Section - Collapsible */}
          <details className="detail-section" style={{ background: '#fefce8', borderLeft: '4px solid #eab308' }}>
            <summary style={{
              cursor: 'pointer',
              fontWeight: 'bold',
              fontSize: '1.1em',
              padding: '12px',
              background: '#fef9c3',
              borderRadius: '6px',
              marginBottom: '12px',
              userSelect: 'none'
            }}>
              🏥 Clinical Profile (Structured Fields)
            </summary>
            <div className="profile-grid">
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
              {clinicalProfile?.pastSurgeries && clinicalProfile.pastSurgeries.length > 0 && (
                <div className="profile-field">
                  <strong>Past Surgeries:</strong> {clinicalProfile.pastSurgeries.join(', ')}
                </div>
              )}
              {clinicalProfile?.smokingStatus && (
                <div className="profile-field">
                  <strong>Smoking:</strong> {clinicalProfile.smokingStatus}
                </div>
              )}
              {clinicalProfile?.alcoholUse && (
                <div className="profile-field">
                  <strong>Alcohol:</strong> {clinicalProfile.alcoholUse}
                </div>
              )}
              {clinicalProfile?.occupation && (
                <div className="profile-field">
                  <strong>Occupation:</strong> {clinicalProfile.occupation}
                </div>
              )}
            </div>
          </details>

          {/* Visit History Section */}
          <div className="detail-section">
            <h3>📅 Visit History ({allVisits.length} visits)</h3>
            <div className="visits-timeline">
              {allVisits.map((visit: any, index: number) => (
                <div key={visit.id} className="visit-item">
                  <div className="visit-number">Visit {allVisits.length - index}</div>
                  <div className="visit-details">
                    <p className="visit-date">
                      {new Date(visit.completedAt).toLocaleDateString()} at{' '}
                      {new Date(visit.completedAt).toLocaleTimeString()}
                    </p>
                    <p><strong>Reason:</strong> {visit.reasonForVisit}</p>
                    {visit.hpiDraft && (
                      <p><strong>HPI:</strong> {visit.hpiDraft}</p>
                    )}
                    {visit.assessment && (
                      <p><strong>Assessment:</strong> {visit.assessment}</p>
                    )}
                    {visit.plan && (
                      <p><strong>Plan:</strong> {visit.plan}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Patient Files Section - Files marked as read */}
          <div className="detail-section" style={{ background: '#f0fdf4', borderLeft: '4px solid #22c55e' }}>
            <h3>📁 Reviewed Patient Files {patientData.files?.length > 0 && `(${patientData.files.length})`}</h3>
            <p style={{ fontSize: '13px', color: '#6b7280', marginBottom: '16px' }}>
              Files uploaded by the patient that you have reviewed
            </p>
            {patientData.files && patientData.files.length > 0 ? (
              <div className="patient-files-grid" style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                gap: '12px',
              }}>
                {patientData.files.map((file: any) => (
                  <div key={file.id} style={{
                    background: 'white',
                    borderRadius: '10px',
                    padding: '14px',
                    border: '1px solid #e5e7eb',
                    display: 'flex',
                    gap: '12px',
                    alignItems: 'flex-start',
                  }}>
                    <div style={{
                      fontSize: '28px',
                      width: '44px',
                      height: '44px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      background: '#f3f4f6',
                      borderRadius: '8px',
                    }}>
                      {file.fileCategory === 'LAB_RESULT' && '🔬'}
                      {file.fileCategory === 'IMAGING' && '📸'}
                      {file.fileCategory === 'PRESCRIPTION' && '💊'}
                      {file.fileCategory === 'INSURANCE' && '📋'}
                      {file.fileCategory === 'ID_DOCUMENT' && '🆔'}
                      {file.fileCategory === 'CONSENT_FORM' && '✍️'}
                      {file.fileCategory === 'AUDIO_RECORDING' && '🎙️'}
                      {(!file.fileCategory || file.fileCategory === 'OTHER') && '📄'}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        fontWeight: 600,
                        fontSize: '14px',
                        color: '#1f2937',
                        marginBottom: '4px',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }} title={file.fileName}>
                        {file.fileName}
                      </div>
                      <div style={{
                        display: 'flex',
                        gap: '8px',
                        fontSize: '12px',
                        color: '#6b7280',
                        marginBottom: '6px',
                        flexWrap: 'wrap',
                      }}>
                        <span style={{
                          background: '#e0f2fe',
                          color: '#0369a1',
                          padding: '2px 6px',
                          borderRadius: '4px',
                          fontSize: '11px',
                          fontWeight: 500,
                        }}>
                          {file.fileCategory?.replace(/_/g, ' ') || 'OTHER'}
                        </span>
                        <span>{file.fileSize ? (file.fileSize / 1024).toFixed(1) + ' KB' : 'N/A'}</span>
                      </div>
                      <div style={{ fontSize: '11px', color: '#9ca3af' }}>
                        Uploaded: {new Date(file.createdAt).toLocaleDateString()}
                        {file.reviewedAt && (
                          <span style={{ marginLeft: '8px', color: '#22c55e' }}>
                            ✓ Reviewed
                          </span>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={async () => {
                        try {
                          const response = await axios.get(
                            `${API_URL}/files/${file.id}`,
                            {
                              headers: { Authorization: `Bearer ${token}` },
                              responseType: 'blob',
                            }
                          );
                          const url = window.URL.createObjectURL(new Blob([response.data]));
                          const link = document.createElement('a');
                          link.href = url;
                          link.setAttribute('download', file.fileName);
                          document.body.appendChild(link);
                          link.click();
                          link.remove();
                          window.URL.revokeObjectURL(url);
                        } catch (error) {
                          console.error('Error downloading file:', error);
                          alert('Failed to download file');
                        }
                      }}
                      style={{
                        background: '#3b82f6',
                        color: 'white',
                        border: 'none',
                        borderRadius: '6px',
                        padding: '6px 10px',
                        fontSize: '12px',
                        fontWeight: 500,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                        flexShrink: 0,
                      }}
                      title="Download file"
                    >
                      ⬇️
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{
                textAlign: 'center',
                padding: '24px',
                color: '#9ca3af',
                background: 'white',
                borderRadius: '8px',
                border: '1px dashed #e5e7eb',
              }}>
                <div style={{ fontSize: '32px', marginBottom: '8px' }}>📂</div>
                <p style={{ margin: 0 }}>No reviewed files yet</p>
                <p style={{ margin: '4px 0 0', fontSize: '12px' }}>
                  Files will appear here after you mark them as read in Patient Files
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default PatientsList;
