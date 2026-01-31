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

const SESSIONS_DIR = path.join(process.cwd(), '.sessions');

// Ensure sessions directory exists
function ensureSessionsDir() {
  if (!fs.existsSync(SESSIONS_DIR)) {
    fs.mkdirSync(SESSIONS_DIR, { recursive: true });
  }
}

function getSessionFile(sessionId: string): string {
  return path.join(SESSIONS_DIR, `${sessionId}.json`);
}

export function getOrCreateSession(sessionId: string, ip?: string, userAgent?: string): UserSession {
  ensureSessionsDir();
  
  const sessionFile = getSessionFile(sessionId);
  
  if (fs.existsSync(sessionFile)) {
    try {
      const data = fs.readFileSync(sessionFile, 'utf-8');
      const session = JSON.parse(data);
      session.lastActivity = new Date().toISOString();
      return session;
    } catch (error) {
      console.error('Error reading session:', error);
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
  
  saveSession(newSession);
  return newSession;
}

export function saveSession(session: UserSession): void {
  ensureSessionsDir();
  const sessionFile = getSessionFile(session.sessionId);
  
  try {
    fs.writeFileSync(sessionFile, JSON.stringify(session, null, 2));
  } catch (error) {
    console.error('Error saving session:', error);
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
  const sessionFile = getSessionFile(sessionId);
  
  if (!fs.existsSync(sessionFile)) {
    return null;
  }
  
  try {
    const data = fs.readFileSync(sessionFile, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Error reading session:', error);
    return null;
  }
}

export function generateSessionId(): string {
  return `session_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
}


