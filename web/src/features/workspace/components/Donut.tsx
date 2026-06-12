import { useId } from 'react'

/**
 * Donut de complétude — style du mockup CEO (pharnos_3.html) : anneau épais (stroke 16
 * sur viewBox 150), dégradé bleu #7aa2ff → #3b5bdb, extrémité arrondie, pourcentage
 * centré en gras. Le fond de l'anneau reste adaptatif (currentColor) pour le thème sombre.
 */
export function Donut({ value, size = 140 }: { value: number; size?: number }) {
  const gid = useId()
  const r = 60
  const c = 2 * Math.PI * r
  const offset = c - (Math.min(100, Math.max(0, value)) / 100) * c
  return (
    <svg
      viewBox="0 0 150 150"
      style={{ width: size, height: size }}
      role="img"
      aria-label={`${value}%`}
    >
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#7aa2ff" />
          <stop offset="1" stopColor="#3b5bdb" />
        </linearGradient>
      </defs>
      <circle
        cx="75"
        cy="75"
        r={r}
        fill="none"
        stroke="currentColor"
        strokeWidth="16"
        className="text-muted"
        opacity="0.45"
      />
      <circle
        cx="75"
        cy="75"
        r={r}
        fill="none"
        stroke={`url(#${gid})`}
        strokeWidth="16"
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={offset}
        transform="rotate(-90 75 75)"
      />
      <text
        x="75"
        y="83"
        textAnchor="middle"
        className="fill-foreground text-[24px] font-bold tabular-nums"
      >
        {value}%
      </text>
    </svg>
  )
}
