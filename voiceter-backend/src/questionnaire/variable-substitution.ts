/**
 * Variable Substitution for Questionnaire Templates
 * 
 * Replaces {{variable}} placeholders with actual values from mock transaction data.
 * For demo purposes, uses example values defined in the questionnaire.
 */

import { getLogger } from '../monitoring/logger';

const logger = getLogger();

/**
 * Mock transaction data for demo purposes
 * This simulates real transaction data that would come from a CRM/database
 */
export interface MockTransactionData {
  transactionDate: string;
  transactionTime: string;
  storeLocation: string;
  storeName: string;
  totalAmount: number;
  currency: string;
  items: Array<{
    productName: string;
    category: string;
    price: number;
    quantity: number;
  }>;
  salesAssociateName?: string;
  salesAssociateId?: string;
  paymentMethod: string;
  // E-commerce specific
  orderNumber?: string;
  deliveryDate?: string;
  sellerName?: string;
  // Automotive specific
  vehicleMake?: string;
  vehicleModel?: string;
  serviceType?: string;
  serviceCenterName?: string;
}

/**
 * Default mock data for each questionnaire type
 */
const MOCK_DATA_BY_QUESTIONNAIRE: Record<string, MockTransactionData> = {
  'demo-01a-electronics-retail-personalized': {
    transactionDate: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // 2 days ago
    transactionTime: '14:30',
    storeLocation: 'Downtown Chicago',
    storeName: 'TechMart Electronics',
    totalAmount: 1299.97,
    currency: 'USD',
    items: [
      { productName: 'Samsung 55-inch Smart TV', category: 'TVs', price: 899.99, quantity: 1 },
      { productName: 'HDMI Cable 6ft', category: 'Accessories', price: 24.99, quantity: 2 },
      { productName: 'TV Wall Mount', category: 'Accessories', price: 349.99, quantity: 1 },
    ],
    salesAssociateName: 'Michael Chen',
    salesAssociateId: 'MC1234',
    paymentMethod: 'Credit Card',
  },
  'demo-01b-ecommerce-delivery-personalized': {
    transactionDate: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    transactionTime: '10:15',
    storeLocation: 'Online',
    storeName: 'ShopEase Marketplace',
    totalAmount: 156.99,
    currency: 'USD',
    items: [
      { productName: 'Wireless Bluetooth Headphones', category: 'Electronics', price: 89.99, quantity: 1 },
      { productName: 'Phone Case', category: 'Accessories', price: 29.99, quantity: 1 },
      { productName: 'Screen Protector', category: 'Accessories', price: 12.99, quantity: 2 },
    ],
    orderNumber: 'ORD-2024-78542',
    deliveryDate: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    sellerName: 'TechGadgets Pro',
    paymentMethod: 'PayPal',
  },
  'demo-01c-automotive-service-personalized': {
    transactionDate: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    transactionTime: '09:00',
    storeLocation: 'Northside Service Center',
    storeName: 'AutoCare Premium',
    totalAmount: 425.00,
    currency: 'USD',
    items: [
      { productName: 'Full Service Oil Change', category: 'Maintenance', price: 89.99, quantity: 1 },
      { productName: 'Brake Pad Replacement', category: 'Repairs', price: 299.99, quantity: 1 },
      { productName: 'Tire Rotation', category: 'Maintenance', price: 35.00, quantity: 1 },
    ],
    salesAssociateName: 'Sarah Johnson',
    vehicleMake: 'Toyota',
    vehicleModel: 'Camry 2022',
    serviceType: 'Scheduled Maintenance',
    serviceCenterName: 'AutoCare Premium - Northside',
    paymentMethod: 'Credit Card',
  },
};

/**
 * NPS Follow-up question templates based on score
 */
const NPS_FOLLOWUP_TEMPLATES: Record<string, Record<string, string>> = {
  'demo-01a-electronics-retail-personalized': {
    detractor: "I'm sorry your experience wasn't what we hoped for. What could we have done differently to make your visit better?",
    passive: "Thank you for that rating. What would it take for TechMart Electronics to earn a 9 or 10 from you next time?",
    promoter: "That's wonderful! What specifically exceeded your expectations?",
  },
  'demo-01b-ecommerce-delivery-personalized': {
    detractor: "I'm sorry your experience wasn't what we hoped for. What could we have done differently to improve your delivery experience?",
    passive: "Thank you for that rating. What would it take for ShopEase Marketplace to earn a 9 or 10 from you next time?",
    promoter: "That's wonderful! What specifically exceeded your expectations with your order?",
  },
  'demo-01c-automotive-service-personalized': {
    detractor: "I'm sorry your service experience wasn't what we hoped for. What could we have done differently to make your visit better?",
    passive: "Thank you for that rating. What would it take for AutoCare Premium to earn a 9 or 10 from you next time?",
    promoter: "That's wonderful! What specifically exceeded your expectations with our service?",
  },
};

/**
 * Calculate days ago text
 */
function calculateDaysAgo(transactionDate: string): string {
  const txDate = new Date(transactionDate);
  const today = new Date();
  const diffTime = today.getTime() - txDate.getTime();
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  
  if (diffDays === 0) return 'earlier today';
  if (diffDays === 1) return 'yesterday';
  if (diffDays <= 7) return `${diffDays} days ago`;
  return 'recently';
}

/**
 * Calculate additional items text
 */
function calculateAdditionalItemsText(items: MockTransactionData['items']): string {
  const count = items.length;
  if (count === 1) return '';
  if (count === 2) return ' and one other item';
  return ` and ${count - 1} other items`;
}

/**
 * Get primary product (highest price item)
 */
function getPrimaryProduct(items: MockTransactionData['items']): string {
  if (!items || items.length === 0) return 'your purchase';
  const sorted = [...items].sort((a, b) => b.price - a.price);
  return sorted[0].productName;
}

/**
 * Format price as currency
 */
function formatPrice(amount: number, currency: string = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency,
  }).format(amount);
}

/**
 * Get mock transaction data for a questionnaire
 */
export function getMockTransactionData(questionnaireId: string): MockTransactionData | null {
  return MOCK_DATA_BY_QUESTIONNAIRE[questionnaireId] || null;
}

/**
 * Get NPS follow-up question based on score
 */
export function getNpsFollowupQuestion(questionnaireId: string, npsScore: number): string {
  const templates = NPS_FOLLOWUP_TEMPLATES[questionnaireId];
  if (!templates) {
    // Default templates
    if (npsScore <= 6) {
      return "I'm sorry your experience wasn't what we hoped for. What could we have done differently?";
    } else if (npsScore <= 8) {
      return "Thank you for that rating. What would it take to earn a 9 or 10 from you next time?";
    } else {
      return "That's wonderful! What specifically exceeded your expectations?";
    }
  }

  if (npsScore <= 6) {
    return templates.detractor;
  } else if (npsScore <= 8) {
    return templates.passive;
  } else {
    return templates.promoter;
  }
}

/**
 * Build variable values from mock transaction data
 */
export function buildVariableValues(questionnaireId: string): Record<string, string> {
  const mockData = getMockTransactionData(questionnaireId);
  if (!mockData) {
    logger.debug('No mock data for questionnaire', { questionnaireId });
    return {};
  }

  const variables: Record<string, string> = {
    // Common variables
    storeName: mockData.storeName,
    storeLocation: mockData.storeLocation,
    transactionDate: mockData.transactionDate,
    transactionTime: mockData.transactionTime,
    totalAmount: formatPrice(mockData.totalAmount, mockData.currency),
    formattedPrice: formatPrice(mockData.items[0]?.price || 0, mockData.currency),
    paymentMethod: mockData.paymentMethod,
    
    // Calculated variables
    daysAgo: calculateDaysAgo(mockData.transactionDate),
    primaryProduct: getPrimaryProduct(mockData.items),
    additionalItemsText: calculateAdditionalItemsText(mockData.items),
    
    // Staff variables
    salesAssociateName: mockData.salesAssociateName || '',
    associateReference: mockData.salesAssociateName 
      ? `${mockData.salesAssociateName}'s` 
      : "the sales associate's",
    salesAssociateQuestion: mockData.salesAssociateName
      ? `I see ${mockData.salesAssociateName} assisted you. Did they help you find the right product?`
      : 'Did you interact with any of our sales staff during your visit?',
    he_she: 'they', // Default to gender-neutral
    
    // E-commerce specific
    orderNumber: mockData.orderNumber || '',
    deliveryDate: mockData.deliveryDate || '',
    sellerName: mockData.sellerName || '',
    
    // Automotive specific
    vehicleMake: mockData.vehicleMake || '',
    vehicleModel: mockData.vehicleModel || '',
    serviceType: mockData.serviceType || '',
    serviceCenterName: mockData.serviceCenterName || '',
    
    // Default NPS follow-up (will be overridden dynamically)
    npsFollowupQuestion: "Thank you for your feedback. Could you tell us more about your experience?",
  };

  return variables;
}

/**
 * Substitute variables in text
 * Replaces {{variableName}} with actual values
 */
export function substituteVariables(text: string, questionnaireId: string, sessionResponses?: Map<string, any>): string {
  if (!text || !text.includes('{{')) {
    return text;
  }

  const variables = buildVariableValues(questionnaireId);
  
  // Handle dynamic NPS follow-up question
  if (text.includes('{{npsFollowupQuestion}}') && sessionResponses) {
    const npsResponse = sessionResponses.get('q7-nps') || sessionResponses.get('q7-nps-score');
    if (npsResponse) {
      const npsScore = parseInt(String(npsResponse.response || npsResponse), 10);
      if (!isNaN(npsScore)) {
        variables.npsFollowupQuestion = getNpsFollowupQuestion(questionnaireId, npsScore);
      }
    }
  }
  
  let result = text;
  
  // Replace all {{variable}} patterns
  result = result.replace(/\{\{(\w+)\}\}/g, (match, varName) => {
    if (varName in variables) {
      return variables[varName];
    }
    logger.warn('Unknown variable in template', { variable: varName, questionnaireId });
    return match; // Keep original if not found
  });

  return result;
}

/**
 * Substitute variables in an entire questionnaire
 */
export function substituteQuestionnaireVariables(
  questionnaire: any,
  questionnaireId: string,
  sessionResponses?: Map<string, any>
): any {
  const variables = buildVariableValues(questionnaireId);
  
  if (Object.keys(variables).length === 0) {
    return questionnaire;
  }

  // Deep clone to avoid mutating original
  const result = JSON.parse(JSON.stringify(questionnaire));

  // Substitute in questions
  if (result.questions) {
    result.questions = result.questions.map((q: any) => ({
      ...q,
      questionText: substituteVariables(q.questionText || '', questionnaireId, sessionResponses),
      text: substituteVariables(q.text || '', questionnaireId, sessionResponses),
    }));
  }

  // Substitute in system prompt if present
  if (result.aiAgentConfiguration?.systemPrompt) {
    result.aiAgentConfiguration.systemPrompt = substituteVariables(
      result.aiAgentConfiguration.systemPrompt,
      questionnaireId,
      sessionResponses
    );
  }

  return result;
}
