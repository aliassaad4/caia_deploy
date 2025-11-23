import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../index';
import { AppError } from '../middleware/errorHandler';
import { generateChatResponse, generateClinicalNote } from '../services/openaiService';

export const chat = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      throw new AppError('Not authenticated', 401);
    }

    const { message, conversationId } = req.body;

    if (!message) {
      throw new AppError('Message required', 400);
    }

    // Get conversation history
    // Only retrieve messages from the specific conversation if a conversationId is provided
    // Otherwise, start a fresh conversation (no history)
    const history = await prisma.message.findMany({
      where: {
        patientId: req.user.id,
        ...(conversationId ? { conversationId } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: {
        sender: true,
        content: true,
      },
    });

    console.log(`📜 Retrieved ${history.length} messages for patient ${req.user.id} (conversationId: ${conversationId || 'NONE'})`);

    // Convert to format for OpenAI
    const conversationHistory = history.reverse().map((msg) => ({
      role: msg.sender === 'PATIENT' ? 'user' : 'assistant',
      content: msg.content,
    }));

    // Check if this is the patient's first message (initial consultation)
    const patient = await prisma.patient.findUnique({
      where: { id: req.user.id },
      select: {
        initialConsultationReason: true,
        initialConsultationDate: true,
      },
    });

    // Save patient message
    const patientMessage = await prisma.message.create({
      data: {
        patientId: req.user.id,
        content: message,
        sender: 'PATIENT',
        messageType: 'TEXT',
        conversationId: conversationId || undefined,
      },
    });

    // Generate AI response
    const aiResult = await generateChatResponse(
      req.user.id,
      message,
      conversationHistory
    );

    // If this is the first interaction about booking an appointment, capture it
    const isFirstConsultation = !patient?.initialConsultationReason && !conversationId;
    const isAboutAppointment = message.toLowerCase().includes('doctor') ||
                               message.toLowerCase().includes('appointment') ||
                               message.toLowerCase().includes('pain') ||
                               message.toLowerCase().includes('problem') ||
                               message.toLowerCase().includes('help') ||
                               message.toLowerCase().includes('see');

    if (isFirstConsultation && isAboutAppointment && conversationHistory.length < 3) {
      // Capture the initial consultation reason
      await prisma.patient.update({
        where: { id: req.user.id },
        data: {
          initialConsultationReason: message,
          initialConsultationNotes: `Initial patient contact: ${message}`,
          initialConsultationDate: new Date(),
        },
      });
    }

    // Save AI response
    const aiMessage = await prisma.message.create({
      data: {
        patientId: req.user.id,
        content: aiResult.response,
        sender: 'AI_ASSISTANT',
        messageType: 'TEXT',
        conversationId: conversationId || patientMessage.id,
        aiProcessed: true,
        aiResponse: aiResult.response,
      },
    });

    res.json({
      status: 'success',
      data: {
        message: aiMessage.content,
        conversationId: conversationId || patientMessage.id,
        timestamp: aiMessage.createdAt,
        action: aiResult.action,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const deleteAllMessages = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      throw new AppError('Not authenticated', 401);
    }

    // Delete all messages for this patient
    const result = await prisma.message.deleteMany({
      where: {
        patientId: req.user.id,
      },
    });

    res.json({
      status: 'success',
      data: {
        deletedCount: result.count,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const generateNoteDraft = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      throw new AppError('Not authenticated', 401);
    }

    const { visitId, transcriptData } = req.body;

    if (!visitId || !transcriptData) {
      throw new AppError('Visit ID and transcript data required', 400);
    }

    // Verify visit exists
    const visit = await prisma.visit.findUnique({
      where: { id: visitId },
    });

    if (!visit) {
      throw new AppError('Visit not found', 404);
    }

    // Generate clinical note
    const clinicalNote = await generateClinicalNote(transcriptData);

    // Create approval queue entry
    const approvalEntry = await prisma.approvalQueue.create({
      data: {
        contentType: 'CLINICAL_NOTE',
        contentId: visitId,
        patientId: visit.patientId,
        draftContent: clinicalNote,
        aiGenerated: true,
        status: 'PENDING',
      },
    });

    res.json({
      status: 'success',
      message: 'Clinical note draft generated and queued for approval',
      data: {
        approvalId: approvalEntry.id,
        draft: clinicalNote,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const analyzeFile = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      throw new AppError('Not authenticated', 401);
    }

    const { fileId, question } = req.body;

    if (!fileId || !question) {
      throw new AppError('fileId and question are required', 400);
    }

    // Get file from database
    const patientFile = await prisma.patientFile.findFirst({
      where: {
        id: fileId,
        deletedAt: null,
      },
    });

    if (!patientFile) {
      throw new AppError('File not found', 404);
    }

    // Authorization: Allow if user is the patient OR doctor with notification for this file
    const isPatient = patientFile.patientId === req.user.id;

    let isAuthorizedDoctor = false;
    if (req.user.role === 'doctor') {
      // Check if doctor has a notification for this file
      const notification = await prisma.fileNotification.findFirst({
        where: {
          fileId: patientFile.id,
          doctorId: req.user.id,
        },
      });
      isAuthorizedDoctor = !!notification;
    }

    if (!isPatient && !isAuthorizedDoctor) {
      throw new AppError('Not authorized to access this file', 403);
    }

    // Download file from storage
    let fileData: Buffer;
    const { downloadFromLocalStorage } = require('../services/storageService');

    if (patientFile.storageUrl.startsWith('/api/files/')) {
      fileData = await downloadFromLocalStorage(patientFile.storageKey);
    } else {
      const { downloadFromSupabase } = require('../services/storageService');
      fileData = await downloadFromSupabase(patientFile.storageKey);
    }

    // Analyze file using OpenAI
    const OpenAI = require('openai');
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    let analysis: string;

    // Check if file is an image
    if (patientFile.fileType.startsWith('image/')) {
      // Use Vision API for images
      const base64Image = fileData.toString('base64');
      const visionResponse = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: `You are a medical assistant AI. Analyze this medical image and answer the following question: "${question}"\n\nProvide a detailed, professional response focusing on observable findings.`,
              },
              {
                type: 'image_url',
                image_url: {
                  url: `data:${patientFile.fileType};base64,${base64Image}`,
                },
              },
            ],
          },
        ],
        max_tokens: 1000,
      });

      analysis = visionResponse.choices[0]?.message?.content || 'Unable to analyze image';
    } else {
      // For non-image files, provide a text-based response
      analysis = `This is a ${patientFile.fileCategory} file named "${patientFile.fileName}". ${
        patientFile.description || 'No description available.'
      }\n\nQuestion: ${question}\n\nAnswer: I can see this is a ${patientFile.fileType} file. To provide a detailed analysis, I would need to extract and read the content of the document. Currently, I can only analyze image files directly. For document analysis, please download the file and review its contents.`;
    }

    res.json({
      status: 'success',
      data: {
        analysis,
        fileInfo: {
          fileName: patientFile.fileName,
          fileType: patientFile.fileType,
          fileCategory: patientFile.fileCategory,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};
