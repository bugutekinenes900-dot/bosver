import clsx from "clsx";
import { Icon } from "../Icon";
import { useUi } from "../../state/UiContext";
import { useChat } from "../../state/ChatContext";
import { modelById } from "../../lib/simulateReply";

export function Header() {
  const { sidebarCollapsed, openDrawer, openModal } = useUi();
  const { model } = useChat();

  return (
    <header
      className={clsx(
        "fixed top-0 left-0 right-0 h-16 bg-surface/80 backdrop-blur-xl z-40",
        "flex items-center justify-between px-gutter transition-[left] duration-300 ease-out",
        sidebarCollapsed ? "md:left-[88px]" : "md:left-72"
      )}
    >
      <div className="flex items-center gap-space-sm">
        <button
          type="button"
          onClick={openDrawer}
          className="md:hidden p-space-sm -ml-space-sm rounded-full text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface transition-colors"
          title="Menüyü aç"
          aria-label="Menüyü aç"
        >
          <Icon name="menu" size={24} />
        </button>
        <span className="font-headline-sm text-headline-sm text-on-surface">AnAr</span>
        <button
          type="button"
          onClick={() => openModal("ai-menu")}
          className="flex items-center gap-space-xs px-space-sm py-space-xs rounded-full text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface transition-colors"
          title="Yapay zeka modelini değiştir"
        >
          <span className="font-label-md text-label-md">{modelById(model).name}</span>
          <Icon name="expand_more" size={18} />
        </button>
      </div>

      <div className="flex items-center gap-space-md">
        <button
          type="button"
          onClick={() => openModal("profile")}
          className="w-8 h-8 rounded-full bg-primary flex items-center justify-center hover:opacity-90 transition-opacity"
          title="Profil / Hesap"
          aria-label="Profil ve hesap"
        >
          <Icon name="person" size={18} className="text-on-primary" />
        </button>
      </div>
    </header>
  );
}
