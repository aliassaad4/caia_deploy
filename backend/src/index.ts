// Load environment variables FIRST before any other imports
import dotenv from 'dotenv';
dotenv.config({ override: true });

// Debug: Check if there's a Windows environment variable overriding .env
if (process.env.ASSEMBLYAI_API_KEY && process.env.ASSEMBLYAI_API_KEY.startsWith('eyJ')) {
  console.error('⚠️  WARNING: ASSEMBLYAI_API_KEY contains a JWT token instead of an API key!');
  console.error('⚠️  This suggests a Windows environment variable is overriding the .env file');
  console.error('⚠️  Value starts with:', process.env.ASSEMBLYAI_API_KEY.substring(0, 50));
}

import express, { Express, Request, Response } from 'express';
import http from 'http';
import { Server as SocketServer } from 'socket.io';
import cors from 'cors';
import path from 'path';
import { PrismaClient } from '@prisma/client';

// Import routes
import authRoutes from './routes/auth';
import patientRoutes from './routes/patient';
import scheduleRoutes from './routes/schedule';
import llmRoutes from './routes/llm';
import fileRoutes from './routes/file';
import doctorRoutes from './routes/doctor';
import patientChartRoutes from './routes/patientChart';

// Import middleware
import { errorHandler } from './middleware/errorHandler';
import { setupWebSocket } from './services/websocket';

// Initialize Prisma Client
export const prisma = new PrismaClient();

// Initialize Express app
const app: Express = express();
const server = http.createServer(app);

// Initialize Socket.IO
export const io = new SocketServer(server, {
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:3001',
    credentials: true,
  },
});

// Attach Socket.IO instance to Express app for use in controllers
app.set('io', io);

// Middleware
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3001',
  credentials: true,
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check endpoint
app.get('/health', (req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Serve uploaded files statically (simple approach)
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/patients', patientRoutes);
app.use('/api/schedule', scheduleRoutes);
app.use('/api/llm', llmRoutes);
app.use('/api/doctor', doctorRoutes);
app.use('/api/patient-chart', patientChartRoutes);
// File routes mounted at /api/files (more specific path)
app.use('/api/files', fileRoutes);

// WebSocket setup
setupWebSocket(io);

// Error handling middleware (must be last)
app.use(errorHandler);

// Start server
const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log(`🚀 Server is running on port ${PORT}`);
  console.log(`📡 WebSocket server is ready`);
  console.log(`🔗 Frontend URL: ${process.env.FRONTEND_URL}`);
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🛑 Shutting down gracefully...');
  await prisma.$disconnect();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n🛑 Shutting down gracefully...');
  await prisma.$disconnect();
  process.exit(0);
});
