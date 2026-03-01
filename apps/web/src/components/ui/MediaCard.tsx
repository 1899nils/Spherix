import { cn } from '@/lib/utils';
import { ProgressBar } from './ProgressBar';
import { Play } from 'lucide-react';

interface MediaCardProps {
  title: string;
  subtitle?: string;
  year?: number | null;
  imageUrl?: string | null;
  /** 0–1 watch/listen progress */
  progress?: number;
  badge?: string;
  aspect?: 'poster' | 'square';
  fallbackIcon?: React.ReactNode;
  onClick?: () => void;
  className?: string;
}

export function MediaCard({
  title,
  subtitle,
  year,
  imageUrl,
  progress,
  badge,
  aspect = 'poster',
  fallbackIcon,
  onClick,
  className,
}: MediaCardProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'group flex flex-col gap-2 text-left w-full focus:outline-none',
        className,
      )}
    >
      {/* Artwork */}
      <div
        className={cn(
          'relative w-full overflow-hidden rounded-lg bg-white/5 border border-white/5 shadow',
          aspect === 'poster' ? 'aspect-[2/3]' : 'aspect-square',
        )}
      >
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={title}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="h-full w-full flex items-center justify-center text-muted-foreground/40">
            {fallbackIcon}
          </div>
        )}

        {/* Hover overlay with play icon */}
        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
          <div className="h-10 w-10 rounded-full bg-white/20 border border-white/30 flex items-center justify-center">
            <Play className="h-5 w-5 text-white fill-white ml-0.5" />
          </div>
        </div>

        {/* Badge */}
        {badge && (
          <span className="absolute top-2 right-2 text-[10px] font-bold px-1.5 py-0.5 rounded bg-black/60 text-white tracking-wider">
            {badge}
          </span>
        )}

        {/* Progress bar */}
        {progress != null && progress > 0 && (
          <div className="absolute bottom-0 left-0 right-0 p-1.5">
            <ProgressBar value={progress} />
          </div>
        )}
      </div>

      {/* Title + meta */}
      <div className="min-w-0 px-0.5">
        <p className="text-sm font-medium truncate text-white/90 group-hover:text-white transition-colors">
          {title}
        </p>
        {(subtitle || year) && (
          <p className="text-xs text-muted-foreground truncate mt-0.5">
            {subtitle}
            {subtitle && year ? ' · ' : ''}
            {year}
          </p>
        )}
      </div>
    </button>
  );
}
