import { cn } from '@/lib/utils';

interface ProgressBarProps {
  value: number; // 0–1
  className?: string;
}

export function ProgressBar({ value, className }: ProgressBarProps) {
  const pct = Math.min(100, Math.max(0, value * 100));
  return (
    <div className={cn('h-1 bg-white/15 rounded-full overflow-hidden', className)}>
      <div
        className="h-full bg-section-accent rounded-full transition-all duration-300"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
