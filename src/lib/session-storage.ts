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

// In-memory fallback for serverless environments where file system might not work
const MEMORY_SESSIONS = new Map<string, UserSession>();

// Detect Vercel/serverless environment at runtime (not at module load)
function isVercelEnvironment(): boolean {
  // Check multiple indicators
  if (process.env.VERCEL || process.env.VERCEL_ENV) return true;
  const cwd = process.cwd();
  if (cwd === '/var/task') return true;
  if (cwd.startsWith('/var/task/')) return true;
  // Additional check: if we're in a serverless-like environment
  if (cwd.includes('/.next') && !fs.existsSync) return true;
  return false;
}

function getSessionsDir(): string {
  if (isVercelEnvironment()) {
    return path.join('/tmp', '.sessions');
  }
  return path.join(process.cwd(), '.sessions');
}

// Ensure sessions directory exists (only if not in Vercel or if /tmp is available)
function ensureSessionsDir() {
  // Always check at runtime, never trust module-level constants
  if (isVercelEnvironment()) {
    // In Vercel, skip file system operations entirely - use in-memory only
    return;
  }
  
  const sessionsDir = getSessionsDir();
  
  // Final safety check: never create directories in /var/task
  if (sessionsDir.includes('/var/task')) {
    console.warn('[session-storage] Blocked: attempted to create dir in /var/task:', sessionsDir);
    return;
  }
  
  try {
    if (fs.existsSync && !fs.existsSync(sessionsDir)) {
      fs.mkdirSync(sessionsDir, { recursive: true });
    }
  } catch (error) {
    // If directory creation fails, use in-memory only
    console.warn('[session-storage] Failed to create sessions dir, using in-memory storage:', error);
  }
}

function getSessionFile(sessionId: string): string {
  return path.join(getSessionsDir(), `${sessionId}.json`);
}

export function getOrCreateSession(sessionId: string, ip?: string, userAgent?: string): UserSession {
  // Always check at runtime
  const isVercel = isVercelEnvironment();
  
  // Try in-memory first
  const memSession = MEMORY_SESSIONS.get(sessionId);
  if (memSession) {
    memSession.lastActivity = new Date().toISOString();
    return memSession;
  }
  
  // Try file system only if not in Vercel
  if (!isVercel) {
    ensureSessionsDir();
    const sessionFile = getSessionFile(sessionId);
    
    // Final safety check before accessing file
    if (!sessionFile.includes('/var/task') && fs.existsSync && fs.existsSync(sessionFile)) {
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
  
  // Always check at runtime
  const isVercel = isVercelEnvironment();
  
  // Try to save to file system only if not in Vercel
  if (!isVercel) {
    try {
      ensureSessionsDir();
      const sessionFile = getSessionFile(session.sessionId);
      
      // Final safety check before writing file
      if (!sessionFile.includes('/var/task') && fs.writeFileSync) {
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
  // Always check at runtime
  const isVercel = isVercelEnvironment();
  
  // Try in-memory first
  const memSession = MEMORY_SESSIONS.get(sessionId);
  if (memSession) return memSession;
  
  // Try file system only if not in Vercel
  if (!isVercel) {
    const sessionFile = getSessionFile(sessionId);
    
    // Final safety check before accessing file
    if (!sessionFile.includes('/var/task') && fs.existsSync && fs.existsSync(sessionFile)) {
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


