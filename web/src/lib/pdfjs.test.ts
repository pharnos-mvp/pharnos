import { describe, expect, it } from 'vitest'

import { PDF_DOC_ASSETS } from './pdfjs'

describe('PDF_DOC_ASSETS', () => {
  it('pointe vers les assets servis sous {BASE}pdf/ (cmaps + polices standard, cmaps packés)', () => {
    // Ces chemins DOIVENT rester alignés sur le plugin Vite `pharnos:pdfjs-assets` (dev + build)
    // et la règle runtimeCaching `/pdf/` : une dérive = polices CID à nouveau illisibles.
    expect(PDF_DOC_ASSETS.cMapUrl).toBe(`${import.meta.env.BASE_URL}pdf/cmaps/`)
    expect(PDF_DOC_ASSETS.standardFontDataUrl).toBe(
      `${import.meta.env.BASE_URL}pdf/standard_fonts/`,
    )
    expect(PDF_DOC_ASSETS.cMapPacked).toBe(true)
  })
})
