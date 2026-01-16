/**
 * VoiceDemoInterface Component
 *
 * Main interface component for voice survey demos with 3-column layout:
 * - Left: Demo Controls (scenario, language, voice, call controls)
 * - Center: Real-Time Transcription
 * - Right: Collected Data & Text Analytics
 * 
 * Uses Socket.IO proxy to Bedrock for voice streaming.
 */

'use client';

import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { useSocketIOVoiceChat, Transcript, SurveyAnswer, RecordedResponse as HookRecordedResponse, NLPAnalysisResult as HookNLPAnalysisResult } from '@/hooks/useSocketIOVoiceChat';
import { useMicrophonePermission } from '@/hooks/useMicrophonePermission';
import { MicrophonePermissionBanner } from './MicrophonePermissionPrompt';
import Icon from '@/components/ui/AppIcon';
import type { NLPAnalysisResult } from '@/types/nlp';

export enum DemoState {
  IDLE = 'idle',
  CONNECTING = 'connecting',
  ACTIVE = 'active',
  COMPLETED = 'completed',
  ERROR = 'error',
}

// Demo scenario mapping to JSON files
interface DemoScenario {
  id: string;
  jsonFile: string;
}

// Map demo IDs to their JSON files (titles/descriptions come from translations)
const DEMO_SCENARIOS: DemoScenario[] = [
  {
    id: 'demo-01a-electronics-retail-personalized',
    jsonFile: '/demo1_csat_nps_electronics_retailer.json',
  },
  {
    id: 'demo-02-concept-test',
    jsonFile: '/demo2_concept_test.json',
  },
  {
    id: 'demo-03-political-polling',
    jsonFile: '/demo3_political_polling.json',
  },
  {
    id: 'demo-04-brand-tracker',
    jsonFile: '/demo4_brand_tracker.json',
  },
  {
    id: 'demo-01b-ecommerce-delivery-personalized',
    jsonFile: '/demo_5_csat_nps_ecommerce_delivery.json',
  },
  {
    id: 'demo-01c-automotive-service-personalized',
    jsonFile: '/demo_6_csat_nps_automotive_service.json',
  },
];

interface Language {
  code: string;
  name: string;
  flag: string;
  voices: VoiceOption[];
}

interface VoiceOption {
  id: string;
  name: string;
  gender: 'male' | 'female';
  accent: string;
}

interface AnalyticsData {
  sentiment: { positive: number; neutral: number; negative: number };
  keywords: string[];
  conversationFlow: string[];
  qualityScore: number;
}

interface CollectedData {
  sessionId: string;
  startTime: string;
  endTime?: string;
  scenario: string;
  language: string;
  voiceId: string;
  responses: Record<string, unknown>;
  transcriptCount: number;
}

interface RecordedResponse {
  qid: string;
  question: string;
  answer: string;
  nlpAnalysis?: NLPAnalysisResult;
}

export interface VoiceDemoInterfaceProps {
  questionnaireId: string;
  voiceId: string;
  userId?: string;
  onDemoStarted?: () => void;
  onDemoCompleted?: () => void;
  onDemoError?: (error: Error) => void;
  onReturnToSelection?: () => void;
  className?: string;
}

// All 30 Gemini Live HD voices
const ALL_GEMINI_VOICES: VoiceOption[] = [
  // Female voices
  { id: 'Aoede', name: 'Aoede', gender: 'female', accent: 'Warm & Friendly' },
  { id: 'Kore', name: 'Kore', gender: 'female', accent: 'Firm & Professional' },
  { id: 'Leda', name: 'Leda', gender: 'female', accent: 'Calm & Soothing' },
  { id: 'Zephyr', name: 'Zephyr', gender: 'female', accent: 'Light & Airy' },
  { id: 'Achernar', name: 'Achernar', gender: 'female', accent: 'Clear & Bright' },
  { id: 'Autonoe', name: 'Autonoe', gender: 'female', accent: 'Gentle & Soft' },
  { id: 'Callirrhoe', name: 'Callirrhoe', gender: 'female', accent: 'Melodic' },
  { id: 'Gacrux', name: 'Gacrux', gender: 'female', accent: 'Expressive' },
  { id: 'Sulafat', name: 'Sulafat', gender: 'female', accent: 'Warm' },
  { id: 'Vindemiatrix', name: 'Vindemiatrix', gender: 'female', accent: 'Elegant' },
  // Male voices
  { id: 'Charon', name: 'Charon', gender: 'male', accent: 'Informative & Clear' },
  { id: 'Puck', name: 'Puck', gender: 'male', accent: 'Upbeat & Energetic' },
  { id: 'Fenrir', name: 'Fenrir', gender: 'male', accent: 'Excitable & Dynamic' },
  { id: 'Orbit', name: 'Orbit', gender: 'male', accent: 'Easygoing & Relaxed' },
  { id: 'Orus', name: 'Orus', gender: 'male', accent: 'Deep & Resonant' },
  { id: 'Achird', name: 'Achird', gender: 'male', accent: 'Neutral' },
  { id: 'Algenib', name: 'Algenib', gender: 'male', accent: 'Confident' },
  { id: 'Algieba', name: 'Algieba', gender: 'male', accent: 'Warm' },
  { id: 'Alnilam', name: 'Alnilam', gender: 'male', accent: 'Strong' },
  { id: 'Enceladus', name: 'Enceladus', gender: 'male', accent: 'Smooth' },
  { id: 'Iapetus', name: 'Iapetus', gender: 'male', accent: 'Steady' },
  { id: 'Umbriel', name: 'Umbriel', gender: 'male', accent: 'Calm' },
  { id: 'Rasalgethi', name: 'Rasalgethi', gender: 'male', accent: 'Rich' },
  { id: 'Sadachbia', name: 'Sadachbia', gender: 'male', accent: 'Friendly' },
  { id: 'Sadaltager', name: 'Sadaltager', gender: 'male', accent: 'Professional' },
  { id: 'Schedar', name: 'Schedar', gender: 'male', accent: 'Authoritative' },
  { id: 'Zubenelgenubi', name: 'Zubenelgenubi', gender: 'male', accent: 'Distinctive' },
];

// Languages supported by Gemini Live API (official BCP-47 codes)
const LANGUAGES: Language[] = [
  {
    code: 'en-US',
    name: 'English (US)',
    flag: 'u🇸',
    voices: ALL_GEMINI_VOICES,
  },
  {
    code: 'en-IN',
    name: 'English (India)',
    flag: 'us',
    voices: ALL_GEMINI_VOICES,
  },
  {
    code: 'tr-TR',
    name: 'Turkish',
    flag: '🇹🇷',
    voices: ALL_GEMINI_VOICES,
  },
  {
    code: 'es-US',
    name: 'Spanish',
    flag: 'es',
    voices: ALL_GEMINI_VOICES,
  },
  {
    code: 'fr-FR',
    name: 'French',
    flag: '🇫🇷',
    voices: ALL_GEMINI_VOICES,
  },
  {
    code: 'de-DE',
    name: 'German',
    flag: '��',
    voices: ALL_GEMINI_VOICES,
  },
  {
    code: 'pt-BR',
    name: 'Portuguese (Brazil)',
    flag: '🇧🇷',
    voices: ALL_GEMINI_VOICES,
  },
  {
    code: 'hi-IN',
    name: 'Hindi',
    flag: '🇮🇳',
    voices: ALL_GEMINI_VOICES,
  },
  {
    code: 'ar-EG',
    name: 'Arabic (Egyptian)',
    flag: '🇪🇬',
    voices: ALL_GEMINI_VOICES,
  },
  {
    code: 'bn-BD',
    name: 'Bengali',
    flag: '🇧🇩',
    voices: ALL_GEMINI_VOICES,
  },
  {
    code: 'nl-NL',
    name: 'Dutch',
    flag: '🇳🇱',
    voices: ALL_GEMINI_VOICES,
  },
  {
    code: 'id-ID',
    name: 'Indonesian',
    flag: '🇮🇩',
    voices: ALL_GEMINI_VOICES,
  },
  {
    code: 'it-IT',
    name: 'Italian',
    flag: '🇮🇹',
    voices: ALL_GEMINI_VOICES,
  },
  {
    code: 'ja-JP',
    name: 'Japanese',
    flag: '🇯🇵',
    voices: ALL_GEMINI_VOICES,
  },
  {
    code: 'ko-KR',
    name: 'Korean',
    flag: '🇰🇷',
    voices: ALL_GEMINI_VOICES,
  },
  {
    code: 'mr-IN',
    name: 'Marathi',
    flag: '🇮🇳',
    voices: ALL_GEMINI_VOICES,
  },
  {
    code: 'pl-PL',
    name: 'Polish',
    flag: '🇵🇱',
    voices: ALL_GEMINI_VOICES,
  },
  {
    code: 'ro-RO',
    name: 'Romanian',
    flag: '🇷🇴',
    voices: ALL_GEMINI_VOICES,
  },
  {
    code: 'ru-RU',
    name: 'Russian',
    flag: '🇷🇺',
    voices: ALL_GEMINI_VOICES,
  },
  {
    code: 'ta-IN',
    name: 'Tamil',
    flag: '🇮🇳',
    voices: ALL_GEMINI_VOICES,
  },
  {
    code: 'te-IN',
    name: 'Telugu',
    flag: '🇮🇳',
    voices: ALL_GEMINI_VOICES,
  },
  {
    code: 'th-TH',
    name: 'Thai',
    flag: '🇹🇭',
    voices: ALL_GEMINI_VOICES,
  },
  {
    code: 'uk-UA',
    name: 'Ukrainian',
    flag: '🇺🇦',
    voices: ALL_GEMINI_VOICES,
  },
  {
    code: 'vi-VN',
    name: 'Vietnamese',
    flag: '🇻🇳',
    voices: ALL_GEMINI_VOICES,
  },
];

const SERVER_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8080';

// Ensure HTTP URL for REST API calls (convert ws:// to http://)
const getHttpUrl = (url: string): string => {
  return url.replace(/^ws:\/\//, 'http://').replace(/^wss:\/\//, 'https://');
};
const API_URL = getHttpUrl(SERVER_URL);

// Helper function to get a readable label for a question
function getQuestionLabel(question: any): string {
  const { questionType, questionId, questionNumber, configuration } = question;

  // Try to get label from configuration
  if (configuration?.satisfactionContext) {
    return configuration.satisfactionContext;
  }

  // Generate label based on question type and ID
  const typeLabels: Record<string, string> = {
    rating_scale: 'Rating',
    nps: 'NPS Score',
    yes_no: 'Yes/No',
    single_choice: 'Choice',
    multiple_choice: 'Multiple Choice',
    open_ended: 'Open Response',
    voice_prompt: 'Prompt',
  };

  // Extract meaningful label from questionId
  if (questionId) {
    const idParts = questionId.replace(/^q\d+-?/, '').replace(/-/g, ' ');
    if (idParts && idParts.length > 2) {
      return idParts.split(' ').map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    }
  }

  return typeLabels[questionType] || `Q${questionNumber}`;
}

// Helper function to extract key phrases from question text for pattern matching
function extractKeyPhrases(questionText: string): string | null {
  if (!questionText || questionText.length < 10) return null;

  // Remove variable placeholders like {{variable}}
  const cleanText = questionText.replace(/\{\{[^}]+\}\}/g, '').trim();

  // Extract key identifying phrases
  const keyPhrasePatterns = [
    /how satisfied.*with (the |your )?([a-z\s]+)/i,
    /scale.*(\d+).*to.*(\d+)/i,
    /how likely.*recommend/i,
    /what.*come.*mind/i,
    /which.*describe/i,
    /are you.*registered/i,
    /do you consider yourself/i,
    /what.*first.*reaction/i,
    /what.*concerns/i,
    /what.*features/i,
    /which.*heard of/i,
    /which.*consider/i,
    /what.*favorite/i,
  ];

  for (const pattern of keyPhrasePatterns) {
    const match = cleanText.match(pattern);
    if (match) {
      // Escape special regex characters and return
      return match[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
  }

  // Fallback: extract first significant phrase (skip common words)
  const words = cleanText.split(/\s+/).filter((w) => w.length > 3);
  if (words.length >= 3) {
    const phrase = words.slice(0, 4).join('\\s+');
    return phrase;
  }

  return null;
}

// Helper function to substitute variable placeholders with example values
function substituteVariables(text: string, variableSubstitution: any, transactionData?: any): string {
  if (!text) return text;
  
  // Default mock transaction data for demos
  const mockData: Record<string, string> = {
    // Electronics Retail
    storeName: 'TechMart Electronics',
    storeLocation: 'Downtown Chicago',
    daysAgo: '2 days ago',
    primaryProduct: 'Samsung 55-inch Smart TV',
    additionalItemsText: ' and 2 other items',
    formattedPrice: '$899.99',
    formattedAmount: '$1,299.99',
    totalAmount: '$1,299.99',
    salesAssociateName: 'Michael Chen',
    salesAssociateQuestion: 'I see Michael Chen assisted you. Did he help you find the right product?',
    associateReference: "Michael Chen's",
    he_she: 'he',
    
    // E-Commerce Delivery
    orderId: '2025-12A',
    deliveryTiming: 'yesterday',
    deliveryDetailsText: 'Your order included 3 items totaling $234.50.',
    estimatedDate: 'December 7th',
    actualDate: 'December 8th',
    deliveryStatusText: "That's one day later than estimated. ",
    itemCount: '3',
    deliveryMethod: 'Standard home delivery',
    courierName: 'FastShip Logistics',
    
    // Automotive Service
    vehicleYear: '2022',
    vehicleMake: 'Honda',
    vehicleModel: 'Accord',
    serviceAdvisorName: 'Jennifer Martinez',
    primaryService: 'an oil change and tire rotation',
    serviceTimingText: 'just yesterday',
    serviceDescription: 'oil change and tire rotation',
    serviceDuration: '2.5',
    formattedTotal: '$189.00',
    
    // Generic
    npsFollowupQuestion: 'What could we have done better?',
  };

  // Replace all {{variable}} patterns
  let result = text.replace(/\{\{([^}]+)\}\}/g, (match, varName) => {
    // Check variableSubstitution for example value first
    if (variableSubstitution?.[varName]?.example) {
      return variableSubstitution[varName].example;
    }
    // Fall back to mock data
    return mockData[varName] || match;
  });

  return result;
}

// Helper function to extract the actual answer value from conversational response
// e.g., "yes, i said five" -> "Five", "um, i would say 8" -> "8"
function extractAnswerValue(userResponse: string, aiQuestion: string): string {
  const response = userResponse.trim().toLowerCase();
  const question = aiQuestion.toLowerCase();
  
  // Detect question type from AI's question
  const isScaleQuestion = question.includes('scale') || 
                          question.includes('1 to') || 
                          question.includes('0 to') ||
                          question.includes('1 being') ||
                          question.includes('0 being');
  const isNPSQuestion = question.includes('recommend') || question.includes('nps');
  const isYesNoQuestion = question.includes('may i') || 
                          question.includes('can i') || 
                          question.includes('do you') ||
                          question.includes('did you') ||
                          question.includes('are you') ||
                          question.includes('would you') ||
                          question.includes('is that correct');
  const isSatisfactionQuestion = question.includes('satisfied') || question.includes('satisfaction');
  
  // Number word to digit mapping
  const numberWords: Record<string, string> = {
    'zero': '0', 'one': '1', 'two': '2', 'three': '3', 'four': '4',
    'five': '5', 'six': '6', 'seven': '7', 'eight': '8', 'nine': '9',
    'ten': '10', 'eleven': '11', 'twelve': '12'
  };
  
  // For scale/rating questions, extract the number
  if (isScaleQuestion || isNPSQuestion || isSatisfactionQuestion) {
    // First try to find a digit
    const digitMatch = response.match(/\b(\d{1,2})\b/);
    if (digitMatch) {
      return digitMatch[1];
    }
    
    // Try to find number words
    for (const [word, digit] of Object.entries(numberWords)) {
      if (response.includes(word)) {
        return digit;
      }
    }
  }
  
  // For yes/no questions
  if (isYesNoQuestion) {
    // Check for affirmative responses
    const affirmatives = ['yes', 'yeah', 'yep', 'sure', 'okay', 'ok', 'correct', 'right', 'absolutely', 'definitely', 'of course', 'certainly'];
    const negatives = ['no', 'nope', 'not', "don't", 'decline', 'refuse', 'negative'];
    
    for (const word of affirmatives) {
      if (response.includes(word)) {
        return 'Yes';
      }
    }
    for (const word of negatives) {
      if (response.includes(word)) {
        return 'No';
      }
    }
  }
  
  // For confirmation questions (e.g., "you said 4, correct?")
  if (question.includes('correct') || question.includes('confirm')) {
    const affirmatives = ['yes', 'yeah', 'yep', 'correct', 'right', 'that\'s right'];
    for (const word of affirmatives) {
      if (response.includes(word)) {
        // Try to extract the number from the AI's question
        const numInQuestion = question.match(/\b(\d{1,2})\b/);
        if (numInQuestion) {
          return numInQuestion[1];
        }
        return 'Confirmed';
      }
    }
  }
  
  // Clean up conversational fillers for open-ended responses
  let cleanedResponse = userResponse.trim();
  
  // Remove common conversational prefixes
  const prefixPatterns = [
    /^(um+|uh+|well|so|like|i mean|you know|let me think|hmm+|okay so|alright so)\s*,?\s*/i,
    /^(i would say|i'd say|i think|i guess|i believe|probably|maybe)\s*/i,
    /^(yes|yeah|yep|sure|okay|ok)\s*,?\s*/i,
    /^(i said|i mentioned|as i said)\s*/i,
  ];
  
  for (const pattern of prefixPatterns) {
    cleanedResponse = cleanedResponse.replace(pattern, '');
  }
  
  // Remove trailing confirmations
  cleanedResponse = cleanedResponse.replace(/\s*,?\s*(right|correct|i think|you know)?\s*\.?\s*$/i, '');
  
  // Capitalize first letter
  if (cleanedResponse.length > 0) {
    cleanedResponse = cleanedResponse.charAt(0).toUpperCase() + cleanedResponse.slice(1);
  }
  
  // If the cleaned response is very short (likely just a number or yes/no), return as-is
  // Otherwise, return the cleaned conversational response
  return cleanedResponse || userResponse.trim();
}

const VoiceDemoInterface: React.FC<VoiceDemoInterfaceProps> = ({
  questionnaireId,
  voiceId: initialVoiceId,
  onDemoStarted,
  onDemoCompleted,
  onDemoError,
  onReturnToSelection,
  className = '',
}) => {
  const t = useTranslations('fullDemo');
  const locale = useLocale();
  
  // Map page locale to BCP-47 language code for Gemini Live
  const getInitialLanguage = (pageLocale: string): string => {
    const localeMap: Record<string, string> = {
      'en': 'en-US',
      'tr': 'tr-TR',
      'es': 'es-US',
      'fr': 'fr-FR',
      'de': 'de-DE',
      'pt': 'pt-BR',
      'hi': 'hi-IN',
      'ar': 'ar-EG',
      'ja': 'ja-JP',
      'ko': 'ko-KR',
      'ru': 'ru-RU',
      'it': 'it-IT',
      'nl': 'nl-NL',
      'pl': 'pl-PL',
      'vi': 'vi-VN',
      'th': 'th-TH',
      'id': 'id-ID',
      'uk': 'uk-UA',
      'ro': 'ro-RO',
    };
    return localeMap[pageLocale] || 'en-US';
  };
  
  // Demo configuration state
  const [selectedScenario, setSelectedScenario] = useState<string>(questionnaireId);
  const [selectedLanguage, setSelectedLanguage] = useState<string>(() => getInitialLanguage(locale));
  const [selectedGender, setSelectedGender] = useState<'male' | 'female'>('male');
  const [selectedVoice, setSelectedVoice] = useState<string>(initialVoiceId || 'Charon');

  // Note: System prompt is generated by the backend from the questionnaire
  const systemPrompt = '';

  // Analytics state
  const [analyticsData, setAnalyticsData] = useState<AnalyticsData>({
    sentiment: { positive: 0, neutral: 0, negative: 0 },
    keywords: [],
    conversationFlow: [],
    qualityScore: 0,
  });

  // Collected data state
  const [collectedData, setCollectedData] = useState<CollectedData>({
    sessionId: '',
    startTime: '',
    scenario: questionnaireId,
    language: 'en-US',
    voiceId: selectedVoice,
    responses: {},
    transcriptCount: 0,
  });

  // Recorded responses state
  const [recordedResponses, setRecordedResponses] = useState<RecordedResponse[]>([]);

  // NLP Analysis state for open-ended responses
  const [nlpAnalysis, setNlpAnalysis] = useState<NLPAnalysisResult | null>(null);
  const [isAnalyzingNLP, setIsAnalyzingNLP] = useState(false);
  const [isProcessingResults, setIsProcessingResults] = useState(false);
  const [hoveredPhrase, setHoveredPhrase] = useState<{
    phrase: string;
    topic: string;
    sentiment: string;
    intent: string;
    emotion: string;
    x: number;
    y: number;
  } | null>(null);

  // Developer modal state
  const [showDevModal, setShowDevModal] = useState(false);

  const transcriptContainerRef = useRef<HTMLDivElement>(null);

  // Function to analyze open-ended response with NLP
  const analyzeOpenEndedResponse = useCallback(async (text: string) => {
    if (!text || text.length < 10) return; // Skip very short responses
    
    setIsAnalyzingNLP(true);
    try {
      const response = await fetch(`${API_URL}/api/nlp/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text,
          questionnaireId: selectedScenario,
          questionId: 'open-ended',
        }),
      });
      
      if (response.ok) {
        const data = await response.json();
        if (data.success && data.analysis) {
          setNlpAnalysis(data.analysis);
          console.log('[NLP Analysis] Result:', data.analysis);
        }
      } else {
        console.error('[NLP Analysis] Failed:', response.status);
      }
    } catch (err) {
      console.error('[NLP Analysis] Error:', err);
    } finally {
      setIsAnalyzingNLP(false);
    }
  }, [selectedScenario]);

  // Use the working Socket.IO voice chat hook
  const {
    connect,
    disconnect,
    connectionState,
    isReady,
    isConnecting,
    error,
    transcripts,
    clearTranscripts,
    surveyAnswers,
    clearSurveyAnswers,
    recordedResponses: hookRecordedResponses,
    clearRecordedResponses,
    nlpAnalysis: hookNlpAnalysis,
    startStreaming,
    stopStreaming,
    isStreaming,
    endSession,
    sendTranscriptForExtraction,
  } = useSocketIOVoiceChat({
    serverUrl: SERVER_URL,
    systemPrompt,
    questionnaireId: selectedScenario,
    voiceId: selectedVoice,
    language: selectedLanguage,
  });

  // Update recorded responses when received from hook (record_response tool)
  useEffect(() => {
    if (hookRecordedResponses && hookRecordedResponses.length > 0) {
      console.log('[VoiceDemoInterface] Received recorded responses from hook:', hookRecordedResponses);
      // Convert hook responses to component format
      const newResponses: RecordedResponse[] = hookRecordedResponses.map((r) => ({
        qid: r.qid,
        question: r.question,
        answer: r.answer,
        nlpAnalysis: r.nlpAnalysis ? {
          overall_sentiment_score: r.nlpAnalysis.overall_sentiment_score,
          analyzed_topics: r.nlpAnalysis.analyzed_topics.map(t => ({
            topic: t.topic,
            sentiment: t.sentiment,
            topic_sentiment_score: t.topic_sentiment_score,
            intent: '',
            emotion: '',
            keywords: [],
            key_phrases: t.key_phrases.map(kp => ({
              phrase: kp.phrase,
              start_char: 0,
              end_char: kp.phrase.length,
            })),
          })),
          original_text: r.answer,
          questionId: r.qid,
          questionnaireId: selectedScenario,
        } : undefined,
      }));
      setRecordedResponses(newResponses);
    }
  }, [hookRecordedResponses, selectedScenario]);

  // Update NLP analysis when received from hook
  useEffect(() => {
    if (hookNlpAnalysis) {
      console.log('[VoiceDemoInterface] Received NLP analysis from hook:', hookNlpAnalysis);
      // Convert to full NLPAnalysisResult format
      const fullNlpAnalysis: NLPAnalysisResult = {
        overall_sentiment_score: hookNlpAnalysis.overall_sentiment_score,
        analyzed_topics: hookNlpAnalysis.analyzed_topics.map(t => ({
          topic: t.topic,
          sentiment: t.sentiment,
          topic_sentiment_score: t.topic_sentiment_score,
          intent: '',
          emotion: '',
          keywords: [],
          key_phrases: t.key_phrases.map(kp => ({
            phrase: kp.phrase,
            start_char: 0,
            end_char: kp.phrase.length,
          })),
        })),
        original_text: '',
        questionId: '',
        questionnaireId: selectedScenario,
      };
      setNlpAnalysis(fullNlpAnalysis);
    }
  }, [hookNlpAnalysis, selectedScenario]);

  // Update from survey answers (Prompt Management) - these are more accurate
  // as they analyze the full conversation at session end
  useEffect(() => {
    if (surveyAnswers && surveyAnswers.length > 0) {
      console.log('[VoiceDemoInterface] Received survey answers from Prompt Management:', surveyAnswers);
      // Prompt Management answers are more accurate - use them when available
      const newResponses: RecordedResponse[] = surveyAnswers.map((answer, index) => ({
        qid: answer.questionId || `Q${index + 1}`,
        question: answer.question,
        answer: answer.answer,
      }));
      setRecordedResponses(newResponses);
    }
  }, [surveyAnswers]);

  // Send transcript for extraction when user finishes speaking (new final transcript)
  const lastUserTranscriptRef = useRef<string>('');
  useEffect(() => {
    // Find the latest final user transcript
    const finalUserTranscripts = transcripts.filter(t => t.role === 'user' && t.isFinal);
    if (finalUserTranscripts.length === 0) return;
    
    const latestUserTranscript = finalUserTranscripts[finalUserTranscripts.length - 1];
    
    // Only send if this is a new user transcript
    if (latestUserTranscript.content !== lastUserTranscriptRef.current) {
      lastUserTranscriptRef.current = latestUserTranscript.content;
      
      // Debounce: wait a bit for the conversation to settle before extracting
      const timeoutId = setTimeout(() => {
        sendTranscriptForExtraction(selectedScenario);
      }, 1500); // Wait 1.5 seconds after user speaks
      
      return () => clearTimeout(timeoutId);
    }
  }, [transcripts, selectedScenario, sendTranscriptForExtraction]);

  // Microphone permission
  const { permissionState, requestPermission, errorType } = useMicrophonePermission();

  // Get current language and available voices
  const currentLanguage = LANGUAGES.find((lang) => lang.code === selectedLanguage);
  const allVoices = currentLanguage?.voices || [];
  
  // Filter voices by gender (no "all" option - always filtered)
  const availableVoices = allVoices.filter(voice => voice.gender === selectedGender);
    
  const selectedScenarioInfo = DEMO_SCENARIOS.find((s) => s.id === selectedScenario);

  // Update voice when language or gender filter changes
  useEffect(() => {
    if (availableVoices.length > 0) {
      const voiceExists = availableVoices.some((v) => v.id === selectedVoice);
      if (!voiceExists) {
        // Auto-select first available voice when filter changes
        setSelectedVoice(availableVoices[0].id);
      }
    }
  }, [selectedLanguage, selectedGender, availableVoices, selectedVoice]);

  // Auto-scroll transcript
  useEffect(() => {
    if (transcriptContainerRef.current) {
      transcriptContainerRef.current.scrollTop = transcriptContainerRef.current.scrollHeight;
    }
  }, [transcripts]);

  // Update analytics when transcripts change
  useEffect(() => {
    if (transcripts.length === 0) return;

    const userMessages = transcripts.filter((m) => m.role === 'user' && m.isFinal);
    const aiMessages = transcripts.filter((m) => m.role === 'assistant' && m.isFinal);

    // Extract keywords from user messages
    const allText = userMessages.map((m) => m.content).join(' ').toLowerCase();
    const words = allText.split(/\s+/).filter((w) => w.length > 3);
    const wordFreq: Record<string, number> = {};
    words.forEach((w) => {
      wordFreq[w] = (wordFreq[w] || 0) + 1;
    });
    const topKeywords = Object.entries(wordFreq)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([word]) => word);

    // Simple sentiment analysis
    const positiveWords = ['yes', 'good', 'great', 'excellent', 'happy', 'satisfied', 'love', 'amazing'];
    const negativeWords = ['no', 'bad', 'poor', 'terrible', 'unhappy', 'dissatisfied', 'hate', 'awful'];

    let positive = 0, negative = 0, neutral = 0;
    userMessages.forEach((m) => {
      const text = m.content.toLowerCase();
      const hasPositive = positiveWords.some((w) => text.includes(w));
      const hasNegative = negativeWords.some((w) => text.includes(w));
      if (hasPositive && !hasNegative) positive++;
      else if (hasNegative && !hasPositive) negative++;
      else neutral++;
    });

    // Calculate quality score
    const avgLength = userMessages.length > 0 
      ? userMessages.reduce((sum, m) => sum + m.content.length, 0) / userMessages.length 
      : 0;
    const qualityScore = Math.min(100, Math.round((avgLength / 50) * 50 + userMessages.length * 10));

    // Build conversation flow
    const flow: string[] = [];
    if (aiMessages.length > 0) flow.push('greeting_received');
    if (userMessages.length > 0) flow.push('user_responded');
    if (userMessages.length > 1) flow.push('conversation_active');

    setAnalyticsData({
      sentiment: { positive, neutral, negative },
      keywords: topKeywords,
      conversationFlow: flow,
      qualityScore,
    });

    setCollectedData((prev) => ({
      ...prev,
      transcriptCount: transcripts.length,
    }));
  }, [transcripts]);

  // Extract survey question answers from conversation
  // Captures user responses that follow AI questions and extracts the actual answer
  // For open-ended questions, combines consecutive user responses into one answer
  // Handles clarification requests by updating previous answer instead of creating new one
  useEffect(() => {
    if (transcripts.length < 2) return;

    const finalTranscripts = transcripts.filter((t) => t.isFinal && t.content.trim().length > 0);
    const extractedResponses: RecordedResponse[] = [];

    let questionIndex = 0;
    let i = 0;

    // Iterate through transcripts to find Q&A pairs
    while (i < finalTranscripts.length) {
      const current = finalTranscripts[i];

      // Look for AI message followed by user response(s)
      if (current.role === 'assistant') {
        const aiText = current.content.toLowerCase();

        // Skip ONLY clear closing/goodbye messages
        const isClosing = 
          aiText.includes('goodbye') || 
          aiText.includes('good bye') ||
          (aiText.includes('have a') && (aiText.includes('great day') || aiText.includes('nice day') || aiText.includes('wonderful day'))) ||
          (aiText.includes('take care') && !aiText.includes('?'));

        if (isClosing) {
          i++;
          continue;
        }

        // Skip messages that are just confirmations without new questions
        // e.g., "You said 5 out of 5, very satisfied, correct?"
        const isPureConfirmation = 
          aiText.includes('you said') && 
          (aiText.includes('correct?') || aiText.includes('is that correct')) &&
          !aiText.includes('how satisfied') &&
          !aiText.includes('how likely') &&
          !aiText.includes('scale') &&
          !aiText.includes('what could') &&
          !aiText.includes('tell me');

        if (isPureConfirmation) {
          i++;
          continue;
        }

        // Skip very short pure acknowledgments (no question expected)
        const isPureAck = aiText.length < 30 && 
          !aiText.includes('?') &&
          (aiText.startsWith('got it') || aiText.startsWith('okay') || aiText.startsWith('alright') || 
           aiText.startsWith('perfect') || aiText.startsWith('great') || aiText.startsWith('understood') ||
           aiText.startsWith('thank you for') || aiText.startsWith('wonderful'));

        if (isPureAck) {
          i++;
          continue;
        }

        // Skip "thank you for your feedback" type messages
        const isThankYou = 
          (aiText.includes('thank you') && (aiText.includes('feedback') || aiText.includes('sharing'))) &&
          !aiText.includes('?') &&
          !aiText.includes('how') &&
          !aiText.includes('what');

        if (isThankYou) {
          i++;
          continue;
        }

        // Detect if AI is asking for clarification/retry (user gave invalid answer)
        const isClarificationRequest = 
          aiText.includes("didn't quite catch") ||
          aiText.includes("didn't catch that") ||
          aiText.includes('could you please repeat') ||
          aiText.includes('please repeat') ||
          aiText.includes('try again') ||
          aiText.includes('one more time') ||
          aiText.includes('sorry, i need') ||
          aiText.includes("i'm sorry, i didn't");

        // Collect ALL consecutive user responses after this AI message
        const userResponses: string[] = [];
        let j = i + 1;
        
        while (j < finalTranscripts.length && finalTranscripts[j].role === 'user') {
          const userContent = finalTranscripts[j].content.trim();
          if (userContent.length > 0) {
            userResponses.push(userContent);
          }
          j++;
        }

        // If we found user responses, this is a Q&A pair
        if (userResponses.length > 0) {
          // Generate label DIRECTLY from AI's question text (not from questionnaire index)
          let questionLabel = '';
          
          // Check for specific question types based on AI text
          if (aiText.includes('may i proceed') || aiText.includes('proceed with') || aiText.includes('few questions')) {
            questionLabel = 'Consent';
          } else if (aiText.includes('store environment') || aiText.includes('cleanliness') || aiText.includes('layout')) {
            questionLabel = 'Store Environment';
          } else if (aiText.includes('which aspects') || aiText.includes('most problematic') || aiText.includes('select all')) {
            questionLabel = 'Store Issues';
          } else if (aiText.includes('did he help') || aiText.includes('did she help') || aiText.includes('find the right product')) {
            questionLabel = 'Staff Helped';
          } else if ((aiText.includes('michael') || aiText.includes('staff') || aiText.includes('associate') || aiText.includes('assistance')) && aiText.includes('satisfied')) {
            questionLabel = 'Staff Satisfaction';
          } else if ((aiText.includes('selection') || aiText.includes('value') || aiText.includes('money') || aiText.includes('product')) && aiText.includes('satisfied') && !aiText.includes('checkout')) {
            questionLabel = 'Product Value';
          } else if (aiText.includes('checkout') || aiText.includes('payment process')) {
            questionLabel = 'Checkout Experience';
          } else if (aiText.includes('recommend') && (aiText.includes('0 to 10') || aiText.includes('friend') || aiText.includes('family'))) {
            questionLabel = 'NPS Score';
          } else if (aiText.includes('what could') && aiText.includes('better')) {
            questionLabel = 'Improvement Feedback';
          } else if (aiText.includes('delivery') || aiText.includes('shipping')) {
            questionLabel = 'Delivery Experience';
          } else if (aiText.includes('tell me') || aiText.includes('describe') || aiText.includes('share your')) {
            questionLabel = 'Open Feedback';
          } else if (aiText.includes('satisfied')) {
            questionLabel = 'Satisfaction';
          } else if (aiText.includes('?')) {
            questionLabel = 'Response';
          } else {
            questionLabel = 'Response';
          }
          
          // Determine if this is an open-ended question
          const isOpenEnded = 
            aiText.includes('tell me') ||
            aiText.includes('tell us') ||
            aiText.includes('describe') ||
            aiText.includes('explain') ||
            aiText.includes('what made') ||
            aiText.includes('why do you') ||
            aiText.includes('why did') ||
            aiText.includes('what could') ||
            aiText.includes('what would') ||
            aiText.includes('any other') ||
            aiText.includes('anything else') ||
            aiText.includes('your thoughts') ||
            aiText.includes('your opinion') ||
            aiText.includes('share') ||
            aiText.includes('elaborate') ||
            aiText.includes('more about') ||
            aiText.includes('done better');

          // Combine user responses for open-ended or multi-part answers
          let finalAnswer: string;
          
          if (isOpenEnded || userResponses.length > 1) {
            // Combine all consecutive user responses
            const combinedResponse = userResponses.join(' ');
            finalAnswer = extractAnswerValue(combinedResponse, aiText);
          } else {
            // Single response
            finalAnswer = extractAnswerValue(userResponses[0], aiText);
          }

          // If this is a clarification request, UPDATE the previous answer instead of adding new
          if (isClarificationRequest && extractedResponses.length > 0) {
            const lastResponse = extractedResponses[extractedResponses.length - 1];
            console.log(`[Survey Answer] Updating ${lastResponse.qid}: "${lastResponse.answer}" -> "${finalAnswer}"`);
            lastResponse.answer = finalAnswer;
          } else {
            // Check for duplicates
            const isDuplicate = extractedResponses.some((r) => {
              if (r.answer === finalAnswer) return true;
              const rLower = r.answer.toLowerCase();
              const fLower = finalAnswer.toLowerCase();
              return rLower === fLower;
            });

            if (!isDuplicate && finalAnswer.length > 0) {
              questionIndex++;
              const newResponse: RecordedResponse = {
                qid: `Q${questionIndex}`,
                question: questionLabel,
                answer: finalAnswer,
              };
              extractedResponses.push(newResponse);
              console.log(`[Survey Answer] Q${questionIndex}: ${questionLabel} = "${finalAnswer}"`);
              
              // Trigger NLP analysis for open-ended responses (longer than 10 chars)
              if (isOpenEnded && finalAnswer.length > 10) {
                // Use setTimeout to avoid blocking the state update
                setTimeout(() => {
                  analyzeOpenEndedResponse(finalAnswer);
                }, 100);
              }
            }
          }

          // Move index past all the user responses we just processed
          i = j;
          continue;
        }
      }
      
      i++;
    }

    // Always update state
    setRecordedResponses(extractedResponses);
  }, [transcripts, analyzeOpenEndedResponse]);

  // Start demo
  const handleStartDemo = useCallback(async () => {
    try {
      if (permissionState !== 'granted') {
        await requestPermission();
      }

      clearTranscripts();
      clearSurveyAnswers();
      clearRecordedResponses();
      setRecordedResponses([]);
      setNlpAnalysis(null);
      setHoveredPhrase(null);
      setAnalyticsData({
        sentiment: { positive: 0, neutral: 0, negative: 0 },
        keywords: [],
        conversationFlow: [],
        qualityScore: 0,
      });

      const sessionId = `session-${Date.now()}`;
      setCollectedData({
        sessionId,
        startTime: new Date().toISOString(),
        scenario: selectedScenario,
        language: selectedLanguage,
        voiceId: selectedVoice,
        responses: {},
        transcriptCount: 0,
      });

      await connect();
      await startStreaming();

      if (onDemoStarted) onDemoStarted();
    } catch (err) {
      console.error('Failed to start demo:', err);
      if (onDemoError) onDemoError(err as Error);
    }
  }, [
    permissionState,
    requestPermission,
    clearTranscripts,
    clearSurveyAnswers,
    selectedScenario,
    selectedLanguage,
    selectedVoice,
    connect,
    startStreaming,
    onDemoStarted,
    onDemoError,
  ]);

  // End demo
  const handleEndDemo = useCallback(async () => {
    try {
      // Show processing indicator while waiting for results
      setIsProcessingResults(true);
      
      // End session and wait for NLP/Survey results from backend
      // This sends session:end and waits for session:complete
      await endSession();
      
      // Now disconnect after receiving results
      await disconnect();

      setCollectedData((prev) => ({ ...prev, endTime: new Date().toISOString() }));

      // Don't call onDemoCompleted to prevent auto-navigation
      // User can manually navigate using the back button if needed
    } catch (err) {
      console.error('Error ending demo:', err);
    } finally {
      // Hide processing indicator
      setIsProcessingResults(false);
    }
  }, [endSession, disconnect]);

  // Toggle call
  const handleToggleCall = useCallback(() => {
    if (isReady && isStreaming) {
      handleEndDemo();
    } else {
      handleStartDemo();
    }
  }, [isReady, isStreaming, handleEndDemo, handleStartDemo]);

  // Return to selection
  const handleReturnToSelection = useCallback(() => {
    if (isReady) {
      handleEndDemo();
    }
    if (onReturnToSelection) onReturnToSelection();
  }, [isReady, handleEndDemo, onReturnToSelection]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);

  const isCallActive = isReady && isStreaming;

  // Main 3-column layout
  return (
    <div className={`min-h-screen bg-background ${className}`}>
      {errorType && <MicrophonePermissionBanner errorType={errorType} onRetry={requestPermission} />}

      <div className="container mx-auto px-6 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Column - Demo Controls */}
          <div className="lg:col-span-3">
            <div className="bg-card rounded-xl border border-border p-6 space-y-6 sticky top-24">
              {/* Scenario Selector */}
              <div>
                <label className="block text-sm font-semibold text-foreground mb-3">{t('demoScenario')}</label>
                <select
                  value={selectedScenario}
                  onChange={(e) => setSelectedScenario(e.target.value)}
                  disabled={isCallActive || isConnecting}
                  className="w-full px-4 py-3 bg-background border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {DEMO_SCENARIOS.map((scenario) => (
                    <option key={scenario.id} value={scenario.id}>
                      {t(`demos.${scenario.id}.title`)}
                    </option>
                  ))}
                </select>
                {selectedScenarioInfo && (
                  <p className="text-xs text-text-secondary mt-2">{t(`demos.${selectedScenarioInfo.id}.description`)}</p>
                )}
              </div>

              {/* Language Selector */}
              <div>
                <label className="block text-sm font-semibold text-foreground mb-3">{t('language')}</label>
                <select
                  value={selectedLanguage}
                  onChange={(e) => setSelectedLanguage(e.target.value)}
                  disabled={isCallActive || isConnecting}
                  className="w-full px-4 py-3 bg-background border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {LANGUAGES.map((language) => (
                    <option key={language.code} value={language.code}>
                      {language.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Gender Filter */}
              <div>
                <label className="block text-sm font-semibold text-foreground mb-3">
                  {t('voiceGender')}
                </label>
                <select
                  value={selectedGender}
                  onChange={(e) => setSelectedGender(e.target.value as 'male' | 'female')}
                  disabled={isCallActive || isConnecting}
                  className="w-full px-4 py-3 bg-background border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <option value="male">{t('maleVoices')} ({allVoices.filter(v => v.gender === 'male').length})</option>
                  <option value="female">{t('femaleVoices')} ({allVoices.filter(v => v.gender === 'female').length})</option>
                </select>
                <p className="text-xs text-text-secondary mt-2">
                  {selectedGender === 'male' ? t('showingMaleVoices') : t('showingFemaleVoices')}
                </p>
              </div>

              {/* Voice Options */}
              <div>
                <label className="block text-sm font-semibold text-foreground mb-3">{t('voiceOption')}</label>
                <select
                  value={selectedVoice}
                  onChange={(e) => setSelectedVoice(e.target.value)}
                  disabled={isCallActive || isConnecting || availableVoices.length === 0}
                  className="w-full px-4 py-3 bg-background border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {availableVoices.map((voice) => (
                    <option key={voice.id} value={voice.id}>
                      {t(`voiceNames.${voice.name}` as any) || voice.name} - {t(`voiceAccents.${voice.accent}` as any) || voice.accent}
                    </option>
                  ))}
                </select>
                {availableVoices.length === 0 && (
                  <p className="text-xs text-error mt-2">
                    No voices available for selected filter
                  </p>
                )}
              </div>

              {/* Call Controls */}
              <div className="pt-4 border-t border-border">
                {!isCallActive ? (
                  <button
                    onClick={handleToggleCall}
                    disabled={isConnecting}
                    className="w-full px-6 py-4 bg-gradient-cta text-primary-foreground font-semibold rounded-lg shadow-primary transition-smooth hover:shadow-lg hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
                  >
                    {isConnecting ? (
                      <>
                        <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        <span>{t('connecting')}</span>
                      </>
                    ) : (
                      <>
                        <Icon name="PhoneIcon" size={24} className="text-white" variant="solid" />
                        <span>{t('startDemoCall')}</span>
                      </>
                    )}
                  </button>
                ) : (
                  <button
                    onClick={handleToggleCall}
                    className="w-full px-6 py-4 bg-error text-white font-semibold rounded-lg shadow-lg transition-smooth hover:bg-error/90 flex items-center justify-center space-x-2"
                  >
                    <Icon name="PhoneXMarkIcon" size={24} className="text-white" variant="solid" />
                    <span>{t('endCall')}</span>
                  </button>
                )}

                {/* Call Status Indicator */}
                {isCallActive && (
                  <div className="flex items-center justify-center space-x-2 py-3 mt-3">
                    <div className="w-3 h-3 rounded-full bg-success animate-pulse" />
                    <span className="text-sm font-medium text-success">{t('callActive')}</span>
                  </div>
                )}

                {/* Error Display */}
                {error && (
                  <div className="mt-4 p-3 bg-error/10 text-error rounded-lg text-sm">
                    {error.message}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Center Column - Transcription */}
          <div className="lg:col-span-5">
            <div className="bg-card rounded-xl border border-border h-full">
              <div className="p-6 border-b border-border">
                <h2 className="text-xl font-bold text-foreground flex items-center space-x-2">
                  <Icon name="ChatBubbleLeftRightIcon" size={24} className="text-primary" variant="solid" />
                  <span>{t('realTimeTranscription')}</span>
                </h2>
                <p className="text-sm text-text-secondary mt-1">{t('liveConversation')}</p>
              </div>

              <div
                ref={transcriptContainerRef}
                className="p-6 h-[calc(100vh-20rem)] overflow-y-auto"
              >
                {transcripts.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-center">
                    <Icon name="MicrophoneIcon" size={48} className="text-text-secondary/30 mb-4" variant="outline" />
                    <p className="text-text-secondary">
                      {t('startDemoPrompt')}
                    </p>
                  </div>
                ) : (
                  <div className="flex flex-col space-y-3">
                    {transcripts.map((transcript) => (
                      <div
                        key={transcript.id}
                        className={`max-w-[85%] p-3 rounded-2xl ${
                          transcript.role === 'assistant'
                            ? 'bg-primary/10 rounded-tl-sm self-start'
                            : 'bg-success/10 rounded-tr-sm self-end'
                        } ${!transcript.isFinal ? 'opacity-70' : ''}`}
                      >
                        <div className="flex items-center space-x-2 mb-1">
                          <span
                            className={`font-semibold text-xs ${
                              transcript.role === 'assistant' ? 'text-primary' : 'text-success'
                            }`}
                          >
                            {transcript.role === 'assistant' ? `🤖 ${t('ai')}` : `👤 ${t('you')}`}
                          </span>
                          <span className="text-xs text-text-secondary">
                            {new Date(transcript.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                        <p className="text-foreground text-sm">{transcript.content || '...'}</p>
                        {!transcript.isFinal && (
                          <span className="text-xs text-text-secondary">({t('speaking')})</span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Right Column - Data & Analytics */}
          <div className="lg:col-span-4 space-y-6">
            {/* Collected Responses Section */}
            <div className="bg-card rounded-xl border border-border">
              <div className="p-4 border-b border-border">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-bold text-foreground flex items-center space-x-2">
                      <Icon name="DocumentTextIcon" size={20} className="text-primary" variant="solid" />
                      <span>{t('surveyAnswers')}</span>
                    </h3>
                    <p className="text-xs text-text-secondary mt-1">
                      {recordedResponses.length} {t('questionsAnswered')}
                    </p>
                  </div>
                  <button
                    onClick={() => setShowDevModal(true)}
                    className="px-3 py-1.5 text-xs font-medium text-text-secondary bg-muted hover:bg-muted/80 rounded-md transition-colors flex items-center space-x-1"
                  >
                    <Icon name="CodeBracketIcon" size={14} variant="outline" />
                    <span>{t('forDevelopers')}</span>
                  </button>
                </div>
              </div>
              <div className="p-4 max-h-80 overflow-y-auto">
                {isProcessingResults && recordedResponses.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-8 text-center">
                    <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mb-4" />
                    <p className="text-sm text-text-secondary">{t('processingResults')}</p>
                    <p className="text-xs text-text-secondary/70 mt-1">{t('pleaseWait')}</p>
                  </div>
                ) : recordedResponses.length === 0 ? (
                  <div className="text-center py-6">
                    <Icon name="ClipboardDocumentListIcon" size={32} className="text-text-secondary/30 mx-auto mb-2" variant="outline" />
                    <p className="text-xs text-text-secondary">{t('surveyAnswersPrompt')}</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {recordedResponses.map((response, index) => (
                      <div key={response.qid} className="bg-background rounded-lg p-3 border border-border/50">
                        <div className="flex items-start space-x-2 mb-1">
                          <span className="text-xs font-semibold text-primary bg-primary/10 px-2 py-0.5 rounded">
                            Q{index + 1}
                          </span>
                          <span className="text-xs text-text-secondary">{response.qid}</span>
                        </div>
                        <p className="text-sm text-foreground font-medium mb-2">{response.question}</p>
                        <div className="flex items-start space-x-2">
                          <Icon name="ChatBubbleLeftIcon" size={14} className="text-success mt-0.5" variant="solid" />
                          <p className="text-sm text-success">{response.answer}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Text Analytics Section */}
            <div className="bg-card rounded-xl border border-border">
              <div className="p-4 border-b border-border">
                <h3 className="text-lg font-bold text-foreground flex items-center space-x-2">
                  <Icon name="ChartBarIcon" size={20} className="text-primary" variant="solid" />
                  <span>{t('textAnalytics')}</span>
                </h3>
                <p className="text-xs text-text-secondary mt-1">{t('nlpAnalysis')}</p>
              </div>
              <div className="p-4 relative">
                {isProcessingResults && !nlpAnalysis ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mb-4" />
                    <p className="text-sm text-text-secondary">{t('processingResults')}</p>
                    <p className="text-xs text-text-secondary/70 mt-1">{t('pleaseWait')}</p>
                  </div>
                ) : !nlpAnalysis && !isAnalyzingNLP ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <Icon name="ChatBubbleBottomCenterTextIcon" size={48} className="text-text-secondary/30 mb-4" variant="outline" />
                    <p className="text-sm text-text-secondary mb-2">
                      {t('waitingForResponse')}
                    </p>
                    <p className="text-xs text-text-secondary/70">
                      {t('nlpWillAppear')}
                    </p>
                  </div>
                ) : isAnalyzingNLP ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mb-4" />
                    <p className="text-sm text-text-secondary">{t('analyzingResponse')}</p>
                  </div>
                ) : nlpAnalysis ? (
                  <div className="space-y-4">
                    {/* Overall Sentiment Score */}
                    <div>
                      <p className="text-xs font-semibold text-foreground mb-2">{t('overallSentiment')}</p>
                      <div className="flex items-center space-x-3">
                        <div className="flex-1 bg-muted rounded-full h-3 relative overflow-hidden">
                          {/* Background gradient from red to green */}
                          <div className="absolute inset-0 bg-gradient-to-r from-error via-warning via-50% to-success opacity-30" />
                          {/* Indicator */}
                          <div 
                            className="absolute top-0 bottom-0 w-1 bg-foreground rounded-full transition-all"
                            style={{ left: `${((nlpAnalysis.overall_sentiment_score + 100) / 200) * 100}%` }}
                          />
                        </div>
                        <span className={`text-sm font-bold min-w-[60px] text-right ${
                          nlpAnalysis.overall_sentiment_score > 20 ? 'text-success' :
                          nlpAnalysis.overall_sentiment_score < -20 ? 'text-error' : 'text-warning'
                        }`}>
                          {nlpAnalysis.overall_sentiment_score > 0 ? '+' : ''}{nlpAnalysis.overall_sentiment_score}%
                        </span>
                      </div>
                      <div className="flex justify-between text-xs text-text-secondary mt-1">
                        <span>-100%</span>
                        <span>0%</span>
                        <span>+100%</span>
                      </div>
                    </div>

                    {/* Analyzed Text with Highlighted Key Phrases */}
                    <div>
                      <p className="text-xs font-semibold text-foreground mb-2">{t('analyzedResponse')}</p>
                      <div className="bg-background rounded-lg p-3 border border-border/50 text-sm text-foreground leading-relaxed">
                        {(() => {
                          const text = nlpAnalysis.original_text || '';
                          const allPhrases: Array<{
                            phrase: string;
                            start: number;
                            end: number;
                            topic: string;
                            sentiment: string;
                            intent: string;
                            emotion: string;
                          }> = [];
                          
                          // Collect all key phrases from all topics
                          nlpAnalysis.analyzed_topics?.forEach((topic) => {
                            topic.key_phrases?.forEach((kp) => {
                              allPhrases.push({
                                phrase: kp.phrase,
                                start: kp.start_char,
                                end: kp.end_char,
                                topic: topic.topic,
                                sentiment: topic.sentiment,
                                intent: topic.intent,
                                emotion: topic.emotion,
                              });
                            });
                          });
                          
                          // Sort by start position
                          allPhrases.sort((a, b) => a.start - b.start);
                          
                          // Build highlighted text
                          const elements: React.ReactNode[] = [];
                          let lastEnd = 0;
                          
                          allPhrases.forEach((phrase, idx) => {
                            // Add text before this phrase
                            if (phrase.start > lastEnd) {
                              elements.push(
                                <span key={`text-${idx}`}>{text.slice(lastEnd, phrase.start)}</span>
                              );
                            }
                            
                            // Add highlighted phrase
                            const sentimentColor = 
                              phrase.sentiment.toLowerCase().includes('positive') ? 'bg-success/20 border-success/40' :
                              phrase.sentiment.toLowerCase().includes('negative') ? 'bg-error/20 border-error/40' :
                              'bg-warning/20 border-warning/40';
                            
                            elements.push(
                              <span
                                key={`phrase-${idx}`}
                                className={`${sentimentColor} border-b-2 px-0.5 rounded cursor-pointer transition-colors hover:opacity-80`}
                                onMouseEnter={(e) => {
                                  const rect = e.currentTarget.getBoundingClientRect();
                                  setHoveredPhrase({
                                    phrase: phrase.phrase,
                                    topic: phrase.topic,
                                    sentiment: phrase.sentiment,
                                    intent: phrase.intent,
                                    emotion: phrase.emotion,
                                    x: rect.left,
                                    y: rect.bottom + 8,
                                  });
                                }}
                                onMouseLeave={() => setHoveredPhrase(null)}
                              >
                                {phrase.phrase}
                              </span>
                            );
                            
                            lastEnd = phrase.end;
                          });
                          
                          // Add remaining text
                          if (lastEnd < text.length) {
                            elements.push(
                              <span key="text-end">{text.slice(lastEnd)}</span>
                            );
                          }
                          
                          return elements.length > 0 ? elements : text;
                        })()}
                      </div>
                    </div>

                    {/* Topics Summary */}
                    {nlpAnalysis.analyzed_topics && nlpAnalysis.analyzed_topics.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold text-foreground mb-2">{t('detectedTopics')}</p>
                        <div className="flex flex-wrap gap-2">
                          {/* Remove duplicates where topic name AND sentiment are the same */}
                          {nlpAnalysis.analyzed_topics
                            .filter((topic, index, self) => 
                              index === self.findIndex(t => 
                                t.topic === topic.topic && t.sentiment === topic.sentiment
                              )
                            )
                            .map((topic, i) => (
                            <span 
                              key={i} 
                              className={`px-2 py-1 text-xs rounded-full ${
                                topic.sentiment.toLowerCase().includes('positive') ? 'bg-success/10 text-success' :
                                topic.sentiment.toLowerCase().includes('negative') ? 'bg-error/10 text-error' :
                                'bg-warning/10 text-warning'
                              }`}
                            >
                              {topic.topic}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ) : null}

                {/* Hover Tooltip for Key Phrases */}
                {hoveredPhrase && (
                  <div 
                    className="fixed z-50 bg-card border border-border rounded-lg shadow-xl p-3 min-w-[200px] max-w-[280px]"
                    style={{ 
                      left: Math.min(hoveredPhrase.x, window.innerWidth - 300),
                      top: hoveredPhrase.y,
                    }}
                  >
                    <p className="text-sm font-semibold text-foreground mb-2">"{hoveredPhrase.phrase}"</p>
                    <div className="space-y-1.5 text-xs">
                      <div className="flex justify-between">
                        <span className="text-text-secondary">{t('topic')}:</span>
                        <span className="text-foreground font-medium">{hoveredPhrase.topic}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-text-secondary">{t('sentiment')}:</span>
                        <span className={`font-medium ${
                          hoveredPhrase.sentiment.toLowerCase().includes('positive') ? 'text-success' :
                          hoveredPhrase.sentiment.toLowerCase().includes('negative') ? 'text-error' :
                          'text-warning'
                        }`}>{hoveredPhrase.sentiment}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-text-secondary">{t('intent')}:</span>
                        <span className="text-foreground font-medium">{hoveredPhrase.intent}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-text-secondary">{t('emotion')}:</span>
                        <span className="text-foreground font-medium">{hoveredPhrase.emotion}</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Developer JSON Modal */}
      {showDevModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-card rounded-xl border border-border shadow-xl w-full max-w-3xl max-h-[80vh] m-4 flex flex-col">
            <div className="p-4 border-b border-border flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Icon name="CodeBracketIcon" size={20} className="text-primary" variant="solid" />
                <h3 className="text-lg font-bold text-foreground">{t('collectedDataJson')}</h3>
              </div>
              <button
                onClick={() => setShowDevModal(false)}
                className="p-2 hover:bg-muted rounded-lg transition-colors"
              >
                <Icon name="XMarkIcon" size={20} className="text-text-secondary" variant="outline" />
              </button>
            </div>
            <div className="p-4 overflow-auto flex-1">
              <pre className="bg-background rounded-lg p-4 text-xs text-foreground overflow-x-auto font-mono">
                {JSON.stringify(
                  {
                    session: {
                      sessionId: collectedData.sessionId,
                      startTime: collectedData.startTime,
                      endTime: collectedData.endTime,
                      scenario: collectedData.scenario,
                      language: collectedData.language,
                      voiceId: collectedData.voiceId,
                      transcriptCount: collectedData.transcriptCount,
                    },
                    responses: recordedResponses,
                    textAnalytics: nlpAnalysis,
                  },
                  null,
                  2
                )}
              </pre>
            </div>
            <div className="p-4 border-t border-border flex justify-end space-x-3">
              <button
                onClick={() => {
                  navigator.clipboard.writeText(
                    JSON.stringify(
                      {
                        session: {
                          sessionId: collectedData.sessionId,
                          startTime: collectedData.startTime,
                          endTime: collectedData.endTime,
                          scenario: collectedData.scenario,
                          language: collectedData.language,
                          voiceId: collectedData.voiceId,
                          transcriptCount: collectedData.transcriptCount,
                        },
                        responses: recordedResponses,
                        textAnalytics: nlpAnalysis,
                      },
                      null,
                      2
                    )
                  );
                }}
                className="px-4 py-2 text-sm font-medium text-foreground bg-muted hover:bg-muted/80 rounded-lg transition-colors flex items-center space-x-2"
              >
                <Icon name="ClipboardDocumentIcon" size={16} variant="outline" />
                <span>{t('copyToClipboard')}</span>
              </button>
              <button
                onClick={() => setShowDevModal(false)}
                className="px-4 py-2 text-sm font-medium text-primary-foreground bg-primary hover:bg-primary/90 rounded-lg transition-colors"
              >
                {t('close')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default VoiceDemoInterface;

