/**
 * Claude Model Pricing Table
 *
 * Prices are in USD per token.
 * Reference: https://www.anthropic.com/pricing
 */

// Pricing per million tokens
const PRICING_PER_MILLION = {
  // Claude Sonnet 4
  'claude-sonnet-4-20250514': {
    input: 3.00,
    output: 15.00,
    cacheRead: 0.30,
    cacheCreate: 3.75
  },
  // Claude Opus 4
  'claude-opus-4-20250514': {
    input: 15.00,
    output: 75.00,
    cacheRead: 1.50,
    cacheCreate: 18.75
  },
  // Claude Haiku 3.5
  'claude-haiku-3-5-20241022': {
    input: 0.80,
    output: 4.00,
    cacheRead: 0.08,
    cacheCreate: 1.00
  },
  // Aliases for simplified model names
  'sonnet': {
    input: 3.00,
    output: 15.00,
    cacheRead: 0.30,
    cacheCreate: 3.75
  },
  'opus': {
    input: 15.00,
    output: 75.00,
    cacheRead: 1.50,
    cacheCreate: 18.75
  },
  'haiku': {
    input: 0.80,
    output: 4.00,
    cacheRead: 0.08,
    cacheCreate: 1.00
  }
};

// Convert to price per token
const PRICING = {};
for (const [model, prices] of Object.entries(PRICING_PER_MILLION)) {
  PRICING[model] = {
    input: prices.input / 1_000_000,
    output: prices.output / 1_000_000,
    cacheRead: prices.cacheRead / 1_000_000,
    cacheCreate: prices.cacheCreate / 1_000_000
  };
}

/**
 * Normalize model name to a standard format
 * @param {string} model - Raw model name
 * @returns {string} Normalized model name
 */
function normalizeModelName(model) {
  if (!model) return 'sonnet';

  const modelLower = model.toLowerCase();

  // Check for exact match
  if (PRICING[model]) {
    return model;
  }

  // Check for partial matches
  if (modelLower.includes('opus')) {
    return 'opus';
  }
  if (modelLower.includes('haiku')) {
    return 'haiku';
  }
  if (modelLower.includes('sonnet')) {
    return 'sonnet';
  }

  // Default to sonnet
  return 'sonnet';
}

/**
 * Calculate cost for token usage
 * @param {Object} usage - Token usage object
 * @param {string} usage.model - Model name
 * @param {number} usage.inputTokens - Input tokens
 * @param {number} usage.outputTokens - Output tokens
 * @param {number} usage.cacheReadTokens - Cache read tokens
 * @param {number} usage.cacheCreationTokens - Cache creation tokens
 * @returns {number} Cost in USD
 */
function calculateCost(usage) {
  const model = normalizeModelName(usage.model);
  const prices = PRICING[model];

  if (!prices) {
    console.warn(`Unknown model: ${usage.model}, using sonnet pricing`);
    return calculateCost({ ...usage, model: 'sonnet' });
  }

  const inputCost = (usage.inputTokens || 0) * prices.input;
  const outputCost = (usage.outputTokens || 0) * prices.output;
  const cacheReadCost = (usage.cacheReadTokens || 0) * prices.cacheRead;
  const cacheCreateCost = (usage.cacheCreationTokens || 0) * prices.cacheCreate;

  return inputCost + outputCost + cacheReadCost + cacheCreateCost;
}

/**
 * Get pricing for a model
 * @param {string} model - Model name
 * @returns {Object} Pricing object
 */
function getModelPricing(model) {
  const normalizedModel = normalizeModelName(model);
  return PRICING[normalizedModel] || PRICING['sonnet'];
}

/**
 * Format cost for display
 * @param {number} cost - Cost in USD
 * @returns {string} Formatted cost string
 */
function formatCost(cost) {
  if (cost < 0.01) {
    return `$${cost.toFixed(4)}`;
  }
  return `$${cost.toFixed(2)}`;
}

export {
  PRICING,
  PRICING_PER_MILLION,
  normalizeModelName,
  calculateCost,
  getModelPricing,
  formatCost
};
