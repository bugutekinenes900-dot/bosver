import { useUi } from "../../state/UiContext";
import { SettingsModal } from "./SettingsModal";
import { ProfileModal } from "./ProfileModal";
import { AiMenuModal } from "./AiMenuModal";

export function Modals() {
  const { modal } = useUi();

  if (modal === "settings") return <SettingsModal />;
  if (modal === "profile") return <ProfileModal />;
  if (modal === "ai-menu") return <AiMenuModal />;
  return null;
}
