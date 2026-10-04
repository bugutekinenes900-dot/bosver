import clsx from "clsx";
import { Icon } from "../Icon";
import { SidebarItem } from "./SidebarItem";
import { useUi } from "../../state/UiContext";
import { useChat } from "../../state/ChatContext";

export function Sidebar() {
  const { drawerOpen, sidebarCollapsed, toggleSidebar, openModal, isDesktop } =
    useUi();
  const { conversations, activeId, newChat, selectChat, deleteChat } = useChat();

  const collapsed = sidebarCollapsed;

  return (
    <aside
      aria-label="Ana menü"
      aria-hidden={!isDesktop && !drawerOpen}
      className={clsx(
        "fixed left-0 top-0 h-[100dvh] bg-surface-container-low z-50",
        "flex flex-col justify-between py-space-md px-space-md",
        "transition-[transform,width] duration-300 ease-out",
        collapsed ? "w-[88px]" : "w-72",
        // Kapaliyken `invisible`, boylece ekran disindaki butonlar Tab sirasindan cikar.
        drawerOpen ? "translate-x-0 visible" : "-translate-x-full invisible",
        "md:translate-x-0 md:visible"
      )}
    >
      <div className="flex flex-col gap-space-md min-h-0 flex-1">
        <div
          className={clsx(
            "flex items-center px-space-sm py-space-sm",
            collapsed ? "justify-center" : "justify-between"
          )}
        >
          <button
            type="button"
            onClick={toggleSidebar}
            className="p-space-sm rounded-full hover:bg-surface-container-high hover:text-on-surface text-on-surface-variant transition-colors"
            title={
              isDesktop
                ? collapsed
                  ? "Menüyü genişlet"
                  : "Menüyü daralt"
                : "Menüyü kapat"
            }
            aria-label={
              isDesktop
                ? collapsed
                  ? "Menüyü genişlet"
                  : "Menüyü daralt"
                : "Menüyü kapat"
            }
            aria-expanded={!collapsed}
          >
            <Icon name="menu" size={24} />
          </button>
          {!collapsed && (
            <span className="font-headline-sm text-headline-sm text-on-surface font-semibold">
              AnAr
            </span>
          )}
        </div>

        <button
          type="button"
          onClick={newChat}
          title={collapsed ? "Yeni Sohbet" : undefined}
          aria-label="Yeni Sohbet"
          className={clsx(
            "flex items-center bg-surface-container-high rounded-full text-on-surface hover:bg-surface-container-highest transition-colors",
            collapsed
              ? "justify-center p-space-md"
              : "gap-space-md px-space-md py-space-md"
          )}
        >
          <Icon name="add" />
          {!collapsed && <span className="font-label-md text-label-md">Yeni Sohbet</span>}
        </button>

        <SidebarItem
          icon="auto_awesome"
          label="Yapay Zeka Menüsü"
          collapsed={collapsed}
          onClick={() => openModal("ai-menu")}
        />

        {collapsed ? (
          <SidebarItem
            icon="chat_bubble_outline"
            label="Geçmiş"
            collapsed
            onClick={toggleSidebar}
          />
        ) : (
          <div className="flex flex-col gap-space-xs mt-space-md min-h-0">
            <span className="px-space-md font-label-sm text-label-sm text-outline uppercase tracking-wider">
              Geçmiş
            </span>
            <nav className="flex flex-col gap-space-xs overflow-y-auto min-h-0">
              {conversations.length === 0 ? (
                <p className="px-space-md py-space-sm font-body-sm text-body-sm text-outline">
                  Henüz sohbet yok. "Yeni Sohbet" ile başlayın.
                </p>
              ) : (
                conversations.map((conversation) => {
                  const active = conversation.id === activeId;
                  return (
                    <div key={conversation.id} className="relative group">
                      <button
                        type="button"
                        onClick={() => selectChat(conversation.id)}
                        aria-label={conversation.title}
                        aria-current={active ? "page" : undefined}
                        className={clsx(
                          "flex items-center w-full px-space-md py-space-sm pr-space-xl rounded-full transition-colors text-left",
                          active
                            ? "bg-primary-container text-on-primary-container font-semibold"
                            : "text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface"
                        )}
                      >
                        <Icon name="chat_bubble_outline" className="mr-space-md" />
                        <span className="font-body-md text-body-md truncate">
                          {conversation.title}
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteChat(conversation.id)}
                        className={clsx(
                          "absolute right-space-sm top-1/2 -translate-y-1/2 p-space-xs rounded-full",
                          "opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity",
                          "hover:bg-surface-container-highest",
                          active ? "text-on-primary-container" : "text-on-surface-variant"
                        )}
                        title="Sohbeti sil"
                        aria-label={`${conversation.title} sohbetini sil`}
                      >
                        <Icon name="delete" size={18} />
                      </button>
                    </div>
                  );
                })
              )}
            </nav>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-space-xs border-t border-outline-variant/30 pt-space-md">
        <SidebarItem
          icon="settings"
          label="Ayarlar"
          collapsed={collapsed}
          onClick={() => openModal("settings")}
        />
        <button
          type="button"
          onClick={() => openModal("profile")}
          title={collapsed ? "Profil / Hesap" : undefined}
          aria-label="Profil / Hesap"
          className={clsx(
            "flex items-center rounded-full text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface transition-colors",
            collapsed
              ? "justify-center px-space-sm py-space-sm"
              : "gap-space-md px-space-md py-space-sm"
          )}
        >
          <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center shrink-0">
            <Icon name="person" size={18} className="text-on-primary" />
          </div>
          {!collapsed && (
            <span className="font-body-md text-body-md">Profil / Hesap</span>
          )}
        </button>
      </div>
    </aside>
  );
}
