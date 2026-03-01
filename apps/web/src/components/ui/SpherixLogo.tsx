import { useId } from 'react';

interface Props {
  className?: string;
}

/**
 * Spherix planet logo rendered as inline SVG.
 * All coloured elements (orbit ring + satellite dots) use `currentColor`,
 * so setting `color` / `text-*` on the element controls the accent.
 * The planet body is white so it works on dark backgrounds.
 */
export function SpherixLogo({ className }: Props) {
  const uid = useId().replace(/:/g, '');
  const backMask  = `sx-back-${uid}`;
  const frontMask = `sx-front-${uid}`;

  return (
    <svg
      viewBox="-3 -3 106 106"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
    >
      <defs>
        {/*
          backMask  — visible everywhere OUTSIDE the planet body
                      so the ring segment that goes "behind" the planet is hidden
        */}
        <mask id={backMask}>
          <rect x="-10" y="-10" width="120" height="120" fill="white" />
          <rect x="15" y="11" width="67" height="77" rx="22"
            transform="rotate(-12,49,49)" fill="black" />
        </mask>

        {/*
          frontMask — visible only INSIDE the planet body region
                      so the ring segment that passes "over" the planet is visible
        */}
        <mask id={frontMask}>
          <rect x="15" y="11" width="67" height="77" rx="22"
            transform="rotate(-12,49,49)" fill="white" />
        </mask>
      </defs>

      {/* Ring — back portion (behind planet, masked out of planet region) */}
      <ellipse
        cx="50" cy="50" rx="47" ry="17"
        stroke="currentColor" strokeWidth="5"
        transform="rotate(30,50,50)"
        mask={`url(#${backMask})`}
      />

      {/* Planet body */}
      <rect
        x="15" y="11" width="67" height="77" rx="22"
        fill="white" fillOpacity="0.93"
        transform="rotate(-12,49,49)"
      />

      {/* Ring — front portion (over planet, clipped to planet region) */}
      <ellipse
        cx="50" cy="50" rx="47" ry="17"
        stroke="currentColor" strokeWidth="5"
        transform="rotate(30,50,50)"
        mask={`url(#${frontMask})`}
      />

      {/* Satellite dots */}
      <circle cx="73" cy="7"  r="4.5" fill="currentColor" />
      <circle cx="48" cy="92" r="4.5" fill="currentColor" />
    </svg>
  );
}
