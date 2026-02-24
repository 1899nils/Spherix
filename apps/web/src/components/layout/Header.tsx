import { Search, Settings as SettingsIcon, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useUIStore } from '@/stores/uiStore';

export function Header() {
  const setSettingsOpen = useUIStore((state) => state.setSettingsOpen);

  return (
    <header className="h-16 flex items-center justify-between px-8 bg-background/50 backdrop-blur-md sticky top-0 z-40 border-b border-white/5">
      {/* Left: Empty for balance or could have breadcrumbs */}
      <div className="w-1/4"></div>

      {/* Center: Search */}
      <div className="flex-1 max-w-xl relative text-white">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <input
          type="text"
          placeholder="Suche nach Künstlern, Alben oder Songs..."
          className="w-full bg-white/5 border border-white/10 pl-10 h-10 rounded-full focus:outline-none focus:ring-1 focus:ring-white/20 transition-all text-sm placeholder:text-muted-foreground"
        />
      </div>

      {/* Right: Settings & User */}
      <div className="w-1/4 flex justify-end items-center gap-3">
        <Button 
          variant="ghost" 
          size="icon" 
          className="hover:bg-white/10 rounded-full"
          onClick={() => setSettingsOpen(true)}
        >
          <SettingsIcon className="h-5 w-5 text-muted-foreground hover:text-white transition-colors" />
        </Button>

        <Button variant="ghost" size="icon" className="hover:bg-white/10 rounded-full">
          <User className="h-5 w-5 text-muted-foreground hover:text-white transition-colors" />
        </Button>
      </div>

    </header>
  );
}

