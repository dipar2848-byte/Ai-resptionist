/**
 * LLM client abstraction over any OpenAI-compatible /chat/completions endpoint.
 *
 * Swap providers purely via env (LLM_BASE_URL / LLM_MODEL / LLM_API_KEY):
 *   - OpenAI:      https://api.openai.com/v1
 *   - Groq:        https://api.groq.com/openai/v1
 *   - OpenRouter:  https://openrouter.ai/api/v1
 *   - Together:    https://api.together.xyz/v1
 *   - Ollama:      http://localhost:11434/v1
 *
 * Includes: timeout via AbortController, JSON-mode request, and typed errors
 * so callers can implement graceful fallback.
 */

const { env } = require('../config/env');
const { logger } = require('../utils/logger');

class LLMError extends Error {
  constructor(message, { status, cause } = {}) {
    super(message);
    this.name = 'LLMError';
    this.status = status;
    this.cause = cause;
  }
}

/**
 * Calls the chat completion endpoint.
 * @param {Array<{role:string, content:string}>} messages
 * @param {object} opts { temperature, jsonMode, maxTokens, timeoutMs }
 * @returns {Promise<string>} raw assistant message content
 */
async function chatCompletion(messages, opts = {}) {
  if (!env.LLM_API_KEY) {
    throw new LLMError('LLM_API_KEY not configured');
  }

  const {
    temperature = 0.4,
    jsonMode = true,
    maxTokens = 400,
    timeoutMs = env.LLM_TIMEOUT_MS,
  } = opts;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const body = {
    model: env.LLM_MODEL,
    messages,
    temperature,
    max_tokens: maxTokens,
  };
  if (jsonMode) {
    // Supported by OpenAI, Groq, etc. Harmless hint for others.
    body.response_format = { type: 'json_object' };
  }

  try {
    const res = await fetch(`${env.LLM_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${env.LLM_API_KEY}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new LLMError(`LLM HTTP ${res.status}`, { status: res.status, cause: text.slice(0, 500) });
    }

    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content;
    if (!content) {
      throw new LLMError('LLM returned empty content');
    }
    return content;
  } catch (err) {
    if (err.name === 'AbortError') {
      logger.warn('LLM request timed out', { timeoutMs });
      throw new LLMError('LLM request timed out', { cause: 'timeout' });
    }
    if (err instanceof LLMError) throw err;
    throw new LLMError('LLM request failed', { cause: err.message });
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { chatCompletion, LLMError };
