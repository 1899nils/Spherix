import * as React from 'react';
import { cn } from '@/lib/utils';

interface SliderProps {
  value: number;
  max: number;
  onChange: (value: number) => void;
  onChangeEnd?: (value: number) => void;
  className?: string;
}

const Slider = React.forwardRef<HTMLDivElement, SliderProps>(
  ({ value, max, onChange, onChangeEnd, className }, ref) => {
    const trackRef = React.useRef<HTMLDivElement>(null);
    const isDragging = React.useRef(false);

    const percentage = max > 0 ? (value / max) * 100 : 0;

    const getValueFromEvent = (e: MouseEvent | React.MouseEvent) => {
      const track = trackRef.current;
      if (!track) return 0;
      const rect = track.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      return ratio * max;
    };

    const handleMouseDown = (e: React.MouseEvent) => {
      isDragging.current = true;
      onChange(getValueFromEvent(e));

      const handleMouseMove = (e: MouseEvent) => {
        if (isDragging.current) {
          onChange(getValueFromEvent(e));
        }
      };

      const handleMouseUp = (e: MouseEvent) => {
        if (isDragging.current) {
          isDragging.current = false;
          onChangeEnd?.(getValueFromEvent(e));
        }
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };

      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    };

    return (
      <div
        ref={ref}
        className={cn('group relative flex w-full touch-none select-none items-center py-1.5 cursor-pointer', className)}
        onMouseDown={handleMouseDown}
      >
        <div
          ref={trackRef}
          className="relative h-1 w-full rounded-full bg-muted group-hover:h-1.5 transition-all"
        >
          <div
            className="absolute h-full rounded-full bg-foreground group-hover:bg-primary transition-colors"
            style={{ width: `${percentage}%` }}
          />
          <div
            className="absolute top-1/2 -translate-y-1/2 h-3 w-3 rounded-full bg-foreground opacity-0 group-hover:opacity-100 transition-opacity"
            style={{ left: `${percentage}%`, transform: `translate(-50%, -50%)` }}
          />
        </div>
      </div>
    );
  },
);
Slider.displayName = 'Slider';

export { Slider };
