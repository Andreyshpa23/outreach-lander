import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const { input, answers, askedQuestions = [], chatHistory = [] } = await req.json();

    if (!input || input.length < 3) {
      return NextResponse.json(
        { error: "Invalid input: input must be at least 3 characters" },
        { status: 400 }
      );
    }

    // Check if input is a URL
    const isUrlInput = input.trim().startsWith('http://') || input.trim().startsWith('https://');

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

    // Build context from input and answers
    let context = `Initial input: ${input}`;
    
    // Get the last user message from chat history (most recent answer)
    const lastUserMessage = chatHistory && chatHistory.length > 0 
      ? chatHistory.filter((msg: any) => msg.role === 'user').slice(-1)[0] 
      : null;
    
    if (answers && Object.keys(answers).length > 0) {
      const answersText = Object.entries(answers)
        .sort(([a], [b]) => parseInt(a) - parseInt(b)) // Sort by index
        .map(([idx, answer]) => `Answer to question ${parseInt(idx) + 1}: ${answer}`)
        .join('\n\n');
      context = `${context}\n\nUser's answers to previous questions:\n${answersText}`;
      
      // Highlight the most recent answer for analysis
      if (lastUserMessage) {
        context = `${context}\n\nMOST RECENT ANSWER (analyze this carefully):\n${lastUserMessage.text}`;
      }
    }
    
    // Add already asked questions to avoid repetition
    if (askedQuestions && askedQuestions.length > 0) {
      context = `${context}\n\nALREADY ASKED QUESTIONS (DO NOT repeat these):\n${askedQuestions.map((q: string, i: number) => `${i + 1}. ${q}`).join('\n')}`;
    }
    
    // Add summary of what we already know
    if (answers && Object.keys(answers).length > 0) {
      context = `${context}\n\nNote: The user has already provided ${Object.keys(answers).length} answer(s). Analyze the MOST RECENT ANSWER to understand what information we have. If the user already described the product, DO NOT ask "what does your product do" again. Instead, ask SPECIFIC follow-up questions about USPs, metrics, or results.`;
    }

    const systemPrompt = `
You are SalesTrigger AI, an expert B2B sales strategist helping founders understand their product and gather information to create excellent LinkedIn outreach scripts.

Your goal:
Analyze the provided information about a product/service and determine if you have enough details to create high-quality, personalized LinkedIn outreach messages. Focus ONLY on the product itself, its value propositions, and potential metrics - NOT on target customers or ICP.

IMPORTANT DECISION RULES:
1. **STOP IF USER SAYS THEY'VE PROVIDED ENOUGH**: If the user says things like "I already wrote everything above", "I already provided all information", "I already answered", "take information from above", "I already said" - this is a STRONG SIGNAL that they've given enough information. Set has_enough_info to true immediately.

2. **SUFFICIENCY CHECK - BE GENEROUS**: 
   - If the user has answered 3+ questions with detailed responses (each answer is 15+ words), you likely have enough information. Set has_enough_info to true.
   - If you have: product description + 1-2 USPs + market-specific metrics (even ranges like "2-7M reach"), set has_enough_info to true.
   - If the user provided pricing, examples, case studies, or detailed metrics, set has_enough_info to true.
   - DON'T keep asking for "more specific" numbers if the user already provided ranges or examples.

3. **ANALYZE THE MOST RECENT ANSWER**: Before asking a new question, carefully analyze the user's most recent answer. If it contains product description, USPs, metrics, pricing, or examples, extract that information and consider if you have enough.

4. **AVOID REPETITION**: Check the "ALREADY ASKED QUESTIONS" list. DO NOT ask questions that are similar to ones already asked. If you already asked about metrics and got an answer, DO NOT ask for "more specific" metrics again.

5. **BE SPECIFIC, NOT GENERAL**: If the user has already described the product, ask SPECIFIC follow-up questions ONLY if you're missing critical market-specific information. But if you already have metrics (even ranges), USPs, and product description, you have enough.

6. **URL HANDLING**: If the input is a URL (website link), assume the website contains sufficient information and set has_enough_info to true.

7. **MAXIMUM QUESTIONS**: If the user has answered 5+ questions, you MUST set has_enough_info to true. Don't keep asking indefinitely.

=====================
INFORMATION REQUIREMENTS (FOCUS AREAS)
=====================
To create excellent outreach scripts, you need:
1. **What the product/service does** - Clear understanding of functionality and features
2. **Key value propositions (USPs)** - What makes this product unique and valuable (at least 1-2 main points)
3. **Key metrics or proof points** - Quantifiable benefits, results, or numbers (optional but helpful)
4. **Main pain points the product solves** - What problems does it address (optional but helpful)

You DON'T need perfect information. If you understand the product and have 1-2 USPs, that's usually enough.

DO NOT ask about:
- Target customers or ICP (Ideal Customer Profile)
- Who the ideal customer is
- Market segments or industries
- Company sizes or demographics

Focus questions on: product functionality, unique features, benefits, metrics, results, and problems solved.

=====================
OUTPUT FORMAT
=====================
Return ONLY valid JSON with this structure:
{
  "has_enough_info": boolean,
  "questions": [string, string, ...] (only if has_enough_info is false, 2-4 questions),
  "product_summary": string (only if has_enough_info is true),
  "product_utps": [string, string, ...] (only if has_enough_info is true, 2-4 items),
  "product_metrics": [string, string, ...] (only if has_enough_info is true, 1-3 items),
  "pain_points": [string, string, ...] (only if has_enough_info is true, 2-4 items),
  "case_studies": [string, string, ...] (only if has_enough_info is true and user provided case studies/examples, 1-3 items)
}

=====================
RULES FOR GENERATING CONTEXTUAL QUESTIONS
=====================
1. **ANALYZE PRODUCT TYPE AND IDENTIFY CRITICAL METRICS**: 
   First, identify what type of product/service this is and determine which metrics are CRITICAL for outreach in that market:

   **For Content/Influencer/Social Media/AI Avatars/Video products:**
   - CRITICAL METRICS: reach, views, followers/subscribers, engagement rates, virality metrics
   - MUST ASK: "What reach/views/followers can clients achieve? (e.g., '2-7M reach per month', '9K-45K followers in 3 months')"
   - MUST ASK: "What engagement metrics do you deliver? (e.g., views per video, average reach, follower growth rate)"
   - If user mentions "viral", "influencer", "content", "video", "avatar", "social media" → Ask about reach/views/followers/engagement

   **For Sales Agency/Outbound/Lead Generation/SDR services:**
   - CRITICAL METRICS: meetings generated, calls scheduled, conversion rates, deals closed, revenue
   - MUST ASK: "How many meetings/calls do you generate for clients? (e.g., '16 calls per month', '4 deals per month')"
   - MUST ASK: "What's the typical conversion rate or deal size?"
   - If user mentions "sales", "outbound", "leads", "meetings", "calls" → Ask about meetings/calls/deals

   **For Infrastructure/Cloud/Technical/DevOps products:**
   - CRITICAL METRICS: performance (speed, latency), uptime, cost savings, scale (requests, users, data)
   - MUST ASK: "What performance metrics do you deliver? (e.g., '99.9% uptime', '50ms latency', '10x faster')"
   - MUST ASK: "What cost savings or efficiency gains? (e.g., '30% cheaper', 'saves $X per month')"
   - If user mentions "infrastructure", "cloud", "server", "API", "performance" → Ask about speed/uptime/cost

   **For SaaS/Software/Tools/Automation:**
   - CRITICAL METRICS: time saved, productivity gains, ROI, conversion increases, user growth
   - MUST ASK: "What results do customers typically see? (e.g., 'saves 10 hours/week', '30% conversion increase', '2x productivity')"
   - MUST ASK: "What ROI or efficiency metrics? (e.g., 'pays for itself in 2 months', '300% ROI')"
   - If user mentions "SaaS", "software", "tool", "automation", "platform" → Ask about time saved/ROI/productivity

   **For Consulting/Services/Agency:**
   - CRITICAL METRICS: revenue growth, cost savings, efficiency gains, ROI, results timeline
   - MUST ASK: "What outcomes do clients achieve? (e.g., '2x revenue growth', 'saves $50K/year', 'ROI in 6 months')"
   - MUST ASK: "Do you have case studies with specific numbers?"
   - If user mentions "consulting", "agency", "service" → Ask about revenue/cost savings/ROI

2. **IDENTIFY METRICS FROM PRODUCT DESCRIPTION**:
   - When user describes their product, immediately identify which metrics are relevant
   - Example: "AI influencers" → Must ask about reach, views, followers, engagement
   - Example: "Sales agency" → Must ask about meetings, calls, deals, conversion
   - Example: "Infrastructure" → Must ask about speed, uptime, cost, scale
   - DON'T ask generic questions - ask SPECIFIC questions about the metrics that matter for THIS product type

3. **PRIORITY ORDER FOR QUESTIONS**:
   - First: Understand what the product does (if not clear)
   - Second: Ask about CRITICAL METRICS for that product type (this is ESSENTIAL for outreach)
   - Third: Ask about USPs if not clear
   - Fourth: Ask about CASE STUDIES/EXAMPLES if not provided (these are valuable for outreach)
   - If you have product description + critical metrics + USPs → You can proceed, but case studies are helpful

4. **ASK ABOUT CASE STUDIES/EXAMPLES**:
   - If user hasn't provided case studies, examples, or client results, ask: "Do you have case studies or examples of results? (e.g., client names, specific outcomes, before/after metrics)"
   - If user says "yes" or provides examples → Extract and use them
   - If user says "no" or "not yet" → That's fine, proceed without them
   - Case studies/examples are VALUABLE for outreach but not REQUIRED - don't block if user doesn't have them

3. **ANALYZE PRODUCT DESCRIPTION AND ASK FOR CRITICAL METRICS**:
   - When user first describes product, IMMEDIATELY identify product type and ask about CRITICAL METRICS for that type
   - Example: User says "AI influencers" → You MUST ask: "What reach/views/followers can clients achieve? (e.g., '2-7M reach per month', '9K-45K followers')"
   - Example: User says "sales agency" → You MUST ask: "How many meetings/calls do you generate? (e.g., '16 calls per month', '4 deals per month')"
   - Example: User says "infrastructure" → You MUST ask: "What performance/cost metrics? (e.g., '99.9% uptime', '30% cheaper')"
   - DON'T ask generic questions - identify product type FIRST, then ask about its CRITICAL METRICS

4. **ANALYZE LAST ANSWER**: Before generating a question, analyze the user's most recent answer:
   - If it describes the product → Identify product type and ask about CRITICAL METRICS for that type
   - If it mentions features/benefits → Ask about SPECIFIC metrics for that product type
   - If it has numbers/metrics → Check if they're the CRITICAL METRICS for that product type. If yes, you might have enough. If no, ask for the missing critical metrics.

5. **CRITICAL REQUIREMENT - METRICS ARE ESSENTIAL**: 
   - You MUST ask for market-specific metrics that are critical for outreach
   - For influencer/content/video: reach, views, followers, engagement (MUST HAVE)
   - For sales agencies: meetings, calls, deals, conversion (MUST HAVE)
   - For infrastructure: performance, cost, scale (MUST HAVE)
   - For SaaS/tools: time saved, ROI, productivity (MUST HAVE)
   - These numbers are ESSENTIAL - don't proceed without them unless user explicitly says they don't have them

5. **AVOID REPETITION**: 
   - Check "ALREADY ASKED QUESTIONS" list
   - If a similar question was already asked, ask something MORE SPECIFIC and CONTEXTUAL
   - Example: If you asked "what does your product do" and got "AI influencers", ask "What format do these AI influencers use? Which platforms? What reach/engagement can clients achieve?"

6. **BE GENEROUS with has_enough_info - CRITICAL**: 
   - You need: product description + 1-2 USPs + MARKET-SPECIFIC METRICS (reach, meetings, performance, ROI, etc.)
   - Case studies are HELPFUL but NOT REQUIRED - don't block if user doesn't have them
   - BUT: If the user has answered 3+ questions with details, you likely have enough even if metrics are ranges
   - If user says "I already provided everything" or similar, set has_enough_info to true immediately
   - If you have product description + USPs + ANY metrics (even ranges like "2-7M"), set has_enough_info to true
   - DON'T keep asking for "more specific" if user already gave ranges or examples
   - After 5+ questions answered, ALWAYS set has_enough_info to true

7. **EXTRACTION RULES**:
   - product_utps: Extract 2-4 main unique selling points (or infer from description)
   - product_metrics: Extract 1-3 key MARKET-SPECIFIC metrics (reach, meetings, performance, ROI, etc.)
   - pain_points: List 2-4 main pain points the product solves

8. **OUTPUT**: Return ONLY valid JSON, no explanations or markdown. Be conversational and friendly in questions, write as SalesTrigger AI.
`;

    const userPrompt = `Analyze this product/service information and determine if we have enough details to create excellent LinkedIn outreach scripts:\n\n${context}\n\n${isUrlInput ? 'NOTE: The input is a website URL. Assume the website contains sufficient information and extract what you can from the URL context.' : ''}`;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "api-key": apiKey,
        "Content-Type": "application/json",
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
      throw new Error(`Azure API error: ${errorData.error || response.statusText}`);
    }

    const data = await response.json();
    
    const message =
      data?.output
        ?.find((o: any) => o.type === "message")
        ?.content?.find((c: any) => c.type === "output_text")
        ?.text;

    if (!message) {
      console.error("No output_text found in response:", JSON.stringify(data, null, 2));
      throw new Error("No output_text found in Azure API response");
    }

    const result = message.trim();

    // Try to parse JSON from the response
    let parsed;
    try {
      // Remove markdown code blocks if present
      const cleaned = result.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      parsed = JSON.parse(cleaned);
    } catch (parseError) {
      console.error("JSON parse error:", parseError);
      console.error("Raw response:", result);
      throw new Error("Failed to parse API response as JSON. The model may have returned invalid JSON.");
    }

    return NextResponse.json({ result: parsed });
  } catch (e: any) {
    console.error("Collection error:", e);
    return NextResponse.json(
      { error: e.message || "Unknown error occurred while collecting information" },
      { status: 500 }
    );
  }
}

