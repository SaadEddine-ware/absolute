// Google Gemini provider using the OpenAI-compatible endpoint.
// Free tier: 250 requests/day for gemini-2.5-flash.
// API: https://generativelanguage.googleapis.com/v1beta/openai/
import { OpenAICompatibleProvider } from './openai-compatible-client.js';

export class GeminiProvider extends OpenAICompatibleProvider {
  constructor() {
    super({
      id: 'gemini',
      name: 'Google Gemini',
      baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai',
      defaultModel: 'gemini-2.5-flash',
      freeTier: true,
      envKey: 'GEMINI_API_KEY',
    });
  }
}
