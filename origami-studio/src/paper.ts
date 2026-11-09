export const paperStyles = {
  original: 'Original color',
  editorial: 'Soft Editorial',
  texture: 'Textured Illustration',
  graphic: 'Graphic Paper Art',
  ivory: 'Warm ivory',
  sage: 'Sage paper',
  ink: 'Graphite',
} as const

export type PaperSettings = {
  method?: 'atelier' | 'basic'
  removeBackground: boolean
  tolerance: number
  style: keyof typeof paperStyles
}

export const defaultPaper: PaperSettings = {
  method: 'atelier', removeBackground: false, tolerance: 38, style: 'original',
}

const tints = {
  ivory: [252, 241, 218],
  sage: [182, 211, 190],
  ink: [223, 225, 226],
}

export function atelierStyle(style: PaperSettings['style']): boolean {
  return style === 'editorial' || style === 'texture' || style === 'graphic'
}

export async function processAtelier(
  source: string, settings: PaperSettings, signal: AbortSignal,
): Promise<HTMLImageElement | HTMLCanvasElement> {
  const input = await (await fetch(source, { signal })).blob()
  const style = atelierStyle(settings.style) ? settings.style : 'original'
  const query = new URLSearchParams({ style, remove: String(settings.removeBackground) })
  const result = await fetch(`/api/paper?${query}`, { method: 'POST', body: input, signal })
  if (result.status === 404 || result.status === 405) {
    throw new Error('Paper Atelier is unavailable on this server. Restart Origami Studio with npm run dev, or choose Basic edge color.')
  }
  if (!result.ok) throw new Error((await result.text()) || 'Paper Atelier could not process this photo.')
  if (!result.headers.get('content-type')?.startsWith('image/png')) {
    throw new Error('Run the local Origami Studio server to use Paper Atelier.')
  }
  const url = URL.createObjectURL(await result.blob())
  try {
    const image = new Image()
    image.src = url
    await image.decode()
    return style === 'original' && settings.style !== 'original'
      ? processPaper(image, { ...settings, removeBackground: false }) : image
  } finally {
    URL.revokeObjectURL(url)
  }
}

export function processPaper(image: HTMLImageElement, settings: PaperSettings) {
  const canvas = document.createElement('canvas')
  canvas.width = image.naturalWidth
  canvas.height = image.naturalHeight
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Could not process the photo.')
  const { width, height } = canvas
  context.drawImage(image, 0, 0)
  const pixels = context.getImageData(0, 0, width, height)
  const data = pixels.data
  if (settings.removeBackground) {
    const total = width * height
    const queue = new Uint32Array(total)
    const visited = new Uint8Array(total)
    const corners = [0, width - 1, total - width, total - 1].map(index =>
      [data[index * 4], data[index * 4 + 1], data[index * 4 + 2]],
    )
    const limit = settings.tolerance ** 2 * 3
    let tail = 0
    function visit(index: number) {
      if (visited[index]) return
      visited[index] = 1
      const i = index * 4
      if (data[i + 3] !== 0 && !corners.some(([r, g, b]) =>
        (data[i] - r) ** 2 + (data[i + 1] - g) ** 2 + (data[i + 2] - b) ** 2 <= limit,
      )) return
      data[i + 3] = 0
      queue[tail++] = index
    }
    for (let x = 0; x < width; x++) {
      visit(x)
      visit(total - width + x)
    }
    for (let y = 1; y < height - 1; y++) {
      visit(y * width)
      visit(y * width + width - 1)
    }
    for (let head = 0; head < tail; head++) {
      const index = queue[head]
      if (index % width > 0) visit(index - 1)
      if (index % width < width - 1) visit(index + 1)
      if (index >= width) visit(index - width)
      if (index < total - width) visit(index + width)
    }
  }
  if (Object.hasOwn(tints, settings.style)) {
    const tint = tints[settings.style as keyof typeof tints]
    for (let i = 0; i < data.length; i += 4) {
      if (!data[i + 3]) continue
      const light = (data[i] * 0.2126 + data[i + 1] * 0.7152 + data[i + 2] * 0.0722) / 255
      const shade = 0.25 + 0.75 * light
      for (let channel = 0; channel < 3; channel++) data[i + channel] = tint[channel] * shade
    }
  }
  context.putImageData(pixels, 0, 0)
  return canvas
}
