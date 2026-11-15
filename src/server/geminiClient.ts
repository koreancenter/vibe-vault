import { GoogleGenAI } from '@google/genai';

/**
 * Resilient Gemini content generation with multi-model failover.
 * Prefers fast and cost-effective gemini-3.1-flash-lite, with automated fallback to gemini-3.8-flash.
 */
export async function generateGeminiWithResilience(
  ai: GoogleGenAI,
  params: {
    model?: string;
    contents: any;
    config?: any;
  }
) {
  const preferredModel = params.model || 'gemini-3.1-flash-lite';
  const candidateModels = preferredModel === 'gemini-3.1-flash-lite'
    ? ['gemini-3.1-flash-lite', 'gemini-3.8-flash']
    : [preferredModel, 'gemini-3.1-flash-lite'];

  let lastError: unknown;
  for (const model of candidateModels) {
    try {
      return await ai.models.generateContent({
        ...params,
        model,
      });
    } catch (err: any) {
      lastError = err;
      const status = err?.status;
      if (status === 503 || status === 429 || status === 404 || status === 500) {
        continue;
      }
      throw err;
    }
  }
  throw lastError;
}

export function createGeminiClient(apiKey: string): GoogleGenAI {
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: { 'User-Agent': 'aistudio-build' }
    }
  });
}
