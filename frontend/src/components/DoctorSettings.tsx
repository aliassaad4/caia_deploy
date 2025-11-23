import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './DoctorSettings.css';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3000/api';

interface DoctorSettingsProps {
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    token: string;
  };
  onBack: () => void;
}

interface Settings {
  specialty?: string;
  clinicName?: string;
  clinicAddress?: string;
  clinicCity?: string;
  clinicCountry?: string;
  clinicPhone?: string;
  profileDescription?: string;
  aiInstructions?: string;
  preVisitNotes?: string;
  locationDetails?: string;
  calendarProvider?: string;
  calendarConnected: boolean;
  calendarEmail?: string;
  calendarLastSyncAt?: string;
  workingHours?: any;
  timezone?: string;
  bufferBefore?: number;
  bufferAfter?: number;
}

const DoctorSettings: React.FC<DoctorSettingsProps> = ({ user, onBack }) => {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    loadSettings();
    checkCalendarCallback();
  }, []);

  const checkCalendarCallback = () => {
    const params = new URLSearchParams(window.location.search);
    const calendarStatus = params.get('calendar');
    const email = params.get('email');

    if (calendarStatus === 'connected') {
      setMessage({ type: 'success', text: `Google Calendar connected successfully! (${decodeURIComponent(email || '')})` });
      // Clean URL
      window.history.replaceState({}, '', window.location.pathname);
      loadSettings(); // Reload to get updated calendar status
    } else if (calendarStatus === 'error') {
      setMessage({ type: 'error', text: 'Failed to connect Google Calendar. Please try again.' });
      window.history.replaceState({}, '', window.location.pathname);
    }
  };

  const loadSettings = async () => {
    try {
      const response = await axios.get(`${API_URL}/doctor/settings`, {
        headers: { Authorization: `Bearer ${user.token}` },
      });
      setSettings(response.data.data);
    } catch (error) {
      console.error('Error loading settings:', error);
      setMessage({ type: 'error', text: 'Failed to load settings' });
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!settings) return;

    setSaving(true);
    setMessage(null);

    try {
      await axios.put(
        `${API_URL}/doctor/settings`,
        settings,
        { headers: { Authorization: `Bearer ${user.token}` } }
      );
      setMessage({ type: 'success', text: 'Settings saved successfully!' });
    } catch (error) {
      console.error('Error saving settings:', error);
      setMessage({ type: 'error', text: 'Failed to save settings' });
    } finally {
      setSaving(false);
    }
  };

  const handleConnectGoogleCalendar = async () => {
    try {
      const response = await axios.get(`${API_URL}/doctor/calendar/google/auth-url`, {
        headers: { Authorization: `Bearer ${user.token}` },
      });

      const authUrl = response.data.data.authUrl;
      // Open OAuth flow in new window
      window.location.href = authUrl;
    } catch (error) {
      console.error('Error getting auth URL:', error);
      setMessage({ type: 'error', text: 'Failed to initiate calendar connection' });
    }
  };

  const handleDisconnectCalendar = async () => {
    if (!window.confirm('Are you sure you want to disconnect your calendar?')) return;

    try {
      await axios.delete(`${API_URL}/doctor/calendar/disconnect`, {
        headers: { Authorization: `Bearer ${user.token}` },
      });
      setMessage({ type: 'success', text: 'Calendar disconnected successfully' });
      loadSettings();
    } catch (error) {
      console.error('Error disconnecting calendar:', error);
      setMessage({ type: 'error', text: 'Failed to disconnect calendar' });
    }
  };

  const updateField = (field: keyof Settings, value: any) => {
    setSettings(prev => prev ? { ...prev, [field]: value } : null);
  };

  if (loading) {
    return (
      <div className="settings-container">
        <div className="settings-loading">Loading settings...</div>
      </div>
    );
  }

  if (!settings) {
    return (
      <div className="settings-container">
        <div className="settings-error">Failed to load settings</div>
      </div>
    );
  }

  return (
    <div className="settings-container">
      <div className="settings-header">
        <button onClick={onBack} className="btn-back">
          ← Back to Dashboard
        </button>
        <h1>⚙️ Settings</h1>
      </div>

      {message && (
        <div className={`settings-message ${message.type}`}>
          {message.text}
        </div>
      )}

      <div className="settings-sections">
        {/* Profile Section */}
        <section className="settings-section">
          <h2>👤 Profile Information</h2>
          <div className="settings-grid">
            <div className="form-field">
              <label>Specialty</label>
              <input
                type="text"
                value={settings.specialty || ''}
                onChange={(e) => updateField('specialty', e.target.value)}
                placeholder="e.g., Cardiologist, Orthopedic Surgeon, General Practitioner"
              />
              <small>Your medical specialty - this helps the AI assistant understand your expertise</small>
            </div>

            <div className="form-field full-width">
              <label>Profile Description</label>
              <textarea
                value={settings.profileDescription || ''}
                onChange={(e) => updateField('profileDescription', e.target.value)}
                rows={4}
                placeholder="Describe your background, experience, and approach to patient care. The AI will share this with patients."
              />
              <small>This information will be shared with patients by the AI assistant</small>
            </div>
          </div>
        </section>

        {/* Clinic Information */}
        <section className="settings-section">
          <h2>🏥 Clinic Information</h2>
          <div className="settings-grid">
            <div className="form-field">
              <label>Clinic Name</label>
              <input
                type="text"
                value={settings.clinicName || ''}
                onChange={(e) => updateField('clinicName', e.target.value)}
                placeholder="Medical Center Name"
              />
            </div>

            <div className="form-field">
              <label>Phone</label>
              <input
                type="text"
                value={settings.clinicPhone || ''}
                onChange={(e) => updateField('clinicPhone', e.target.value)}
                placeholder="+1 (555) 123-4567"
              />
            </div>

            <div className="form-field">
              <label>Address</label>
              <input
                type="text"
                value={settings.clinicAddress || ''}
                onChange={(e) => updateField('clinicAddress', e.target.value)}
                placeholder="Street Address"
              />
            </div>

            <div className="form-field">
              <label>City</label>
              <input
                type="text"
                value={settings.clinicCity || ''}
                onChange={(e) => updateField('clinicCity', e.target.value)}
                placeholder="City"
              />
            </div>

            <div className="form-field">
              <label>Country</label>
              <input
                type="text"
                value={settings.clinicCountry || ''}
                onChange={(e) => updateField('clinicCountry', e.target.value)}
                placeholder="Country"
              />
            </div>
          </div>
        </section>

        {/* Location Details */}
        <section className="settings-section">
          <h2>📍 Location Details</h2>
          <div className="form-field">
            <label>Detailed Location Instructions</label>
            <textarea
              value={settings.locationDetails || ''}
              onChange={(e) => updateField('locationDetails', e.target.value)}
              rows={4}
              placeholder="e.g., 'Located on the 5th floor, Suite 502. Parking available in the underground garage. Building entrance is next to Starbucks.'"
            />
            <small>Help patients find your office - parking, building entrance, floor, suite number, etc.</small>
          </div>
        </section>

        {/* AI Assistant Instructions */}
        <section className="settings-section">
          <h2>🤖 AI Assistant Configuration</h2>
          <div className="form-field">
            <label>AI Instructions</label>
            <textarea
              value={settings.aiInstructions || ''}
              onChange={(e) => updateField('aiInstructions', e.target.value)}
              rows={5}
              placeholder="e.g., 'I specialize in sports medicine and prefer to see athletes with injuries. I typically recommend physical therapy before considering surgery. I speak English and Spanish.'"
            />
            <small>Custom instructions for the AI assistant - your approach, preferences, languages spoken, etc.</small>
          </div>

          <div className="form-field">
            <label>Pre-Visit Instructions for Patients</label>
            <textarea
              value={settings.preVisitNotes || ''}
              onChange={(e) => updateField('preVisitNotes', e.target.value)}
              rows={4}
              placeholder="e.g., 'Please arrive 15 minutes early. Bring your insurance card and photo ID. For dental appointments, brush your teeth before coming.'"
            />
            <small>Standard instructions that patients should receive before their appointment</small>
          </div>
        </section>

        {/* Calendar Integration */}
        <section className="settings-section">
          <h2>📅 Calendar Integration</h2>

          {settings.calendarConnected ? (
            <div className="calendar-connected">
              <div className="calendar-status">
                <div className="status-badge success">✓ Connected</div>
                <div className="calendar-info">
                  <p><strong>Provider:</strong> {settings.calendarProvider}</p>
                  <p><strong>Account:</strong> {settings.calendarEmail}</p>
                  {settings.calendarLastSyncAt && (
                    <p><strong>Last synced:</strong> {new Date(settings.calendarLastSyncAt).toLocaleString()}</p>
                  )}
                </div>
              </div>
              <button onClick={handleDisconnectCalendar} className="btn-disconnect">
                Disconnect Calendar
              </button>
            </div>
          ) : (
            <div className="calendar-disconnected">
              <p className="calendar-description">
                Connect your Google Calendar to enable real-time availability checking.
                The AI assistant will only schedule appointments during your available time slots.
              </p>
              <button onClick={handleConnectGoogleCalendar} className="btn-connect-calendar">
                <span className="google-icon">G</span>
                Connect Google Calendar
              </button>
            </div>
          )}
        </section>

        {/* Appointment Settings */}
        <section className="settings-section">
          <h2>⏰ Appointment Settings</h2>
          <div className="settings-grid">
            <div className="form-field">
              <label>Buffer Before (minutes)</label>
              <input
                type="number"
                value={settings.bufferBefore || 5}
                onChange={(e) => updateField('bufferBefore', parseInt(e.target.value))}
                min="0"
                max="60"
              />
              <small>Time buffer before each appointment</small>
            </div>

            <div className="form-field">
              <label>Buffer After (minutes)</label>
              <input
                type="number"
                value={settings.bufferAfter || 5}
                onChange={(e) => updateField('bufferAfter', parseInt(e.target.value))}
                min="0"
                max="60"
              />
              <small>Time buffer after each appointment</small>
            </div>

            <div className="form-field">
              <label>Timezone</label>
              <input
                type="text"
                value={settings.timezone || 'UTC'}
                onChange={(e) => updateField('timezone', e.target.value)}
                placeholder="America/New_York"
              />
              <small>Your local timezone (e.g., America/New_York)</small>
            </div>
          </div>
        </section>
      </div>

      {/* Save Button */}
      <div className="settings-footer">
        <button
          onClick={handleSave}
          className="btn-save"
          disabled={saving}
        >
          {saving ? 'Saving...' : '💾 Save All Settings'}
        </button>
      </div>
    </div>
  );
};

export default DoctorSettings;
