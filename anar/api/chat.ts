export const config = { runtime: "edge" };

type Role = "user" | "assistant";
type ModelId = "flash" | "pro" | "mini";

const MODELS: Record<ModelId, { id: string; max_tokens: number }> = {
  flash: { id: "llama-3.1-8b-instant", max_tokens: 2048 },
  pro: { id: "llama-3.3-70b-versatile", max_tokens: 4096 },
  mini: { id: "llama-3.1-8b-instant", max_tokens: 512 },
};

const SYSTEM = `Sen Anar'sın; Türkçe, net ve doğrudan cevap veren bir sohbet asistanısın.
Soru sorulunca soruyu tekrar etme; hemen yanıtla.
Kod, açıklama, hesap ve özet isteklerini yerine getir.
Uydurma bilgi verme; bilmiyorsan söyle.
Kısa sorulara kısa, karmaşık sorulara yeterli derinlikte cevap ver.`;

const MAX_MESSAGES = 20;

function corsOrigin(req: Request): string {
  const origin = req.headers.get("origin") ?? "";
  const production = process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : "";
  const preview = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : "";
  if (
    origin.startsWith("http://localhost") ||
    origin.startsWith("http://127.0.0.1") ||
    origin === production ||
    origin === preview
  ) {
    return origin;
  }
  return production || preview || origin || "*";
}

function corsHeaders(req: Request): HeadersInit {
  return {
    "Access-Control-Allow-Origin": corsOrigin(req),
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

function jsonError(req: Request, status: number, error: string, message: string) {
  return new Response(JSON.stringify({ error, message }), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...corsHeaders(req),
    },
  });
}

function isModelId(value: unknown): value is ModelId {
  return value === "flash" || value === "pro" || value === "mini";
}

export async function handleChat(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(req) });
  }
  if (req.method !== "POST") {
    return jsonError(req, 405, "method_not_allowed", "Yalnızca POST kabul edilir.");
  }

  const key = process.env.GROQ_API_KEY;
  if (!key) {
    return jsonError(
      req,
      503,
      "missing_key",
      "Yanıt şu an üretilemedi. Sunucu yapılandırması eksik."
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError(req, 400, "invalid_json", "İstek okunamadı.");
  }

  const payload = body as { messages?: unknown; model?: unknown };
  const model = isModelId(payload.model) ? payload.model : "flash";
  if (!Array.isArray(payload.messages)) {
    return jsonError(req, 400, "invalid_messages", "Mesaj listesi gerekli.");
  }

  const messages = payload.messages
    .filter((item): item is { role: Role; content: string } => {
      if (!item || typeof item !== "object") return false;
      const row = item as { role?: unknown; content?: unknown };
      return (
        (row.role === "user" || row.role === "assistant") &&
        typeof row.content === "string" &&
        row.content.trim().length > 0
      );
    })
    .slice(-MAX_MESSAGES)
    .map((item) => ({ role: item.role, content: item.content.slice(0, 8000) }));

  if (messages.length === 0) {
    return jsonError(req, 400, "empty", "Gönderilecek mesaj yok.");
  }

  const spec = MODELS[model];
  const groq = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: spec.id,
      max_tokens: spec.max_tokens,
      temperature: model === "pro" ? 0.4 : 0.6,
      stream: true,
      messages: [{ role: "system", content: SYSTEM }, ...messages],
    }),
  });

  if (!groq.ok || !groq.body) {
    let message = "Yanıt şu an üretilemedi. Biraz sonra tekrar deneyin.";
    try {
      const err = (await groq.json()) as { error?: { message?: string } };
      if (groq.status === 401 || groq.status === 403) {
        message = "Yanıt şu an üretilemedi. API anahtarı geçersiz.";
      } else if (groq.status === 429) {
        message = "Çok fazla istek geldi. Biraz sonra tekrar deneyin.";
      } else if (err.error?.message) {
        message = "Yanıt şu an üretilemedi.";
      }
    } catch {
      /* ignore parse errors */
    }
    return jsonError(req, groq.status === 401 ? 502 : 502, "upstream", message);
  }

  return new Response(groq.body, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      ...corsHeaders(req),
    },
  });
}

export default handleChat;
