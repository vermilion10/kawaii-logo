import type { Scene } from './scene'

const r2 = (v: number) => Math.round(v * 100) / 100

export function sceneToSvg(scene: Scene): string {
  const { x, y, w, h } = scene.viewBox
  const paths = [
    ...scene.layers.map((l) => `<path fill="${l.color}" d="${l.d}"/>`),
    ...scene.fills.map((f) => `<path fill="${f.color}" d="${f.d}"/>`),
    scene.maskD ? `<path fill="${scene.maskColor}" d="${scene.maskD}"/>` : '',
    ...scene.decos.flatMap((d) => d.parts.map((p) => `<path fill="${p.color}" d="${p.d}"/>`)),
  ].filter(Boolean)
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${r2(x)} ${r2(y)} ${r2(w)} ${r2(h)}" width="${Math.ceil(w)}" height="${Math.ceil(h)}">\n` +
    paths.map((p) => '  ' + p).join('\n') +
    '\n</svg>\n'
  )
}

export function download(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export async function svgToPng(svg: string, scale: number): Promise<Blob> {
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }))
  try {
    const img = new Image()
    img.src = url
    await img.decode()
    const canvas = document.createElement('canvas')
    canvas.width = Math.ceil(img.naturalWidth * scale)
    canvas.height = Math.ceil(img.naturalHeight * scale)
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas 2D is not available in this browser.')
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    return await new Promise((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('PNG encoding failed.'))), 'image/png'),
    )
  } finally {
    URL.revokeObjectURL(url)
  }
}

export function fileSlug(text: string): string {
  const slug = text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
  return slug || 'logo'
}
