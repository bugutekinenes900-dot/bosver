import clsx from "clsx";
import { Icon } from "../Icon";

type SidebarItemProps = {
  icon: string;
  label: string;
  onClick: () => void;
  active?: boolean;
  collapsed?: boolean;
  filled?: boolean;
};

export function SidebarItem({
  icon,
  label,
  onClick,
  active = false,
  collapsed = false,
  filled = false,
}: SidebarItemProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={collapsed ? label : undefined}
      aria-label={label}
      aria-current={active ? "page" : undefined}
      className={clsx(
        "flex items-center w-full rounded-full transition-colors",
        collapsed ? "justify-center px-space-sm py-space-sm" : "px-space-md py-space-sm",
        active
          ? "bg-primary-container text-on-primary-container font-semibold"
          : "text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface"
      )}
    >
      <Icon name={icon} filled={filled} className={collapsed ? undefined : "mr-space-md"} />
      {!collapsed && (
        <span className="font-body-md text-body-md truncate">{label}</span>
      )}
    </button>
  );
}
