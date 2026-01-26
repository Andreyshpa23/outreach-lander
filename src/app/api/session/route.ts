import { NextResponse } from "next/server";
import { getOrCreateSession, getSession, generateSessionId } from "@/lib/session-storage";

export const runtime = "nodejs";

// GET - получить или создать сессию
export async function GET(req: Request) {
  try {
    const sessionId = req.headers.get('x-session-id') || generateSessionId();
    const ip = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown';
    const userAgent = req.headers.get('user-agent') || 'unknown';
    
    const session = getOrCreateSession(sessionId, ip, userAgent);
    
    return NextResponse.json({ 
      sessionId: session.sessionId,
      lastResult: session.lastResult || null,
      requestCount: session.requests.length
    });
  } catch (e: any) {
    console.error("Session error:", e);
    return NextResponse.json(
      { error: e.message || "Unknown error" },
      { status: 500 }
    );
  }
}

// POST - сохранить результат
export async function POST(req: Request) {
  try {
    const { sessionId, result, productUTPs, productMetrics, case_studies } = await req.json();
    
    if (!sessionId) {
      return NextResponse.json(
        { error: "Session ID required" },
        { status: 400 }
      );
    }
    
    const ip = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown';
    const userAgent = req.headers.get('user-agent') || 'unknown';
    
    const session = getOrCreateSession(sessionId, ip, userAgent);
    
    if (result) {
      session.lastResult = {
        apiData: result,
        productUTPs: productUTPs || [],
        productMetrics: productMetrics || [],
        case_studies: case_studies || [],
        timestamp: new Date().toISOString()
      };
      
      // Save session
      const { saveSession } = await import('@/lib/session-storage');
      saveSession(session);
    }
    
    return NextResponse.json({ success: true });
  } catch (e: any) {
    console.error("Session save error:", e);
    return NextResponse.json(
      { error: e.message || "Unknown error" },
      { status: 500 }
    );
  }
}


