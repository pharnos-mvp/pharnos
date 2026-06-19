/**
 * Donut de complétude — style EXACT du mockup CTD builder (`.ring`) : anneau conique navy
 * (var(--brand)) sur piste neutre (var(--border)), trou central (var(--card)) portant le %
 * en navy gras. 100 % tokens → dark/light automatiques. `value` borné 0–100.
 */
export function Donut({ value, size = 96 }: { value: number; size?: number }) {
  const pct = Math.min(100, Math.max(0, Math.round(value)))
  const inner = Math.round(size * 0.75)
  return (
    <div
      role="img"
      aria-label={`${pct}%`}
      className="grid shrink-0 place-items-center rounded-full"
      style={{
        width: size,
        height: size,
        background: `conic-gradient(var(--brand) ${pct}%, var(--border) ${pct}% 100%)`,
      }}
    >
      <div
        className="text-brand bg-card grid place-items-center rounded-full font-bold tabular-nums"
        style={{ width: inner, height: inner, fontSize: Math.round(size * 0.2) }}
      >
        {pct}%
      </div>
    </div>
  )
}
