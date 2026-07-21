export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface CallOpts {
  temperature?: number;
  maxTokens?: number;
}

interface ProviderResult {
  content: string;
  usageIn?: number | string;
  usageOut?: number | string;
}

interface Provider {
  name: string;
  envVar: string;
  configured: () => boolean;
  call: (messages: ChatMessage[], opts?: CallOpts, overrideApiKey?: string) => Promise<ProviderResult>;
}

function log(...args: unknown[]) {
  console.log(`[AI ${new Date().toISOString()}]`, ...args);
}

// --- Hugging Face (Llama, lewat HF Inference Providers router - OpenAI-compatible) ---

async function callHuggingFace(messages: ChatMessage[], opts?: CallOpts, overrideApiKey?: string): Promise<ProviderResult> {
  const token = overrideApiKey || process.env.HF_TOKEN!;
  const model = process.env.HF_MODEL || "meta-llama/Llama-4-Scout-17B-16E-Instruct";

  const res = await fetch("https://router.huggingface.co/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages,
      temperature: opts?.temperature ?? 0.3,
      max_tokens: opts?.maxTokens ?? 500,
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`HF error ${res.status}: ${text.slice(0, 300)}`);
  }

  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== "string") throw new Error("Respons HF tidak sesuai format yang diharapkan.");

  return { content, usageIn: data?.usage?.prompt_tokens, usageOut: data?.usage?.completion_tokens };
}

// --- Google Gemini (Google AI Studio - generativelanguage.googleapis.com) ---

async function callGemini(messages: ChatMessage[], opts?: CallOpts, overrideApiKey?: string): Promise<ProviderResult> {
  const apiKey = overrideApiKey || process.env.GEMINI_API_KEY!;
  const model = process.env.GEMINI_MODEL || "gemini-2.0-flash";

  const systemMsg = messages.find((m) => m.role === "system")?.content;
  const contents = messages
    .filter((m) => m.role !== "system")
    .map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] }));

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents,
        ...(systemMsg ? { systemInstruction: { parts: [{ text: systemMsg }] } } : {}),
        generationConfig: {
          temperature: opts?.temperature ?? 0.3,
          maxOutputTokens: opts?.maxTokens ?? 500,
        },
      }),
    }
  );

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Gemini error ${res.status}: ${text.slice(0, 300)}`);
  }

  const data = await res.json();
  const content = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (typeof content !== "string") throw new Error("Respons Gemini tidak sesuai format yang diharapkan (mungkin diblokir safety filter).");

  return { content, usageIn: data?.usageMetadata?.promptTokenCount, usageOut: data?.usageMetadata?.candidatesTokenCount };
}

// --- Groq (llama/mixtral cloud-hosted super cepat, OpenAI-compatible, free tier) ---

async function callGroq(messages: ChatMessage[], opts?: CallOpts, overrideApiKey?: string): Promise<ProviderResult> {
  const apiKey = overrideApiKey || process.env.GROQ_API_KEY!;
  const model = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";

  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages,
      temperature: opts?.temperature ?? 0.3,
      max_tokens: opts?.maxTokens ?? 500,
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Groq error ${res.status}: ${text.slice(0, 300)}`);
  }

  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== "string") throw new Error("Respons Groq tidak sesuai format yang diharapkan.");

  return { content, usageIn: data?.usage?.prompt_tokens, usageOut: data?.usage?.completion_tokens };
}

// --- OpenRouter (router ke banyak model termasuk Llama gratis, OpenAI-compatible) ---

async function callOpenRouter(messages: ChatMessage[], opts?: CallOpts, overrideApiKey?: string): Promise<ProviderResult> {
  const apiKey = overrideApiKey || process.env.OPENROUTER_API_KEY!;
  const model = process.env.OPENROUTER_MODEL || "meta-llama/llama-3.3-70b-instruct:free";

  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages,
      temperature: opts?.temperature ?? 0.3,
      max_tokens: opts?.maxTokens ?? 500,
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`OpenRouter error ${res.status}: ${text.slice(0, 300)}`);
  }

  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== "string") throw new Error("Respons OpenRouter tidak sesuai format yang diharapkan.");

  return { content, usageIn: data?.usage?.prompt_tokens, usageOut: data?.usage?.completion_tokens };
}

// --- OpenAI (GPT models - api.openai.com, berbayar) ---

async function callOpenAI(messages: ChatMessage[], opts?: CallOpts, overrideApiKey?: string): Promise<ProviderResult> {
  const apiKey = overrideApiKey || process.env.OPENAI_API_KEY!;
  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages,
      temperature: opts?.temperature ?? 0.3,
      max_tokens: opts?.maxTokens ?? 500,
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`OpenAI error ${res.status}: ${text.slice(0, 300)}`);
  }

  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== "string") throw new Error("Respons OpenAI tidak sesuai format yang diharapkan.");

  return { content, usageIn: data?.usage?.prompt_tokens, usageOut: data?.usage?.completion_tokens };
}

/** Urutan fallback: coba provider pertama yang env var-nya diisi; kalau gagal
 * (kuota habis, rate limit, error apapun), lanjut ke provider berikutnya yang
 * dikonfigurasi. */
const PROVIDERS: Provider[] = [
  { name: "OpenRouter", envVar: "OPENROUTER_API_KEY", configured: () => !!process.env.OPENROUTER_API_KEY, call: callOpenRouter },
  { name: "OpenAI", envVar: "OPENAI_API_KEY", configured: () => !!process.env.OPENAI_API_KEY, call: callOpenAI },
  { name: "Groq", envVar: "GROQ_API_KEY", configured: () => !!process.env.GROQ_API_KEY, call: callGroq },
  { name: "Google Gemini", envVar: "GEMINI_API_KEY", configured: () => !!process.env.GEMINI_API_KEY, call: callGemini },
  { name: "Hugging Face", envVar: "HF_TOKEN", configured: () => !!process.env.HF_TOKEN, call: callHuggingFace },
];

export function isAnyProviderConfigured(): boolean {
  return PROVIDERS.some((p) => p.configured());
}

export function configuredProviderNames(): string[] {
  return PROVIDERS.filter((p) => p.configured()).map((p) => p.name);
}

export interface LLMOverride {
  provider: string;
  apiKey?: string;
}

/** Memanggil LLM lewat provider pertama yang dikonfigurasi & berhasil, dengan
 * fallback otomatis ke provider berikutnya kalau gagal. Logs each attempt to
 * the terminal (provider, durasi, token in/out) so AI activity is visible
 * while `npm run dev` is running. */
export async function callLLM(messages: ChatMessage[], opts?: CallOpts, override?: LLMOverride): Promise<string> {
  let candidates: Provider[] = [];
  
  if (override?.provider) {
    const matched = PROVIDERS.find(p => p.name.toLowerCase() === override.provider.toLowerCase() || p.envVar === override.provider || p.name === override.provider);
    if (matched) {
      if (override.apiKey || matched.configured()) {
        candidates = [matched];
      } else {
        throw new Error(`Anda belum memasukkan API Key untuk ${matched.name}, dan admin belum mengatur default key-nya.`);
      }
    } else {
      throw new Error(`Provider AI tidak didukung: ${override.provider}`);
    }
  } else {
    candidates = PROVIDERS.filter((p) => p.configured());
  }

  if (candidates.length === 0) {
    const err = "Belum ada konfigurasi provider AI. Silakan masukkan API Key Anda.";
    log(err);
    throw new Error(err);
  }

  const promptChars = messages.reduce((sum, m) => sum + m.content.length, 0);
  const failures: string[] = [];

  for (const provider of candidates) {
    const startedAt = Date.now();
    log(`-> mencoba "${provider.name}" (${messages.length} pesan, ~${promptChars} karakter prompt)...`);
    try {
      const isOverride = override?.provider && (provider.name.toLowerCase() === override.provider.toLowerCase() || provider.envVar === override.provider);
      const apiKeyToUse = isOverride ? override.apiKey : undefined;
      const result = await provider.call(messages, opts, apiKeyToUse);
      
      const durationMs = Date.now() - startedAt;
      log(
        `<- "${provider.name}" berhasil dalam ${durationMs}ms, ${result.content.length} karakter dihasilkan` +
          (result.usageIn != null ? ` (token: ${result.usageIn} in / ${result.usageOut ?? "?"} out)` : "")
      );
      return result.content;
    } catch (err) {
      const durationMs = Date.now() - startedAt;
      const baseMsg = err instanceof Error ? err.message : String(err);
      const cause = err instanceof Error && err.cause ? ` (cause: ${String(err.cause)})` : "";
      const msg = `${baseMsg}${cause}`;
      log(`<- "${provider.name}" gagal setelah ${durationMs}ms:`, msg);
      failures.push(`${provider.name}: ${msg}`);
    }
  }

  const err = `Semua provider AI gagal:\n${failures.join("\n")}`;
  log(err);
  throw new Error(err);
}
