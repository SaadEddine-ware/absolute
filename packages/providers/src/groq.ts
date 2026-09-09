import { OpenAICompatibleProvider } from './openai-compatible-client.js';

export class GroqProvider extends OpenAICompatibleProvider {
  constructor() {
    super({
      id: 'groq',
      name: 'Groq',
      baseURL: 'https://api.groq.com/openai/v1',
      defaultModel: 'llama-3.3-70b-versatile',
      freeTier: true,
    });
  }
}