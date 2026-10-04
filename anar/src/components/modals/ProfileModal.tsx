import { useState } from "react";
import { Modal } from "./Modal";
import { Icon } from "../Icon";
import { useUi } from "../../state/UiContext";
import type { Profile } from "../../types";

const GUEST: Profile = {
  name: "Misafir Kullanıcı",
  email: "misafir@anar.ai",
  plan: "Anar Free",
};

export function ProfileModal() {
  const { closeModal, profile, setProfile } = useUi();
  const [draft, setDraft] = useState<Profile>(profile);
  const [saved, setSaved] = useState(false);

  const update = (patch: Partial<Profile>) => {
    setDraft((previous) => ({ ...previous, ...patch }));
    setSaved(false);
  };

  const inputClass =
    "w-full bg-surface-container rounded-full px-space-md py-space-sm font-body-md text-body-md text-on-surface placeholder:text-outline outline-none focus:ring-2 focus:ring-primary/40 transition-shadow";

  return (
    <Modal
      title="Profil / Hesap"
      description="Bu bilgiler yalnızca bu tarayıcıda saklanır."
      onClose={closeModal}
    >
      <div className="flex flex-col gap-space-lg">
        <div className="flex items-center gap-space-md">
          <div className="w-14 h-14 rounded-full bg-primary flex items-center justify-center shrink-0">
            <Icon name="person" size={28} className="text-on-primary" />
          </div>
          <div className="min-w-0">
            <p className="font-headline-sm text-headline-sm text-on-surface truncate">
              {draft.name || "İsimsiz"}
            </p>
            <span className="inline-flex items-center gap-space-xs mt-space-xs px-space-sm py-space-xs rounded-full bg-secondary-container text-on-secondary-container font-label-sm text-label-sm">
              <Icon name="workspace_premium" size={14} />
              {draft.plan}
            </span>
          </div>
        </div>

        <label className="flex flex-col gap-space-xs">
          <span className="font-label-md text-label-md text-on-surface-variant">
            Ad Soyad
          </span>
          <input
            className={inputClass}
            value={draft.name}
            onChange={(event) => update({ name: event.target.value })}
            placeholder="Adınız"
          />
        </label>

        <label className="flex flex-col gap-space-xs">
          <span className="font-label-md text-label-md text-on-surface-variant">
            E-posta
          </span>
          <input
            className={inputClass}
            type="email"
            value={draft.email}
            onChange={(event) => update({ email: event.target.value })}
            placeholder="ornek@anar.ai"
          />
        </label>

        <div className="flex flex-wrap gap-space-sm pt-space-md border-t border-outline-variant/30">
          <button
            type="button"
            onClick={() => {
              setProfile(draft);
              setSaved(true);
            }}
            className="flex items-center gap-space-xs px-space-md py-space-sm rounded-full bg-primary-container text-on-primary-container font-label-md text-label-md hover:opacity-90 transition-opacity"
          >
            <Icon name={saved ? "check" : "save"} size={18} />
            {saved ? "Kaydedildi" : "Kaydet"}
          </button>
          <button
            type="button"
            onClick={() => {
              setProfile(GUEST);
              setDraft(GUEST);
              setSaved(false);
            }}
            className="flex items-center gap-space-xs px-space-md py-space-sm rounded-full bg-surface-container-high text-on-surface font-label-md text-label-md hover:bg-surface-container-highest transition-colors"
          >
            <Icon name="logout" size={18} />
            Çıkış yap
          </button>
        </div>
      </div>
    </Modal>
  );
}
