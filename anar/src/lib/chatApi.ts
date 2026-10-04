import type { ModelId } from "../types";

export async function streamAssistant(
  messages: { role: "user" | "assistant"; content: string }[],
  model: ModelId,
  onDelta: (text: string) => void,
  signal: AbortSignal
): Promise<void> {
  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages, model }),
    signal,
  });

  if (!res.ok || !res.body) {
    let message = "Yanıt şu an üretilemedi. Biraz sonra tekrar deneyin.";
    try {
      const data = (await res.json()) as { message?: string };
      if (typeof data.message === "string" && data.message.trim()) {
        message = data.message;
      }
    } catch {
      /* gövde JSON değilse varsayılan mesaj */
    }
    throw new Error(message);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const data = trimmed.slice(5).trim();
      if (!data || data === "[DONE]") continue;
      try {
        const json = JSON.parse(data) as {
          choices?: Array<{ delta?: { content?: string } }>;
        };
        const delta = json.choices?.[0]?.delta?.content;
        if (typeof delta === "string" && delta) onDelta(delta);
      } catch {
        /* yarım JSON satırını atla */
      }
    }
  }
}
