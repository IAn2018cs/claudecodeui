/**
 * Claude Model Pricing Table
 *
 * Prices are in USD per token.
 * Reference: https://www.anthropic.com/pricing
 */

// Pricing per million tokens
// Reference: https://platform.claude.com/docs/en/about-claude/pricing
// Cache pricing: read = 0.1x base, write (5min) = 1.25x base, write (1h) = 2x base
const PRICING_PER_MILLION = {
  // ============ Latest Models ============
  // Claude Opus 4.5 (latest flagship)
  'claude-opus-4-5-20251101': {
    input: 5.00,
    output: 25.00,
    cacheRead: 0.50,
    cacheCreate5m: 6.25,    // 1.25x base (5-minute ephemeral cache)
    cacheCreate1h: 10.00    // 2x base (1-hour extended cache)
  },
  // Claude Sonnet 4.5
  'claude-sonnet-4-5-20250929': {
    input: 3.00,
    output: 15.00,
    cacheRead: 0.30,
    cacheCreate5m: 3.75,    // 1.25x base
    cacheCreate1h: 6.00     // 2x base
  },
  // Claude Haiku 4.5
  'claude-haiku-4-5-20251001': {
    input: 1.00,
    output: 5.00,
    cacheRead: 0.10,
    cacheCreate5m: 1.25,    // 1.25x base
    cacheCreate1h: 2.00     // 2x base
  },
  // ============ Legacy Models ============
  // Claude Opus 4.1
  'claude-opus-4-1-20250805': {
    input: 15.00,
    output: 75.00,
    cacheRead: 1.50,
    cacheCreate5m: 18.75,   // 1.25x base
    cacheCreate1h: 30.00    // 2x base
  },
  // Claude Opus 4
  'claude-opus-4-20250514': {
    input: 15.00,
    output: 75.00,
    cacheRead: 1.50,
    cacheCreate5m: 18.75,   // 1.25x base
    cacheCreate1h: 30.00    // 2x base
  },
  // Claude Sonnet 4
  'claude-sonnet-4-20250514': {
    input: 3.00,
    output: 15.00,
    cacheRead: 0.30,
    cacheCreate5m: 3.75,    // 1.25x base
    cacheCreate1h: 6.00     // 2x base
  },
  // Claude Sonnet 3.7
  'claude-3-7-sonnet-20250219': {
    input: 3.00,
    output: 15.00,
    cacheRead: 0.30,
    cacheCreate5m: 3.75,    // 1.25x base
    cacheCreate1h: 6.00     // 2x base
  },
  // Claude Haiku 3.5
  'claude-3-5-haiku-20241022': {
    input: 0.80,
    output: 4.00,
    cacheRead: 0.08,
    cacheCreate5m: 1.00,    // 1.25x base
    cacheCreate1h: 1.60     // 2x base
  },
  // Claude Haiku 3
  'claude-3-haiku-20240307': {
    input: 0.25,
    output: 1.25,
    cacheRead: 0.03,
    cacheCreate5m: 0.30,    // Per pricing doc (not exactly 1.25x)
    cacheCreate1h: 0.50     // 2x base
  },
  // ============ Aliases ============
  // Aliases for simplified model names (pointing to latest versions)
  'sonnet': {
    input: 3.00,
    output: 15.00,
    cacheRead: 0.30,
    cacheCreate5m: 3.75,    // 1.25x base
    cacheCreate1h: 6.00     // 2x base
  },
  'opus': {
    input: 5.00,
    output: 25.00,
    cacheRead: 0.50,
    cacheCreate5m: 6.25,    // 1.25x base
    cacheCreate1h: 10.00    // 2x base
  },
  'haiku': {
    input: 1.00,
    output: 5.00,
    cacheRead: 0.10,
    cacheCreate5m: 1.25,    // 1.25x base
    cacheCreate1h: 2.00     // 2x base
  }
};

// Convert to price per token
const PRICING = {};
for (const [model, prices] of Object.entries(PRICING_PER_MILLION)) {
  PRICING[model] = {
    input: prices.input / 1_000_000,
    output: prices.output / 1_000_000,
    cacheRead: prices.cacheRead / 1_000_000,
    cacheCreate5m: prices.cacheCreate5m / 1_000_000,
    cacheCreate1h: prices.cacheCreate1h / 1_000_000
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
 * @param {number} usage.cacheCreation5mTokens - 5-minute ephemeral cache creation tokens
 * @param {number} usage.cacheCreation1hTokens - 1-hour extended cache creation tokens
 * @param {number} [usage.cacheCreationTokens] - Legacy: total cache creation tokens (fallback for SDK that doesn't distinguish)
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

  // Calculate cache creation cost with distinction between 5m and 1h
  let cacheCreateCost = 0;
  if (usage.cacheCreation5mTokens !== undefined || usage.cacheCreation1hTokens !== undefined) {
    // Use precise calculation with separate 5m and 1h tokens
    cacheCreateCost = (usage.cacheCreation5mTokens || 0) * prices.cacheCreate5m +
                      (usage.cacheCreation1hTokens || 0) * prices.cacheCreate1h;
  } else {
    // Fallback: use legacy cacheCreationTokens with 5m price (default assumption)
    cacheCreateCost = (usage.cacheCreationTokens || 0) * prices.cacheCreate5m;
  }

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
