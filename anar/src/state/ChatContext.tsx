import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { readStored, uid, useStoredState, writeStored } from "../lib/storage";
import { titleFromPrompt } from "../lib/simulateReply";
import { streamAssistant } from "../lib/chatApi";
import { useUi } from "./UiContext";
import type { Attachment, Conversation, Message, ModelId } from "../types";

type ChatValue = {
  conversations: Conversation[];
  activeId: string | null;
  activeConversation: Conversation | null;
  messages: Message[];
  isStreaming: boolean;
  model: ModelId;
  setModel: (id: ModelId) => void;
  send: (text: string, attachments?: Attachment[]) => void;
  stop: () => void;
  newChat: () => void;
  selectChat: (id: string) => void;
  deleteChat: (id: string) => void;
  clearAll: () => void;
  regenerate: (messageId: string) => void;
  toggleLike: (messageId: string) => void;
};

const ChatContext = createContext<ChatValue | null>(null);

/** Sekme akis ortasinda kapanmissa yarim kalan mesajlari temizle. */
function sanitize(list: Conversation[]): Conversation[] {
  if (!Array.isArray(list)) return [];
  return list
    .filter((conversation) => conversation && Array.isArray(conversation.messages))
    .map((conversation) => ({
      ...conversation,
      messages: conversation.messages
        .filter((message) => !(message.streaming && !message.text.trim()))
        .map((message) => {
          const restored = { ...message };
          delete restored.streaming;
          return restored;
        }),
    }));
}

type Run = {
  abort: AbortController | null;
};

export function ChatProvider({ children }: { children: ReactNode }) {
  const { closeDrawer } = useUi();

  const [conversations, setConversations] = useState<Conversation[]>(() =>
    sanitize(readStored<Conversation[]>("conversations", []))
  );
  const [activeId, setActiveId] = useStoredState<string | null>(
    "active-conversation",
    null
  );
  const [model, setModel] = useStoredState<ModelId>("model", "flash");
  const [isStreaming, setIsStreaming] = useState(false);

  const run = useRef<Run>({ abort: null });
  const modelRef = useRef<ModelId>(model);
  modelRef.current = model;

  // Akis bitene kadar her karakterde diske yazmamak icin bekle.
  useEffect(() => {
    if (isStreaming) return;
    writeStored("conversations", conversations);
  }, [conversations, isStreaming]);

  const patchMessage = useCallback(
    (
      conversationId: string,
      messageId: string,
      update: (message: Message) => Message
    ) => {
      setConversations((previous) =>
        previous.map((conversation) =>
          conversation.id === conversationId
            ? {
                ...conversation,
                messages: conversation.messages.map((message) =>
                  message.id === messageId ? update(message) : message
                ),
              }
            : conversation
        )
      );
    },
    []
  );

  const clearRun = useCallback(() => {
    run.current.abort?.abort();
    run.current.abort = null;
  }, []);

  const startRun = useCallback(
    (conversationId: string, history: Array<{ role: "user" | "assistant"; text: string }>) => {
      clearRun();
      const abort = new AbortController();
      run.current.abort = abort;
      setIsStreaming(true);
      const assistantId = uid();

      setConversations((previous) =>
        previous.map((conversation) =>
          conversation.id === conversationId
            ? {
                ...conversation,
                messages: [
                  ...conversation.messages,
                  {
                    id: assistantId,
                    role: "assistant" as const,
                    text: "",
                    at: Date.now(),
                    streaming: true,
                  },
                ],
              }
            : conversation
        )
      );

      const payload = history
        .filter((item) => item.text.trim())
        .slice(-20)
        .map((item) => ({ role: item.role, content: item.text }));

      void (async () => {
        try {
          let full = "";
          await streamAssistant(
            payload,
            modelRef.current,
            (delta) => {
              full += delta;
              const snapshot = full;
              patchMessage(conversationId, assistantId, (message) => ({
                ...message,
                text: snapshot,
              }));
            },
            abort.signal
          );
          if (abort.signal.aborted) return;
          patchMessage(conversationId, assistantId, (message) => ({
            ...message,
            streaming: false,
          }));
        } catch (err) {
          if (abort.signal.aborted) return;
          const message =
            err instanceof Error
              ? err.message
              : "Yanıt şu an üretilemedi. Biraz sonra tekrar deneyin.";
          patchMessage(conversationId, assistantId, (item) => ({
            ...item,
            text: item.text.trim() || message,
            streaming: false,
          }));
        } finally {
          if (!abort.signal.aborted) {
            setIsStreaming(false);
            if (run.current.abort === abort) run.current.abort = null;
          }
        }
      })();
    },
    [clearRun, patchMessage]
  );

  const stop = useCallback(() => {
    clearRun();
    setIsStreaming(false);
    setConversations((previous) =>
      previous.map((conversation) => ({
        ...conversation,
        messages: conversation.messages
          .filter((message) => !(message.streaming && !message.text.trim()))
          .map((message) =>
            message.streaming ? { ...message, streaming: false } : message
          ),
      }))
    );
  }, [clearRun]);

  useEffect(() => clearRun, [clearRun]);

  const send = useCallback(
    (raw: string, attachments: Attachment[] = []) => {
      const text = raw.trim();
      if (!text) return;

      const userMessage: Message = {
        id: uid(),
        role: "user",
        text,
        at: Date.now(),
        ...(attachments.length ? { attachments } : {}),
      };

      const targetId = activeId ?? uid();
      const previous = conversations.find((item) => item.id === targetId);
      const history = [...(previous?.messages ?? []), userMessage].map((item) => ({
        role: item.role,
        text: item.text,
      }));

      setConversations((list) => {
        const exists = list.some((conversation) => conversation.id === targetId);
        if (exists) {
          return list.map((conversation) =>
            conversation.id === targetId
              ? {
                  ...conversation,
                  at: Date.now(),
                  messages: [...conversation.messages, userMessage],
                }
              : conversation
          );
        }
        return [
          {
            id: targetId,
            title: titleFromPrompt(text),
            messages: [userMessage],
            at: Date.now(),
          },
          ...list,
        ];
      });

      if (!activeId) setActiveId(targetId);
      startRun(targetId, history);
    },
    [activeId, conversations, setActiveId, startRun]
  );

  const newChat = useCallback(() => {
    clearRun();
    setIsStreaming(false);
    setActiveId(null);
    closeDrawer();
  }, [clearRun, closeDrawer, setActiveId]);

  const selectChat = useCallback(
    (id: string) => {
      clearRun();
      setIsStreaming(false);
      setActiveId(id);
      closeDrawer();
    },
    [clearRun, closeDrawer, setActiveId]
  );

  const deleteChat = useCallback(
    (id: string) => {
      setConversations((previous) =>
        previous.filter((conversation) => conversation.id !== id)
      );
      setActiveId((current) => (current === id ? null : current));
    },
    [setActiveId]
  );

  const clearAll = useCallback(() => {
    clearRun();
    setIsStreaming(false);
    setConversations([]);
    setActiveId(null);
  }, [clearRun, setActiveId]);

  const regenerate = useCallback(
    (messageId: string) => {
      const conversation = conversations.find((item) => item.id === activeId);
      if (!conversation) return;
      const index = conversation.messages.findIndex(
        (message) => message.id === messageId
      );
      if (index < 1) return;
      const history = conversation.messages.slice(0, index);
      if (!history.some((message) => message.role === "user")) return;

      setConversations((previous) =>
        previous.map((item) =>
          item.id === conversation.id
            ? { ...item, messages: history }
            : item
        )
      );
      startRun(
        conversation.id,
        history.map((item) => ({ role: item.role, text: item.text }))
      );
    },
    [activeId, conversations, startRun]
  );

  const toggleLike = useCallback(
    (messageId: string) => {
      if (!activeId) return;
      patchMessage(activeId, messageId, (message) => ({
        ...message,
        liked: !message.liked,
      }));
    },
    [activeId, patchMessage]
  );

  const activeConversation = useMemo(
    () => conversations.find((conversation) => conversation.id === activeId) ?? null,
    [conversations, activeId]
  );

  const value = useMemo<ChatValue>(
    () => ({
      conversations,
      activeId,
      activeConversation,
      messages: activeConversation?.messages ?? [],
      isStreaming,
      model,
      setModel,
      send,
      stop,
      newChat,
      selectChat,
      deleteChat,
      clearAll,
      regenerate,
      toggleLike,
    }),
    [
      conversations,
      activeId,
      activeConversation,
      isStreaming,
      model,
      setModel,
      send,
      stop,
      newChat,
      selectChat,
      deleteChat,
      clearAll,
      regenerate,
      toggleLike,
    ]
  );

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}

export function useChat(): ChatValue {
  const context = useContext(ChatContext);
  if (!context) throw new Error("useChat must be used within ChatProvider");
  return context;
}
