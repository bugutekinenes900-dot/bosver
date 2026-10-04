import type { ModelId, ModelInfo, StreamSpeed } from "../types";

export const MODELS: ModelInfo[] = [
  {
    id: "flash",
    name: "Anar Flash",
    tagline: "Günlük işler için hızlı ve dengeli yanıtlar",
    icon: "bolt",
  },
  {
    id: "pro",
    name: "Anar Pro",
    tagline: "Karmaşık akıl yürütme ve uzun içerik için derin analiz",
    icon: "workspace_premium",
  },
  {
    id: "mini",
    name: "Anar Mini",
    tagline: "Kısa sorular için en düşük gecikme",
    icon: "flash_on",
  },
];

export function modelById(id: ModelId): ModelInfo {
  return MODELS.find((model) => model.id === id) ?? MODELS[0];
}

type Recipe = {
  match: RegExp;
  build: (prompt: string) => string;
};

const RECIPES: Recipe[] = [
  {
    match: /(merhaba|selam|hey|günaydın|gunaydin|iyi ak[sş]amlar)/i,
    build: () =>
      `Merhaba! Ben Anar. Bugün size nasıl yardımcı olabilirim?\n\nAklınızda bir konu varsa doğrudan yazabilirsiniz; isterseniz fikir üretmek, metin yazmak, kod yazmak veya uzun bir metni özetlemek için de kullanabilirsiniz.`,
  },
  {
    match: /(kod|python|javascript|react|fonksiyon|algoritma|hata|bug)/i,
    build: (prompt) =>
      `"${prompt}" için kod tarafında şu yaklaşımı öneriyorum:\n\n1. Önce girdi ve çıktı sözleşmesini netleştirelim\n2. En küçük çalışan sürümü yazıp testle doğrulayalım\n3. Ardından hata durumlarını ve sınır koşullarını ekleyelim\n\nÖrnek bir iskelet:\n\ndef cozum(girdi):\n    if not girdi:\n        return None\n    # ana mantık buraya\n    return girdi\n\nHangi dilde ilerlemek istersiniz?`,
  },
  {
    match: /(e-?posta|mail|mektup|yazı|yazi|metin|taslak)/i,
    build: (prompt) =>
      `"${prompt}" için kısa ve net bir taslak hazırladım:\n\nKonu: [konuyu buraya yazın]\n\nMerhaba [isim],\n\nUmarım iyisinizdir. Size [amaç] konusunda yazmak istedim. [Bir cümlelik bağlam.] Bu konuda [somut talep] mümkün müdür?\n\nDönüşünüzü bekliyorum, iyi çalışmalar.\n\nTonunu daha resmi ya da daha samimi yapmamı ister misiniz?`,
  },
  {
    match: /(hikaye|masal|senaryo|yaratıcı|yaratici|şiir|siir)/i,
    build: (prompt) =>
      `"${prompt}" için bir açılış önerisi:\n\nŞehrin üzerine akşam inerken, kimsenin fark etmediği bir şey oluyordu: lambalar hep aynı anda yanıyor, ama biri her zaman bir saniye geç kalıyordu. O lambanın altında duran kişi, bu gecikmeyi yıllardır sayıyordu.\n\nDevamını getirelim mi, yoksa karakteri ve atmosferi önce birlikte mi kuralım?`,
  },
  {
    match: /(fikir|öneri|oneri|beyin fırtınası|plan|strateji)/i,
    build: (prompt) =>
      `"${prompt}" için üç farklı yön:\n\n1. Hızlı kazanım: en az emekle en görünür sonucu veren adım\n2. Orta vadeli: iki-üç haftalık emekle kalıcı fark yaratan seçenek\n3. İddialı: daha riskli ama ayrıştırıcı olan yol\n\nHangisini açalım? Seçerseniz o yönü adım adım plana çevirebilirim.`,
  },
];

const FALLBACK = (prompt: string) =>
  `Harika bir soru! "${prompt}" konusunda size memnuniyetle yardımcı olabilirim. Bu süreci optimize etmek için birkaç farklı yaklaşım izleyebiliriz:\n\n1. Kapsamlı bir analiz hazırlamak\n2. İlgili kaynakları listelemek\n3. Adım adım bir yol haritası çıkarmak\n\nHangi adımla başlamamızı istersiniz?`;

const MODEL_TONE: Record<ModelId, (body: string) => string> = {
  flash: (body) => body,
  pro: (body) =>
    `${body}\n\nDaha derine inmemi isterseniz konuyu alt başlıklara ayırıp her biri için gerekçe, alternatif ve olası riskleri de çıkarabilirim.`,
  mini: (body) => body.split("\n\n").slice(0, 2).join("\n\n"),
};

export function buildReply(prompt: string, model: ModelId): string {
  const recipe = RECIPES.find((item) => item.match.test(prompt));
  const body = recipe ? recipe.build(prompt) : FALLBACK(prompt);
  return MODEL_TONE[model](body);
}

const SPEED_MS: Record<StreamSpeed, number> = {
  slow: 22,
  normal: 12,
  fast: 5,
};

const MODEL_CHARS: Record<ModelId, number> = {
  flash: 2,
  pro: 1,
  mini: 3,
};

export type StreamHandle = { cancel: () => void };

export function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/**
 * Metni karakter karakter akitir. Tik basina birden fazla karakter yazilir,
 * boylece React her karakterde degil, ~60fps hizinda render eder.
 */
export function streamText(
  text: string,
  options: { model: ModelId; speed: StreamSpeed },
  onChunk: (soFar: string) => void,
  onDone: () => void
): StreamHandle {
  if (prefersReducedMotion()) {
    onChunk(text);
    onDone();
    return { cancel: () => {} };
  }

  const step = MODEL_CHARS[options.model];
  const tick = SPEED_MS[options.speed];
  let index = 0;

  const timer = window.setInterval(() => {
    index = Math.min(text.length, index + step);
    onChunk(text.slice(0, index));
    if (index >= text.length) {
      window.clearInterval(timer);
      onDone();
    }
  }, tick);

  return {
    cancel: () => {
      window.clearInterval(timer);
    },
  };
}

export function titleFromPrompt(prompt: string): string {
  const clean = prompt.replace(/\s+/g, " ").trim();
  return clean.length > 40 ? `${clean.slice(0, 40).trimEnd()}...` : clean;
}
