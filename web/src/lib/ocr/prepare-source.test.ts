import { beforeEach, describe, expect, it, vi } from 'vitest'

const readPdfPages = vi.fn()
const recognizePdf = vi.fn()

// `pdf-text` et `recognize` touchent pdf.js, un worker et 7,5 Mo d'assets : ils sont remplacés, et
// c'est justement ce qui rend la GARANTIE DE COÛT observable — le module de reconnaissance ne doit
// pas seulement rester inactif sur un document textuel, il ne doit pas être IMPORTÉ.
vi.mock('./pdf-text', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./pdf-text')>()),
  readPdfPages: (...args: unknown[]) => readPdfPages(...args) as unknown,
}))
vi.mock('./recognize', () => ({
  recognizePdf: (...args: unknown[]) => recognizePdf(...args) as unknown,
}))

const { ControlCorpusTooLargeError, prepareUpgradeSource } = await import('./prepare-source')
const { MAX_CONTROL_CHARS } = await import('./pdf-text')

const bytes = new Uint8Array([1, 2, 3])

beforeEach(() => {
  readPdfPages.mockReset()
  recognizePdf.mockReset()
})

describe('prepareUpgradeSource', () => {
  it('un document TEXTUEL n’appelle jamais la reconnaissance', async () => {
    // LA garantie de coût : ~7,5 Mo de noyau et de modèles ne doivent atteindre que les utilisateurs
    // qui déposent un scan. Sur un marché où la bande passante se paie, l'inverse est un défaut
    // produit, pas une inefficacité.
    readPdfPages.mockResolvedValue({
      pages: ['Rubrique une du document', 'Rubrique deux du document'],
      textless: [],
      pageCount: 2,
      truncated: false,
    })
    const phases: string[] = []
    const out = await prepareUpgradeSource(bytes, { onPhase: (p) => phases.push(p) })
    expect(recognizePdf).not.toHaveBeenCalled()
    expect(phases).toEqual(['reading'])
    expect(out.sourceKind).toBe('text')
    expect(out.recognizedPages).toBe(0)
  })

  it('un document MIXTE n’océrise que les pages sans texte, et garde le texte exact des autres', async () => {
    // Océriser une page qui a déjà son texte remplacerait une source fidèle par une reconstruction.
    readPdfPages.mockResolvedValue({
      pages: ['Texte exact de la page une', '', 'Texte exact de la page trois', ''],
      textless: [1, 3],
      pageCount: 4,
      truncated: false,
    })
    recognizePdf.mockResolvedValue({
      pages: new Map([
        [1, 'Reconstruction de la page deux'],
        [3, 'Reconstruction de la page quatre'],
      ]),
      recognized: 2,
      pageCount: 4,
      truncated: false,
    })
    const out = await prepareUpgradeSource(bytes)
    expect(recognizePdf).toHaveBeenCalledWith(bytes, expect.objectContaining({ pages: [1, 3] }))
    expect(out.sourceKind).toBe('ocr')
    expect(out.recognizedPages).toBe(2)
    expect(out.controlText).toContain('Texte exact de la page une')
    expect(out.controlText).toContain('Reconstruction de la page deux')
    expect(out.controlText).toContain('Texte exact de la page trois')
  })

  it('un corpus au-delà du plafond LÈVE, au lieu de poser un drapeau', async () => {
    // L'Edge répondrait `413 control_truncated`. Un booléen consultatif que rien n'oblige à lire
    // finirait par ne pas l'être : la garantie doit vivre dans la fonction qui écrit.
    readPdfPages.mockResolvedValue({
      pages: ['x'.repeat(MAX_CONTROL_CHARS + 1)],
      textless: [],
      pageCount: 1,
      truncated: false,
    })
    await expect(prepareUpgradeSource(bytes)).rejects.toBeInstanceOf(ControlCorpusTooLargeError)
  })

  it('une lecture ÉCOURTÉE est remontée, jamais tue', async () => {
    // Les rubriques citées dans les pages non lues ressortiront « Non fourni », et cela aurait l'air
    // d'un défaut du moteur alors que c'est une limite déclarée.
    readPdfPages.mockResolvedValue({
      pages: ['Une page lue sur beaucoup'],
      textless: [],
      pageCount: 80,
      truncated: true,
    })
    expect((await prepareUpgradeSource(bytes)).truncated).toBe(true)
  })
})
