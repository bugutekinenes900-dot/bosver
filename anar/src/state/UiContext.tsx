import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useStoredState } from "../lib/storage";
import { useIsDesktop } from "./useMediaQuery";
import type { ModalId, Profile, StreamSpeed, Theme } from "../types";

type UiValue = {
  isDesktop: boolean;
  drawerOpen: boolean;
  openDrawer: () => void;
  closeDrawer: () => void;
  /** Mobilde drawer'i, masaustunde ikon rayini ac/kapat. */
  toggleSidebar: () => void;
  sidebarCollapsed: boolean;
  modal: ModalId | null;
  openModal: (id: ModalId) => void;
  closeModal: () => void;
  theme: Theme;
  setTheme: (theme: Theme) => void;
  streamSpeed: StreamSpeed;
  setStreamSpeed: (speed: StreamSpeed) => void;
  profile: Profile;
  setProfile: (profile: Profile) => void;
};

const DEFAULT_PROFILE: Profile = {
  name: "Misafir Kullanıcı",
  email: "misafir@anar.ai",
  plan: "Anar Free",
};

const UiContext = createContext<UiValue | null>(null);

export function UiProvider({ children }: { children: ReactNode }) {
  const isDesktop = useIsDesktop();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useStoredState(
    "sidebar-collapsed",
    false
  );
  const [modal, setModal] = useState<ModalId | null>(null);
  // Tasarimin varsayilani acik tema; koyu tema Ayarlar'dan secilir.
  const [theme, setTheme] = useStoredState<Theme>("theme", "light");
  const [streamSpeed, setStreamSpeed] = useStoredState<StreamSpeed>(
    "stream-speed",
    "normal"
  );
  const [profile, setProfile] = useStoredState<Profile>(
    "profile",
    DEFAULT_PROFILE
  );

  const closeDrawer = useCallback(() => setDrawerOpen(false), []);
  const openDrawer = useCallback(() => setDrawerOpen(true), []);

  const toggleSidebar = useCallback(() => {
    if (isDesktop) {
      setSidebarCollapsed((value) => !value);
    } else {
      setDrawerOpen((value) => !value);
    }
  }, [isDesktop, setSidebarCollapsed]);

  // Masaustune gecildiginde acik kalmis drawer'i kapat.
  useEffect(() => {
    if (isDesktop) setDrawerOpen(false);
  }, [isDesktop]);

  // Mobilde drawer acikken arka planin kaymasini engelle.
  useEffect(() => {
    if (!drawerOpen || isDesktop) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [drawerOpen, isDesktop]);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("dark", theme === "dark");
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute("content", theme === "dark" ? "#131314" : "#f8f9fa");
  }, [theme]);

  // ESC once modali, yoksa drawer'i kapatir.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (modal) setModal(null);
      else if (drawerOpen) setDrawerOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [modal, drawerOpen]);

  const value = useMemo<UiValue>(
    () => ({
      isDesktop,
      drawerOpen,
      openDrawer,
      closeDrawer,
      toggleSidebar,
      sidebarCollapsed: isDesktop ? sidebarCollapsed : false,
      modal,
      openModal: (id: ModalId) => setModal(id),
      closeModal: () => setModal(null),
      theme,
      setTheme,
      streamSpeed,
      setStreamSpeed,
      profile,
      setProfile,
    }),
    [
      isDesktop,
      drawerOpen,
      openDrawer,
      closeDrawer,
      toggleSidebar,
      sidebarCollapsed,
      modal,
      theme,
      setTheme,
      streamSpeed,
      setStreamSpeed,
      profile,
      setProfile,
    ]
  );

  return <UiContext.Provider value={value}>{children}</UiContext.Provider>;
}

export function useUi(): UiValue {
  const context = useContext(UiContext);
  if (!context) throw new Error("useUi must be used within UiProvider");
  return context;
}
