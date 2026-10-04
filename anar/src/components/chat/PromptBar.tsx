import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
} from "react";
import clsx from "clsx";
import { Icon } from "../Icon";
import { useChat } from "../../state/ChatContext";
import { uid } from "../../lib/storage";
import type { Attachment } from "../../types";

type SpeechResultEvent = {
  results: ArrayLike<ArrayLike<{ transcript: string }>>;
};

type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((event: SpeechResultEvent) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
};

type SpeechWindow = typeof window & {
  SpeechRecognition?: new () => SpeechRecognitionLike;
  webkitSpeechRecognition?: new () => SpeechRecognitionLike;
};

function speechCtor() {
  if (typeof window === "undefined") return undefined;
  const scope = window as SpeechWindow;
  return scope.SpeechRecognition ?? scope.webkitSpeechRecognition;
}

const MAX_TEXTAREA_HEIGHT = 200;

export function PromptBar() {
  const { send, stop, isStreaming } = useChat();
  const [value, setValue] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [listening, setListening] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  const speechSupported = Boolean(speechCtor());
  const canSend = value.trim().length > 0 && !isStreaming;

  // Icerik buyudukce textarea'yi bir tavana kadar uzat.
  useEffect(() => {
    const element = textareaRef.current;
    if (!element) return;
    element.style.height = "auto";
    element.style.height = `${Math.min(element.scrollHeight, MAX_TEXTAREA_HEIGHT)}px`;
  }, [value]);

  useEffect(
    () => () => {
      recognitionRef.current?.stop();
    },
    []
  );

  const submit = () => {
    if (!canSend) return;
    send(value, attachments);
    setValue("");
    setAttachments([]);
    textareaRef.current?.focus();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    // IME/Turkce klavyede yarim kelime gonderilmesini engelle.
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) {
      return;
    }
    event.preventDefault();
    submit();
  };

  const onFilesPicked = (event: ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(event.target.files ?? []).map((file) => ({
      id: uid(),
      name: file.name,
      size: file.size,
    }));
    setAttachments((previous) => [...previous, ...picked]);
    event.target.value = "";
  };

  const toggleMic = () => {
    const Ctor = speechCtor();
    if (!Ctor) return;

    if (listening) {
      recognitionRef.current?.stop();
      return;
    }

    const recognition = new Ctor();
    recognition.lang = "tr-TR";
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.onresult = (event) => {
      const transcript = Array.from({ length: event.results.length })
        .map((_, index) => event.results[index][0]?.transcript ?? "")
        .join(" ")
        .trim();
      if (transcript) {
        setValue((previous) => (previous ? `${previous} ${transcript}` : transcript));
      }
    };
    recognition.onerror = () => setListening(false);
    recognition.onend = () => setListening(false);

    recognitionRef.current = recognition;
    recognition.start();
    setListening(true);
  };

  return (
    <div className="w-full pt-space-md bg-surface/80 backdrop-blur-xl pb-[env(safe-area-inset-bottom)]">
      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-space-xs mb-space-sm px-space-sm">
          {attachments.map((file) => (
            <span
              key={file.id}
              className="flex items-center gap-space-xs pl-space-sm pr-space-xs py-space-xs rounded-full bg-surface-container-high text-on-surface-variant font-label-sm text-label-sm"
            >
              <Icon name="description" size={14} />
              <span className="max-w-[10rem] truncate">{file.name}</span>
              <button
                type="button"
                onClick={() =>
                  setAttachments((previous) =>
                    previous.filter((item) => item.id !== file.id)
                  )
                }
                className="rounded-full hover:text-on-surface transition-colors"
                aria-label={`${file.name} ekini kaldır`}
              >
                <Icon name="close" size={14} />
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="relative flex items-end bg-surface-container-low rounded-2xl sm:rounded-full px-space-md py-space-sm shadow-sm hover:shadow-md transition-shadow">
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={onFilesPicked}
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="p-space-xs rounded-full text-on-surface-variant hover:text-on-surface transition-colors mr-space-xs shrink-0"
          title="Dosya Ekle"
          aria-label="Dosya ekle"
        >
          <Icon name="attach_file" size={22} />
        </button>

        <textarea
          ref={textareaRef}
          id="prompt-input"
          rows={1}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={onKeyDown}
          placeholder="AnAr'a bir şeyler sorun..."
          aria-label="Mesajınız"
          className="flex-1 bg-transparent border-none outline-none resize-none font-body-md text-body-md text-on-surface placeholder:text-outline px-space-sm py-space-xs max-h-[200px] self-center"
        />

        <div className="flex items-center gap-space-xs shrink-0">
          <button
            type="button"
            onClick={toggleMic}
            disabled={!speechSupported}
            className={clsx(
              "p-space-xs rounded-full transition-colors disabled:opacity-40 disabled:cursor-not-allowed",
              listening
                ? "text-primary animate-pulse"
                : "text-on-surface-variant hover:text-on-surface"
            )}
            title={
              speechSupported
                ? listening
                  ? "Dinlemeyi durdur"
                  : "Sesli Komut"
                : "Tarayıcınız sesli komutu desteklemiyor"
            }
            aria-label="Sesli komut"
            aria-pressed={listening}
          >
            <Icon name="mic" size={22} filled={listening} />
          </button>

          {isStreaming ? (
            <button
              type="button"
              onClick={stop}
              className="w-10 h-10 rounded-full bg-surface-container-high text-on-surface flex items-center justify-center hover:bg-surface-container-highest transition-colors"
              title="Yanıtı durdur"
              aria-label="Yanıtı durdur"
            >
              <Icon name="stop" size={20} filled />
            </button>
          ) : (
            <button
              type="button"
              onClick={submit}
              disabled={!canSend}
              className="w-10 h-10 rounded-full bg-primary-container text-on-primary-container flex items-center justify-center hover:opacity-90 transition-opacity disabled:opacity-40"
              title="Gönder"
              aria-label="Gönder"
            >
              <Icon name="arrow_upward" size={20} filled />
            </button>
          )}
        </div>
      </div>

      <div className="text-center mt-space-xs">
        <span className="font-label-sm text-label-sm text-outline">
          AnAr önemli bilgileri kontrol edebilir, bu yüzden yanıtlarını doğrulayın.
        </span>
      </div>
    </div>
  );
}
