# CAIA — AI Clinic Agent (EECE 503P) - Complete Implementation Specification
## Project Overview
Vision: Build a comprehensive AI-powered clinic management system with a patient portal where patients can interact with an LLM assistant, book appointments, access medical records, and receive automated care coordination.
Core Value Proposition: Streamline outpatient clinic operations through AI while maintaining strict doctor oversight and patient safety.
## 1. Environment Configuration
### Required Environment Variables
Create a .env file with these exact values:
# Backend Services
OPENAI_API_KEY=your_openai_api_key
OPENAI_MODEL=gpt-4o
ASSEMBLYAI_API_KEY=your-assemblyai-api-key-here
# Database & Storage
DATABASE_URL=postgresql://user:password@host:5432/database?sslmode=require&channel_binding=require
OBJECT_STORAGE_BUCKET=patient-files
OBJECT_STORAGE_ENDPOINT=https://your-supabase-project.supabase.co/storage/v1
OBJECT_STORAGE_ACCESS_KEY=your-supabase-anon-key
OBJECT_STORAGE_SECRET_KEY=your-supabase-service-role-key
# Security
JWT_SIGNING_KEY=your-random-jwt-secret-key-here
ENCRYPTION_KEY=your-random-encryption-key-here
# Server Configuration
PORT=3000
NODE_ENV=development
FRONTEND_URL=http://localhost:3001
BACKEND_URL=http://localhost:3000
# Google Calendar OAuth
GOOGLE_CALENDAR_OAUTH_CLIENT_ID=your_google_client_id
GOOGLE_CALENDAR_OAUTH_CLIENT_SECRET=your-google-client-secret-here
# Microsoft Graph OAuth (for future use)
MS_GRAPH_CLIENT_ID=your-ms-client-id-here
MS_GRAPH_CLIENT_SECRET=your-ms-client-secret-here
# Email Service (Resend)
RESEND_API_KEY=your-resend-api-key-here
FROM_EMAIL=noreply@yourdomain.com
FROM_NAME=CAIA Clinic
## 2. System Architecture Requirements
### 2.1 High-Level Architecture
Build a full-stack application with:
Frontend Layer:

React-based patient portal with real-time chat interface (channel is the website chat; legacy WhatsApp flows remain supported but are not primary)
Responsive design for desktop and mobile
Secure authentication and session management

Backend Layer:

Node.js/Express API server
WebSocket support for real-time communication
RESTful API design with proper error handling

Data Layer:

PostgreSQL database with Prisma ORM
Supabase for file storage (audio, documents, images)
Encrypted storage for sensitive health data

AI Services Layer:

OpenAI GPT-4o integration for conversational AI
AssemblyAI for speech-to-text with speaker diarization
Intelligent appointment scheduling and priority scoring

### 2.2 Technology Stack Mandates

Frontend: React 18+, TypeScript, Tailwind CSS, [Socket.io](http://Socket.io) Client
Backend: Node.js, Express, [Socket.io](http://Socket.io), Prisma, JWT authentication
Database: PostgreSQL with Neon
Storage: Supabase Storage for files
Deployment: Docker containerization ready

## 3. Core Data Models Implementation
### 3.1 Database Schema Requirements
Implement these core tables with Prisma:
Patient Management:

patients table with demographic info, contact details, preferences
clinical_profiles for medical history, medications, allergies
portal_sessions for authentication and security

Visit &amp; Clinical Data:

visits tracking appointments with status (scheduled, completed, cancelled)
messages for all patient-AI and patient-doctor communications
tasks for lab orders, follow-ups, medication adherence tracking

Doctor Workflow:

q_board for patient questions requiring doctor responses
audit trail for all system actions and data changes
approval_queue for doctor review of AI-generated content

### 3.2 Data Relationships

One-to-many: Patient → Visits, Patient → Messages, Patient → Tasks
One-to-one: Patient → Clinical Profile
Many-to-many through join tables where needed
Soft delete implementation for data retention

## 4. Patient Portal Features Specification
### 4.1 Authentication &amp; Security

Implement email/password registration and login
Magic link authentication option
JWT token-based session management
Password reset workflow
Session timeout and security

### 4.2 Dashboard Requirements

Welcome section with patient greeting
Statistics cards: upcoming appointments, pending tasks, unread messages
Quick action buttons for common tasks
Upcoming appointments list with reschedule/cancel options
Emergency help access prominently displayed

### 4.3 Real-Time Chat Interface

WebSocket-based real-time messaging (primary channel is the website chat agent)
Typing indicators and delivery status
File upload capability for documents and images
Message history persistence
LLM integration for intelligent responses
Conversation context maintenance

### 4.4 Appointment Management

Multi-step booking wizard:

Reason for visit capture
Symptom details collection
Availability selection
Confirmation and preparation instructions


Calendar integration for real-time slot availability
Rescheduling and cancellation workflows
Automated reminders and notifications

### 4.5 Medical Records Access

Secure viewing of approved visit notes
Lab results display with trend analysis
Medication history and current prescriptions
Download records as PDF functionality
Access logging for compliance

## 5. AI Assistant Capabilities
### 5.1 Patient Concierge Agent
Build an intelligent AI that can:
Conversational Abilities:

Natural language understanding of patient intents in the website chat (previously WhatsApp)
Context-aware responses maintaining conversation history (up to 20 patient messages)
Multilingual prompts and simplification when needed; consistent disclaimers that it is not a clinician

Patient File Awareness:

Secure read access to the Patient File to surface last visit date, prior reasons, active problems, current medications, allergies, open tasks, and the “next-visit window”
Summarize recent visits into layperson-friendly language during booking, without exposing unapproved drafts
Write operations limited to draft objects (e.g., pre-visit HPI bullets, proposed tasks) that require doctor approval before becoming part of the canonical Patient File

Appointment Scheduling (Doctor Calendar Integration):

Connect to provider calendars (Google/Outlook/CalDAV) via a service account; respect provider working hours, clinic location blocks, personal busy times, and configurable buffers before/after visits
Time zone handling end-to-end (store patient time zone, convert to clinic time zone when committing the booking, display both for clarity)
Reason-to-duration mapping (e.g., “new patient dermatology = 30m”, “HTN follow-up = 15m”) with clinic-editable rules and per-provider overrides
Slot search sorts by earliest feasible time that matches: patient availability windows, provider availability, buffer rules, and priority score; supports “hold-and-confirm” to avoid double-booking races
Booking confirmations generate calendar invites, create a visit record (status: scheduled), attach pre-visit instructions, and create any prerequisite task stubs (e.g., “bring previous labs”)

Priority Scoring and Triage:

Apply the 1–10 urgency scale (see 5.2) using symptom keywords, onset/severity, red-flag patterns, and chronic status; never provide diagnosis
If score ≥ threshold for suspected emergency, immediately direct to emergency services and notify staff; do not book a routine clinic slot
High-priority non-emergency cases are front-loaded into earliest suitable slots

Safety and Guardrails:

Never deliver clinical advice or management plans; defer to provider
All patient-visible clinical content beyond standard, pre-approved templates requires doctor approval
Every action (lookup, proposed booking, message) is written to the immutable audit trail with user, time, and rationale

### 5.2 Priority Scoring Algorithm
Implement this urgency classification:
Urgent (9-10): Chest pain, shortness of breath, severe bleeding → Same-day slots
High (7-8): Acute infections, spreading rashes → Within 3-7 days
Medium (4-6): Chronic follow-ups, refills → 7-14 days
Low (1-3): Administrative questions → 14+ days
### 5.3 Speech-to-Text Pipeline (In-Clinic Scribe Agent)
Audio Capture and Consent:

Recording begins only after explicit verbal or button consent; visual indicator shows “recording on”
Dual-channel capture preferred (doctor/patient separated) when hardware supports it; otherwise enable robust diarization
Local buffering with encrypted upload to storage; immediate availability for streaming or batch transcription

AssemblyAI Integration:

Use real-time streaming when network allows; fallback to upload-and-poll on weak networks
Enable speaker diarization, word-level timestamps, and punctuation; keep original Arabic/English mix; no forced redaction without policy flags
Store transcription artifacts with pointers to audio segments for precise review

LLM Clinical Structuring and Drafting:

Transform transcripts into structured SOAP drafts: HPI, ROS (if stated), Exam findings (as dictated), Assessment (problem-wise), Plan (orders, meds, instructions)
Extract orders into typed objects: labs, imaging, prescriptions; normalize drug names and units; identify “prep” instructions for each order
Map problems and orders to codes when possible (ICD-10/SNOMED/RxNorm) and flag low-confidence mappings for doctor review
Generate a patient-friendly after-visit summary (Arabic/English) with diagnosis in simple words, medication dose/how/when, tests to do with prep steps, FAQs, and warning signs

Draft-to-Approval Flow:

Everything produced by the scribe agent is “draft” in the approval_queue: SOAP note, order set, instructions, and the after-visit summary
The doctor can request edits via natural language (“expand HPI to include duration”, “change amoxicillin to azithromycin”), and the LLM updates the draft while preserving an audit trail of changes
Only after explicit Approve does the system: write the finalized note to the Patient File, place orders as tasks, and queue patient-facing messages; nothing goes to the patient before approval

Quality and Safety Controls:

Confidence tagging on each extracted entity; highlight low-confidence or conflicting items
Automatic detection of likely transcription artifacts (e.g., homophones, impossible doses) with inline suggestions
Retention policy: raw audio retained per clinic policy; at minimum, a hash and provenance record are kept for audit

## 6. Doctor Approval Workflow
### 6.1 Safety-First Design Principle
Critical Rule: No AI-generated content reaches patients without explicit doctor approval.
Approval Gates:

Patient instructions and education materials
Clinical note drafts and summaries
Order sets and care plans
Automated messages and reminders

### 6.2 Doctor Console Features
Dashboard:

Today’s patient list with status indicators
Approval queue with priority sorting
Q-Board for patient questions needing responses

Visit Workspace:

Side-by-side transcript and draft note view
Edit and refinement tools for AI-generated content
One-click approval with audit trail
Version comparison with previous notes

Patient Management:

Auto-brief generation for upcoming visits
Task tracking for labs, imaging, follow-ups
Communication history and patterns

## 7. API Endpoints Specification
### 7.1 Core REST API Endpoints
Authentication:
POST /api/auth/login              - Patient login
POST /api/auth/register           - Patient registration
POST /api/auth/magic-link         - Passwordless login
POST /api/auth/logout             - Session termination
Patient Management:
GET  /api/patients/profile        - Get patient profile
PUT  /api/patients/profile        - Update patient profile
GET  /api/patients/records        - Get medical records
GET  /api/patients/last-visit     - Get last visit summary for concierge agent
GET  /api/patients/tasks/open     - Get open tasks (labs/imaging/follow-ups)
Appointments:
GET  /api/schedule/appointments   - List patient appointments
GET  /api/schedule/slots          - Get available time slots (provider, duration, timezone, buffers)
POST /api/schedule/book           - Book new appointment (hold-and-confirm flow supported)
PUT  /api/schedule/appointments/:id - Reschedule appointment
DELETE /api/schedule/appointments/:id - Cancel appointment
AI Services:
POST /api/llm/chat                - Process patient message (concierge agent)
POST /api/llm/note-draft          - Generate clinical note draft (scribe agent)
POST /api/asr/transcribe          - Submit audio for transcription (stream or batch)
File Management:
POST /api/upload                  - Upload patient documents
GET  /api/files/:id               - Download files
### 7.2 WebSocket Events
Connection: Authenticated patient sessions
Events:

send_message - Patient sends chat message
new_message - AI/System sends response
typing_start / typing_stop - Typing indicators
appointment_reminder - Real-time notifications
connection_status - Online/offline status

## 8. Security &amp; Compliance Requirements
### 8.1 Data Protection

End-to-end encryption for PHI (Personal Health Information)
Field-level encryption for sensitive data in database
Secure file storage with access controls
Regular security audits and penetration testing

### 8.2 Access Controls

Role-based permissions (patient, doctor, admin, staff)
Least privilege principle enforcement
Session management with automatic timeout
Audit logging for all data access and modifications

### 8.3 Privacy Compliance

HIPAA compliance for health data handling
Patient consent management for data processing
Data retention policies with automatic cleanup
Breach notification procedures

## 9. Implementation Phases
### Phase 1: Foundation (Weeks 1-4)
Backend:

Project setup with Node.js/Express
Database schema implementation with Prisma
Basic authentication system (JWT)
Environment configuration and security setup

Frontend:

React application setup with routing
Authentication pages (login, register)
Basic dashboard layout
Tailwind CSS configuration

### Phase 2: Core Features (Weeks 5-8)
Backend:

WebSocket server implementation
OpenAI integration for basic chat
Patient profile management APIs
File upload handling

Frontend:

Real-time chat interface
Patient dashboard with stats
Profile management pages
Responsive design refinement

### Phase 3: Appointment System (Weeks 9-12)
Backend:

Appointment booking logic
Calendar integration
Notification system
Priority scoring algorithm

Frontend:

Multi-step booking wizard
Appointment management
Calendar interface
Confirmation workflows

### Phase 4: Medical Features (Weeks 13-16)
Backend:

Medical records API
Task management system
AssemblyAI integration
Clinical note generation

Frontend:

Records viewer
Task management interface
File/document management
Advanced chat features

### Phase 5: Doctor Console (Weeks 17-20)
Backend:

Approval workflow system
Q-Board implementation
Audit logging
Analytics endpoints

Frontend:

Doctor dashboard
Approval interface
Patient management tools
Analytics views

### Phase 6: Polish &amp; Launch (Weeks 21-24)

Comprehensive testing
Performance optimization
Security hardening
Production deployment
Documentation completion

## 10. Testing Strategy
### 10.1 Test Coverage Requirements
Backend Testing:

Unit tests for all utility functions and services
Integration tests for API endpoints
Authentication and authorization tests
Database operation tests

Frontend Testing:

Component unit testing with React Testing Library
User flow integration testing
Chat interface functionality testing
Responsive design validation

End-to-End Testing:

Patient registration to appointment booking flow
Chat conversation scenarios
File upload and management
Mobile device compatibility

### 10.2 Security Testing

Penetration testing for API endpoints
Authentication bypass attempts
SQL injection and XSS vulnerability testing
Data encryption verification

## 11. Deployment &amp; DevOps
### 11.1 Production Environment

Docker containerization for all services
PostgreSQL database with Neon
Frontend deployment to Vercel/Netlify
Backend deployment to Railway/Render
CDN for static assets

### 11.2 Monitoring &amp; Analytics

Application performance monitoring
Error tracking and alerting
User analytics for feature usage
Uptime and reliability monitoring

### 11.3 Backup &amp; Recovery

Automated database backups
File storage redundancy
Disaster recovery procedures
Regular recovery testing

## 12. Success Metrics &amp; KPIs
### 12.1 Patient Engagement

Time to first appointment booking
Chat response satisfaction scores
Portal login frequency
Feature adoption rates

### 12.2 Clinical Efficiency

Time saved per appointment
Reduction in administrative tasks
Doctor approval workflow speed
Patient no-show rate reduction

### 12.3 System Performance

API response times (&lt;200ms target)
Chat response latency (&lt;2s target)
System uptime (99.9% target)
Error rate (&lt;0.1% target)

## 13. Compliance Documentation
### 13.1 Required Documentation

System architecture diagrams
Data flow documentation
Security protocols and procedures
API documentation with examples
User manuals for patients and doctors
Compliance audit trails

