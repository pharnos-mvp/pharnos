import { Printer, X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { printAuditReport } from '../audit-print'
import type { AuditReport } from '../audit-report'

/**
 * Rapport d'audit global au PREMIER PLAN : papier A4 scrollable, typographie corporate
 * (Times), impression/PDF via le dialogue natif (pattern printForm).
 */
export function AuditReportView({ report, onClose }: { report: AuditReport; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-black/60 p-4 sm:p-8"
      role="dialog"
      aria-modal="true"
      aria-label="Rapport d'audit de conformité"
    >
      <div className="pointer-events-none sticky top-0 z-10 mx-auto flex max-w-[820px] justify-end gap-2 pb-3">
        <Button
          size="sm"
          onClick={() => printAuditReport(report)}
          className="pointer-events-auto gap-1.5 rounded-full"
        >
          <Printer className="size-3.5" />
          Imprimer / PDF
        </Button>
        <Button
          size="sm"
          variant="secondary"
          onClick={onClose}
          className="pointer-events-auto gap-1.5 rounded-full"
        >
          <X className="size-3.5" />
          Fermer
        </Button>
      </div>
      {/* Papier A4 (210 mm ≈ 794 px) — fond blanc fixe, indépendant du thème. */}
      <div
        className="mx-auto min-h-[1123px] w-full max-w-[820px] bg-white px-12 py-14 text-[15px] leading-relaxed text-neutral-900 shadow-2xl sm:px-16"
        style={{ fontFamily: "'Times New Roman', Times, serif" }}
      >
        <h1 className="text-center text-xl font-bold tracking-wide">{report.title}</h1>
        <p className="mt-1 text-center font-semibold text-[#263F73]">{report.subtitle}</p>
        <hr className="mt-3 mb-6 border-t-2 border-[#263F73]" />
        {report.sections.map((s) => (
          <section key={s.heading} className="mb-5">
            <h2 className="mb-2 font-bold text-[#263F73]">{s.heading}</h2>
            {s.rows ? (
              <table className="mb-2 w-full border-collapse text-[14px]">
                <tbody>
                  {s.rows.map(([k, v]) => (
                    <tr key={k}>
                      <td className="w-1/3 border border-neutral-400 bg-[#f2f4f8] px-2 py-1 font-semibold">
                        {k}
                      </td>
                      <td className="border border-neutral-400 px-2 py-1">{v}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : null}
            {(s.paragraphs ?? []).map((p) => (
              <p key={p} className="mb-1.5 text-justify">
                {p}
              </p>
            ))}
            {s.items && s.items.length > 0 ? (
              <ul className="list-disc space-y-1 pl-5">
                {s.items.map((i) => (
                  <li key={i} className="text-justify">
                    {i}
                  </li>
                ))}
              </ul>
            ) : null}
          </section>
        ))}
        <p className="mt-8 border-t border-neutral-400 pt-2 text-center text-xs text-neutral-500">
          {report.footer}
        </p>
      </div>
    </div>
  )
}
