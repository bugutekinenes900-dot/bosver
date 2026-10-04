import clsx from "clsx";
import { Icon } from "../Icon";

type Option<T extends string> = {
  value: T;
  label: string;
  icon?: string;
};

type OptionRowProps<T extends string> = {
  label: string;
  options: Option<T>[];
  value: T;
  onChange: (value: T) => void;
};

/** Ayarlar modalindaki kucuk segment kontrolu. */
export function OptionRow<T extends string>({
  label,
  options,
  value,
  onChange,
}: OptionRowProps<T>) {
  return (
    <div className="flex flex-col gap-space-sm">
      <span className="font-label-md text-label-md text-on-surface-variant">
        {label}
      </span>
      <div
        role="radiogroup"
        aria-label={label}
        className="flex gap-space-xs p-space-xs bg-surface-container rounded-full"
      >
        {options.map((option) => {
          const active = option.value === value;
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onChange(option.value)}
              className={clsx(
                "flex-1 flex items-center justify-center gap-space-xs px-space-md py-space-sm rounded-full transition-colors font-label-md text-label-md",
                active
                  ? "bg-primary-container text-on-primary-container font-semibold"
                  : "text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface"
              )}
            >
              {option.icon && <Icon name={option.icon} size={18} />}
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
