import { useEffect, useRef } from "react";
import { MessageBubble } from "./MessageBubble";
import { WelcomeState } from "./WelcomeState";
import { useChat } from "../../state/ChatContext";

export function ChatStream() {
  const { messages, send } = useChat();
  const streamRef = useRef<HTMLDivElement>(null);
  const lastText = messages[messages.length - 1]?.text ?? "";

  // Yeni mesaj veya yeni karakter geldikce en alta kay.
  useEffect(() => {
    const element = streamRef.current;
    if (!element) return;
    element.scrollTop = element.scrollHeight;
  }, [messages.length, lastText]);

  return (
    <div
      ref={streamRef}
      id="chat-stream"
      className="flex-1 overflow-y-auto flex flex-col gap-space-lg pr-space-sm pb-space-xl"
      aria-live="polite"
      aria-relevant="additions text"
    >
      <h1 className="sr-only">Anar - Türkçe yapay zeka sohbet asistanı</h1>
      {messages.length === 0 ? (
        <WelcomeState onSelect={send} />
      ) : (
        <div className="flex flex-col gap-space-lg w-full">
          {messages.map((message) => (
            <MessageBubble key={message.id} message={message} />
          ))}
        </div>
      )}
    </div>
  );
}
