import { assertEquals } from 'jsr:@std/assert@1'

import { validateAgentLifecycleEvent } from './lifecycle-agent-actions.ts'

Deno.test('whitelist : seuls les jalons AVAL de l’agent passent', () => {
  assertEquals(validateAgentLifecycleEvent('deposited', {}), { type: 'deposited', payload: {} })
  // Jalons interdits à l'agent : amont, conditions labo, relances.
  for (const type of ['reminder_sent', 'authority_response', 'fees_invoiced', 'samples_shipped', 'montage', '', 42, null]) {
    assertEquals(validateAgentLifecycleEvent(type, {}), null)
  }
})

Deno.test('deposited : payload toujours vide (rien ne passe du client)', () => {
  const v = validateAgentLifecycleEvent('deposited', { evil: '<script>', mode: 'portal' })
  assertEquals(v, { type: 'deposited', payload: {} })
})

Deno.test('submitted : mode ENUM + référence bornée, clés inconnues jetées', () => {
  const v = validateAgentLifecycleEvent('submitted', {
    mode: 'portal_physical',
    reference: '  ABMed-2026-0784  ',
    injected: 'x',
  })
  assertEquals(v, {
    type: 'submitted',
    payload: { mode: 'portal_physical', reference: 'ABMed-2026-0784' },
  })
  // Mode hors enum → omis ; référence trop longue → omise ; payload absent → {}.
  assertEquals(validateAgentLifecycleEvent('submitted', { mode: 'pigeon' })?.payload, {})
  assertEquals(
    validateAgentLifecycleEvent('submitted', { reference: 'x'.repeat(121) })?.payload,
    {},
  )
  assertEquals(validateAgentLifecycleEvent('submitted', undefined)?.payload, {})
})

Deno.test('authority_query : via=agent FORCÉ (jamais fourni par le client) + note bornée', () => {
  const v = validateAgentLifecycleEvent('authority_query', { via: 'direct', note: 'Complément CMC' })
  assertEquals(v, { type: 'authority_query', payload: { via: 'agent', note: 'Complément CMC' } })
  assertEquals(
    validateAgentLifecycleEvent('authority_query', { note: 'x'.repeat(2001) })?.payload,
    { via: 'agent' },
  )
})

Deno.test('amm_granted : n° REQUIS ; validité normalisée midi-UTC (règle labo M2)', () => {
  const v = validateAgentLifecycleEvent('amm_granted', {
    amm_number: ' AMM-BJ-2026-124 ',
    valid_until: '2031-07-04',
  })
  assertEquals(v, {
    type: 'amm_granted',
    payload: { amm_number: 'AMM-BJ-2026-124', valid_until: '2031-07-04T12:00:00.000Z' },
  })
  // Sans n° → REJET (null) ; validité illisible → omise, l'événement passe.
  assertEquals(validateAgentLifecycleEvent('amm_granted', { valid_until: '2031-07-04' }), null)
  assertEquals(validateAgentLifecycleEvent('amm_granted', { amm_number: '' }), null)
  assertEquals(
    validateAgentLifecycleEvent('amm_granted', { amm_number: 'A1', valid_until: '04/07/2031' }),
    { type: 'amm_granted', payload: { amm_number: 'A1' } },
  )
  assertEquals(
    validateAgentLifecycleEvent('amm_granted', { amm_number: 'A1', valid_until: '2031-99-99' }),
    { type: 'amm_granted', payload: { amm_number: 'A1' } },
  )
})

Deno.test('amm_refused : motif borné optionnel', () => {
  assertEquals(validateAgentLifecycleEvent('amm_refused', {}), { type: 'amm_refused', payload: {} })
  assertEquals(validateAgentLifecycleEvent('amm_refused', { reason: ' dossier incomplet ' }), {
    type: 'amm_refused',
    payload: { reason: 'dossier incomplet' },
  })
})
