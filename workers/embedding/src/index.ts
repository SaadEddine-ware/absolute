export interface Env {
  AI: any;
  EMBEDDING_MODEL?: string;
  EMBEDDING_TOKEN?: string;
}

const DEFAULT_MODEL = '@cf/baai/bge-base-en-v1.5';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    const url = new URL(request.url);
    const path = url.pathname;

    if (path === '/api/health') {
      return json({
        status: 'ok',
        provider: 'cloudflare',
        model: env.EMBEDDING_MODEL ?? DEFAULT_MODEL,
        dimensions: 768,
      });
    }

    if (path === '/api/embed' && request.method === 'POST') {
      const authError = checkAuth(request, env);
      if (authError) return authError;

      let text: string;
      try {
        const body = (await request.json()) as { text?: string };
        text = typeof body.text === 'string' ? body.text : '';
      } catch {
        return error('Invalid JSON body', 400);
      }

      if (!text.trim()) {
        return error('text is required', 400);
      }

      const model = env.EMBEDDING_MODEL ?? DEFAULT_MODEL;

      try {
        const embedding = await computeEmbedding(text, env.AI, model);
        return json({
          embedding: embeddingToBase64(embedding),
          dimensions: embedding.length,
          model,
        });
      } catch (e) {
        return error(e instanceof Error ? e.message : 'Embedding failed', 500);
      }
    }

    return error('Not Found', 404);
  },
} satisfies ExportedHandler<Env>;

function checkAuth(request: Request, env: Env): Response | null {
  const token = env.EMBEDDING_TOKEN;
  if (!token) return null;

  const auth = request.headers.get('Authorization');
  if (auth !== `Bearer ${token}`) {
    return error('Unauthorized', 401);
  }
  return null;
}

async function computeEmbedding(
  text: string,
  ai: any,
  model: string
): Promise<Float32Array> {
  if (!ai) {
    throw new Error(
      'Workers AI binding is required for embeddings. ' +
        'Add { "ai": { "binding": "AI" } } to wrangler.jsonc.'
    );
  }

  const response = await ai.run(model, {
    text: [text],
  });

  const data = response?.data as number[][] | undefined;
  if (!data || !data[0] || data[0].length === 0) {
    throw new Error('Workers AI returned an empty embedding response');
  }

  return new Float32Array(data[0]);
}

export function embeddingToBase64(embedding: Float32Array): string {
  const buffer = embedding.buffer.slice(
    embedding.byteOffset,
    embedding.byteOffset + embedding.byteLength
  ) as ArrayBuffer;
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
}

function error(message: string, status: number): Response {
  return json({ error: message }, status);
}