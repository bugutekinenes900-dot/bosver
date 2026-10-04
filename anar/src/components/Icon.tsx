import clsx from "clsx";

type IconProps = {
  name: string;
  size?: number;
  filled?: boolean;
  className?: string;
};

/** Stitch tasariminin kullandigi Material Symbols Outlined ikon fontu. */
export function Icon({ name, size = 20, filled = false, className }: IconProps) {
  return (
    <span
      aria-hidden="true"
      className={clsx("material-symbols-outlined shrink-0 select-none", className)}
      style={{
        fontSize: `${size}px`,
        width: `${size}px`,
        height: `${size}px`,
        fontVariationSettings: `'FILL' ${filled ? 1 : 0}`,
      }}
    >
      {name}
    </span>
  );
}
