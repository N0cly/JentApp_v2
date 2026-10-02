/** Icône de l'app (design/icon), aux couleurs des jetons. */
export function AppIcon({ size = 64 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 512 512"
      role="img"
      aria-label="Icône de JentApp"
      className="shrink-0 rounded-md"
    >
      <rect width="512" height="512" fill="var(--bg)" />
      <rect
        x="1"
        y="1"
        width="510"
        height="510"
        rx="112"
        fill="var(--bg)"
        stroke="var(--line-strong)"
        strokeWidth="6"
      />
      <g transform="rotate(-8 256 256) translate(256 256) scale(1.1) translate(-110 -150)">
        <rect width="220" height="300" rx="14" fill="var(--paper)" />
        <circle cx="0" cy="200" r="18" fill="var(--bg)" />
        <circle cx="220" cy="200" r="18" fill="var(--bg)" />
        <line
          x1="32"
          y1="200"
          x2="188"
          y2="200"
          stroke="var(--on-paper-muted)"
          strokeWidth="5"
          strokeDasharray="12 10"
        />
        <path
          d="M154 36V118A44 44 0 0 1 71.9 140"
          fill="none"
          stroke="var(--on-paper)"
          strokeWidth="34"
        />
        <rect x="40" y="236" width="140" height="28" rx="14" fill="var(--brand)" />
      </g>
    </svg>
  );
}
