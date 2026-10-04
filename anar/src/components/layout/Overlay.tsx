import clsx from "clsx";
import { useUi } from "../../state/UiContext";

/** Mobilde drawer acikken iceriklerin uzerine gelen karartma. */
export function Overlay() {
  const { drawerOpen, closeDrawer } = useUi();

  return (
    <div
      onClick={closeDrawer}
      aria-hidden="true"
      className={clsx(
        "fixed inset-0 z-40 bg-black/30 transition-opacity duration-300 md:hidden",
        drawerOpen ? "opacity-100" : "pointer-events-none opacity-0"
      )}
    />
  );
}
