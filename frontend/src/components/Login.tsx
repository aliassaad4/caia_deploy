import React, { useState } from 'react';
import axios from 'axios';
import './Login.css';

const API_URL = 'http://localhost:3000/api';

interface LoginProps {
  onLogin: (userData: any) => void;
}

const Login: React.FC<LoginProps> = ({ onLogin }) => {
  const [isRegister, setIsRegister] = useState(false);
  const [isDoctor, setIsDoctor] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [specialty, setSpecialty] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (isRegister) {
        // Register
        const endpoint = isDoctor ? '/doctor/auth/register' : '/auth/register';
        const data = isDoctor
          ? { email, password, firstName, lastName, specialty }
          : { email, password, firstName, lastName };

        await axios.post(`${API_URL}${endpoint}`, data);

        // Auto-login after registration
        const loginEndpoint = isDoctor ? '/doctor/auth/login' : '/auth/login';
        const loginResponse = await axios.post(`${API_URL}${loginEndpoint}`, {
          email,
          password,
        });

        const userData = isDoctor
          ? { ...loginResponse.data.data.doctor, token: loginResponse.data.data.token, role: 'doctor' }
          : { ...loginResponse.data.data.patient, token: loginResponse.data.data.token, role: 'patient' };

        onLogin(userData);
      } else {
        // Login
        const endpoint = isDoctor ? '/doctor/auth/login' : '/auth/login';
        const response = await axios.post(`${API_URL}${endpoint}`, {
          email,
          password,
        });

        const userData = isDoctor
          ? { ...response.data.data.doctor, token: response.data.data.token, role: 'doctor' }
          : { ...response.data.data.patient, token: response.data.data.token, role: 'patient' };

        onLogin(userData);
      }
    } catch (err: any) {
      setError(
        err.response?.data?.message || 'An error occurred. Please try again.'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-container">
      <div className="login-box">
        <h1>🏥 CAIA Clinic</h1>
        <h2>{isRegister ? 'Create Account' : (isDoctor ? 'Doctor Login' : 'Patient Login')}</h2>

        <div className="role-toggle">
          <button
            type="button"
            className={!isDoctor ? 'active' : ''}
            onClick={() => setIsDoctor(false)}
          >
            Patient
          </button>
          <button
            type="button"
            className={isDoctor ? 'active' : ''}
            onClick={() => {
              setIsDoctor(true);
              setIsRegister(false); // Force login mode for doctors
            }}
          >
            Doctor
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          {isRegister && (
            <>
              <div className="form-group">
                <label>First Name</label>
                <input
                  type="text"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  required
                  placeholder="Enter your first name"
                />
              </div>

              <div className="form-group">
                <label>Last Name</label>
                <input
                  type="text"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  required
                  placeholder="Enter your last name"
                />
              </div>

              {isDoctor && (
                <div className="form-group">
                  <label>Specialty</label>
                  <input
                    type="text"
                    value={specialty}
                    onChange={(e) => setSpecialty(e.target.value)}
                    required
                    placeholder="e.g., Internal Medicine"
                  />
                </div>
              )}
            </>
          )}

          <div className="form-group">
            <label>Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="Enter your email"
            />
          </div>

          <div className="form-group">
            <label>Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              placeholder="Enter your password"
            />
          </div>

          {error && <div className="error-message">{error}</div>}

          <button type="submit" disabled={loading} className="btn-primary">
            {loading ? 'Please wait...' : isRegister ? 'Register' : 'Login'}
          </button>
        </form>

        {!isDoctor && (
          <div className="toggle-form">
            {isRegister ? (
              <p>
                Already have an account?{' '}
                <button onClick={() => setIsRegister(false)}>Login here</button>
              </p>
            ) : (
              <p>
                Don't have an account?{' '}
                <button onClick={() => setIsRegister(true)}>Register here</button>
              </p>
            )}
          </div>
        )}

        {isDoctor && !isRegister && (
          <div className="doctor-info">
            <p className="info-text">
              <strong>Doctor Access Only</strong><br />
              Contact your administrator for credentials.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default Login;
