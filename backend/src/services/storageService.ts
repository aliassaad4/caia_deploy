import axios from 'axios';
import crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

const SUPABASE_URL = process.env.OBJECT_STORAGE_ENDPOINT;
const SUPABASE_BUCKET = process.env.OBJECT_STORAGE_BUCKET;
const SUPABASE_KEY = process.env.OBJECT_STORAGE_SECRET_KEY;

// Local storage fallback for development
const LOCAL_STORAGE_DIR = path.join(__dirname, '../../uploads');

export async function uploadToSupabase(
  fileBuffer: Buffer,
  fileName: string,
  mimeType: string,
  patientId: string
): Promise<{ storageUrl: string; storageKey: string }> {
  try {
    // Try Supabase first if configured
    if (SUPABASE_URL && SUPABASE_BUCKET && SUPABASE_KEY) {
      return await uploadToSupabaseCloud(fileBuffer, fileName, mimeType, patientId);
    }

    // Fall back to local storage
    console.log('⚠️ Supabase not configured, using local storage fallback');
    return await uploadToLocalStorage(fileBuffer, fileName, patientId);
  } catch (error) {
    console.error('❌ Upload error:', error);
    // If Supabase fails, try local storage as fallback
    if (SUPABASE_URL && SUPABASE_BUCKET && SUPABASE_KEY) {
      console.log('⚠️ Supabase failed, falling back to local storage');
      return await uploadToLocalStorage(fileBuffer, fileName, patientId);
    }
    throw new Error('Failed to upload file to storage');
  }
}

async function uploadToSupabaseCloud(
  fileBuffer: Buffer,
  fileName: string,
  mimeType: string,
  patientId: string
): Promise<{ storageUrl: string; storageKey: string }> {
  // Generate unique file key
  const timestamp = Date.now();
  const hash = crypto.randomBytes(8).toString('hex');
  const extension = fileName.split('.').pop();
  const storageKey = `${patientId}/${timestamp}-${hash}.${extension}`;

  // Upload to Supabase Storage
  const uploadUrl = `${SUPABASE_URL}/object/${SUPABASE_BUCKET}/${storageKey}`;

  const response = await axios.post(uploadUrl, fileBuffer, {
    headers: {
      'Content-Type': mimeType,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'x-upsert': 'false',
    },
  });

  const storageUrl = `${SUPABASE_URL}/object/public/${SUPABASE_BUCKET}/${storageKey}`;

  return { storageUrl, storageKey };
}

async function uploadToLocalStorage(
  fileBuffer: Buffer,
  fileName: string,
  patientId: string
): Promise<{ storageUrl: string; storageKey: string }> {
  // Create patient directory if it doesn't exist
  const patientDir = path.join(LOCAL_STORAGE_DIR, patientId);
  if (!fs.existsSync(patientDir)) {
    fs.mkdirSync(patientDir, { recursive: true });
  }

  // Generate unique file name
  const timestamp = Date.now();
  const hash = crypto.randomBytes(8).toString('hex');
  const extension = fileName.split('.').pop();
  const fileName_Unique = `${timestamp}-${hash}.${extension}`;
  const filePath = path.join(patientDir, fileName_Unique);

  // Write file to disk
  fs.writeFileSync(filePath, fileBuffer);

  // Return local storage URL (relative path for now)
  const storageKey = `${patientId}/${fileName_Unique}`;
  const storageUrl = `/api/files/${storageKey}`;

  console.log(`✅ File saved locally: ${filePath}`);

  return { storageUrl, storageKey };
}

export async function downloadFromSupabase(storageKey: string): Promise<Buffer> {
  try {
    if (!SUPABASE_URL || !SUPABASE_BUCKET || !SUPABASE_KEY) {
      throw new Error('Supabase storage not configured');
    }

    const downloadUrl = `${SUPABASE_URL}/object/${SUPABASE_BUCKET}/${storageKey}`;

    const response = await axios.get(downloadUrl, {
      headers: {
        Authorization: `Bearer ${SUPABASE_KEY}`,
      },
      responseType: 'arraybuffer',
    });

    return Buffer.from(response.data);
  } catch (error) {
    console.error('Supabase download error:', error);
    throw new Error('Failed to download file from storage');
  }
}

export async function downloadFromLocalStorage(storageKey: string): Promise<Buffer> {
  try {
    const filePath = path.join(LOCAL_STORAGE_DIR, storageKey);

    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found: ${storageKey}`);
    }

    const fileData = fs.readFileSync(filePath);
    console.log(`✅ File read from local storage: ${filePath}`);

    return fileData;
  } catch (error) {
    console.error('Local storage download error:', error);
    throw new Error('Failed to read file from local storage');
  }
}

export async function deleteFromSupabase(storageKey: string): Promise<void> {
  try {
    if (!SUPABASE_URL || !SUPABASE_BUCKET || !SUPABASE_KEY) {
      throw new Error('Supabase storage not configured');
    }

    const deleteUrl = `${SUPABASE_URL}/object/${SUPABASE_BUCKET}/${storageKey}`;

    await axios.delete(deleteUrl, {
      headers: {
        Authorization: `Bearer ${SUPABASE_KEY}`,
      },
    });
  } catch (error) {
    console.error('Supabase delete error:', error);
    throw new Error('Failed to delete file from storage');
  }
}
