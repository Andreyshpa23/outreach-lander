"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";

/* ===================== PAGE ===================== */

type TypedState = { filters: string; personalization: string; messages: string[] };

/** Target audience (ICP) for Apollo / lead lists */
export type TargetAudience = {
  geo: string;           // e.g. "United States, Canada"
  positions: string[];    // e.g. ["CEO", "Head of Sales"]
  industry: string;      // e.g. "SaaS, Technology"
  company_size: string;  // e.g. "1-50", "51-200", "201-500", "500+"
};

export default function Page() {
  const [input, setInput] = useState("");
  const [step, setStep] = useState(0); // 0..4
  const [loading, setLoading] = useState(false);
  const [apiData, setApiData] = useState<any | null>(null);
  const [typed, setTyped] = useState<TypedState[]>([]);
  const [wowText, setWowText] = useState("");
  const [wowSegmentName, setWowSegmentName] = useState("");
  const [progressValue, setProgressValue] = useState(0);
  const [metricValues, setMetricValues] = useState({ dialogs: 0, calls: 0, deals: 0 });
  const [firstMessageComplete, setFirstMessageComplete] = useState(false);
  const [selectedSegmentIndex, setSelectedSegmentIndex] = useState(0);
  const [activeMessageIndex, setActiveMessageIndex] = useState(0);
  const [askingQuestions, setAskingQuestions] = useState(false);
  const [questions, setQuestions] = useState<string[]>([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [chatExpanded, setChatExpanded] = useState(false);
  const [completedAnalysisItems, setCompletedAnalysisItems] = useState(0);
  const [productUTPs, setProductUTPs] = useState<string[]>([]);
  const [productMetrics, setProductMetrics] = useState<string[]>([]);
  const [caseStudies, setCaseStudies] = useState<string[]>([]);
  const [chatMessages, setChatMessages] = useState<Array<{role: 'agent' | 'user', text: string}>>([]);
  const [currentAnswer, setCurrentAnswer] = useState("");
  const [needsMoreInfo, setNeedsMoreInfo] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [initialInput, setInitialInput] = useState<string>(""); // Store initial product input/URL
  const [productName, setProductName] = useState<string>(""); // Store extracted product name
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authAgreed, setAuthAgreed] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<Array<{name: string, type: string, size: number}>>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [placeholderIndex, setPlaceholderIndex] = useState(0);
  const [placeholderText, setPlaceholderText] = useState("");
  const [isTyping, setIsTyping] = useState(true);
  const [targetAudience, setTargetAudience] = useState<TargetAudience>({
    geo: "",
    positions: [],
    industry: "",
    company_size: "",
  });
  const [launchSaving, setLaunchSaving] = useState(false);
  const [launchResult, setLaunchResult] = useState<{ download_csv_url: string | null; leads_count: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatMessagesEndRef = useRef<HTMLDivElement>(null);
  const dropZoneRef = useRef<HTMLDivElement>(null);
  const placeholderTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Cookie helpers
  function getCookie(name: string): string | null {
    if (typeof document === 'undefined') return null;
    try {
      const value = `; ${document.cookie}`;
      const parts = value.split(`; ${name}=`);
      if (parts.length === 2) {
        const cookieValue = parts.pop()?.split(';').shift() || null;
        return cookieValue ? decodeURIComponent(cookieValue) : null;
      }
      return null;
    } catch (error) {
      console.error(`Error reading cookie ${name}:`, error);
      return null;
    }
  }

  function setCookie(name: string, value: string, days: number = 365) {
    if (typeof document === 'undefined') return;
    try {
      const expires = new Date();
      expires.setTime(expires.getTime() + days * 24 * 60 * 60 * 1000);
      // Encode value to handle special characters in JSON
      const encodedValue = encodeURIComponent(value);
      // Set domain to .salestrigger.io so cookie is available on all subdomains
      document.cookie = `${name}=${encodedValue};expires=${expires.toUTCString()};path=/;domain=.salestrigger.io;SameSite=Lax`;
      console.log(`Cookie ${name} saved successfully on .salestrigger.io`);
    } catch (error) {
      console.error(`Error saving cookie ${name}:`, error);
    }
  }

  // Initialize session on mount
  useEffect(() => {
    async function initSession() {
      try {
        // Check if we have sessionId in cookies
        let currentSessionId = getCookie('st_session_id');
        
        if (!currentSessionId) {
          // Get or create session from API
          const res = await fetch('/api/session', {
            method: 'GET',
            headers: {
              'x-session-id': ''
            }
          });
          
          if (res.ok) {
            const data = await res.json();
            currentSessionId = data.sessionId;
            if (currentSessionId) {
              setCookie('st_session_id', currentSessionId);
              setSessionId(currentSessionId);
            }
            
            // Load saved results if available
            if (data.lastResult) {
              // Restore state from saved result
              setApiData(data.lastResult.apiData);
              setProductUTPs(data.lastResult.productUTPs || []);
              setProductMetrics(data.lastResult.productMetrics || []);
              setCaseStudies(data.lastResult.case_studies || []);
              
              // Restore results to cookies for quick access
              setCookie('st_last_result', JSON.stringify(data.lastResult), 7);
              
              // Also save to new format cookie if not exists
              const fullOutputData = {
                apiData: data.lastResult.apiData,
                productUTPs: data.lastResult.productUTPs || [],
                productMetrics: data.lastResult.productMetrics || [],
                caseStudies: data.lastResult.case_studies || [],
                targetAudience: data.lastResult.targetAudience,
                sessionId: currentSessionId,
                timestamp: data.lastResult.timestamp || new Date().toISOString()
              };
              setCookie('st_user_output', JSON.stringify(fullOutputData), 30);
              if (data.lastResult.targetAudience) {
                setTargetAudience(data.lastResult.targetAudience);
              }
              // If we have saved data, show it
              if (data.lastResult.apiData) {
                setStep(4);
              }
            }
          }
        } else {
          setSessionId(currentSessionId);
          
          // Try to load from cookies first (faster) - check new format first
          const savedUserOutput = getCookie('st_user_output');
          if (savedUserOutput) {
            try {
              const parsed = JSON.parse(savedUserOutput);
              setApiData(parsed.apiData);
              setProductUTPs(parsed.productUTPs || []);
              setProductMetrics(parsed.productMetrics || []);
              setCaseStudies(parsed.caseStudies || []);
              if (parsed.targetAudience) {
                setTargetAudience(parsed.targetAudience);
              }
              if (parsed.apiData) {
                setStep(4);
              }
            } catch (e) {
              console.error('Error parsing saved user output:', e);
            }
          } else {
            // Fallback to old format
            const savedResult = getCookie('st_last_result');
            if (savedResult) {
              try {
                const parsed = JSON.parse(savedResult);
                setApiData(parsed.apiData);
                setProductUTPs(parsed.productUTPs || []);
                setProductMetrics(parsed.productMetrics || []);
                if (parsed.apiData) {
                  setStep(4);
                }
              } catch (e) {
                console.error('Error parsing saved result:', e);
              }
            }
          }
          
          // Also fetch from API to get latest
          const res = await fetch('/api/session', {
            method: 'GET',
            headers: {
              'x-session-id': currentSessionId
            }
          });
          
          if (res.ok) {
            const data = await res.json();
            if (data.lastResult && !savedUserOutput && !getCookie('st_last_result')) {
              setApiData(data.lastResult.apiData);
              setProductUTPs(data.lastResult.productUTPs || []);
              setProductMetrics(data.lastResult.productMetrics || []);
              setCaseStudies(data.lastResult.case_studies || []);
              setCookie('st_last_result', JSON.stringify(data.lastResult), 7);
              
              // Also save to new format
              const fullOutputData = {
                apiData: data.lastResult.apiData,
                productUTPs: data.lastResult.productUTPs || [],
                productMetrics: data.lastResult.productMetrics || [],
                caseStudies: data.lastResult.case_studies || [],
                targetAudience: data.lastResult.targetAudience,
                sessionId: currentSessionId,
                timestamp: data.lastResult.timestamp || new Date().toISOString()
              };
              setCookie('st_user_output', JSON.stringify(fullOutputData), 30);
              if (data.lastResult.targetAudience) {
                setTargetAudience(data.lastResult.targetAudience);
              }
              if (data.lastResult.apiData) {
                setStep(4);
              }
            }
          }
          // Try to load target_audience from X-Fast-Creation if present
          const xFast = getCookie('X-Fast-Creation');
          if (xFast) {
            try {
              const xParsed = JSON.parse(xFast);
              if (xParsed.target_audience && typeof xParsed.target_audience === 'object') {
                const ta = xParsed.target_audience;
                setTargetAudience(prev => ({
                  geo: ta.geo ?? prev.geo,
                  positions: Array.isArray(ta.positions) ? ta.positions : prev.positions,
                  industry: ta.industry ?? prev.industry,
                  company_size: ta.company_size ?? prev.company_size
                }));
              }
            } catch (_) {}
          }
        }
      } catch (error) {
        console.error('Error initializing session:', error);
      }
    }
    
    initSession();
  }, []);

  // Persist target_audience to X-Fast-Creation and st_user_output when user edits (for Apollo API)
  useEffect(() => {
    if (step < 4 || !apiData) return;
    try {
      const raw = getCookie('X-Fast-Creation');
      if (raw) {
        const data = JSON.parse(raw);
        data.target_audience = {
          geo: targetAudience.geo,
          positions: targetAudience.positions,
          industry: targetAudience.industry,
          company_size: targetAudience.company_size
        };
        setCookie('X-Fast-Creation', JSON.stringify(data), 30);
      }
      const saved = getCookie('st_user_output');
      if (saved) {
        const parsed = JSON.parse(saved);
        parsed.targetAudience = targetAudience;
        setCookie('st_user_output', JSON.stringify(parsed), 30);
      }
    } catch (_) {}
  }, [targetAudience, step, apiData]);

  // Launch outreach: create file in MinIO (product + segments), set cookie, trigger Apollo leadgen in background
  async function handleLaunchOutreach() {
    if (!apiData?.segments?.length) {
      setShowAuthModal(true);
      return;
    }
    setLaunchSaving(true);
    try {
      const productNameVal = productName || initialInput || apiData?.product_name || "Product";
      const descriptionParts = [...(productUTPs || []), ...(productMetrics || [])].slice(0, 4);
      const description = descriptionParts.join(". ").substring(0, 500) || "Product details";
      const payload = {
        product: {
          name: productNameVal,
          description,
          goal_type: "MANUAL_GOAL",
          goal_description: "Надо забукать с ним кол, попроси его прислать удобные слоты для созвона или его календли",
        },
        segments: apiData.segments.map((seg: { name?: string; personalization_ideas?: string; personalization?: string; linkedin_filters?: string }, i: number) => ({
          name: seg.name || "Segment",
          personalization: seg.personalization_ideas || seg.personalization || "",
          linkedin_filters: typed[i]?.filters || seg.linkedin_filters || "",
        })),
        target_audience: {
          geo: targetAudience.geo || undefined,
          positions: targetAudience.positions?.length ? targetAudience.positions : undefined,
          industry: targetAudience.industry || undefined,
          company_size: targetAudience.company_size || undefined,
        },
      };
      const res = await fetch("/api/launch-outreach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success && data.key) {
        setCookie("demo_st_minio_id", data.key, 30);
        setLaunchResult({
          download_csv_url: data.download_csv_url ?? null,
          leads_count: data.leads_count ?? 0,
        });
        setShowAuthModal(true);
      } else {
        const msg = data?.error || (res.status === 503 ? "MinIO не настроен на сервере. Добавьте MINIO_* в Vercel." : "Не удалось запустить outreach.");
        alert(msg);
        setShowAuthModal(true);
      }
    } catch (e) {
      alert("Ошибка при запуске outreach. Проверьте консоль.");
      setShowAuthModal(true);
    } finally {
      setLaunchSaving(false);
    }
  }

  const steps = useMemo(
    () => [
      { id: 1, label: "Understanding your product and market" },
      { id: 2, label: "Choosing who to talk to first" },
      { id: 3, label: "Writing the first message" },
      { id: 4, label: "Your AI Sales Agent is ready" },
    ],
    []
  );

  const messageLabels = ["Opening message", "Follow-up #1", "Follow-up #2", "Break-up follow-up"];

  // Placeholder rotation animation
  const placeholders = useMemo(() => [
    "Built something but don't know how to get users?",
    "Drop your idea. Let AI handle sales.",
    "What would you sell if sales wasn't annoying?"
  ], []);

  useEffect(() => {
    // Only animate placeholder when input is empty and user is not focused on textarea
    if (step !== 0 || input.trim() !== "") {
      return;
    }

    const currentPlaceholder = placeholders[placeholderIndex];
    
    if (isTyping) {
      // Typing animation
      if (placeholderText.length < currentPlaceholder.length) {
        placeholderTimeoutRef.current = setTimeout(() => {
          setPlaceholderText(currentPlaceholder.slice(0, placeholderText.length + 1));
        }, 50); // Typing speed
      } else {
        // Full text shown, wait before erasing
        placeholderTimeoutRef.current = setTimeout(() => {
          setIsTyping(false);
        }, 2000); // Show full text for 2 seconds
      }
    } else {
      // Erasing animation
      if (placeholderText.length > 0) {
        placeholderTimeoutRef.current = setTimeout(() => {
          setPlaceholderText(placeholderText.slice(0, -1));
        }, 30); // Erasing speed (faster than typing)
      } else {
        // Move to next placeholder
        setIsTyping(true);
        setPlaceholderIndex((prev) => (prev + 1) % placeholders.length);
      }
    }

    return () => {
      if (placeholderTimeoutRef.current) {
        clearTimeout(placeholderTimeoutRef.current);
      }
    };
  }, [placeholderText, isTyping, placeholderIndex, step, input, placeholders]);

  /* ===================== FILE UPLOAD ===================== */

  async function handleFileUpload(file: File) {
    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch('/api/upload-file', {
        method: 'POST',
        headers: {
          'x-session-id': sessionId || ''
        },
        body: formData
      });

      if (!res.ok) {
        // Try to parse JSON error, fallback to text
        let errorMessage = 'Failed to upload file';
        try {
          const errorData = await res.json();
          errorMessage = errorData.error || errorMessage;
        } catch (e) {
          // If JSON parsing fails, try to get text
          try {
            const errorText = await res.text();
            errorMessage = errorText || errorMessage;
          } catch (e2) {
            // If both fail, use status text
            errorMessage = res.statusText || errorMessage;
          }
        }
        throw new Error(errorMessage);
      }

      const data = await res.json();
      setUploadedFiles(prev => [...prev, {
        name: data.originalName,
        type: data.type,
        size: data.size
      }]);

      // Add file info to input
      const fileInfo = `\n[Attached file: ${data.originalName} (${(data.size / 1024).toFixed(1)}KB)]`;
      if (chatMessages.length === 0) {
        setInput(prev => prev + fileInfo);
      } else {
        setCurrentAnswer(prev => prev + fileInfo);
      }
    } catch (error: any) {
      alert(`Failed to upload file: ${error.message}`);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }

  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = Array.from(e.dataTransfer.files);
    const allowedTypes = ['.pdf', '.pptx', '.docx', '.doc', '.ppt', '.txt'];
    
    files.forEach(file => {
      const extension = '.' + file.name.split('.').pop()?.toLowerCase();
      if (allowedTypes.includes(extension)) {
        handleFileUpload(file);
      } else {
        alert(`File type ${extension} is not supported. Please upload PDF, PPTX, DOCX, DOC, PPT, or TXT files.`);
      }
    });
  }

  /* ===================== GENERATE ===================== */

  async function checkAndAskQuestions() {
    // Always start Step 1 - information collection phase
    // Chat will remain open during this phase
    setStep(1);
    setLoading(false); // Don't show loading spinner, we're in interactive chat mode
    setNeedsMoreInfo(true);
    setAskingQuestions(false);
    setCurrentQuestionIndex(0);
    setAnswers({});
    
    // Save initial input (product name/URL) for later use
    setInitialInput(input.trim());
    
    // Extract product name from input (URL or text)
    let extractedName = input.trim();
    if (extractedName.startsWith('http://') || extractedName.startsWith('https://')) {
      // If it's a URL, use it as is
      setProductName(extractedName);
    } else {
      // If it's text, use first line or first 50 chars as product name
      const firstLine = extractedName.split('\n')[0].trim();
      setProductName(firstLine.length > 0 ? firstLine : extractedName.substring(0, 50));
    }
    
    // Include uploaded files info in initial message
    let initialMessage = input;
    if (uploadedFiles.length > 0) {
      const filesInfo = uploadedFiles.map(f => `${f.name} (${(f.size / 1024).toFixed(1)}KB)`).join(', ');
      initialMessage = `${input}\n\n[Uploaded files: ${filesInfo}]`.trim();
    }
    
    // Add user's initial input as first message in chat
    setChatMessages([{
      role: 'user',
      text: initialMessage
    }]);
    setCurrentAnswer("");

    // Call API to check if we have enough info and get questions if needed
    await collectInformation();
  }

  async function collectInformation() {
    try {
      // Get all agent messages (questions) that were already asked
      const agentMessages = chatMessages.filter(msg => msg.role === 'agent');
      const askedQuestions = agentMessages.map(msg => msg.text);
      
      // Include uploaded files info in input
      let finalInput = input;
      if (uploadedFiles.length > 0) {
        const filesInfo = uploadedFiles.map(f => `${f.name} (${(f.size / 1024).toFixed(1)}KB)`).join(', ');
        finalInput = `${input}\n\n[Uploaded files: ${filesInfo}]`.trim();
      }
      
      const res = await fetch("/api/collect-info", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "x-session-id": sessionId || ""
        },
        body: JSON.stringify({ 
          input: finalInput,
          answers: answers,
          askedQuestions: askedQuestions, // Pass already asked questions
          chatHistory: chatMessages, // Pass full chat history for context
          uploadedFiles: uploadedFiles.map(f => ({ name: f.name, type: f.type, size: f.size }))
        }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ error: "Unknown error" }));
        
        // Check if it's a rate limit error
        if (res.status === 429 || errorData.limitReached) {
          throw new Error("Daily limit reached. Please try again tomorrow.");
        }
        
        throw new Error(errorData.error || `API error: ${res.status} ${res.statusText}`);
      }

      const data = await res.json();
      
      if (!data.result) {
        throw new Error("API returned no result. Check server logs.");
      }

      const info = data.result;

      // Update product name from API response if available
      if (info.product_name) {
        setProductName(info.product_name);
      }

      // Safety check: If user has answered 5+ questions, force has_enough_info to true
      const answerCount = Object.keys(answers).length;
      if (!info.has_enough_info && answerCount >= 5) {
        console.log("User has answered 5+ questions, forcing has_enough_info to true");
        info.has_enough_info = true;
        // Try to extract what we have
        if (!info.product_utps || info.product_utps.length === 0) {
          info.product_utps = ["Product details provided by user"];
        }
        if (!info.product_metrics || info.product_metrics.length === 0) {
          info.product_metrics = ["Metrics provided by user"];
        }
      }

      if (!info.has_enough_info) {
        // Need more information - show questions in chat
        let questionsToUse: string[] = [];
        
        if (info.questions && info.questions.length > 0) {
          questionsToUse = info.questions;
        } else {
          // Fallback questions - focus on product, USPs, and metrics
          questionsToUse = [
            "What exactly does your product do? Can you describe its main functionality?",
            "What are your product's main unique selling points (USPs)? What makes it different from alternatives?",
            "What key metrics or numbers best showcase your product? (e.g., 'Saves 10 hours/week', '99.9% uptime', 'Used by 5000+ companies', 'Increases conversion by 30%')",
            "What main problems or pain points does your product solve for users?",
          ];
        }
        
        setQuestions(questionsToUse);
        
        // Check if we need to add a new question to chat
        // Get all agent messages that are questions
        const agentMessages = chatMessages.filter(msg => msg.role === 'agent');
        const lastAgentMessage = agentMessages[agentMessages.length - 1];
        
        // Find the first question that hasn't been asked yet
        const unansweredQuestion = questionsToUse.find(q => 
          !agentMessages.some(msg => msg.text === q)
        );
        
        if (unansweredQuestion) {
          // Update current question index
          const questionIndex = questionsToUse.indexOf(unansweredQuestion);
          setCurrentQuestionIndex(questionIndex);
          
          // Add question to chat if it's not already the last message
          // Use shorter delay for first question (after user's initial message), longer for subsequent ones
          const delay = chatMessages.length === 1 ? 100 : 150; // Reduced from 500-800ms to 100-150ms
          if (lastAgentMessage?.text !== unansweredQuestion) {
            setTimeout(() => {
              setChatMessages(prev => [...prev, { 
                role: 'agent', 
                text: unansweredQuestion 
              }]);
            }, delay);
          }
        }
      } else {
        // Have enough information - extract it and show Product Insights first
        if (info.product_utps) {
          setProductUTPs(info.product_utps);
        }
        if (info.product_metrics) {
          setProductMetrics(info.product_metrics);
        }
        
        // Add final message from agent confirming we have enough info
        setTimeout(() => {
          setChatMessages(prev => [...prev, { 
            role: 'agent', 
            text: 'Perfect! I have everything I need. Analyzing your product insights...' 
          }]);
        }, 100); // Reduced from 500ms to 100ms
        
        // Close chat and show Product Insights (stay on Step 1 but hide chat)
        setTimeout(() => {
          setNeedsMoreInfo(false);
        }, 500); // Reduced from 2000ms to 500ms
        
        // Combine all information for generation
        let finalInput = input;
        if (Object.keys(answers).length > 0) {
          const answersText = Object.entries(answers)
            .map(([idx, answer]) => `Answer ${parseInt(idx) + 1}: ${answer}`)
            .join('\n');
          finalInput = `${input}\n\nAdditional information:\n${answersText}`;
        }
        if (info.product_summary) {
          finalInput = `${finalInput}\n\nProduct Summary: ${info.product_summary}`;
        }

        // Prepare product insights for generation (including case studies)
        const productInsights = {
          product_utps: info.product_utps || [],
          product_metrics: info.product_metrics || [],
          case_studies: info.case_studies || []
        };
        
        // Save case studies to state
        if (info.case_studies && Array.isArray(info.case_studies) && info.case_studies.length > 0) {
          setCaseStudies(info.case_studies);
        }

        // Wait for Product Insights to be shown, then move to Step 2 and start generation
        setTimeout(async () => {
          await startGenerationWithInput(finalInput, productInsights);
        }, 1000); // Reduced from 5000ms to 1000ms
      }
    } catch (e: any) {
      console.error("Information collection error:", e);
      alert(`Failed to collect information: ${e.message || "Unknown error"}\n\nCheck console for details.`);
      setLoading(false);
      setStep(0);
      setNeedsMoreInfo(false);
    }
  }

  async function handleAnswerSubmit() {
    if (!currentAnswer.trim()) return;

    // Save answer
    const newAnswers = { ...answers, [currentQuestionIndex]: currentAnswer };
    setAnswers(newAnswers);
    
    // Add user message to chat
    setChatMessages(prev => [...prev, { role: 'user', text: currentAnswer }]);
    setCurrentAnswer("");

    // After saving answer, call API again to check if we have enough info now
    // This will either return more questions or confirm we have enough info
    await collectInformation();
  }

  async function startGeneration() {
    // Include uploaded files info in input
    let finalInput = input;
    if (uploadedFiles.length > 0) {
      const filesInfo = uploadedFiles.map(f => `${f.name} (${(f.size / 1024).toFixed(1)}KB)`).join(', ');
      finalInput = `${input}\n\n[Uploaded files: ${filesInfo}]`.trim();
    }

    // For URLs, we can skip information collection and go directly to generation
    // But we still need to collect info first to extract UTPs and metrics
    if (isUrl(input)) {
      // For URLs, collect info first (but it should return has_enough_info = true immediately)
      await collectInformation();
    } else {
      // For non-URLs, always collect info first
      await collectInformation();
    }
  }

  async function startGenerationWithInput(finalInput: string, productInsights?: { product_utps?: string[], product_metrics?: string[], case_studies?: string[] }) {
    // Start generation - move to Step 2 (Step 1 was information collection)
    setLoading(true);
    setStep(2);
    setNeedsMoreInfo(false);
    setApiData(null);
    setTyped([]);
    setWowText("");
    setWowSegmentName("");
    setProgressValue(0);
    setMetricValues({ dialogs: 0, calls: 0, deals: 0 });
    setFirstMessageComplete(false);
    setSelectedSegmentIndex(0);
    setActiveMessageIndex(0);
    setChatExpanded(false);
    setCompletedAnalysisItems(0);

    let parsed: any;
    try {
      // Prepare request body with product insights
      const requestBody: any = { input: finalInput };
      if (productInsights) {
        if (productInsights.product_utps && productInsights.product_utps.length > 0) {
          requestBody.product_utps = productInsights.product_utps;
        }
        if (productInsights.product_metrics && productInsights.product_metrics.length > 0) {
          requestBody.product_metrics = productInsights.product_metrics;
        }
        if (productInsights.case_studies && productInsights.case_studies.length > 0) {
          requestBody.case_studies = productInsights.case_studies;
        }
      }
      // Also use state values if available
      if (productUTPs.length > 0) {
        requestBody.product_utps = productUTPs;
      }
      if (productMetrics.length > 0) {
        requestBody.product_metrics = productMetrics;
      }

      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "x-session-id": sessionId || ""
        },
        body: JSON.stringify(requestBody),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ error: "Unknown error" }));
        
        // Check if it's a rate limit error
        if (res.status === 429 || errorData.limitReached) {
          throw new Error("Daily limit reached. Please try again tomorrow.");
        }
        
        throw new Error(errorData.error || `API error: ${res.status} ${res.statusText}`);
      }

      const data = await res.json();
      
      if (!data.result) {
        throw new Error("API returned no result. Check server logs.");
      }

      try {
      parsed = JSON.parse(data.result);
      } catch (parseError) {
        console.error("JSON parse error:", parseError);
        console.error("Raw response:", data.result);
        throw new Error("Failed to parse API response as JSON. Check server response format.");
      }
    } catch (e: any) {
      console.error("Generation error:", e);
      alert(`Generation failed: ${e.message || "Unknown error"}\n\nCheck console for details.`);
      setLoading(false);
      setStep(0);
      setAskingQuestions(false);
      return;
    }

    setApiData(parsed);

    // Extract product name from API response if available
    if (parsed.product_name) {
      setProductName(parsed.product_name);
    }

    // Extract UTPs and metrics from API response if available (for URLs)
    if (parsed.product_utps && Array.isArray(parsed.product_utps) && parsed.product_utps.length > 0) {
      setProductUTPs(parsed.product_utps);
    }
    if (parsed.product_metrics && Array.isArray(parsed.product_metrics) && parsed.product_metrics.length > 0) {
      setProductMetrics(parsed.product_metrics);
    }

    // Fill Target audience (ICP) from AI output (accept target_audience or targetAudience, snake_case or camelCase)
    const rawTa = parsed.target_audience ?? (parsed as { targetAudience?: unknown }).targetAudience;
    let extractedTa: TargetAudience | null = null;
    if (rawTa && typeof rawTa === "object") {
      const ta = rawTa as Record<string, unknown>;
      const geo = typeof (ta.geo ?? ta.geography) === "string" ? String(ta.geo ?? ta.geography) : "";
      const positions = Array.isArray(ta.positions) ? (ta.positions as unknown[]).filter((p): p is string => typeof p === "string") : [];
      const industry = typeof (ta.industry) === "string" ? ta.industry : "";
      const company_size = typeof (ta.company_size ?? ta.companySize) === "string" ? String(ta.company_size ?? ta.companySize) : "";
      extractedTa = { geo, positions, industry, company_size };
      setTargetAudience((prev) => ({
        geo: geo || prev.geo,
        positions: positions.length > 0 ? positions : prev.positions,
        industry: industry || prev.industry,
        company_size: company_size || prev.company_size,
      }));
    }

    // Save results to session and cookies - NEW FORMAT: X-Fast-Creation
    // Always save cookie, even if sessionId is not yet set
    // Get final product insights
    const finalUTPs = productUTPs.length > 0 ? productUTPs : (parsed.product_utps || []);
    const finalMetrics = productMetrics.length > 0 ? productMetrics : (parsed.product_metrics || []);
    
    // Create short description from UTPs and metrics (key points and features)
    const descriptionParts: string[] = [];
    
    // Add key USPs
    if (finalUTPs.length > 0) {
      descriptionParts.push(...finalUTPs.slice(0, 3)); // Top 3 USPs
    }
    
    // Add key metrics
    if (finalMetrics.length > 0) {
      descriptionParts.push(...finalMetrics.slice(0, 2)); // Top 2 metrics
    }
    
    // Join into short description (max 500 chars)
    const shortDescription = descriptionParts
      .filter(p => p && p.trim().length > 0)
      .join('. ')
      .substring(0, 500);
    
    // Get product name (from extracted name or initial input)
    const finalProductName = productName || initialInput || (parsed.product_name || 'Product');
    
    // Extract segments data (name and personalization)
    const segmentsData = parsed.segments && Array.isArray(parsed.segments) 
      ? parsed.segments.map((seg: any) => ({
          name: seg.name || 'Segment',
          personalization: seg.personalization_ideas || seg.personalization || ''
        }))
      : [];
    
    // Use extracted AI target_audience for cookie when available, else current state
    const taForCookie = extractedTa ?? {
      geo: targetAudience.geo,
      positions: targetAudience.positions,
      industry: targetAudience.industry,
      company_size: targetAudience.company_size
    };

    // Prepare new format data for X-Fast-Creation cookie (include target_audience for Apollo)
    const fastCreationData = {
      product: {
        name: finalProductName,
        description: shortDescription || 'Product details and key features',
        goal_type: "Manual_Goal",
        goal_description: "Надо забукать с ним кол, попроси его прислать удобные слоты для созвона или его календли"
      },
      segments: segmentsData,
      target_audience: taForCookie
    };
    
    // Save to X-Fast-Creation cookie (30 days) - ALWAYS save, regardless of sessionId
    try {
      const cookieValue = JSON.stringify(fastCreationData);
      setCookie('X-Fast-Creation', cookieValue, 30);
      console.log('X-Fast-Creation cookie saved:', fastCreationData);
    } catch (error) {
      console.error('Error saving X-Fast-Creation cookie:', error);
    }
    
    // Save leads_ref cookie (link to leads file) - placeholder for now
    // This will be updated when leads file is uploaded/created
    try {
      const leadsRefData = {
        file_url: null // Will be set when leads file is available
      };
      const leadsRefValue = JSON.stringify(leadsRefData);
      setCookie('leads_ref', leadsRefValue, 30);
      console.log('leads_ref cookie saved:', leadsRefData);
    } catch (error) {
      console.error('Error saving leads_ref cookie:', error);
    }
    
    // Continue with session save if sessionId exists
    if (sessionId) {
      
      // Also keep full output data for internal use (use AI-filled target_audience when available)
      const fullOutputData = {
        // Full API response with all segments, messages, filters, etc.
        apiData: parsed,
        
        // Product insights
        productUTPs: finalUTPs,
        productMetrics: finalMetrics,
        caseStudies: caseStudies.length > 0 ? caseStudies : (parsed.case_studies || []),
        
        // Target audience (ICP) for Apollo / lead lists (AI-filled from parsed when present)
        targetAudience: taForCookie,
        
        // Metadata
        sessionId: sessionId,
        timestamp: new Date().toISOString(),
        
        // Chat history (if available)
        chatHistory: chatMessages.length > 0 ? chatMessages : undefined,
        
        // Uploaded files info (if available)
        uploadedFiles: uploadedFiles.length > 0 ? uploadedFiles : undefined
      };
      
      // Save to cookies (quick access) - this will be accessible after auth
      setCookie('st_user_output', JSON.stringify(fullOutputData), 30); // 30 days
      
      // Also keep the old cookie for backward compatibility
      const resultToSave = {
        apiData: parsed,
        productUTPs: finalUTPs,
        productMetrics: finalMetrics,
        timestamp: fullOutputData.timestamp
      };
      setCookie('st_last_result', JSON.stringify(resultToSave), 7);
      
      // Save to session (server-side)
      fetch('/api/session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-session-id': sessionId
        },
        body: JSON.stringify({
          sessionId,
          result: parsed,
          productUTPs: finalUTPs,
          productMetrics: finalMetrics,
          case_studies: fullOutputData.caseStudies,
          targetAudience: fullOutputData.targetAudience
        })
      }).catch(err => console.error('Error saving session:', err));
    }
    setTyped(
      parsed.segments.map(() => ({
        filters: "",
        personalization: "",
        messages: ["", "", "", ""],
      }))
    );

    // Step 2: Choosing leads - animate progress bar smoothly
    // (Step 1 was information collection, which is already done)
    animateProgress(50, 800); // Reduced from 2000ms to 800ms

    // Complete analysis items one by one (4 items, faster now)
    setTimeout(() => setCompletedAnalysisItems(1), 100); // Reduced from 500ms
    setTimeout(() => setCompletedAnalysisItems(2), 200); // Reduced from 1000ms
    setTimeout(() => setCompletedAnalysisItems(3), 300); // Reduced from 1500ms
    setTimeout(() => setCompletedAnalysisItems(4), 400); // Reduced from 2000ms

    // Step 3: Show wow card with first message (faster now)
    setTimeout(() => {
      setStep(3);
      animateProgress(75, 0);
      if (parsed.segments && parsed.segments.length > 0) {
        setWowSegmentName(parsed.segments[0].name);
        const firstMessage = parsed.segments[0].outreach_sequence[0];
        const typingSpeed = 18;
        const typingDuration = firstMessage.length * typingSpeed;
        typeText(firstMessage, setWowText, typingSpeed, 0);
        
        // Mark first message as complete after typing finishes
        setTimeout(() => {
          setFirstMessageComplete(true);
        }, typingDuration + 100);

        // Step 4: Only start AFTER first message is fully typed + delay (reduced pause)
        const step4Delay = typingDuration + 500; // Reduced from typingDuration + 2000ms to + 500ms
        setTimeout(() => {
          setStep(4);
          animateProgress(100, 0);
          // Animate metrics counting up
          if (parsed.performance) {
            animateMetric("dialogs", parsed.performance.dialogs);
            setTimeout(() => animateMetric("calls", parsed.performance.calls), 100); // Reduced from 300ms
            setTimeout(() => animateMetric("deals", parsed.performance.deals), 200); // Reduced from 600ms
          }
          
          // Type filters after a delay
          setTimeout(() => {
      parsed.segments.forEach((seg: any, i: number) =>
        typeText(seg.linkedin_filters, (v) => {
          setTyped((p) => {
            const n = [...p];
            if (!n[i]) return p;
            n[i] = { ...n[i], filters: v };
            return n;
          });
              }, 18, i * 200)
      );
          }, 200); // Reduced from 800ms

          // Type personalization after filters
    setTimeout(() => {
      parsed.segments.forEach((seg: any, i: number) =>
        typeText(seg.personalization_ideas, (v) => {
          setTyped((p) => {
            const n = [...p];
            if (!n[i]) return p;
            n[i] = { ...n[i], personalization: v };
            return n;
          });
              }, 18, i * 200 + 800)
      );
          }, 500); // Reduced from 2500ms

          // Type all messages after personalization
    setTimeout(() => {
      parsed.segments.forEach((seg: any, i: number) =>
        seg.outreach_sequence.forEach((msg: string, mIdx: number) =>
          typeText(
            msg,
            (v) => {
              setTyped((p) => {
                const n = [...p];
                if (!n[i]) return p;
                const messages = [...n[i].messages];
                messages[mIdx] = v;
                n[i] = { ...n[i], messages };
                return n;
              });
            },
            14,
                  (i * 1000) + (mIdx * 350)
          )
        )
      );
      setLoading(false);
            // Activate messages one by one
            setTimeout(() => setActiveMessageIndex(0), 800); // Reduced from 4000ms
            setTimeout(() => setActiveMessageIndex(1), 1000); // Reduced from 5000ms
            setTimeout(() => setActiveMessageIndex(2), 1200); // Reduced from 6000ms
            setTimeout(() => setActiveMessageIndex(3), 1400); // Reduced from 7000ms
          }, 800); // Reduced from 4000ms
        }, step4Delay);
      }
    }, 800); // Reduced from 3500ms to 800ms
  }

  function animateProgress(target: number, duration: number) {
    const start = progressValue;
    const startTime = Date.now();
    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const current = start + (target - start) * progress;
      setProgressValue(current);
      if (progress < 1) {
        requestAnimationFrame(animate);
      }
    };
    if (duration > 0) {
      requestAnimationFrame(animate);
    } else {
      setProgressValue(target);
    }
  }

  function animateMetric(metric: "dialogs" | "calls" | "deals", target: number) {
    const duration = 1200;
    const start = 0;
    const startTime = Date.now();
    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // Ease out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = Math.floor(start + (target - start) * eased);
      setMetricValues((prev) => ({ ...prev, [metric]: current }));
      if (progress < 1) {
        requestAnimationFrame(animate);
      } else {
        setMetricValues((prev) => ({ ...prev, [metric]: target }));
      }
    };
    requestAnimationFrame(animate);
  }

  function typeText(
    text: string,
    setter: (v: string) => void,
    speed = 18,
    delay = 0
  ) {
    setTimeout(() => {
      let i = 0;
      const int = setInterval(() => {
        setter(text.slice(0, i + 1));
        i++;
        if (i >= text.length) clearInterval(int);
      }, speed);
    }, delay);
  }

  function copyMessage() {
    if (wowText) {
      navigator.clipboard.writeText(wowText);
    }
  }

  const currentProgressValue = step <= 0 ? 0 : Math.min(progressValue, 100);
  const currentSegment = apiData?.segments?.[selectedSegmentIndex];
  const currentTyped = typed[selectedSegmentIndex];

  // Auto-scroll chat to bottom when new messages arrive
  useEffect(() => {
    if (needsMoreInfo && chatMessagesEndRef.current) {
      chatMessagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chatMessages, needsMoreInfo]);

  /* ===================== UI ===================== */

  return (
    <main className="min-h-screen relative overflow-hidden">
      {/* Background gradient */}
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute inset-0 bg-gradient-to-b from-white via-blue-50 to-blue-200" />
        <div 
          className="absolute bottom-0 left-1/2 h-[80vh] w-[120vw] -translate-x-1/2"
          style={{
            background: 'radial-gradient(ellipse 60% 100% at 50% 100%, rgb(59, 130, 246) 0%, rgb(147, 197, 253) 30%, transparent 70%)',
            filter: 'blur(80px)',
          }}
        />
        <div 
          className="absolute bottom-0 left-1/2 h-[60vh] w-[100vw] -translate-x-1/2"
          style={{
            background: 'radial-gradient(ellipse 50% 80% at 50% 100%, rgb(37, 99, 235) 0%, transparent 60%)',
            filter: 'blur(100px)',
          }}
        />
      </div>

      {/* Header */}
      <header className="relative z-10 mx-auto flex max-w-7xl items-center justify-center px-6 py-6">
        <div className="flex items-center gap-3 font-semibold tracking-tight absolute left-6">
          <img src="/logo.png" alt="SalesTrigger" className="h-8 w-auto" />
        </div>
        <nav className="hidden items-center gap-6 text-sm text-zinc-600 md:flex">
          <a className="hover:text-zinc-900" href="#">Roadmap</a>
          <a className="hover:text-zinc-900" href="#">Pricing</a>
          <a className="hover:text-zinc-900" href="#">FAQ</a>
          <a className="hover:text-zinc-900" href="#">Contacts</a>
        </nav>
        <Button 
          className="rounded-full px-5 absolute right-6"
          onClick={() => window.open('https://outreach.salestrigger.io', '_blank')}
        >
          Log in
        </Button>
      </header>

      {/* MAIN SCENE - Fixed height container */}
      <div className="relative z-10 mx-auto max-w-6xl px-6" style={{ minHeight: 'calc(90vh - 80px)' }}>
        {step === 0 && !needsMoreInfo && (
          <div className="flex flex-col items-center justify-center py-12">
            {/* Hero */}
            <section className="flex max-w-4xl flex-col items-center text-center">
        <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-white/70 px-3 py-1 text-xs text-zinc-600 shadow-sm backdrop-blur">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
          AI SDR for LinkedIn
        </div>
        <h1 className="text-5xl font-semibold tracking-tight text-zinc-900 md:text-6xl">
                Your AI Sales Agent.
          <br />
                <span className="text-zinc-500">Get your first 100 sales.</span>
        </h1>
        <p className="mt-6 max-w-2xl text-lg text-zinc-600">
                An AI agent that handles outreach, messages and conversations
                <br />
                so you can keep building.
        </p>
      </section>

            {/* Input */}
            <section className="mt-12 w-full max-w-3xl">
        <div 
          ref={dropZoneRef}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={`w-full rounded-xl border border-zinc-200 bg-white/75 p-4 shadow-xl backdrop-blur-md relative transition-all ${
            isDragging ? 'border-blue-400 bg-blue-50/50 ring-2 ring-blue-300' : ''
          }`}
        >
          {/* Drag Overlay */}
          {isDragging && (
            <div className="absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-blue-500/10 backdrop-blur-sm">
              <div className="text-center">
                <svg className="mx-auto h-12 w-12 text-blue-500 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
                <p className="text-sm font-medium text-blue-600">Drop files here to upload</p>
              </div>
            </div>
          )}

          {/* Uploaded Files Preview */}
          {uploadedFiles.length > 0 && (
            <div className="mb-3 flex flex-wrap gap-2">
              {uploadedFiles.map((file, idx) => (
                <div
                  key={idx}
                  className="flex items-center gap-2 rounded-lg bg-blue-50 px-3 py-1.5 text-sm text-blue-700"
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                  </svg>
                  <span className="max-w-[150px] truncate">{file.name}</span>
                  <button
                    onClick={() => {
                      setUploadedFiles(prev => prev.filter((_, i) => i !== idx));
                    }}
                    className="text-blue-500 hover:text-blue-700"
                  >
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          )}

          <Textarea
            rows={4}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                if ((input.trim() || uploadedFiles.length > 0) && !loading && !askingQuestions) {
                  checkAndAskQuestions();
                }
              }
            }}
            placeholder={input.trim() === "" && step === 0 ? placeholderText || placeholders[0] : "What are you selling? (or upload a pitch deck, presentation, etc.)"}
            className="resize-none border-zinc-200 bg-white/70 text-base focus-visible:ring-0"
          />

          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.pptx,.docx,.doc,.ppt,.txt"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFileUpload(file);
            }}
          />

          <div className="mt-4 flex items-center justify-between gap-4">
            <Button
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              variant="outline"
              className="rounded-lg px-4 py-2 border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50 hover:text-zinc-900 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
            >
              {isUploading ? (
                <span className="flex items-center gap-2">
                  <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  Uploading...
                </span>
              ) : (
                "Attach"
              )}
            </Button>
            <Button
              size="lg"
              className="rounded-xl px-6 bg-zinc-900 text-white hover:bg-zinc-800 font-medium"
              onClick={() => checkAndAskQuestions()}
              disabled={(!input.trim() && uploadedFiles.length === 0) || loading || askingQuestions}
            >
              Launch AI Sales Agent
            </Button>
            </div>

          <div className="mt-3 text-xs text-zinc-500 text-center">
            Powered by SalesTrigger AI
          </div>
        </div>
      </section>
          </div>
        )}

        {/* Chat with questions - Show when needsMoreInfo (stays open during info gathering) */}
        {needsMoreInfo && (
          <div className="flex flex-col items-center justify-center py-12">
            {/* Hero - Keep it visible */}
            <section className="flex max-w-4xl flex-col items-center text-center mb-8">
              <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-white/70 px-3 py-1 text-xs text-zinc-600 shadow-sm backdrop-blur">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                AI SDR for LinkedIn
              </div>
              <h1 className="text-5xl font-semibold tracking-tight text-zinc-900 md:text-6xl">
                Your AI Sales Agent.
                <br />
                <span className="text-zinc-500">Get your first 100 sales.</span>
              </h1>
              <p className="mt-6 max-w-2xl text-lg text-zinc-600">
                An AI agent that handles outreach, messages and conversations
                <br />
                so you can keep building.
              </p>
            </section>

            {/* Chat with questions - ChatGPT-style dialog */}
            <section className="mt-8 w-full max-w-3xl">
              <div 
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className={`w-full rounded-xl border border-zinc-200 bg-white/90 shadow-xl backdrop-blur-md overflow-hidden flex flex-col transition-all ${
                  isDragging ? 'border-blue-400 bg-blue-50/50 ring-2 ring-blue-300' : ''
                }`}
                style={{ maxHeight: '600px' }}
              >
                {/* Chat Messages Container - Full history visible */}
                <div className="flex-1 overflow-y-auto px-4 py-6 space-y-4 min-h-[300px]">
                  {chatMessages.length === 0 ? (
                    <div className="flex items-center justify-center h-full text-zinc-400 text-sm">
                      Start the conversation by clicking "Launch AI Sales Agent"
                    </div>
                  ) : (
                    <>
                      {chatMessages.map((msg, idx) => (
                        <div
                          key={idx}
                          className={`flex ${msg.role === 'agent' ? 'justify-start' : 'justify-end'} animate-fade-in`}
                          style={{ animationDelay: `${idx * 50}ms` }}
                        >
                          <div className={`flex gap-3 max-w-[85%] ${msg.role === 'agent' ? 'flex-row' : 'flex-row-reverse'}`}>
                            {/* Avatar */}
                            <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
                              msg.role === 'agent' 
                                ? 'bg-zinc-900' 
                                : 'bg-blue-600 text-white'
                            }`}>
                              {msg.role === 'agent' ? (
                                // SalesTrigger logo - black circle with white dot (same as header)
                                <div className="w-full h-full rounded-full bg-zinc-900 flex items-center justify-center">
                                  <div className="w-2 h-2 rounded-full bg-white"></div>
                                </div>
                              ) : (
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                                </svg>
                              )}
                            </div>
                            
                            {/* Message Bubble */}
                            <div
                              className={`rounded-2xl px-4 py-3 ${
                                msg.role === 'agent'
                                  ? 'bg-zinc-100 text-zinc-900 rounded-tl-sm'
                                  : 'bg-blue-600 text-white rounded-tr-sm'
                              }`}
                            >
                              <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.text}</p>
                            </div>
                          </div>
                        </div>
                      ))}
                      <div ref={chatMessagesEndRef} />
                    </>
                  )}
                </div>

                {/* Input Area - Fixed at bottom */}
                <div className="border-t border-zinc-200 bg-white/95 p-4">
                  {/* Uploaded Files Preview */}
                  {uploadedFiles.length > 0 && (
                    <div className="mb-3 flex flex-wrap gap-2">
                      {uploadedFiles.map((file, idx) => (
                        <div
                          key={idx}
                          className="flex items-center gap-2 rounded-lg bg-blue-50 px-3 py-1.5 text-sm text-blue-700"
                        >
                          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                          </svg>
                          <span className="max-w-[150px] truncate">{file.name}</span>
                          <button
                            onClick={() => {
                              setUploadedFiles(prev => prev.filter((_, i) => i !== idx));
                            }}
                            className="text-blue-500 hover:text-blue-700"
                          >
                            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="flex items-end gap-3">
                    <div className="flex-1">
                      <Textarea
                        rows={2}
                        value={chatMessages.length === 0 ? input : currentAnswer}
                        onChange={(e) => {
                          if (chatMessages.length === 0) {
                            setInput(e.target.value);
                          } else {
                            setCurrentAnswer(e.target.value);
                          }
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            if (chatMessages.length === 0) {
                              if (input.trim() || uploadedFiles.length > 0) {
                                startGeneration();
                              }
                            } else {
                              if (currentAnswer.trim()) {
                                handleAnswerSubmit();
                              }
                            }
                          }
                        }}
                        placeholder={chatMessages.length === 0 ? "What are you selling? (or upload a pitch deck, presentation, etc.)" : "Type your answer here..."}
                        className="resize-none border-zinc-200 bg-white text-base focus-visible:ring-2 focus-visible:ring-blue-500 rounded-lg"
                      />
                    </div>
            <Button
                      onClick={() => {
                        if (chatMessages.length === 0) {
                          if (input.trim() || uploadedFiles.length > 0) {
                            startGeneration();
                          }
                        } else {
                          handleAnswerSubmit();
                        }
                      }}
                      disabled={chatMessages.length === 0 ? (!input.trim() && uploadedFiles.length === 0) : !currentAnswer.trim()}
                      className="rounded-lg px-6 h-auto py-2.5 bg-zinc-900 text-white hover:bg-zinc-800 font-medium"
              size="lg"
            >
                      {chatMessages.length === 0 ? "Launch" : "Send"}
            </Button>
                  </div>

                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf,.pptx,.docx,.doc,.ppt,.txt"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleFileUpload(file);
                    }}
                  />

                  <div className="mt-4 flex items-center justify-between gap-4">
                    <Button
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isUploading}
                      variant="outline"
                      className="rounded-lg px-4 py-2 border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50 hover:text-zinc-900 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
                    >
                      {isUploading ? (
                        <span className="flex items-center gap-2">
                          <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                          </svg>
                          Uploading...
                        </span>
                      ) : (
                        "Attach"
                      )}
                    </Button>
                    <div className="flex-1" />
                  </div>

                  <div className="mt-3 text-xs text-zinc-400 text-center">
                    Powered by SalesTrigger AI
                  </div>
          </div>
        </div>
      </section>

            {/* Research Animation - Show when user has sent initial message but agent hasn't asked questions yet */}
            {needsMoreInfo && chatMessages.length > 0 && chatMessages.filter(msg => msg.role === 'agent').length === 0 && (
              <div className="mt-6 w-full max-w-3xl mx-auto animate-fade-in">
                <Card className="border-zinc-200 bg-white/80 shadow-lg backdrop-blur-md">
                  <CardContent className="p-6">
                    <div className="flex items-center gap-4">
                      <div className="flex-shrink-0">
                        <div className="w-12 h-12 rounded-full bg-blue-50 flex items-center justify-center animate-pulse-slow">
                          <svg className="w-6 h-6 text-blue-600 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                          </svg>
                        </div>
                      </div>
                      <div className="flex-1">
                        <h4 className="text-sm font-semibold text-zinc-900 mb-1">Researching your product and market</h4>
                        <p className="text-xs text-zinc-600">Analyzing your input to understand your product and identify key insights...</p>
                      </div>
                    </div>
                    
                    {/* Animated dots */}
                    <div className="mt-4 flex items-center gap-2">
                      <div className="flex gap-1.5">
                        <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" style={{ animationDelay: '0s' }}></div>
                        <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" style={{ animationDelay: '0.2s' }}></div>
                        <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" style={{ animationDelay: '0.4s' }}></div>
                      </div>
                      <span className="text-xs text-zinc-500 ml-2">Processing...</span>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}
          </div>
        )}

        {/* Questions UI */}
        {askingQuestions && step === 0 && (
          <div className="flex flex-col items-center justify-center py-12">
            <div className="w-full max-w-2xl">
              <Card className="border-zinc-200 bg-white/90 shadow-lg backdrop-blur-md">
                <CardContent className="p-8">
                  <div className="mb-6">
                    <h3 className="text-lg font-semibold text-zinc-900 mb-2">
                      {questions[currentQuestionIndex]}
                    </h3>
                    <p className="text-sm text-zinc-500">
                      Question {currentQuestionIndex + 1} of {questions.length}
                    </p>
                  </div>
                  <Textarea
                    rows={4}
                    value={answers[currentQuestionIndex] || ""}
                    onChange={(e) => {
                      setAnswers(prev => ({
                        ...prev,
                        [currentQuestionIndex]: e.target.value
                      }));
                    }}
                    placeholder="Type your answer here..."
                    className="resize-none border-zinc-200 bg-white/70 text-base focus-visible:ring-0 mb-4"
                  />
                  <div className="flex items-center justify-between">
                    {currentQuestionIndex > 0 && (
                      <Button
                        variant="outline"
                        onClick={() => setCurrentQuestionIndex(prev => prev - 1)}
                      >
                        Previous
                      </Button>
                    )}
                    <div className="flex-1" />
                    {currentQuestionIndex < questions.length - 1 ? (
                      <Button
                        onClick={() => setCurrentQuestionIndex(prev => prev + 1)}
                        disabled={!answers[currentQuestionIndex]}
                      >
                        Next
                      </Button>
                    ) : (
                      <Button
                        onClick={() => startGeneration()}
                        disabled={!answers[currentQuestionIndex]}
                      >
                        Start Generation
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        )}

        {/* ACTIVE SCENE - Agent working */}
        {step > 0 && !(step === 1 && needsMoreInfo) && (
          <div className="flex flex-col" style={{ minHeight: 'calc(90vh - 80px)' }}>
            {/* Progress Section - Always visible */}
            <div className="mb-6 rounded-2xl border border-zinc-200 bg-white/70 p-4 shadow-sm backdrop-blur">
            <div className="flex items-center justify-between mb-4">
              <div className="flex flex-wrap items-center gap-2 flex-1">
                {steps.map((s, idx) => {
                const active = step === s.id;
                const done = step > s.id;
                  const isVisible = step >= s.id;
                return (
                  <div
                    key={s.id}
                    className={[
                        "rounded-full px-3 py-1.5 text-xs transition-all duration-500 flex items-center gap-2",
                        !isVisible ? "opacity-0 scale-0" : "animate-step-appear",
                      done
                          ? "bg-zinc-900 text-white animate-step-complete"
                        : active
                          ? "bg-white text-zinc-900 ring-2 ring-blue-500/30 shadow-lg animate-step-active"
                          : "bg-zinc-100 text-zinc-600 opacity-60",
                    ].join(" ")}
                      style={{ 
                        animationDelay: `${idx * 150}ms`,
                        animationFillMode: 'both'
                      }}
                  >
                      {active && !done && (
                        <span className="inline-block w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse-dot" />
                      )}
                    {done ? "✓ " : ""}
                    {s.label}
                  </div>
                );
              })}
            </div>
              {!chatExpanded && step > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-full ml-4"
                  onClick={() => setChatExpanded(true)}
                >
                  Expand Chat
                </Button>
              )}
            </div>
              <div className="mt-4">
                <Progress value={currentProgressValue} className="transition-all duration-500 ease-out" />
                <p className="mt-3 text-sm text-zinc-500 animate-fade-in">
                  Step {Math.max(step, 1)}/4 — {steps[Math.max(step - 1, 0)]?.label || "Preparing your AI Sales Agent"}
              </p>
            </div>
          </div>

          {/* Chat Input - Expandable */}
          {chatExpanded && step > 0 && (
            <section className="mb-6 w-full max-w-3xl mx-auto">
              <div className="w-full rounded-xl border border-zinc-200 bg-white/75 p-4 shadow-xl backdrop-blur-md">
                <Textarea
                  rows={4}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      if (input && !loading) {
                        checkAndAskQuestions();
                      }
                    }
                  }}
                  placeholder="What are you selling?"
                  className="resize-none border-zinc-200 bg-white/70 text-base focus-visible:ring-0"
                />
                <div className="mt-3 flex items-center justify-between">
                  <div className="text-xs text-zinc-500">
                    Powered by SalesTrigger AI
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="rounded-lg"
                      onClick={() => setChatExpanded(false)}
                    >
                      Close
                    </Button>
                    <Button
                      size="lg"
                      className="rounded-xl px-6"
                      onClick={() => checkAndAskQuestions()}
                      disabled={!input || loading}
                    >
                      Launch AI Sales Agent
                    </Button>
                  </div>
            </div>
          </div>
        </section>
      )}

            {/* Content Area - Replaces based on step */}
            <div className="flex-1 flex flex-col">
              {/* Product Insights - Show after Step 1 and remain visible on all subsequent steps */}
              {step >= 1 && !needsMoreInfo && (productUTPs.length > 0 || productMetrics.length > 0) && (
                <div className="mb-6 animate-fade-in-up">
                  <div className="w-full max-w-4xl mx-auto">
                    <Card className="border-zinc-200 bg-white/90 shadow-lg backdrop-blur-md">
                      <CardContent className="p-6">
                        <div className="mb-4">
                          <h3 className="text-lg font-semibold text-zinc-900 mb-1">
                            Key product insights we found
                          </h3>
                          <p className="text-sm text-zinc-600">
                            These will be used in your outreach messages
                          </p>
                        </div>
                        <div className="grid gap-4 md:grid-cols-2">
                          {productUTPs.length > 0 && (
                            <div>
                              <h4 className="text-sm font-semibold text-zinc-700 mb-2">Unique Selling Points</h4>
                              <div className="space-y-2">
                                {productUTPs.map((utp, idx) => (
                                  <div key={idx} className="flex items-start gap-2 p-2 rounded-lg bg-blue-50/50 border border-blue-100 animate-fade-in" style={{ animationDelay: `${idx * 100}ms` }}>
                                    <div className="w-5 h-5 rounded-full bg-blue-500 flex items-center justify-center flex-shrink-0 mt-0.5">
                                      <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                      </svg>
                                    </div>
                                    <span className="text-sm text-zinc-800">{utp}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                          {productMetrics.length > 0 && (
                            <div>
                              <h4 className="text-sm font-semibold text-zinc-700 mb-2">Key Metrics</h4>
                              <div className="space-y-2">
                                {productMetrics.map((metric, idx) => (
                                  <div key={idx} className="flex items-start gap-2 p-2 rounded-lg bg-green-50/50 border border-green-100 animate-fade-in" style={{ animationDelay: `${(productUTPs.length + idx) * 100}ms` }}>
                                    <div className="w-5 h-5 rounded-full bg-green-500 flex items-center justify-center flex-shrink-0 mt-0.5">
                                      <span className="text-xs text-white font-bold">#</span>
                                    </div>
                                    <span className="text-sm text-zinc-800 font-medium">{metric}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </CardContent>
                    </Card>
            </div>
          </div>
        )}

              {/* Step 2: Agent Preview Panel - Only show if NOT asking questions */}
              {step === 2 && !needsMoreInfo && (
                <div className="flex-1 flex items-center justify-center">
                  <AgentPreview step={step} input={input} completedItems={completedAnalysisItems} />
                </div>
              )}

              {/* Step 3: First message preview - Show while typing */}
              {step >= 3 && step < 4 && apiData && wowSegmentName && (
                <div className="flex-1 flex items-center justify-center">
                  <div className="w-full max-w-2xl animate-fade-in-up">
                    <div className="mb-4 text-center">
                      <p className="text-sm font-medium text-zinc-600">
                        This is how your agent will start the conversation.
                      </p>
                    </div>
                    <Card className="border-zinc-200 bg-white/95 shadow-2xl backdrop-blur-md">
                      <CardContent className="p-8">
                        <div className="mb-6 flex items-center gap-3">
                          <span className="text-2xl">{segmentEmoji(wowSegmentName)}</span>
                          <h3 className="text-lg font-semibold text-zinc-900">{wowSegmentName}</h3>
                        </div>
                        <div className="mb-6 rounded-xl border border-zinc-200 bg-gradient-to-br from-zinc-50 to-white p-6 shadow-sm">
                          <pre className="whitespace-pre-wrap text-base leading-relaxed text-zinc-800 font-medium">
                            {wowText || "..."}
                          </pre>
                        </div>
                        <div className="flex items-center justify-center">
                          <Button
                            variant="outline"
                            size="sm"
                            className="rounded-full"
                            onClick={copyMessage}
                            disabled={!wowText}
                          >
                            📋 Copy message
                          </Button>
                    </div>
                      </CardContent>
                    </Card>
            </div>
          </div>
        )}

              {/* Step 4: Full agent ready - Metrics + First Message + Segment */}
              {step >= 4 && apiData && firstMessageComplete && (
                <div className="flex-1 flex flex-col gap-6">
                  {/* Metrics - Payoff moment */}
                  <div className="animate-fade-in-up">
                    <Card className="border-zinc-200 bg-white/90 shadow-xl backdrop-blur-md">
                      <CardContent className="p-6">
                        <div className="mb-4 text-center">
                          <h3 className="text-lg font-semibold text-zinc-900">
                            What one LinkedIn account typically generates
                      </h3>
                        </div>
                        <div className="grid grid-cols-2 gap-6 md:grid-cols-4">
                          <div className="text-center">
                            <div className="text-2xl font-semibold text-zinc-900">1</div>
                            <div className="mt-1 text-xs text-zinc-500">LinkedIn accounts</div>
                          </div>
                          <Metric 
                            label="Dialogs / month" 
                            value={metricValues.dialogs} 
                            highlight={true}
                          />
                          <Metric 
                            label="Sales calls / month" 
                            value={metricValues.calls} 
                          />
                          <Metric 
                            label="Deals / month" 
                            value={metricValues.deals} 
                          />
                        </div>
                  </CardContent>
                </Card>
                    </div>

                  {/* First Message - Keep it visible */}
                  {wowText && wowSegmentName && (
                    <div className="animate-fade-in-up">
                      <Card className="border-zinc-200 bg-white/95 shadow-lg backdrop-blur-md">
                        <CardContent className="p-6">
                          <div className="mb-4 flex items-center gap-3">
                            <span className="text-xl">{segmentEmoji(wowSegmentName)}</span>
                            <h3 className="text-base font-semibold text-zinc-900">{wowSegmentName}</h3>
                            <span className="ml-auto text-xs text-zinc-500">Opening message</span>
                          </div>
                          <div className="mb-4 rounded-lg border border-zinc-200 bg-gradient-to-br from-zinc-50 to-white p-4 shadow-sm">
                            <pre className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-800">
                              {wowText}
                            </pre>
                          </div>
                          <div className="flex items-center justify-center">
                            <Button
                              variant="outline"
                              size="sm"
                              className="rounded-full"
                              onClick={copyMessage}
                            >
                              📋 Copy message
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    </div>
                  )}

                  {/* Segment Switcher with Filters */}
                  {apiData.segments.length > 0 && (
                    <div className="space-y-4">
                      {/* Segment tabs */}
                      {apiData.segments.length > 1 && (
                        <div className="flex justify-center gap-2">
                          {apiData.segments.map((seg: any, i: number) => (
                            <button
                              key={i}
                              onClick={() => setSelectedSegmentIndex(i)}
                              className={[
                                "rounded-full px-4 py-2 text-sm font-medium transition-all",
                                selectedSegmentIndex === i
                                  ? "bg-zinc-900 text-white shadow-md"
                                  : "bg-white/70 text-zinc-600 hover:bg-white/90"
                              ].join(" ")}
                            >
                              {segmentEmoji(seg.name)} {seg.name}
                            </button>
                          ))}
                        </div>
                      )}

                      {/* Filter input for current segment - always visible */}
                      {typed[selectedSegmentIndex] && (
                        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl p-4 border border-blue-200 shadow-sm">
                          <div className="flex items-center gap-2 mb-2">
                            <span className="text-lg">{segmentEmoji(apiData.segments[selectedSegmentIndex]?.name)}</span>
                            <span className="font-semibold text-zinc-800">
                              {apiData.segments[selectedSegmentIndex]?.name || "Segment"} — Search Filters
                            </span>
                            <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
                              Segment {selectedSegmentIndex + 1} of {apiData.segments.length}
                            </span>
                          </div>
                          <input
                            type="text"
                            value={typed[selectedSegmentIndex]?.filters || ""}
                            onChange={(e) => {
                              const val = e.target.value;
                              setTyped((prev) => {
                                const next = [...prev];
                                if (next[selectedSegmentIndex]) {
                                  next[selectedSegmentIndex] = { ...next[selectedSegmentIndex], filters: val };
                                }
                                return next;
                              });
                            }}
                            placeholder="e.g. CEO, CTO, Head of Sales, VP Engineering, Founder"
                            className="w-full rounded-lg border border-blue-300 bg-white px-4 py-3 text-sm text-zinc-800 placeholder:text-zinc-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 shadow-sm"
                          />
                          <p className="mt-2 text-xs text-zinc-600">
                            🎯 Enter job titles and keywords to find leads for this segment (comma-separated). Each segment searches for different people.
                          </p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Active Segment - Chat Interface */}
                  {currentSegment && currentTyped && (
                    <div className="flex-1 animate-fade-in">
                      <Card className="border-zinc-200 bg-white/90 shadow-lg backdrop-blur h-full flex flex-col">
                        <CardContent className="p-6 flex-1 flex flex-col">
                          {/* Segment Header */}
                          <div className="mb-4 flex items-center justify-between border-b border-zinc-100 pb-4">
                            <h3 className="flex items-center gap-2 text-lg font-semibold text-zinc-900">
                              <span className="text-xl">{segmentEmoji(currentSegment.name)}</span>
                              {currentSegment.name}
                      </h3>
                            <Badge variant="secondary" className="bg-zinc-100 text-zinc-700">Segment</Badge>
      </div>

                          {/* Personalization hint */}
                          {currentTyped.personalization && (
                            <div className="mb-4 rounded-lg border border-zinc-200 bg-zinc-50/50 p-2 text-xs">
                              <span className="font-medium text-zinc-700">💡 Personalization: </span>
                              <span className="text-zinc-600">{currentTyped.personalization.substring(0, 150)}{currentTyped.personalization.length > 150 ? '...' : ''}</span>
                            </div>
                          )}

                          {/* Chat Messages - Only one active at a time */}
                          <div className="flex-1 overflow-y-auto space-y-4 mb-6">
                            {currentTyped.messages.map((message, idx) => {
                              const isActive = idx === activeMessageIndex;
                              const isPast = idx < activeMessageIndex;
                              const isFuture = idx > activeMessageIndex;
                              
                              if (isFuture && !message) return null;
                              
                              return (
                                <div
                                  key={idx}
                                  className={[
                                    "transition-all duration-500",
                                    isActive ? "opacity-100 scale-100" : isPast ? "opacity-60 scale-95" : "opacity-30 scale-90"
                                  ].join(" ")}
                                >
                                  <div className="flex items-start gap-3">
                                    <div className="mt-1 h-8 w-8 flex-shrink-0 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-white text-xs font-semibold">
                                      AI
                                    </div>
                                    <div className="flex-1">
                                      <div className="mb-1 flex items-center gap-2">
                                        <span className="text-xs font-semibold text-zinc-900">AI Sales Agent</span>
                                        <span className="text-xs text-zinc-400">•</span>
                                        <span className="text-xs text-zinc-400">
                                          {idx === 0 ? "Now" : idx === 1 ? "2 days later" : idx === 2 ? "5 days later" : "10 days later"}
                                        </span>
                                      </div>
                                      <div className="rounded-lg bg-zinc-50 p-4 border border-zinc-200">
                                        <div className="mb-2">
                                          <Badge variant="secondary" className="bg-blue-50 text-blue-700 text-xs border-blue-200">
                                            {messageLabels[idx] || `Step ${idx + 1}`}
                                          </Badge>
                                        </div>
                                        <pre className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-800">
                                          {message || "..."}
                                        </pre>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                    </div>

                          {/* CTA — save to MinIO on click (~200–600 ms), then open auth modal */}
                          <Button 
                            className="w-full rounded-full !bg-zinc-900 !text-white hover:!bg-zinc-800 disabled:opacity-70"
                            style={{ backgroundColor: '#18181b', color: '#ffffff' }}
                            onClick={handleLaunchOutreach}
                            disabled={launchSaving}
                          >
                            {launchSaving ? (
                              <>
                                <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent mr-2" />
                                Preparing…
                              </>
                            ) : (
                              <>🚀 Launch outreach for this segment</>
                            )}
                          </Button>
                  </CardContent>
                </Card>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* CSS Animations */}
      <style jsx global>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(6px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes stepActive {
          0%, 100% {
            box-shadow: 0 0 0 0 rgba(59, 130, 246, 0.4);
            transform: scale(1);
          }
          50% {
            box-shadow: 0 0 0 4px rgba(59, 130, 246, 0);
            transform: scale(1.02);
          }
        }
        @keyframes stepComplete {
          from {
            opacity: 0.6;
            transform: scale(0.95) translateY(-2px);
          }
          to {
            opacity: 1;
            transform: scale(1) translateY(0);
          }
        }
        @keyframes pulseDot {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(0.8); }
        }
        @keyframes stepAppear {
          from { opacity: 0; transform: translateY(-10px) scale(0.9); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes pulseSlow {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.7; }
        }
        @keyframes progressBar {
          from { width: 0%; }
          to { width: 75%; }
        }
        @keyframes analysisLine {
          from {
            opacity: 0;
            transform: translateX(-10px);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }
        .animate-fade-in {
          animation: fadeIn 420ms ease-out both;
        }
        .animate-fade-in-up {
          animation: fadeInUp 600ms ease-out both;
        }
        .animate-step-active {
          animation: stepActive 2s ease-in-out infinite;
        }
        .animate-step-complete {
          animation: stepComplete 400ms ease-out both;
        }
        .animate-pulse-dot {
          animation: pulseDot 1.5s ease-in-out infinite;
        }
        .animate-step-appear {
          animation: stepAppear 400ms ease-out both;
        }
        .animate-pulse-slow {
          animation: pulseSlow 2s ease-in-out infinite;
        }
        .animate-progress-bar {
          animation: progressBar 2s ease-out forwards;
        }
        .animate-analysis-line {
          animation: analysisLine 0.5s ease-out both;
        }
        .animate-check-complete {
          animation: checkComplete 0.6s ease-out both;
        }
        .animate-check-mark {
          animation: checkMark 0.4s ease-out both;
        }
        .animate-item-active {
          animation: itemActive 1.5s ease-in-out infinite;
        }
        .animate-spin-fast {
          animation: spinFast 0.8s linear infinite;
        }
      `}</style>
      {/* Auth Modal */}
      {showAuthModal && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
          onClick={() => setShowAuthModal(false)}
        >
          <div 
            className="relative w-full max-w-md rounded-2xl bg-white p-8 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close button */}
            <button
              onClick={() => setShowAuthModal(false)}
              className="absolute right-4 top-4 text-zinc-400 hover:text-zinc-600 transition-colors"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>

            {/* Header */}
            <div className="mb-6">
              <h2 className="text-2xl font-bold text-zinc-900">Get Started</h2>
              <p className="mt-2 text-sm text-zinc-600">Sign in to launch your AI Sales Agent</p>
            </div>

            {/* Google Sign In */}
            <Button
              className="w-full rounded-lg border border-zinc-200 bg-white text-zinc-900 hover:bg-zinc-50 mb-4"
              onClick={() => window.open('https://outreach.salestrigger.io/signup', '_blank')}
            >
              <svg className="mr-2 h-5 w-5" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              Sign in with Google
            </Button>

            {/* Divider */}
            <div className="relative my-6">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-zinc-200"></div>
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="bg-white px-4 text-zinc-500">Or continue with email</span>
              </div>
            </div>

            {/* Email Form */}
            <form 
              onSubmit={(e) => {
                e.preventDefault();
                window.open('https://outreach.salestrigger.io/signup', '_blank');
              }}
              className="space-y-4"
            >
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-zinc-700 mb-1">
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  value={authEmail}
                  onChange={(e) => setAuthEmail(e.target.value)}
                  className="w-full rounded-lg border border-zinc-300 px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  placeholder="you@example.com"
                  required
                />
              </div>

              <div>
                <label htmlFor="password" className="block text-sm font-medium text-zinc-700 mb-1">
                  Password
                </label>
                <input
                  id="password"
                  type="password"
                  value={authPassword}
                  onChange={(e) => setAuthPassword(e.target.value)}
                  className="w-full rounded-lg border border-zinc-300 px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  placeholder="Minimum 8 characters"
                  minLength={8}
                  required
                />
                <p className="mt-1 text-xs text-zinc-500">Minimum 8 characters</p>
              </div>

              <div className="flex items-start gap-2">
                <input
                  id="terms"
                  type="checkbox"
                  checked={authAgreed}
                  onChange={(e) => setAuthAgreed(e.target.checked)}
                  className="mt-1 h-4 w-4 rounded border-zinc-300 text-blue-600 focus:ring-blue-500"
                  required
                />
                <label htmlFor="terms" className="text-sm text-zinc-600">
                  I agree to the <a href="https://outreach.salestrigger.io" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">Terms & Conditions</a>. By signing up for a SalesTrigger account, you agree to our <a href="https://outreach.salestrigger.io" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">Privacy Policy</a> and <a href="https://outreach.salestrigger.io" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">Terms of Service</a>
                </label>
              </div>

              <Button
                type="submit"
                className="w-full rounded-lg !bg-zinc-900 !text-white hover:!bg-zinc-800"
                style={{ backgroundColor: '#18181b', color: '#ffffff' }}
                disabled={!authAgreed}
              >
                Continue
              </Button>
            </form>

            {/* Sign in link */}
            <div className="mt-6 text-center text-sm text-zinc-600">
              Already have an account?{' '}
              <a 
                href="https://outreach.salestrigger.io" 
                target="_blank" 
                rel="noopener noreferrer"
                className="font-medium text-blue-600 hover:underline"
              >
                Sign in
              </a>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

/* ===================== UI HELPERS ===================== */

function isUrl(input: string): boolean {
  try {
    let url = input.trim();
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = 'https://' + url;
    }
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

function hasEnoughInfo(input: string): boolean {
  // Check if input has enough information for generation
  // For short descriptions, we always ask questions to get more details
  const trimmed = input.trim();
  if (isUrl(trimmed)) return true;
  const wordCount = trimmed.split(/\s+/).filter(word => word.length > 0).length;
  // If less than 15 words, always ask questions (too little info for good outreach)
  if (wordCount < 15) return false;
  // If 15-30 words, still ask questions unless it's very detailed (>= 250 chars)
  if (wordCount < 30) {
    return trimmed.length >= 250;
  }
  // 30+ words is generally enough
  return true;
}

function AgentPreview({ step, input, completedItems = 0 }: { step: number; input: string; completedItems?: number }) {
  if (step === 1) {
    const analysisItems = [
      "Understanding your product",
      "Researching your market",
      "Extracting key insights",
      "Identifying market opportunities",
    ];

  return (
      <div className="w-full max-w-2xl animate-fade-in-up">
        <Card className="border-zinc-200 bg-white/90 shadow-lg backdrop-blur-md">
          <CardContent className="p-8">
            <div className="text-center mb-6">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-blue-50 mb-4 animate-pulse-slow">
                <svg className="w-8 h-8 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-zinc-900 mb-2">Agent is understanding your product & market</h3>
              <p className="text-sm text-zinc-600">Understanding your product and researching your market</p>
            </div>

            <div className="space-y-3">
              {analysisItems.map((item, index) => {
                const isCompleted = completedItems > index;
                const isActive = completedItems === index;
                return (
                  <div
                    key={index}
                    className={[
                      "flex items-center gap-3 p-4 rounded-lg border-2 transition-all duration-500",
                      isCompleted 
                        ? "bg-green-50 border-green-200 shadow-sm animate-check-complete" 
                        : isActive
                        ? "bg-blue-50 border-blue-300 shadow-md animate-item-active"
                        : "bg-zinc-50 border-zinc-200"
                    ].join(" ")}
                    style={{
                      animationDelay: `${index * 0.1}s`,
                    }}
                  >
                    {isCompleted ? (
                      <div className="w-6 h-6 rounded-full bg-green-500 flex items-center justify-center flex-shrink-0 animate-check-mark">
                        <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      </div>
                    ) : isActive ? (
                      <div className="w-6 h-6 rounded-full bg-blue-500 flex items-center justify-center flex-shrink-0">
                        <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      </div>
                    ) : (
                      <div className="w-6 h-6 rounded-full bg-zinc-300 flex-shrink-0" />
                    )}
                    <span className={[
                      "text-sm font-medium transition-colors duration-300",
                      isCompleted ? "text-green-700" : isActive ? "text-blue-700" : "text-zinc-600"
                    ].join(" ")}>
                      {item}
                    </span>
                  </div>
                );
              })}
            </div>
      </CardContent>
    </Card>
      </div>
  );
}

  if (step === 2) {
  return (
      <div className="w-full max-w-2xl animate-fade-in-up">
        <Card className="border-zinc-200 bg-white/90 shadow-lg backdrop-blur-md">
          <CardContent className="p-8">
            <div className="text-center mb-6">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-blue-50 mb-4">
                <svg className="w-8 h-8 text-blue-600 animate-pulse-slow" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-zinc-900 mb-2">Agent is choosing who to talk to</h3>
              <p className="text-sm text-zinc-600">Building LinkedIn filters to find the right prospects</p>
            </div>
            <div className="space-y-3">
              <div className="p-4 rounded-lg bg-zinc-50 border border-zinc-200">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-zinc-900">LinkedIn Filters</span>
                  <div className="w-16 h-2 bg-zinc-200 rounded-full overflow-hidden">
                    <div className="h-full bg-blue-500 rounded-full animate-progress-bar" style={{ width: '75%' }} />
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 mt-3">
                  <span className="px-3 py-1 bg-white border border-zinc-300 rounded-full text-xs text-zinc-700">Job Title</span>
                  <span className="px-3 py-1 bg-white border border-zinc-300 rounded-full text-xs text-zinc-700">Company Size</span>
                  <span className="px-3 py-1 bg-blue-50 border border-blue-200 rounded-full text-xs text-blue-700 animate-fade-in">Industry</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (step === 3) {
  return (
      <div className="w-full max-w-2xl animate-fade-in-up">
        <Card className="border-zinc-200 bg-white/90 shadow-lg backdrop-blur-md">
          <CardContent className="p-8">
            <div className="text-center mb-6">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-blue-50 mb-4">
                <svg className="w-8 h-8 text-blue-600 animate-pulse-slow" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-zinc-900 mb-2">Agent is writing outreach messages</h3>
              <p className="text-sm text-zinc-600">Crafting personalized LinkedIn messages for each segment</p>
            </div>
            <div className="space-y-4">
              <div className="rounded-lg border border-zinc-200 bg-white p-4">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-white text-xs font-semibold flex-shrink-0">
                    AI
                  </div>
                  <div className="flex-1">
                    <div className="mb-2 flex items-center gap-2">
                      <span className="text-xs font-semibold text-zinc-900">AI Sales Agent</span>
                      <span className="text-xs text-zinc-400">•</span>
                      <span className="text-xs text-zinc-400">Writing...</span>
                    </div>
                    <div className="space-y-2">
                      <div className="h-3 bg-zinc-200 rounded animate-pulse" style={{ width: '85%' }} />
                      <div className="h-3 bg-zinc-200 rounded animate-pulse" style={{ width: '92%', animationDelay: '0.1s' }} />
                      <div className="h-3 bg-zinc-200 rounded animate-pulse" style={{ width: '78%', animationDelay: '0.2s' }} />
                      <div className="h-3 bg-zinc-200 rounded animate-pulse" style={{ width: '65%', animationDelay: '0.3s' }} />
                    </div>
                  </div>
                </div>
              </div>
            </div>
      </CardContent>
    </Card>
      </div>
  );
}

  return null;
}

function Metric({ label, value, highlight = false }: { label: string; value: number; highlight?: boolean }) {
  return (
    <div className={`text-center ${highlight ? 'md:scale-105' : ''}`}>
      <div className={`text-3xl font-bold text-zinc-900 ${highlight ? 'text-blue-600' : ''}`}>
        {value.toLocaleString()}
      </div>
      <div className={`mt-1 text-xs ${highlight ? 'font-medium text-zinc-700' : 'text-zinc-500'}`}>
        {label}
      </div>
    </div>
  );
}

function segmentEmoji(name: string) {
  const emojis = ["🎯", "🚀", "📈", "🧠", "👥", "💼", "🛠", "📊"];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return emojis[Math.abs(hash) % emojis.length];
}

