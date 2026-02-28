import { useNavigate } from 'react-router-dom';
import { useSectionStore, type AppSection } from '@/stores/sectionStore';
import { Music, Clapperboard, BookOpen } from 'lucide-react';
import { cn } from '@/lib/utils';

const SECTIONS: {
  id: AppSection;
  label: string;
  icon: React.ElementType;
  accent: string;    // used for inline style on the active indicator
  accentBg: string;  // tailwind-safe class: needs to be literal
}[] = [
  { id: 'music',     label: 'Musik',      icon: Music,       accent: 'hsl(262 83% 77%)', accentBg: 'music' },
  { id: 'video',     label: 'Video',      icon: Clapperboard, accent: 'hsl(213 94% 68%)', accentBg: 'video' },
  { id: 'audiobook', label: 'Hörbücher',  icon: BookOpen,    accent: 'hsl(45 93% 47%)',  accentBg: 'audiobook' },
];

const ROOT_ROUTES: Record<AppSection, string> = {
  music:     '/music',
  video:     '/video/recently-added',
  audiobook: '/audiobooks/recent',
};

interface Props {
  collapsed: boolean;
}

export function SectionSwitcher({ collapsed }: Props) {
  const { section, setSection } = useSectionStore();
  const navigate = useNavigate();

  const handleSwitch = (s: AppSection) => {
    setSection(s);
    navigate(ROOT_ROUTES[s]);
  };

  if (collapsed) {
    // Compact: single column of icons
    return (
      <div className="flex flex-col items-center gap-1 px-2 py-2">
        {SECTIONS.map(({ id, icon: Icon, accent }) => {
          const isActive = section === id;
          return (
            <button
              key={id}
              onClick={() => handleSwitch(id)}
              title={SECTIONS.find((s) => s.id === id)!.label}
              style={isActive ? { color: accent } : undefined}
              className={cn(
                'h-9 w-9 flex items-center justify-center rounded-lg transition-all',
                isActive
                  ? 'bg-white/10'
                  : 'text-zinc-500 hover:text-zinc-300 hover:bg-white/5',
              )}
            >
              <Icon className="h-5 w-5" />
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div className="mx-3 my-2">
      <div className="flex gap-1 rounded-xl bg-[#18181d] p-1">
        {SECTIONS.map(({ id, label, icon: Icon, accent }) => {
          const isActive = section === id;
          return (
            <button
              key={id}
              onClick={() => handleSwitch(id)}
              className={cn(
                'relative flex flex-1 flex-col items-center gap-1 rounded-lg py-2 px-1 transition-all duration-200',
                isActive ? 'bg-white/5' : 'hover:bg-[#1f1f26]',
              )}
              style={
                isActive
                  ? {
                      boxShadow: `0 0 0 1px ${accent}40`,
                      background: `linear-gradient(135deg, ${accent}18, ${accent}0a)`,
                    }
                  : undefined
              }
            >
              <Icon
                className="h-4 w-4 transition-colors"
                style={isActive ? { color: accent } : { color: '#888' }}
              />
              <span
                className="text-[10px] font-medium leading-none transition-colors"
                style={isActive ? { color: accent } : { color: '#666' }}
              >
                {label}
              </span>

              {/* Bottom accent bar */}
              {isActive && (
                <span
                  className="absolute bottom-0.5 left-1/2 -translate-x-1/2 h-0.5 w-4 rounded-full"
                  style={{ backgroundColor: accent }}
                />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
