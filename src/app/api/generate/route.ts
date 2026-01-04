import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
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

You are writing a 4-step LinkedIn outreach sequence.

Tone:
- Calm, confident, human
- No hype, no buzzwords
- Sounds like a real B2B sales professional
- Direct, thoughtful, respectful

Writing rules:
- Messages must NOT be short
- Each message should be 3–6 short paragraphs
- Use line breaks to improve readability
- Avoid generic AI phrases like:
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
PRODUCT INSIGHTS - USE PROVIDED DATA
=====================

You will receive product insights that were collected from the user:
- product_utps: Array of unique selling points (USE THESE in your messages)
- product_metrics: Array of key metrics/numbers (USE THESE in your messages - they are REAL and CRITICAL)
- case_studies: Array of case studies/examples (USE THESE for social proof if available)

CRITICAL: You MUST use these real facts, numbers, and USPs in your outreach messages:
- Reference specific metrics (e.g., "2-7M reach per month", "16 calls per month", "99.9% uptime")
- Highlight the unique selling points provided
- Use case studies/examples for social proof when available
- Make messages concrete and credible with REAL numbers, not generic claims

If product insights are provided, they are FACTS - use them directly in messages to make outreach compelling and credible.

=====================
OUTPUT FORMAT (STRICT)
=====================

{
  "performance": {
    "dialogs": number,
    "calls": number,
    "deals": number
  },
  "product_utps": ["string", "string", ...],
  "product_metrics": ["string", "string", ...],
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
    const cleaned = message
      .replace(/```json/g, "")
      .replace(/```/g, "")
      .trim();

    return NextResponse.json({ result: cleaned });

  } catch (e: any) {
    console.error("API route error:", e);
    return NextResponse.json(
      { error: "Server error", details: e.message || "Unknown error occurred" },
      { status: 500 }
    );
  }
}