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
    expect(isValidInviteCodeFormat('AB')).toBe(false) // trop court
    expect(isValidInviteCodeFormat('-ABC')).toBe(false) // ne commence pas par alphanumérique
    expect(isValidInviteCodeFormat('CODE AVEC ESPACE')).toBe(false)
  })

  it('capture ?invite=CODE en localStorage (survit à la redirection OAuth)', () => {
    window.history.replaceState(null, '', '/?invite=dr-kouame')
    captureInviteCodeFromUrl()
    expect(getStoredInviteCode()).toBe('DR-KOUAME')
    clearStoredInviteCode()
    expect(getStoredInviteCode()).toBe('')
  })

  it('ignore un code mal formé (pas de pollution du storage)', () => {
    window.history.replaceState(null, '', '/?invite=<script>')
    captureInviteCodeFromUrl()
    expect(getStoredInviteCode()).toBe('')
  })
})
