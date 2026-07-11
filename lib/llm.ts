export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

const HF_ROUTER_URL = "https://router.huggingface.co/v1/chat/completions";
const DEFAULT_MODEL = "meta-llama/Llama-3.3-70B-Instruct";

/** Calls a Llama model through Hugging Face's OpenAI-compatible Inference
 * Providers router. Model is configurable via HF_MODEL so it can be swapped
 * without code changes. */
export async function callLLM(
  messages: ChatMessage[],
  opts?: { temperature?: number; maxTokens?: number }
): Promise<string> {
  const token = process.env.HF_TOKEN;
  if (!token) {
    throw new Error("HF_TOKEN belum diset. Tambahkan di .env.local untuk mengaktifkan analisis AI.");
  }
  const model = process.env.HF_MODEL || DEFAULT_MODEL;

  const res = await fetch(HF_ROUTER_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: opts?.temperature ?? 0.3,
      max_tokens: opts?.maxTokens ?? 900,
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Hugging Face Inference API error ${res.status}: ${text.slice(0, 500)}`);
  }

  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== "string") {
    throw new Error("Respons LLM tidak sesuai format yang diharapkan.");
  }
  return content;
}
