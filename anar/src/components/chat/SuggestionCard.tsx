import { Icon } from "../Icon";

type SuggestionCardProps = {
  label: string;
  icon: string;
  onSelect: (label: string) => void;
};

export function SuggestionCard({ label, icon, onSelect }: SuggestionCardProps) {
  return (
    <button
      type="button"
      onClick={() => onSelect(label)}
      className="flex items-center justify-between p-space-md bg-surface-container-low hover:bg-surface-container-high transition-all rounded-xl text-left group"
    >
      <span className="font-label-md text-label-md text-on-surface">{label}</span>
      <Icon
        name={icon}
        className="text-outline group-hover:text-primary transition-colors"
      />
    </button>
  );
}
