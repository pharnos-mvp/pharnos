/**
 * Filigrane du PDF téléchargé par le reviewer (L1 — traçabilité/dissuasion de fuite) :
 * e-mail + horodatage incrustés en diagonale sur chaque page via pdf-lib (déjà dépendance,
 * chargé à la demande). L'aperçu, lui, est filigrané au rendu canvas (PdfViewer `watermark`)
 * — le fichier source dans Storage reste vierge.
 */
export async function watermarkPdfBlob(blob: Blob, text: string): Promise<Blob> {
  try {
    const { PDFDocument, StandardFonts, rgb, degrees } = await import('pdf-lib')
    const doc = await PDFDocument.load(await blob.arrayBuffer(), { ignoreEncryption: true })
    const font = await doc.embedFont(StandardFonts.HelveticaBold)
    // WinAnsi (pdf-lib standard fonts) : on retire les caractères non encodables plutôt
    // que d'échouer (e-mails exotiques) — le filigrane reste lisible.
    const safe = text.replace(/[^ -ÿ]/g, '?')
    for (const page of doc.getPages()) {
      const { width, height } = page.getSize()
      const size = Math.max(11, Math.min(18, width / 32))
      for (const frac of [0.22, 0.5, 0.78]) {
        page.drawText(safe, {
          x: width * 0.1,
          y: height * frac,
          size,
          font,
          color: rgb(0.12, 0.23, 0.54),
          opacity: 0.13,
          rotate: degrees(30),
        })
      }
    }
    const bytes = await doc.save()
    return new Blob([new Uint8Array(bytes)], { type: 'application/pdf' })
  } catch {
    // Un PDF récalcitrant ne doit jamais bloquer le téléchargement : original sans filigrane.
    return blob
  }
}
