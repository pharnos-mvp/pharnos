import { useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'

import { useI18n } from '@/lib/i18n-context'

import { FEATURE_BY_KEY } from './feature-state'
import { PLAN_LABEL } from './use-org-plan'

/**
 * Upsell standardisé du modèle « Vitrine » : au clic sur une feature en Vitrine, montre un toast
 * « Incluse à partir du plan X » + CTA « Mettre à niveau » → onglet Compte → Abonnement.
 * C'est le tunnel de conversion unique (DISPLAY ONLY ; l'entitlement réel reste serveur).
 */
export function useUpsell() {
  const navigate = useNavigate()
  const { t } = useI18n()

  return useCallback(
    (featureKey: string) => {
      const meta = FEATURE_BY_KEY[featureKey]
      const planName = meta ? t(PLAN_LABEL[meta.minPlan]) : ''
      const featureName = meta ? t(meta.label) : featureKey
      toast(featureName, {
        description: planName
          ? t({
              fr: `Incluse à partir du plan ${planName}.`,
              en: `Included from the ${planName} plan.`,
            })
          : undefined,
        action: {
          label: t({ fr: 'Mettre à niveau', en: 'Upgrade' }),
          onClick: () => navigate('/compte', { state: { section: 'abonnement' } }),
        },
      })
    },
    [navigate, t],
  )
}
