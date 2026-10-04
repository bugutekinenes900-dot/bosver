import { Icon } from "../Icon";
import { MessageActions } from "./MessageActions";
import type { Message } from "../../types";

function AttachmentChips({ message }: { message: Message }) {
  if (!message.attachments?.length) return null;
  return (
    <div className="flex flex-wrap gap-space-xs justify-end mb-space-xs">
      {message.attachments.map((file) => (
        <span
          key={file.id}
          className="flex items-center gap-space-xs px-space-sm py-space-xs rounded-full bg-surface-container text-on-surface-variant font-label-sm text-label-sm"
        >
          <Icon name="description" size={14} />
          {file.name}
        </span>
      ))}
    </div>
  );
}

export function MessageBubble({ message }: { message: Message }) {
  if (message.role === "user") {
    return (
      <div className="flex items-start gap-space-md justify-end animate-fade-in-up">
        <div className="flex flex-col items-end max-w-[85%] sm:max-w-xl">
          <AttachmentChips message={message} />
          <div className="bg-surface-container-high rounded-2xl rounded-tr-xs px-space-md py-space-sm text-on-surface font-body-md text-body-md whitespace-pre-wrap break-words">
            {message.text}
          </div>
        </div>
        <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center shrink-0">
          <Icon name="person" size={18} className="text-on-primary" />
        </div>
      </div>
    );
  }

  const pending = message.streaming && !message.text;

  return (
    <div className="flex items-start gap-space-md animate-fade-in-up">
      <div className="w-8 h-8 rounded-full bg-primary-container text-on-primary-container flex items-center justify-center shrink-0">
        <Icon name="auto_awesome" size={18} filled />
      </div>
      <div className="flex flex-col gap-space-xs max-w-[85%] sm:max-w-2xl">
        <div className="bg-surface-container-low rounded-2xl rounded-tl-xs px-space-lg py-space-md text-on-surface font-body-md text-body-md leading-relaxed whitespace-pre-wrap break-words">
          {pending ? (
            <span className="inline-block animate-pulse text-on-surface-variant">
              Yapay zeka yanıt hazırlıyor...
            </span>
          ) : (
            message.text
          )}
        </div>
        {!message.streaming && message.text ? (
          <MessageActions message={message} />
        ) : null}
      </div>
    </div>
  );
}
