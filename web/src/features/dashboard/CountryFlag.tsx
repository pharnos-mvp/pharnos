import type { ReactElement } from 'react'

// Drapeaux SVG inline des 10 pays du dashboard (UEMOA + Nigeria + Ghana).
// Remplace les emoji « regional indicator » qui ne s'affichent PAS sur Windows
// (🇧🇫 y devient « BF »). Couleurs littérales : un drapeau ne dépend pas du thème.

function Star({ cx, cy, r, fill }: { cx: number; cy: number; r: number; fill: string }) {
  const pts: string[] = []
  for (let i = 0; i < 10; i++) {
    const ang = ((-90 + i * 36) * Math.PI) / 180
    const rad = i % 2 === 0 ? r : r * 0.382
    pts.push(`${(cx + rad * Math.cos(ang)).toFixed(2)},${(cy + rad * Math.sin(ang)).toFixed(2)}`)
  }
  return <polygon points={pts.join(' ')} fill={fill} />
}

// Contenu de chaque drapeau dans un viewBox 0 0 30 20 (ratio 3:2).
const FLAGS: Record<string, ReactElement> = {
  BJ: (
    <>
      <rect width="11" height="20" fill="#008751" />
      <rect x="11" width="19" height="10" fill="#fcd116" />
      <rect x="11" y="10" width="19" height="10" fill="#e8112d" />
    </>
  ),
  BF: (
    <>
      <rect width="30" height="10" fill="#ef2b2d" />
      <rect y="10" width="30" height="10" fill="#009e49" />
      <Star cx={15} cy={10} r={4} fill="#fcd116" />
    </>
  ),
  CI: (
    <>
      <rect width="10" height="20" fill="#f77f00" />
      <rect x="10" width="10" height="20" fill="#ffffff" />
      <rect x="20" width="10" height="20" fill="#009e60" />
    </>
  ),
  GW: (
    <>
      <rect x="10" width="20" height="10" fill="#fcd116" />
      <rect x="10" y="10" width="20" height="10" fill="#009e49" />
      <rect width="10" height="20" fill="#ce1126" />
      <Star cx={5} cy={10} r={3.2} fill="#000000" />
    </>
  ),
  ML: (
    <>
      <rect width="10" height="20" fill="#14b53a" />
      <rect x="10" width="10" height="20" fill="#fcd116" />
      <rect x="20" width="10" height="20" fill="#ce1126" />
    </>
  ),
  NE: (
    <>
      <rect width="30" height="6.67" fill="#e05206" />
      <rect y="6.67" width="30" height="6.66" fill="#ffffff" />
      <rect y="13.33" width="30" height="6.67" fill="#0db02b" />
      <circle cx="15" cy="10" r="3" fill="#e05206" />
    </>
  ),
  SN: (
    <>
      <rect width="10" height="20" fill="#00853f" />
      <rect x="10" width="10" height="20" fill="#fdef42" />
      <rect x="20" width="10" height="20" fill="#e31b23" />
      <Star cx={15} cy={10} r={3.6} fill="#00853f" />
    </>
  ),
  TG: (
    <>
      <rect width="30" height="4" fill="#006a4e" />
      <rect y="4" width="30" height="4" fill="#ffce00" />
      <rect y="8" width="30" height="4" fill="#006a4e" />
      <rect y="12" width="30" height="4" fill="#ffce00" />
      <rect y="16" width="30" height="4" fill="#006a4e" />
      <rect width="12" height="12" fill="#d21034" />
      <Star cx={6} cy={6} r={3} fill="#ffffff" />
    </>
  ),
  NG: (
    <>
      <rect width="10" height="20" fill="#008751" />
      <rect x="10" width="10" height="20" fill="#ffffff" />
      <rect x="20" width="10" height="20" fill="#008751" />
    </>
  ),
  GH: (
    <>
      <rect width="30" height="6.67" fill="#ce1126" />
      <rect y="6.67" width="30" height="6.66" fill="#fcd116" />
      <rect y="13.33" width="30" height="6.67" fill="#006b3f" />
      <Star cx={15} cy={10} r={3.6} fill="#000000" />
    </>
  ),
}

type Props = { code: string; size?: number; className?: string; style?: React.CSSProperties }

export function CountryFlag({ code, size = 20, className, style }: Props) {
  const flag = FLAGS[code?.toUpperCase()]
  return (
    <svg
      width={size}
      height={Math.round((size * 2) / 3)}
      viewBox="0 0 30 20"
      className={className}
      role="img"
      aria-hidden="true"
      style={{ borderRadius: 2, overflow: 'hidden', flex: 'none', ...style }}
    >
      {flag ?? <rect width="30" height="20" fill="var(--pd-track)" />}
      <rect
        x="0.5"
        y="0.5"
        width="29"
        height="19"
        rx="1.5"
        fill="none"
        stroke="rgba(0,0,0,0.18)"
        strokeWidth="1"
      />
    </svg>
  )
}
