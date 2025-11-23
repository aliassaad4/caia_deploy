# CAIA Clinic - AI-Powered Medical Assistant

A comprehensive clinic management system with an intelligent AI medical secretary that handles appointment scheduling, patient interactions, and clinical documentation.

## Features

- **AI Medical Secretary**: Conversational AI assistant that helps patients book appointments naturally
- **Smart Scheduling**: AI checks doctor availability and patient needs to find optimal appointment times
- **Priority-Based Booking**: Automatically assesses urgency based on symptoms
- **Visit Recording**: Record doctor-patient conversations with AI-powered transcription
- **Automated Clinical Notes**: Generate SOAP notes, prescriptions, and patient summaries from visit recordings
- **Patient Portal**: Dashboard for viewing appointments, medical history, and visit summaries
- **Doctor Dashboard**: Queue management, visit recording, and patient management

## Tech Stack

- **Frontend**: React + TypeScript
- **Backend**: Node.js + Express + TypeScript
- **Database**: PostgreSQL (via Neon)
- **ORM**: Prisma
- **AI Services**: OpenAI GPT-4, AssemblyAI
- **Real-time**: Socket.io

## Quick Start

Follow these steps to set up the project locally.

### Prerequisites

- Node.js (v16 or higher)
- npm or yarn
- Git

### Setup Instructions

1. **Clone the repository**
   ```bash
   git clone <your-private-repo-url>
   cd Project
   ```

2. **Install Backend Dependencies**
   ```bash
   cd backend
   npm install
   ```

3. **Configure Environment Variables**
   ```bash
   # Copy the example environment file
   cp .env.example .env

   # Edit .env with your actual API keys and database credentials
   # See backend/.env.example for required variables
   ```

4. **Setup Database**
   ```bash
   # Generate Prisma Client
   npx prisma generate

   # Push schema to database
   npx prisma db push
   ```

5. **Install Frontend Dependencies**
   ```bash
   cd ../frontend
   npm install
   ```

6. **Run the Application**

   Open two terminal windows:

   **Terminal 1 - Backend:**
   ```bash
   cd backend
   npm run dev
   ```
   Backend runs on http://localhost:3000

   **Terminal 2 - Frontend:**
   ```bash
   cd frontend
   npm start
   ```
   Frontend runs on http://localhost:3001

7. **Access the Application**
   - Open your browser to http://localhost:3001
   - Login credentials are in the database (check with team)

## Project Structure

```
Project/
├── backend/
│   ├── src/
│   │   ├── controllers/     # Request handlers
│   │   ├── routes/          # API routes
│   │   ├── services/        # Business logic (AI, transcription, etc.)
│   │   ├── middleware/      # Auth, error handling
│   │   └── index.ts         # Express server entry point
│   ├── prisma/
│   │   └── schema.prisma    # Database schema
│   └── .env                 # Backend configuration (INCLUDED)
├── frontend/
│   ├── src/
│   │   ├── components/      # React components
│   │   ├── App.tsx          # Main app component
│   │   └── index.tsx        # Entry point
│   └── public/
└── README.md
```

## Environment Variables

Copy `backend/.env.example` to `backend/.env` and configure these required variables:

- `DATABASE_URL` - PostgreSQL connection string (e.g., Neon)
- `OPENAI_API_KEY` - OpenAI API key for AI features
- `ASSEMBLYAI_API_KEY` - AssemblyAI for transcription
- `JWT_SIGNING_KEY` - Random secret for JWT tokens
- `ENCRYPTION_KEY` - Random 32-byte hex key for encryption
- `OBJECT_STORAGE_*` - Supabase storage configuration
- `GOOGLE_CALENDAR_OAUTH_*` - Google Calendar OAuth credentials
- `RESEND_API_KEY` - Resend email service API key

See `backend/.env.example` for the complete list with descriptions.

## Available Test Accounts

### Patient Account
- Email: patient@test.com
- Password: password123

### Doctor Account
- Email: doctor@test.com
- Password: password123

## Key Features Walkthrough

### 1. AI Medical Secretary
- Go to "AI Assistant" tab
- Say "I want to see the doctor"
- The AI will:
  - Ask about your symptoms
  - Check your medical history
  - Assess priority
  - Find available appointment times
  - Book your appointment conversationally

### 2. Appointment Rescheduling
- Go to "Appointments" tab
- Click "Reschedule" on any appointment
- You'll be taken to AI Assistant
- Discuss new times conversationally with the AI

### 3. Visit Recording (Doctor Side)
- Login as doctor
- Start a visit
- Click "Record Visit"
- Have a conversation
- Stop recording
- AI generates complete clinical notes automatically

## Database Schema

The database includes:
- **Patients**: Patient profiles with clinical history
- **Providers**: Doctor profiles with schedules
- **Visits**: Appointments and completed visits
- **Messages**: Patient-AI chat history
- **Tasks**: Follow-up tasks, lab orders, prescriptions
- **AuditLog**: Complete audit trail
- **QBoard**: Doctor question queue

## Important Notes

- Keep your `.env` file private - never commit it to version control
- Database is hosted on Neon (serverless PostgreSQL)
- The AI is designed to be conversational - it won't book appointments immediately

## Development Tips

### Reset Database
```bash
cd backend
npx prisma db push --force-reset
```

### View Database
```bash
cd backend
npx prisma studio
```
Opens database GUI at http://localhost:5555

### Check Logs
Backend logs are shown in the terminal running `npm run dev`

## Troubleshooting

### Port Already in Use
If you get "Port already in use" errors:

**Windows:**
```bash
# Find process on port 3000
netstat -ano | findstr :3000
# Kill it (replace PID with the number from above)
taskkill //F //PID <PID>
```

### Database Connection Error
- Check that DATABASE_URL in backend/.env is correct
- Make sure you have internet connection (Neon is cloud-based)

### AI Not Responding
- Check that OPENAI_API_KEY is valid in backend/.env
- Check backend logs for errors

## Contributing

When making changes:
1. Create a new branch: `git checkout -b feature/your-feature-name`
2. Make your changes
3. Commit: `git commit -am "Description of changes"`
4. Push: `git push origin feature/your-feature-name`
5. Create a Pull Request

## Team

- Ali Assad - Lead Developer
- [Your Friend's Name] - Developer

## License

Private - All Rights Reserved
This code is proprietary and confidential.
