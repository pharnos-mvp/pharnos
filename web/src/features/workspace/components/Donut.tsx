/** Donut de complétude (pourcentage de feuilles documentées) — panneau droit du workspace. */
export function Donut({ value, size = 96 }: { value: number; size?: number }) {
  const r = 28
  const c = 2 * Math.PI * r
  const offset = c - (Math.min(100, Math.max(0, value)) / 100) * c
  return (
    <svg
      viewBox="0 0 64 64"
      style={{ width: size, height: size }}
      role="img"
      aria-label={`${value}%`}
    >
      <circle
        cx="32"
        cy="32"
        r={r}
        fill="none"
        stroke="currentColor"
        strokeWidth="6"
        className="text-muted"
        opacity="0.25"
      />
      <circle
        cx="32"
        cy="32"
        r={r}
        fill="none"
        stroke="currentColor"
        strokeWidth="6"
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={offset}
        transform="rotate(-90 32 32)"
        className="text-blue-500"
      />
      <text x="32" y="36" textAnchor="middle" className="fill-foreground text-[14px] font-semibold">
        {value}%
      </text>
    </svg>
  )
}
