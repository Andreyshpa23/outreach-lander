import { NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import { join } from "path";
import { existsSync } from "fs";

export const runtime = "nodejs";
export const maxDuration = 30;

// Maximum file size: 50MB
const MAX_FILE_SIZE = 50 * 1024 * 1024;

// Allowed file types
const ALLOWED_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation', // .pptx
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
  'application/msword', // .doc
  'application/vnd.ms-powerpoint', // .ppt
  'text/plain', // .txt
];

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File;
    const sessionId = req.headers.get('x-session-id') || 'unknown';

    if (!file) {
      return NextResponse.json(
        { error: "No file provided" },
        { status: 400 }
      );
    }

    // Check file size
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: `File size exceeds ${MAX_FILE_SIZE / 1024 / 1024}MB limit` },
        { status: 400 }
      );
    }

    // Check file type
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: "File type not supported. Please upload PDF, PPTX, DOCX, DOC, PPT, or TXT files." },
        { status: 400 }
      );
    }

    // Create uploads directory if it doesn't exist
    // In Vercel, use /tmp (only writable directory). Otherwise use uploads in project root.
    const baseDir = process.env.VERCEL ? '/tmp' : process.cwd();
    const uploadsDir = join(baseDir, 'uploads', sessionId);
    try {
      if (!existsSync(uploadsDir)) {
        await mkdir(uploadsDir, { recursive: true });
      }
    } catch (error) {
      console.error('[upload-file] Failed to create uploads dir:', error);
      return NextResponse.json(
        { error: 'Failed to create upload directory' },
        { status: 500 }
      );
    }

    // Generate unique filename
    const timestamp = Date.now();
    const originalName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
    const filename = `${timestamp}_${originalName}`;
    const filepath = join(uploadsDir, filename);

    // Save file
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    await writeFile(filepath, buffer);

    // Return file info (we'll extract text on the client side or in a separate endpoint)
    return NextResponse.json({
      success: true,
      filename: filename,
      originalName: file.name,
      size: file.size,
      type: file.type,
      path: `/uploads/${sessionId}/${filename}`
    });

  } catch (e: any) {
    console.error("File upload error:", e);
    return NextResponse.json(
      { error: e.message || "Failed to upload file" },
      { status: 500 }
    );
  }
}

