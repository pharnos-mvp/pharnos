import { useNavigate } from 'react-router'
import { toast } from 'sonner'

import { env } from '@/lib/env'
import { useI18n } from '@/lib/i18n-context'
import { useOnlineStatus } from '@/hooks/use-online-status'
import type { MeteredCompileOutcome } from './metered-compile'
import { checkCompilationQuota, recordCompilation, useOrgPlan } from './use-org-plan'
import type { CompileGate } from './use-org-plan'

/**
 * Le métrage d'un dépôt, avec ses messages — partagé par les DEUX écrans qui font sortir le paquet
 * compilé de l'application.
 *
 * ⚠️ C'est le point qu'il ne faut pas défaire : le livrable métré n'est pas « le clic sur Compiler »,
 * c'est **le paquet qui quitte l'application**. `DossierWorkspacePage` le fabrique et l'affiche ;
 * `DossierPreviewPage` le télécharge et l'envoie à l'agence. Ne métrer que le premier laissait la
 * porte grande ouverte : au plafond, il suffisait d'ouvrir l'aperçu pour récupérer exactement le
 * même PDF. Tout nouvel écran qui exporte un dossier compilé passe par ici.
 *
 * La fenêtre de grâce de 24 h (migration 0082) rend l'ensemble cohérent : compiler puis télécharger
 * puis envoyer le même dossier dans la foulée coûte **un** crédit, pas trois.
 */
export function useCompilationCredit(dossierId: string | null) {
  const { t } = useI18n()
  const navigate = useNavigate()
  const online = useOnlineStatus()
  const { data: orgPlan } = useOrgPlan()
  const metered = online && env.isSupabaseConfigured

  /**
   * Le préflight n'a pas toujours l'empreinte : quand on est sur le point de FABRIQUER, les octets
   * n'existent pas encore. Il répond alors au pire cas (facturable) ; c'est l'enregistrement, qui
   * a les octets, qui reconnaîtra une récupération et ne facturera rien.
   */
  const preflight = (sha: string | null = null) => checkCompilationQuota(dossierId, sha)
  const record = (sha: string | null = null) => recordCompilation(dossierId, 'm1_pdf', sha)

  function notifyRefused(gate: CompileGate) {
    if (gate.reason !== 'quota_exceeded') {
      toast.error(t({ fr: 'Compilation indisponible.', en: 'Compilation unavailable.' }))
      return
    }
    // Le libellé suit la PÉRIODE réelle du quota : un pack 49 € / 249 € est un `lifetime`, pas un
    // mensuel — annoncer « ce mois » à qui a épuisé son pack serait un mensonge doublé d'une
    // fausse promesse (« ça repart le 1er »).
    const perMonth = (orgPlan?.compilations_period ?? 'month') === 'month'
    toast.error(
      perMonth
        ? t({
            fr: `Quota de dépôts atteint ce mois (${gate.cap ?? ''}). Compilez davantage avec un plan supérieur.`,
            en: `Monthly submission quota reached (${gate.cap ?? ''}). Upgrade to compile more.`,
          })
        : t({
            fr: `Vos ${gate.cap ?? ''} compilations sont utilisées. Rechargez pour continuer.`,
            en: `Your ${gate.cap ?? ''} compilations are used up. Top up to continue.`,
          }),
      {
        action: {
          label: perMonth
            ? t({ fr: 'Mettre à niveau', en: 'Upgrade' })
            : t({ fr: 'Recharger', en: 'Top up' }),
          onClick: () => navigate('/compte', { state: { section: 'abonnement' } }),
        },
      },
    )
  }

  /**
   * Une gratuité qu'on ne voit pas ne rassure personne : sur un pack de 3, l'utilisateur qui relance
   * après correction doit SAVOIR que ça ne lui coûte rien, sinon il n'ose pas et livre un dossier
   * qu'il savait imparfait. Symétriquement, on prévient quand la réserve devient courte.
   */
  function notifyCharged(gate: CompileGate | undefined) {
    if (!gate) return
    if (gate.billed === false) {
      // Deux gratuités, deux messages : « je récupère ce que j'ai payé » et « je corrige » ne
      // rassurent pas de la même façon, et le second est celui qui débloque une relecture.
      toast.info(
        gate.free_reason === 'recovery'
          ? t({
              fr: 'Offert — ce paquet est identique à celui déjà décompté.',
              en: 'Free — this package is identical to the one already counted.',
            })
          : t({
              fr: 'Offert — correction du même dossier dans les 24 h.',
              en: 'Free — same dossier corrected within 24 h.',
            }),
      )
      return
    }
    if (typeof gate.remaining === 'number' && gate.remaining <= 2) {
      toast.warning(
        gate.remaining === 0
          ? t({ fr: 'Dernière compilation utilisée.', en: 'Last compilation used.' })
          : t({
              fr: `Il vous reste ${gate.remaining} compilation(s).`,
              en: `${gate.remaining} compilation(s) left.`,
            }),
      )
    }
  }

  /**
   * Affiche le verdict et répond : peut-on continuer ? ⚠️ A un effet de bord (les toasts) — ne pas
   * l'appeler deux fois sur le même résultat.
   */
  function announceAndContinue<T>(
    outcome: MeteredCompileOutcome<T>,
  ): outcome is { ok: true; value: T; gate?: CompileGate } {
    if (!outcome.ok) {
      notifyRefused(outcome.gate)
      return false
    }
    notifyCharged(outcome.gate)
    return true
  }

  /**
   * Variante en deux temps, pour un geste dont l'issue n'est connue qu'après coup (l'envoi à
   * l'agence passe par une boîte de dialogue). `guard()` refuse tôt sans rien facturer ;
   * `settle()` décompte une fois le paquet réellement parti.
   */
  async function guard(sha: string | null = null): Promise<boolean> {
    if (!metered) return true
    const pre = await preflight(sha)
    if (pre.allowed) return true
    notifyRefused(pre)
    return false
  }

  async function settle(sha: string | null = null): Promise<void> {
    if (!metered) return
    notifyCharged(await record(sha))
  }

  return { metered, preflight, record, announceAndContinue, guard, settle }
}
