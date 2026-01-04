// Simple token usage limiter
// Stores usage in a JSON file (resets daily)

import fs from 'fs';
import path from 'path';

interface UsageData {
  date: string; // YYYY-MM-DD
  requests: number;
  tokens: number;
}

const USAGE_FILE = path.join(process.cwd(), '.token-usage.json');

function getTodayDate(): string {
  return new Date().toISOString().split('T')[0]; // YYYY-MM-DD
}

function readUsage(): UsageData {
  try {
    if (fs.existsSync(USAGE_FILE)) {
      const data = fs.readFileSync(USAGE_FILE, 'utf-8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('Error reading usage file:', error);
  }
  return { date: getTodayDate(), requests: 0, tokens: 0 };
}

function writeUsage(usage: UsageData): void {
  try {
    fs.writeFileSync(USAGE_FILE, JSON.stringify(usage, null, 2));
  } catch (error) {
    console.error('Error writing usage file:', error);
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

