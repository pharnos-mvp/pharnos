// Registre des formulaires de templates officiels disponibles, par type de document.
// Source des gabarits : CEO (HTML RCP + Notice) et template officiel ABMed (Étiquetage).
import { LABELING_FORM_DEFINITION } from './labeling-form-model'
import { NOTICE_FORM_DEFINITION } from './notice-form-model'
import { RCP_FORM_DEFINITION } from './rcp-form-model'
import type { TemplateFormDefinition } from './form-types'

/**
 * Formulaire officiel pour un type de document — `null` si le type n'a pas (encore) de
 * gabarit (cover/pght gardent le squelette TipTap). `artwork` (étiquetage étranger 1.3.4…)
 * utilise le formulaire Étiquetage.
 */
export function formDefinitionFor(
  docType: string | null | undefined,
): TemplateFormDefinition | null {
  switch (docType) {
    case 'rcp':
      return RCP_FORM_DEFINITION
    case 'notice':
      return NOTICE_FORM_DEFINITION
    case 'labeling':
    case 'artwork':
      return LABELING_FORM_DEFINITION
    default:
      return null
  }
}
