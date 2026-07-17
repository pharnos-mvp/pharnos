// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'

import {
  captureInviteCodeFromUrl,
  clearStoredInviteCode,
  getStoredInviteCode,
  isValidInviteCodeFormat,
  normalizeInviteCode,
} from './invite-code'

beforeEach(() => {
  window.localStorage.clear()
  window.history.replaceState(null, '', '/')
})

describe('invite-code — capture pré-OAuth du code d’invitation', () => {
  it('normalise (majuscules + trim) et valide le format SQL', () => {
    expect(normalizeInviteCode('  dr-kouame ')).toBe('DR-KOUAME')
    expect(isValidInviteCodeFormat('dr-kouame')).toBe(true)
    expect(normalizeInviteCode('DR KOUAME')).toBe('DRKOUAME') // espaces internes retirés
    expect(isValidInviteCodeFormat('AB')).toBe(false) // trop court
    expect(isValidInviteCodeFormat('-ABC')).toBe(false) // ne commence pas par alphanumérique
    expect(isValidInviteCodeFormat('CODE_SOULIGNÉ')).toBe(false) // caractère hors format
  })

  it('capture ?invite=CODE en localStorage (survit à la redirection OAuth) et nettoie l’URL', () => {
    window.history.replaceState(null, '', '/?invite=dr-kouame&x=1')
    captureInviteCodeFromUrl()
    expect(getStoredInviteCode()).toBe('DR-KOUAME')
    expect(window.location.search).toBe('?x=1')
    clearStoredInviteCode()
    expect(getStoredInviteCode()).toBe('')
  })

  it('un code stocké expire après 1 h (anti-attribution fantôme sur navigateur partagé)', () => {
    window.localStorage.setItem(
      'pharnos.inviteCode',
      JSON.stringify({ code: 'EXPERT-42', at: Date.now() - 2 * 60 * 60 * 1000 }),
    )
    expect(getStoredInviteCode()).toBe('')
  })

  it('ignore un code mal formé (pas de pollution du storage)', () => {
    window.history.replaceState(null, '', '/?invite=<script>')
    captureInviteCodeFromUrl()
    expect(getStoredInviteCode()).toBe('')
  })
})
