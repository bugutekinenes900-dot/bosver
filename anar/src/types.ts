export type Role = "user" | "assistant";

export type Attachment = {
  id: string;
  name: string;
  size: number;
};

export type Message = {
  id: string;
  role: Role;
  text: string;
  at: number;
  /** Yanit halen akiyorsa true; metin bos ise "hazirlaniyor" durumu gosterilir. */
  streaming?: boolean;
  liked?: boolean;
  attachments?: Attachment[];
};

export type Conversation = {
  id: string;
  title: string;
  messages: Message[];
  at: number;
};

export type ModelId = "flash" | "pro" | "mini";

export type ModelInfo = {
  id: ModelId;
  name: string;
  tagline: string;
  icon: string;
};

export type Theme = "light" | "dark";

export type StreamSpeed = "slow" | "normal" | "fast";

export type ModalId = "settings" | "profile" | "ai-menu";

export type Profile = {
  name: string;
  email: string;
  plan: string;
};
