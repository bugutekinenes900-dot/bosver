import { useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { Icon } from "../Icon";
import { useChat } from "../../state/ChatContext";
import type { Message } from "../../types";

export function MessageActions({ message }: { message: Message }) {
  const { toggleLike, regenerate, isStreaming } = useChat();
  const [copied, setCopied] = useState(false);
  const resetTimer = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (resetTimer.current) window.clearTimeout(resetTimer.current);
    },
    []
  );

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(message.text);
    } catch {
      // Pano izni yoksa eski yontemle dene.
      const helper = document.createElement("textarea");
      helper.value = message.text;
      helper.style.position = "fixed";
      helper.style.opacity = "0";
      document.body.appendChild(helper);
      helper.select();
      document.execCommand("copy");
      helper.remove();
    }
    setCopied(true);
    if (resetTimer.current) window.clearTimeout(resetTimer.current);
    resetTimer.current = window.setTimeout(() => setCopied(false), 2000);
  };

  const buttonClass =
    "p-space-xs rounded-full hover:text-on-surface hover:bg-surface-container-high transition-colors disabled:opacity-40 disabled:hover:bg-transparent";

  return (
    <div className="flex items-center gap-space-sm text-outline">
      <button
        type="button"
        onClick={copy}
        className={buttonClass}
        title={copied ? "Kopyalandı" : "Kopyala"}
        aria-label={copied ? "Kopyalandı" : "Yanıtı kopyala"}
      >
        <Icon name={copied ? "check" : "content_copy"} size={18} />
      </button>
      <button
        type="button"
        onClick={() => toggleLike(message.id)}
        className={clsx(buttonClass, message.liked && "text-primary")}
        title="Beğen"
        aria-label="Yanıtı beğen"
        aria-pressed={Boolean(message.liked)}
      >
        <Icon name="thumb_up" size={18} filled={Boolean(message.liked)} />
      </button>
      <button
        type="button"
        onClick={() => regenerate(message.id)}
        disabled={isStreaming}
        className={buttonClass}
        title="Yeniden Dene"
        aria-label="Yanıtı yeniden oluştur"
      >
        <Icon name="refresh" size={18} />
      </button>
    </div>
  );
}
