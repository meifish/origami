import type { Crop } from './crop'
import { paperStyles } from './paper'
import type { PaperSettings } from './paper'

export type Point = { x: number; y: number }
export type Kind = 'valley' | 'mountain' | 'crease' | 'arrow'
export const arrowStyles = {
  single: 'Single head', double: 'Double head', unfold: 'Fold and unfold',
} as const
export type ArrowStyle = keyof typeof arrowStyles
export type Mark = {
  id: string; kind: Kind; start: Point; end: Point; control: Point
  arrowStyle?: ArrowStyle
  color: string; width: number; opacity: number; hidden: boolean
}
export type Project = {
  version: 1
  photo: { name: string; data: string; rotation?: number; paper?: PaperSettings; crop?: Crop } | null
  marks: Mark[]
}

export const labels: Record<Kind, string> = {
  valley: 'Valley fold', mountain: 'Mountain fold', crease: 'Crease', arrow: 'Curved arrow',
}
export const patterns: Record<Kind, number[]> = {
  valley: [10, 7], mountain: [14, 5, 3, 5], crease: [], arrow: [],
}
export const blank: Project = { version: 1, photo: null, marks: [] }
const imageData = /^data:image\/[\w.+-]+;base64,[a-z\d+/]+=*$/i
const kinds = Object.keys(labels)

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
function between(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && value >= min && value <= max
}
function point(value: unknown): value is Point {
  return record(value) && between(value.x, 0, 1) && between(value.y, 0, 1)
}
function mark(value: unknown): value is Mark {
  return record(value) && typeof value.id === 'string' && value.id.length > 0 &&
    typeof value.kind === 'string' && kinds.includes(value.kind) &&
    (value.arrowStyle === undefined || Object.keys(arrowStyles).some(style => style === value.arrowStyle)) &&
    point(value.start) && point(value.end) && point(value.control) &&
    typeof value.color === 'string' && /^#[\da-f]{6}$/i.test(value.color) &&
    between(value.width, 1, 24) && between(value.opacity, 0.1, 1) && typeof value.hidden === 'boolean'
}
export function parseProject(json: string): Project {
  const value: unknown = JSON.parse(json)
  if (!record(value) || value.version !== 1 || !Array.isArray(value.marks) || !value.marks.every(mark)) {
    throw new Error('Choose a valid Origami Studio v0.1 project.')
  }
  const photo = value.photo
  if (photo !== null && (!record(photo) || typeof photo.name !== 'string' ||
    typeof photo.data !== 'string' || !imageData.test(photo.data) ||
    (photo.rotation !== undefined && ![0, 90, 180, 270].includes(photo.rotation as number)))) {
    throw new Error('The project contains an invalid image.')
  }
  if (record(photo) && photo.crop !== undefined) {
    const crop = photo.crop
    if (!record(crop) || ![crop.x, crop.y, crop.width, crop.height].every(Number.isSafeInteger) ||
        !between(crop.x, 0, Number.MAX_SAFE_INTEGER) || !between(crop.y, 0, Number.MAX_SAFE_INTEGER) ||
        !between(crop.width, 1, Number.MAX_SAFE_INTEGER) || !between(crop.height, 1, Number.MAX_SAFE_INTEGER)) {
      throw new Error('The project contains an invalid crop.')
    }
  }
  if (record(photo) && photo.paper !== undefined) {
    const paper = photo.paper
    if (!record(paper) || (paper.method !== undefined && paper.method !== 'atelier' && paper.method !== 'basic') || typeof paper.removeBackground !== 'boolean' ||
      !between(paper.tolerance, 1, 120) || !Object.keys(paperStyles).some(style => style === paper.style)) {
      throw new Error('The project contains invalid paper settings.')
    }
  }
  if (new Set(value.marks.map(item => item.id)).size !== value.marks.length) {
    throw new Error('The project contains duplicate annotation IDs.')
  }
  return { version: 1, photo: photo as Project['photo'], marks: value.marks }
}
export function decode(data: string): Promise<HTMLImageElement> {
  const image = new Image()
  image.src = data
  return image.decode().then(() => image)
}
export function readImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Could not read the image file.'))
    reader.onload = () => {
      const data = String(reader.result)
      if (imageData.test(data)) resolve(data)
      else reject(new Error('Choose an image file such as JPEG, PNG, or WebP.'))
    }
    reader.readAsDataURL(file)
  })
}
export function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = name
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 30_000)
}
