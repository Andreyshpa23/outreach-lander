// Simple token usage limiter
// Stores usage in a JSON file (resets daily) or in-memory in Vercel

import fs from 'fs';
import path from 'path';

interface UsageData {
  date: string; // YYYY-MM-DD
  requests: number;
  tokens: number;
}

// Detect Vercel/serverless environment
const IS_VERCEL = !!process.env.VERCEL || !!process.env.VERCEL_ENV || process.cwd() === '/var/task';
const USE_FILE_SYSTEM = !IS_VERCEL;

// In-memory fallback for Vercel
const MEMORY_USAGE: UsageData = { date: '', requests: 0, tokens: 0 };

const USAGE_FILE = USE_FILE_SYSTEM 
  ? path.join(process.cwd(), '.token-usage.json')
  : path.join('/tmp', '.token-usage.json');

function getTodayDate(): string {
  return new Date().toISOString().split('T')[0]; // YYYY-MM-DD
}

function readUsage(): UsageData {
  // In Vercel, use in-memory storage
  if (!USE_FILE_SYSTEM) {
    const today = getTodayDate();
    if (MEMORY_USAGE.date !== today) {
      MEMORY_USAGE.date = today;
      MEMORY_USAGE.requests = 0;
      MEMORY_USAGE.tokens = 0;
    }
    return { ...MEMORY_USAGE };
  }
  
  // Try file system
  try {
    if (fs.existsSync && fs.existsSync(USAGE_FILE)) {
      const data = fs.readFileSync(USAGE_FILE, 'utf-8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('Error reading usage file:', error);
  }
  return { date: getTodayDate(), requests: 0, tokens: 0 };
}

function writeUsage(usage: UsageData): void {
  // In Vercel, update in-memory storage only
  if (!USE_FILE_SYSTEM) {
    MEMORY_USAGE.date = usage.date;
    MEMORY_USAGE.requests = usage.requests;
    MEMORY_USAGE.tokens = usage.tokens;
    return;
  }
  
  // Try file system
  try {
    if (fs.writeFileSync) {
      fs.writeFileSync(USAGE_FILE, JSON.stringify(usage, null, 2));
    }
  } catch (error) {
    // Silently fail - in-memory will be used on next read
    console.warn('[token-limiter] Failed to write usage file, using in-memory:', error);
  }
}

export function checkTokenLimit(): { allowed: boolean; message?: string; current?: number; limit?: number } {
  // Check for daily request limit (simpler than token counting)
  const dailyRequestLimit = parseInt(process.env.DAILY_REQUEST_LIMIT || '0', 10);
  
  // If no limit set, allow all requests
  if (dailyRequestLimit === 0) {
    return { allowed: true };
  }

  const today = getTodayDate();
  let usage = readUsage();

  // Reset if it's a new day
  if (usage.date !== today) {
    usage = { date: today, requests: 0, tokens: 0 };
    writeUsage(usage);
  }

  // Check request limit
  if (usage.requests >= dailyRequestLimit) {
    return {
      allowed: false,
      message: `Daily limit reached (${usage.requests}/${dailyRequestLimit} requests used). Please try again tomorrow.`,
      current: usage.requests,
      limit: dailyRequestLimit
    };
  }

  return { allowed: true, current: usage.requests, limit: dailyRequestLimit };
}

export function incrementUsage(estimatedTokens: number = 1000): void {
  const today = getTodayDate();
  let usage = readUsage();

  // Reset if it's a new day
  if (usage.date !== today) {
    usage = { date: today, requests: 0, tokens: 0 };
  }

  usage.requests += 1;
  usage.tokens += estimatedTokens;

  writeUsage(usage);
}

export function getUsageStats(): { requests: number; tokens: number; limit: number } {
  const dailyRequestLimit = parseInt(process.env.DAILY_REQUEST_LIMIT || '0', 10);
  const today = getTodayDate();
  let usage = readUsage();

  // Reset if it's a new day
  if (usage.date !== today) {
    usage = { date: today, requests: 0, tokens: 0 };
  }

  return {
    requests: usage.requests,
    tokens: usage.tokens,
    limit: dailyRequestLimit
  };
}

