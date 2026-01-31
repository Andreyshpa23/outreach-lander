import { NextResponse } from "next/server";
import { checkTokenLimit, incrementUsage } from "@/lib/token-limiter";
import { addRequest } from "@/lib/session-storage";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    // Check token limit before processing
    const limitCheck = checkTokenLimit();
    if (!limitCheck.allowed) {
      return NextResponse.json(
        { 
          error: limitCheck.message || "Daily limit reached. Please try again tomorrow.",
          limitReached: true
        },
        { status: 429 }
      );
    }

    const sessionId = req.headers.get('x-session-id') || 'unknown';
    const ip = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown';
    const userAgent = req.headers.get('user-agent') || 'unknown';

    const { input, product_utps = [], product_metrics = [], case_studies = [] } = await req.json();

    if (!input || input.length < 10) {
      return NextResponse.json(
        { error: "Invalid input: input must be at least 10 characters" },
        { status: 400 }
      );
    }

    const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
    const apiKey = process.env.AZURE_OPENAI_API_KEY;
    const deployment = process.env.AZURE_OPENAI_DEPLOYMENT;

    if (!endpoint || !apiKey || !deployment) {
      console.error("Missing environment variables:", {
        hasEndpoint: !!endpoint,
        hasApiKey: !!apiKey,
        hasDeployment: !!deployment,
      });
      return NextResponse.json(
        { error: "Server configuration error: Missing Azure OpenAI credentials. Check environment variables." },
        { status: 500 }
      );
    }

    const apiVersion = "2025-04-01-preview";

    const url = `${endpoint}/openai/responses?api-version=${apiVersion}`;

    const systemPrompt = `
You are a senior B2B outbound strategist and copywriter.
You specialize in writing high-conversion LinkedIn outreach for SaaS companies.

Your goal:
Generate realistic, human-sounding LinkedIn outbound sequences that feel like they were written by an experienced sales rep — not by AI.

=====================
CRITICAL OUTPUT RULES
=====================

- Return ONLY valid JSON
- Do NOT include explanations, comments, or markdown
- Do NOT include special characters that break JSON
- Use standard quotes only (")
- Do NOT use long dashes, emojis inside text, or unusual symbols
- Line breaks are allowed only as standard newline characters (\n)

=====================
SEGMENTS RULE (IMPORTANT)
=====================

- Always generate EXACTLY 2 segments
- Never generate 1 segment
- Never generate more than 2 segments
- Segments must represent different ICPs or buyer types

=====================
PERFORMANCE ESTIMATES
=====================

All performance numbers must be NUMBERS ONLY (no text).

Assume results per 1 LinkedIn account:
- dialogs: from 50 to 250
- calls: from 4 to 30
- deals: from 1 to 10

=====================
MESSAGE STRATEGY
=====================

You are writing a 4-step LinkedIn outreach sequence. This is NOT a sales pitch. It's a friendly sharing about what you're building, what you're working on, and a genuine interest in connecting if it's relevant.

Tone:
- Friendly, authentic, human
- Sharing-focused, not sales-focused
- Like sharing what you're building with a potential collaborator or someone who might be interested
- Natural conversation starter, not a pitch
- Direct, thoughtful, respectful
- Avoid aggressive sales language

Writing rules:
- Messages must NOT be short
- Each message should be 3–6 short paragraphs
- Use line breaks to improve readability
- Write as if you're sharing what you're working on, not selling
- Focus on "I'm building X", "I'm working on Y", "thought you might be interested", "would be great to connect if relevant"
- Avoid generic sales phrases like:
  "hope you're doing well"
  "just reaching out"
  "quick question"
  "touch base"
  "circle back"
  "leverage"
  "unlock"
  "streamline"
  "revolutionary"
  "game-changing"
  "I can help you"
  "Let me show you how"
  "Are you struggling with"
  "Pain points"
  "Solutions"

=====================
PERSONALIZATION RULES
=====================

- Use {first_name} ONLY as a placeholder
- Do NOT reference company name, role, industry, or personal details
- Personalization must come from relevance, not data

=====================
SEQUENCE STRUCTURE
=====================

Step 1:
- Contextual problem statement
- Clear value proposition
- Soft, non-pushy CTA

Step 2:
- Reframe the problem
- Contrast with common alternatives
- Introduce how the product works at a high level

Step 3:
- Address why outbound usually fails
- Explain why this approach works better
- Social proof style framing (without fake names)

Step 4:
- Low-pressure close
- Give permission to say no
- Offer to reconnect later

=====================
PRODUCT INSIGHTS - USE PROVIDED DATA (CRITICAL)
=====================

You will receive product insights that were collected from the user:
- product_utps: Array of unique selling points (USE THESE in your messages - spread them across different messages)
- product_metrics: Array of key metrics/numbers (USE THESE in your messages - they are REAL and CRITICAL - MUST USE NUMBERS)
- case_studies: Array of case studies/examples (USE THESE when sharing results/insights)

CRITICAL REQUIREMENTS:
1. **YOU MUST USE NUMBERS/METRICS IN EVERY MESSAGE**: Every message in the sequence MUST include at least one specific number or metric from product_metrics. This is NOT optional - numbers make messages credible and interesting.

2. **DIFFERENT NUMBERS IN DIFFERENT MESSAGES**: 
   - Message 1: Use one or two specific metrics/numbers
   - Message 2: Use different metrics/numbers than Message 1
   - Message 3: Use different metrics/numbers than Messages 1 and 2
   - Message 4: Use different metrics/numbers if available, or reference numbers from previous messages
   - DO NOT repeat the same numbers in every message - vary them across the sequence

3. **USE USPs STRATEGICALLY**: 
   - Spread unique selling points across different messages
   - Don't list all USPs in one message
   - Integrate USPs naturally into the sharing narrative

4. **INTEGRATE NATURALLY**: 
   - Frame numbers as "what we're seeing" or "what we've achieved" or "what we're building"
   - Example: "We're seeing clients get 2-7M reach per month" instead of "Our solution delivers 2-7M reach"
   - Example: "Built something that helps achieve 99.9% uptime" instead of "Our platform has 99.9% uptime"
   - Share numbers as insights, not as sales claims

5. **CASE STUDIES**: 
   - Use case studies in Message 3 or 4 when sharing results
   - Frame as "thought you might find this interesting" not "look at our success"

REMEMBER: You MUST include specific numbers/metrics from product_metrics in EVERY message. If no numbers are provided, note this but still try to be specific where possible. Numbers are what make messages interesting and credible.

=====================
TARGET AUDIENCE (ICP) - REQUIRED
=====================

Based on the product and segments, infer the ideal customer profile and fill target_audience. This is used for lead lists (e.g. Apollo). Use short, comma-separated values where applicable.

- geo: string - main geography (e.g. "United States, Canada", "UK, Germany")
- positions: array of strings - job titles (e.g. ["CEO", "VP Sales", "Head of Marketing"])
- industry: string - industries (e.g. "SaaS, Technology", "Finance, Insurance")
- company_size: string - employee ranges (e.g. "51-200, 201-500", "1-50, 51-200")

=====================
OUTPUT FORMAT (STRICT)
=====================

{
  "product_name": "string" (product name or URL from input),
  "performance": {
    "dialogs": number,
    "calls": number,
    "deals": number
  },
  "product_utps": ["string", "string", ...],
  "product_metrics": ["string", "string", ...],
  "target_audience": {
    "geo": "string",
    "positions": ["string", "string", ...],
    "industry": "string",
    "company_size": "string"
  },
  "segments": [
    {
      "name": "string",
      "linkedin_filters": "string",
      "personalization_ideas": "string",
      "outreach_sequence": [
        "message step 1",
        "message step 2",
        "message step 3",
        "message step 4"
      ]
    },
    {
      "name": "string",
      "linkedin_filters": "string",
      "personalization_ideas": "string",
      "outreach_sequence": [
        "message step 1",
        "message step 2",
        "message step 3",
        "message step 4"
      ]
    }
  ]
}
`.trim();

    // Build user prompt with product insights
    let userPrompt = input;
    
    if (product_utps && product_utps.length > 0) {
      userPrompt += `\n\nPRODUCT UNIQUE SELLING POINTS (USE THESE IN MESSAGES):\n${product_utps.map((utp: string, i: number) => `${i + 1}. ${utp}`).join('\n')}`;
    }
    
    if (product_metrics && product_metrics.length > 0) {
      userPrompt += `\n\nPRODUCT METRICS/NUMBERS (USE THESE REAL NUMBERS IN MESSAGES - THEY ARE CRITICAL):\n${product_metrics.map((metric: string, i: number) => `${i + 1}. ${metric}`).join('\n')}`;
    }
    
    if (case_studies && case_studies.length > 0) {
      userPrompt += `\n\nCASE STUDIES/EXAMPLES (USE FOR SOCIAL PROOF):\n${case_studies.map((cs: string, i: number) => `${i + 1}. ${cs}`).join('\n')}`;
    }
    
    if (product_utps.length > 0 || product_metrics.length > 0 || case_studies.length > 0) {
      userPrompt += `\n\nIMPORTANT: Use the above USPs, metrics, and case studies DIRECTLY in your outreach messages. Reference specific numbers and facts to make messages credible and compelling.`;
    }

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api-key": apiKey
      },
      body: JSON.stringify({
        model: deployment,
        input: [
          {
            role: "system",
            content: systemPrompt
          },
          {
            role: "user",
            content: userPrompt
          }
        ]
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: "Unknown Azure API error" }));
      console.error("Azure API error:", response.status, errorData);
      return NextResponse.json(
        { error: `Azure OpenAI API error: ${errorData.error || response.statusText}` },
        { status: response.status }
      );
    }

    const data = await response.json();

    const message =
      data?.output
        ?.find((o: any) => o.type === "message")
        ?.content?.find((c: any) => c.type === "output_text")
        ?.text;

    if (!message) {
      console.error("No output_text found in response:", JSON.stringify(data, null, 2));
      return NextResponse.json(
        { error: "No output_text found in Azure API response", raw: data },
        { status: 500 }
      );
    }

    // Remove ```json markdown wrapper
    let cleaned = message
      .replace(/```json/g, "")
      .replace(/```/g, "")
      .trim();

    // Ensure target_audience is always present so frontend can fill ICP (model sometimes omits it)
    try {
      const parsed = JSON.parse(cleaned) as Record<string, unknown>;
      if (!parsed.target_audience || typeof parsed.target_audience !== "object") {
        const segments = Array.isArray(parsed.segments) ? parsed.segments : [];
        const firstSegment = segments[0] as Record<string, unknown> | undefined;
        const linkedinFilters = typeof firstSegment?.linkedin_filters === "string" ? firstSegment.linkedin_filters : "";
        parsed.target_audience = {
          geo: "United States, Canada, UK",
          positions: linkedinFilters ? linkedinFilters.split(/[,;|]/).map((s: string) => s.trim()).filter(Boolean).slice(0, 5) : ["CEO", "VP Sales", "Head of Marketing"],
          industry: "SaaS, Technology",
          company_size: "51-200, 201-500",
        };
        cleaned = JSON.stringify(parsed);
      }
    } catch (_) {
      // If parse fails, return cleaned as-is
    }

    // Increment usage counter (estimate ~2000 tokens per generation request)
    incrementUsage(2000);

    // Log request to session
    if (sessionId && sessionId !== 'unknown') {
      try {
        let parsedResult;
        try {
          parsedResult = JSON.parse(cleaned);
        } catch (e) {
          parsedResult = cleaned;
        }
        
        addRequest(sessionId, {
          timestamp: new Date().toISOString(),
          type: 'generate',
          input: input,
          result: parsedResult,
          productInsights: {
            utps: product_utps,
            metrics: product_metrics,
            caseStudies: case_studies
          }
        });
      } catch (err) {
        console.error('Error logging request:', err);
      }
    }

    return NextResponse.json({ result: cleaned });

  } catch (e: any) {
    console.error("API route error:", e);
    return NextResponse.json(
      { error: "Server error", details: e.message || "Unknown error occurred" },
      { status: 500 }
    );
  }
}