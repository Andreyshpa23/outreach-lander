// Session storage for user requests and results
// Stores data in JSON files on server

import fs from 'fs';
import path from 'path';

interface UserSession {
  sessionId: string;
  ip?: string;
  userAgent?: string;
  createdAt: string;
  lastActivity: string;
  requests: Array<{
    timestamp: string;
    type: 'collect-info' | 'generate';
    input: string;
    result?: any;
    productInsights?: {
      utps?: string[];
      metrics?: string[];
      caseStudies?: string[];
    };
  }>;
  lastResult?: {
    apiData: any;
    productUTPs: string[];
    productMetrics: string[];
    case_studies?: string[];
    targetAudience?: {
      geo: string;
      positions: string[];
      industry: string;
      company_size: string;
    };
    timestamp: string;
  };
}

// Detect Vercel/serverless environment
const IS_VERCEL = !!process.env.VERCEL || !!process.env.VERCEL_ENV || process.cwd() === '/var/task';
const USE_FILE_SYSTEM = !IS_VERCEL;

// In Vercel, use /tmp (only writable directory). Otherwise use .sessions in project root.
const SESSIONS_DIR = IS_VERCEL 
  ? path.join('/tmp', '.sessions')
  : path.join(process.cwd(), '.sessions');

// In-memory fallback for serverless environments where file system might not work
const MEMORY_SESSIONS = new Map<string, UserSession>();

// Ensure sessions directory exists (only if not in Vercel or if /tmp is available)
function ensureSessionsDir() {
  // Double-check: never create directories in /var/task (Vercel)
  const currentDir = process.cwd();
  if (currentDir === '/var/task' || !USE_FILE_SYSTEM) {
    // In Vercel, skip file system operations entirely
    return;
  }
  
  // Additional safety: check if path contains /var/task
  if (SESSIONS_DIR.includes('/var/task')) {
    console.warn('[session-storage] Skipping directory creation in /var/task (Vercel)');
    return;
  }
  
  try {
    if (fs.existsSync && !fs.existsSync(SESSIONS_DIR)) {
      fs.mkdirSync(SESSIONS_DIR, { recursive: true });
    }
  } catch (error) {
    // If directory creation fails, use in-memory only
    console.warn('[session-storage] Failed to create sessions dir, using in-memory storage:', error);
  }
}

function getSessionFile(sessionId: string): string {
  return path.join(SESSIONS_DIR, `${sessionId}.json`);
}

export function getOrCreateSession(sessionId: string, ip?: string, userAgent?: string): UserSession {
  // Try in-memory first
  const memSession = MEMORY_SESSIONS.get(sessionId);
  if (memSession) {
    memSession.lastActivity = new Date().toISOString();
    return memSession;
  }
  
  // Try file system only if not in Vercel
  if (USE_FILE_SYSTEM) {
    ensureSessionsDir();
    const sessionFile = getSessionFile(sessionId);
    
    if (fs.existsSync && fs.existsSync(sessionFile)) {
      try {
        const data = fs.readFileSync(sessionFile, 'utf-8');
        const session = JSON.parse(data);
        session.lastActivity = new Date().toISOString();
        MEMORY_SESSIONS.set(sessionId, session);
        return session;
      } catch (error) {
        console.error('Error reading session file:', error);
      }
    }
  }
  
  // Create new session
  const newSession: UserSession = {
    sessionId,
    ip,
    userAgent,
    createdAt: new Date().toISOString(),
    lastActivity: new Date().toISOString(),
    requests: []
  };
  
  MEMORY_SESSIONS.set(sessionId, newSession);
  saveSession(newSession);
  return newSession;
}

export function saveSession(session: UserSession): void {
  // Always update in-memory
  MEMORY_SESSIONS.set(session.sessionId, session);
  
  // Try to save to file system only if not in Vercel
  if (USE_FILE_SYSTEM) {
    try {
      ensureSessionsDir();
      const sessionFile = getSessionFile(session.sessionId);
      if (fs.writeFileSync) {
        fs.writeFileSync(sessionFile, JSON.stringify(session, null, 2));
      }
    } catch (error) {
      // If file write fails, in-memory storage is still available
      console.warn('[session-storage] Failed to save session to file, using in-memory only:', error);
    }
  }
}

export function addRequest(sessionId: string, request: UserSession['requests'][0]): void {
  const session = getOrCreateSession(sessionId);
  session.requests.push(request);
  session.lastActivity = new Date().toISOString();
  saveSession(session);
}

export function saveLastResult(sessionId: string, result: UserSession['lastResult']): void {
  const session = getOrCreateSession(sessionId);
  session.lastResult = result;
  session.lastActivity = new Date().toISOString();
  saveSession(session);
}

export function getSession(sessionId: string): UserSession | null {
  // Try in-memory first
  const memSession = MEMORY_SESSIONS.get(sessionId);
  if (memSession) return memSession;
  
  // Try file system only if not in Vercel
  if (USE_FILE_SYSTEM) {
    const sessionFile = getSessionFile(sessionId);
    
    if (fs.existsSync && fs.existsSync(sessionFile)) {
      try {
        const data = fs.readFileSync(sessionFile, 'utf-8');
        const session = JSON.parse(data);
        MEMORY_SESSIONS.set(sessionId, session);
        return session;
      } catch (error) {
        console.error('Error reading session:', error);
      }
    }
  }
  
  return null;
}

export function generateSessionId(): string {
  return `session_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
}


