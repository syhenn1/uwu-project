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
  call: (messages: ChatMessage[], opts?: CallOpts) => Promise<ProviderResult>;
}

function log(...args: unknown[]) {
  console.log(`[AI ${new Date().toISOString()}]`, ...args);
}

// --- Hugging Face (Llama, lewat HF Inference Providers router - OpenAI-compatible) ---

async function callHuggingFace(messages: ChatMessage[], opts?: CallOpts): Promise<ProviderResult> {
  const token = process.env.HF_TOKEN!;
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

async function callGemini(messages: ChatMessage[], opts?: CallOpts): Promise<ProviderResult> {
  const apiKey = process.env.GEMINI_API_KEY!;
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

async function callGroq(messages: ChatMessage[], opts?: CallOpts): Promise<ProviderResult> {
  const apiKey = process.env.GROQ_API_KEY!;
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

async function callOpenRouter(messages: ChatMessage[], opts?: CallOpts): Promise<ProviderResult> {
  const apiKey = process.env.OPENROUTER_API_KEY!;
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

async function callOpenAI(messages: ChatMessage[], opts?: CallOpts): Promise<ProviderResult> {
  const apiKey = process.env.OPENAI_API_KEY!;
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
 * dikonfigurasi. Empat yang pertama punya tingkatan/model gratis - HF Inference
 * Providers, Google AI Studio (Gemini), Groq, dan OpenRouter (model ":free",
 * termasuk Llama). OpenAI ditaruh PALING AKHIR karena berbayar (tidak ada
 * tingkatan gratis) - dipakai sebagai cadangan terakhir kalau semua provider
 * gratis di atas gagal/habis kuota. */
const PROVIDERS: Provider[] = [
  { name: "Hugging Face", envVar: "HF_TOKEN", configured: () => !!process.env.HF_TOKEN, call: callHuggingFace },
  { name: "Google Gemini", envVar: "GEMINI_API_KEY", configured: () => !!process.env.GEMINI_API_KEY, call: callGemini },
  { name: "Groq", envVar: "GROQ_API_KEY", configured: () => !!process.env.GROQ_API_KEY, call: callGroq },
  { name: "OpenRouter", envVar: "OPENROUTER_API_KEY", configured: () => !!process.env.OPENROUTER_API_KEY, call: callOpenRouter },
  { name: "OpenAI", envVar: "OPENAI_API_KEY", configured: () => !!process.env.OPENAI_API_KEY, call: callOpenAI },
];

export function isAnyProviderConfigured(): boolean {
  return PROVIDERS.some((p) => p.configured());
}

export function configuredProviderNames(): string[] {
  return PROVIDERS.filter((p) => p.configured()).map((p) => p.name);
}

/** Memanggil LLM lewat provider pertama yang dikonfigurasi & berhasil, dengan
 * fallback otomatis ke provider berikutnya kalau gagal. Logs each attempt to
 * the terminal (provider, durasi, token in/out) so AI activity is visible
 * while `npm run dev` is running. */
export async function callLLM(messages: ChatMessage[], opts?: CallOpts): Promise<string> {
  const candidates = PROVIDERS.filter((p) => p.configured());
  if (candidates.length === 0) {
    const err =
      "Belum ada provider AI dikonfigurasi. Isi salah satu di .env.local: HF_TOKEN, GEMINI_API_KEY, GROQ_API_KEY, OPENROUTER_API_KEY, atau OPENAI_API_KEY.";
    log(err);
    throw new Error(err);
  }

  const promptChars = messages.reduce((sum, m) => sum + m.content.length, 0);
  const failures: string[] = [];

  for (const provider of candidates) {
    const startedAt = Date.now();
    log(`-> mencoba "${provider.name}" (${messages.length} pesan, ~${promptChars} karakter prompt)...`);
    try {
      const result = await provider.call(messages, opts);
      const durationMs = Date.now() - startedAt;
      log(
        `<- "${provider.name}" berhasil dalam ${durationMs}ms, ${result.content.length} karakter dihasilkan` +
          (result.usageIn != null ? ` (token: ${result.usageIn} in / ${result.usageOut ?? "?"} out)` : "")
      );
      return result.content;
    } catch (err) {
      const durationMs = Date.now() - startedAt;
      // "fetch failed" sendiri tidak bilang APA yang gagal (DNS? timeout?
      // koneksi ditolak?) - penyebab sebenarnya ada di `cause` (mis. "getaddrinfo
      // ENOTFOUND ...", "ECONNREFUSED", "ETIMEDOUT") tapi tidak otomatis masuk
      // ke `message`. Sertakan eksplisit supaya log/pesan error berikutnya
      // langsung actionable, bukan cuma "fetch failed" yang generik.
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
