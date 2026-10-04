import { useState } from "react";
import { Modal } from "./Modal";
import { OptionRow } from "./OptionRow";
import { Icon } from "../Icon";
import { useUi } from "../../state/UiContext";
import { useChat } from "../../state/ChatContext";
import type { StreamSpeed, Theme } from "../../types";

export function SettingsModal() {
  const { closeModal, theme, setTheme, streamSpeed, setStreamSpeed } = useUi();
  const { conversations, clearAll } = useChat();
  const [confirming, setConfirming] = useState(false);

  return (
    <Modal
      title="Ayarlar"
      description="Görünüm ve yanıt tercihlerinizi buradan yönetin."
      onClose={closeModal}
    >
      <div className="flex flex-col gap-space-lg">
        <OptionRow<Theme>
          label="Tema"
          value={theme}
          onChange={setTheme}
          options={[
            { value: "light", label: "Açık", icon: "light_mode" },
            { value: "dark", label: "Koyu", icon: "dark_mode" },
          ]}
        />

        <OptionRow<StreamSpeed>
          label="Yanıt akış hızı"
          value={streamSpeed}
          onChange={setStreamSpeed}
          options={[
            { value: "slow", label: "Yavaş" },
            { value: "normal", label: "Normal" },
            { value: "fast", label: "Hızlı" },
          ]}
        />

        <div className="flex flex-col gap-space-sm pt-space-md border-t border-outline-variant/30">
          <span className="font-label-md text-label-md text-on-surface-variant">
            Sohbet geçmişi
          </span>
          <p className="font-body-sm text-body-sm text-outline">
            {conversations.length > 0
              ? `${conversations.length} sohbet bu tarayıcıda saklanıyor.`
              : "Saklanan sohbet yok."}
          </p>

          {confirming ? (
            <div className="flex flex-wrap gap-space-sm">
              <button
                type="button"
                onClick={() => {
                  clearAll();
                  setConfirming(false);
                }}
                className="flex items-center gap-space-xs px-space-md py-space-sm rounded-full bg-error text-on-error font-label-md text-label-md hover:opacity-90 transition-opacity"
              >
                <Icon name="delete_forever" size={18} />
                Evet, tümünü sil
              </button>
              <button
                type="button"
                onClick={() => setConfirming(false)}
                className="px-space-md py-space-sm rounded-full bg-surface-container-high text-on-surface font-label-md text-label-md hover:bg-surface-container-highest transition-colors"
              >
                Vazgeç
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              disabled={conversations.length === 0}
              className="self-start flex items-center gap-space-xs px-space-md py-space-sm rounded-full bg-error-container text-on-error-container font-label-md text-label-md hover:opacity-90 transition-opacity disabled:opacity-40"
            >
              <Icon name="delete" size={18} />
              Tüm geçmişi temizle
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}
