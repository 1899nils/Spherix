import { useState } from 'react';
import { Search, Settings as SettingsIcon, User, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Settings } from '@/pages/Settings';

export function Header() {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  return (
    <header className="h-16 flex items-center justify-between px-8 bg-background/50 backdrop-blur-md sticky top-0 z-40 border-b border-white/5">
      {/* Left: Empty for balance or could have breadcrumbs */}
      <div className="w-1/4"></div>

      {/* Center: Search */}
      <div className="flex-1 max-w-xl relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <input
          type="text"
          placeholder="Suche nach Künstlern, Alben oder Songs..."
          className="w-full bg-white/5 border border-white/10 pl-10 h-10 rounded-full focus:outline-none focus:ring-1 focus:ring-white/20 transition-all text-sm text-white placeholder:text-muted-foreground"
        />
      </div>

      {/* Right: Settings & User */}
      <div className="w-1/4 flex justify-end items-center gap-3">
        <Button 
          variant="ghost" 
          size="icon" 
          className="hover:bg-white/10 rounded-full"
          onClick={() => setIsSettingsOpen(true)}
        >
          <SettingsIcon className="h-5 w-5 text-muted-foreground hover:text-white transition-colors" />
        </Button>

        <Button variant="ghost" size="icon" className="hover:bg-white/10 rounded-full">
          <User className="h-5 w-5 text-muted-foreground hover:text-white transition-colors" />
        </Button>
      </div>

      {/* Custom Settings Modal */}
      {isSettingsOpen && (
        <>
          {/* Backdrop */}
          <div 
            className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm animate-in fade-in duration-300"
            onClick={() => setIsSettingsOpen(false)}
          />
          {/* Modal Content */}
          <div 
            className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[101] w-full max-w-4xl max-h-[85vh] flex flex-col bg-[#1c1c1e] border border-white/10 rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in duration-300"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-6 border-b border-white/5 shrink-0">
              <h2 className="text-xl font-bold text-white">Einstellungen</h2>
              <Button 
                variant="ghost" 
                size="icon" 
                className="hover:bg-white/10 rounded-full h-8 w-8"
                onClick={() => setIsSettingsOpen(false)}
              >
                <X className="h-5 w-5 text-zinc-400" />
              </Button>
            </div>
            <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
              <Settings />
            </div>
          </div>
        </>
      )}
    </header>
  );
}

