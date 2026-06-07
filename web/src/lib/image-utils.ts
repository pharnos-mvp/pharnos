/** Taille max d'un fichier image accepté (avant traitement). */
export const MAX_IMAGE_BYTES = 3 * 1024 * 1024 // 3 Mo

export function fileToDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error ?? new Error('Lecture du fichier impossible'))
    reader.readAsDataURL(file)
  })
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Image illisible'))
    img.src = src
  })
}

/**
 * Lit un fichier image et renvoie une **data URL réduite** (max `maxDim` px sur le grand côté)
 * pour garder un stockage léger (en-tête/pied/signature). Repli sur la data URL brute si le
 * canvas n'est pas disponible (ex. environnement de test).
 */
export async function imageFileToDataUrl(
  file: File,
  maxDim = 1400,
  quality = 0.85,
): Promise<string> {
  const dataUrl = await fileToDataUrl(file)
  try {
    const img = await loadImage(dataUrl)
    const scale = Math.min(1, maxDim / Math.max(img.width, img.height))
    if (scale >= 1) return dataUrl
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(img.width * scale)
    canvas.height = Math.round(img.height * scale)
    const ctx = canvas.getContext('2d')
    if (!ctx) return dataUrl
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    const type = file.type === 'image/png' ? 'image/png' : 'image/jpeg'
    return canvas.toDataURL(type, quality)
  } catch {
    return dataUrl
  }
}
