import { Server as SocketServer, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { prisma } from '../index';
import { generateChatResponse } from './openaiService';

interface AuthenticatedSocket extends Socket {
  userId?: string;
  userEmail?: string;
}

export function setupWebSocket(io: SocketServer) {
  // Authentication middleware for WebSocket
  io.use(async (socket: AuthenticatedSocket, next) => {
    try {
      const token = socket.handshake.auth.token;

      if (!token) {
        return next(new Error('Authentication required'));
      }

      const jwtSecret = process.env.JWT_SIGNING_KEY;
      if (!jwtSecret) {
        return next(new Error('Server configuration error'));
      }

      const decoded = jwt.verify(token, jwtSecret) as {
        id: string;
        email: string;
      };

      socket.userId = decoded.id;
      socket.userEmail = decoded.email;

      next();
    } catch (error) {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket: AuthenticatedSocket) => {
    console.log(`User connected: ${socket.userId}`);

    // Join user-specific room
    if (socket.userId) {
      socket.join(`user:${socket.userId}`);
      socket.join(`patient:${socket.userId}`); // Keep for backward compatibility
      socket.join(`doctor:${socket.userId}:files`); // For file notifications
    }

    // Handle chat messages
    socket.on('send_message', async (data: { message: string; conversationId?: string }) => {
      try {
        if (!socket.userId) {
          socket.emit('error', { message: 'Not authenticated' });
          return;
        }

        const { message, conversationId } = data;

        // Show typing indicator
        socket.emit('typing_start', { sender: 'AI_ASSISTANT' });

        // Get conversation history
        const history = await prisma.message.findMany({
          where: {
            patientId: socket.userId,
            conversationId: conversationId || undefined,
          },
          orderBy: { createdAt: 'desc' },
          take: 20,
          select: {
            sender: true,
            content: true,
          },
        });

        const conversationHistory = history.reverse().map((msg) => ({
          role: msg.sender === 'PATIENT' ? 'user' : 'assistant',
          content: msg.content,
        }));

        // Save patient message
        const patientMessage = await prisma.message.create({
          data: {
            patientId: socket.userId,
            content: message,
            sender: 'PATIENT',
            messageType: 'TEXT',
            conversationId: conversationId || undefined,
          },
        });

        // Generate AI response
        const aiResult = await generateChatResponse(
          socket.userId,
          message,
          conversationHistory
        );

        // Save AI message
        const aiMessage = await prisma.message.create({
          data: {
            patientId: socket.userId,
            content: aiResult.response,
            sender: 'AI_ASSISTANT',
            messageType: 'TEXT',
            conversationId: conversationId || patientMessage.id,
            aiProcessed: true,
            aiResponse: aiResult.response,
          },
        });

        // Stop typing indicator
        socket.emit('typing_stop', { sender: 'AI_ASSISTANT' });

        // Send AI response
        socket.emit('new_message', {
          id: aiMessage.id,
          content: aiMessage.content,
          sender: 'AI_ASSISTANT',
          timestamp: aiMessage.createdAt,
          conversationId: conversationId || patientMessage.id,
        });
      } catch (error) {
        console.error('WebSocket message error:', error);
        socket.emit('error', { message: 'Failed to process message' });
      }
    });

    // Handle typing indicators
    socket.on('typing_start', () => {
      if (socket.userId) {
        socket.to(`patient:${socket.userId}`).emit('typing_start', {
          sender: 'PATIENT',
        });
      }
    });

    socket.on('typing_stop', () => {
      if (socket.userId) {
        socket.to(`patient:${socket.userId}`).emit('typing_stop', {
          sender: 'PATIENT',
        });
      }
    });

    // Handle file upload notifications (Doctor subscribes)
    socket.on('subscribe:file-notifications', () => {
      if (socket.userId) {
        console.log(`Doctor ${socket.userId} subscribed to file notifications`);
        socket.join(`doctor:${socket.userId}:files`);
      }
    });

    // Handle file notification mark as read
    socket.on('file:notification:mark-read', async (notificationId: string) => {
      try {
        if (!socket.userId) {
          socket.emit('error', { message: 'Not authenticated' });
          return;
        }

        // Update notification in database
        await prisma.fileNotification.update({
          where: { id: notificationId },
          data: {
            status: 'READ',
            readAt: new Date()
          }
        });

        // Emit confirmation
        socket.emit('file:notification:read-confirmed', { notificationId });
      } catch (error) {
        console.error('Error marking notification as read:', error);
        socket.emit('error', { message: 'Failed to mark notification as read' });
      }
    });

    // Handle file notification archive
    socket.on('file:notification:archive', async (notificationId: string) => {
      try {
        if (!socket.userId) {
          socket.emit('error', { message: 'Not authenticated' });
          return;
        }

        // Update notification in database
        await prisma.fileNotification.update({
          where: { id: notificationId },
          data: {
            status: 'ARCHIVED'
          }
        });

        // Emit confirmation
        socket.emit('file:notification:archived', { notificationId });
      } catch (error) {
        console.error('Error archiving notification:', error);
        socket.emit('error', { message: 'Failed to archive notification' });
      }
    });

    // Handle disconnection
    socket.on('disconnect', () => {
      console.log(`User disconnected: ${socket.userId}`);
    });
  });

  // Function to send notifications to specific users (patients or doctors)
  io.sendToPatient = (patientId: string, event: string, data: any) => {
    io.to(`patient:${patientId}`).emit(event, data);
  };

  io.sendToUser = (userId: string, event: string, data: any) => {
    io.to(`user:${userId}`).emit(event, data);
  };

  // File-specific event broadcasting functions
  io.notifyFileUpload = (patientId: string, fileData: any) => {
    // Notify patient that file was uploaded
    io.to(`patient:${patientId}`).emit('file:uploaded', {
      fileId: fileData.id,
      fileName: fileData.fileName,
      category: fileData.fileCategory,
      uploadedAt: new Date(),
      message: `File "${fileData.fileName}" has been uploaded and will be reviewed by the doctor.`,
    });
  };

  io.notifyFileAnnotation = (patientId: string, doctorId: string, fileData: any) => {
    // Notify patient of doctor annotation
    io.to(`patient:${patientId}`).emit('file:annotation-added', {
      fileId: fileData.fileId,
      fileName: fileData.fileName,
      annotationType: fileData.annotationType,
      doctorName: fileData.doctorName,
      message: `Dr. ${fileData.doctorName} added a ${fileData.annotationType} annotation on your "${fileData.fileName}" file.`,
    });

    // Notify doctor's clients about their own annotation
    io.to(`user:${doctorId}`).emit('file:annotation-created', {
      fileId: fileData.fileId,
      annotationId: fileData.annotationId,
      status: 'success',
    });
  };

  io.notifyFileComment = (patientId: string, doctorId: string, fileData: any) => {
    // Notify patient of doctor comment
    io.to(`patient:${patientId}`).emit('file:comment-added', {
      fileId: fileData.fileId,
      fileName: fileData.fileName,
      doctorName: fileData.doctorName,
      comment: fileData.comment,
      message: `Dr. ${fileData.doctorName} left a comment on your "${fileData.fileName}" file.`,
    });

    // Notify doctor's clients about their own comment
    io.to(`user:${doctorId}`).emit('file:comment-created', {
      fileId: fileData.fileId,
      commentId: fileData.commentId,
      status: 'success',
    });
  };

  io.notifyFileReviewStatusChange = (patientId: string, fileData: any) => {
    // Notify patient that file review status changed
    io.to(`patient:${patientId}`).emit('file:review-status-changed', {
      fileId: fileData.fileId,
      fileName: fileData.fileName,
      newStatus: fileData.reviewStatus,
      reviewedAt: fileData.reviewedAt,
      message: `Your "${fileData.fileName}" file has been ${fileData.reviewStatus.toLowerCase()} by the doctor.`,
    });
  };

  io.notifyDoctorFileUpload = (doctorId: string, patientData: any, fileData: any) => {
    // Notify doctor when patient uploads a file
    io.to(`doctor:${doctorId}:files`).emit('patient:file-uploaded', {
      fileId: fileData.id,
      fileName: fileData.fileName,
      category: fileData.fileCategory,
      patientId: patientData.patientId,
      patientName: patientData.patientName,
      uploadedAt: new Date(),
      message: `${patientData.patientName} uploaded "${fileData.fileName}" for review.`,
    });
  };

  return io;
}

// Extend SocketServer type to include custom methods
declare module 'socket.io' {
  interface Server {
    sendToPatient: (patientId: string, event: string, data: any) => void;
    sendToUser: (userId: string, event: string, data: any) => void;
    notifyFileUpload: (patientId: string, fileData: any) => void;
    notifyFileAnnotation: (patientId: string, doctorId: string, fileData: any) => void;
    notifyFileComment: (patientId: string, doctorId: string, fileData: any) => void;
    notifyFileReviewStatusChange: (patientId: string, fileData: any) => void;
    notifyDoctorFileUpload: (doctorId: string, patientData: any, fileData: any) => void;
  }
}
