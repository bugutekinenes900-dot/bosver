import { SuggestionCard } from "./SuggestionCard";

const SUGGESTIONS = [
  { label: "Bir e-posta taslakla", icon: "edit_note" },
  { label: "Python kodu yaz", icon: "code" },
  { label: "Yaratıcı hikaye oluştur", icon: "auto_stories" },
  { label: "Fikir üret", icon: "lightbulb" },
];

export function WelcomeState({ onSelect }: { onSelect: (text: string) => void }) {
  return (
    <div className="flex flex-col items-center justify-center my-auto py-space-xl text-center animate-fade-in">
      <div className="w-16 h-16 rounded-full bg-primary-container/10 flex items-center justify-center mb-space-md text-primary-container">
        <svg
          className="w-8 h-8 text-primary"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
          role="img"
          aria-label="Anar"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 5a3 3 0 10-5.997.125 4 4 0 00-2.526 5.77 4 4 0 00.556 6.588A4 4 0 1012 18m0-13a3 3 0 115.997.125 4 4 0 012.526 5.77 4 4 0 01-.556 6.588A4 4 0 1112 18m0-13v13"
          />
        </svg>
      </div>

      <h2 className="font-headline-lg text-headline-lg text-on-surface mb-space-sm">
        Merhaba! Size bugün nasıl yardımcı olabilirim?
      </h2>
      <p className="font-body-lg text-body-lg text-on-surface-variant max-w-md mb-space-xl">
        Kod yazın, fikir üretin, karmaşık konuları özetleyin veya sadece yaratıcı
        projeler tasarlayın.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-space-md w-full max-w-2xl">
        {SUGGESTIONS.map((suggestion) => (
          <SuggestionCard
            key={suggestion.label}
            label={suggestion.label}
            icon={suggestion.icon}
            onSelect={onSelect}
          />
        ))}
      </div>
    </div>
  );
}
