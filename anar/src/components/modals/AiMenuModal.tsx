import clsx from "clsx";
import { Modal } from "./Modal";
import { Icon } from "../Icon";
import { useUi } from "../../state/UiContext";
import { useChat } from "../../state/ChatContext";
import { MODELS } from "../../lib/simulateReply";

export function AiMenuModal() {
  const { closeModal } = useUi();
  const { model, setModel } = useChat();

  return (
    <Modal
      title="Yapay Zeka Menüsü"
      description="Yanıtların derinliğini ve hızını belirleyen modeli seçin."
      onClose={closeModal}
    >
      <div className="flex flex-col gap-space-sm" role="radiogroup" aria-label="Model seçimi">
        {MODELS.map((item) => {
          const active = item.id === model;
          return (
            <button
              key={item.id}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => {
                setModel(item.id);
                closeModal();
              }}
              className={clsx(
                "flex items-start gap-space-md p-space-md rounded-xl text-left transition-colors",
                active
                  ? "bg-primary-container text-on-primary-container"
                  : "bg-surface-container-low text-on-surface hover:bg-surface-container-high"
              )}
            >
              <span
                className={clsx(
                  "w-10 h-10 rounded-full flex items-center justify-center shrink-0",
                  active
                    ? "bg-on-primary-container/20 text-on-primary-container"
                    : "bg-surface-container-high text-primary"
                )}
              >
                <Icon name={item.icon} size={20} filled={active} />
              </span>
              <span className="flex flex-col gap-space-xs min-w-0 flex-1">
                <span className="font-label-md text-label-md font-semibold">
                  {item.name}
                </span>
                <span
                  className={clsx(
                    "font-body-sm text-body-sm",
                    active ? "text-on-primary-container/80" : "text-on-surface-variant"
                  )}
                >
                  {item.tagline}
                </span>
              </span>
              {active && <Icon name="check_circle" size={20} filled />}
            </button>
          );
        })}
      </div>
    </Modal>
  );
}
