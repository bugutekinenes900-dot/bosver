import { useCallback, useEffect, useRef, useState } from "react";

const PREFIX = "anar:";

export function readStored<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(PREFIX + key);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

export function writeStored<T>(key: string, value: T): void {
  try {
    window.localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    // Kota dolu veya gizli sekme: kalicilik olmadan devam et.
  }
}

/** localStorage'a yazan useState. Ilk deger yalnizca mount'ta okunur. */
export function useStoredState<T>(key: string, fallback: T) {
  const [value, setValue] = useState<T>(() => readStored(key, fallback));
  const keyRef = useRef(key);
  keyRef.current = key;

  useEffect(() => {
    writeStored(keyRef.current, value);
  }, [value]);

  return [value, setValue] as const;
}

export function uid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Bagimliligi degistiginde en guncel callback'i cagiran sabit referans. */
export function useEvent<T extends (...args: never[]) => unknown>(handler: T): T {
  const ref = useRef(handler);
  ref.current = handler;
  return useCallback(((...args: never[]) => ref.current(...args)) as T, []);
}
