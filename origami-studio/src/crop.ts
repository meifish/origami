export type Crop = { x: number; y: number; width: number; height: number }

export function visibleBounds(pixels: ImageData): Crop | null {
  const { width, height, data } = pixels
  let left = width
  let top = height
  let right = -1
  let bottom = -1
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] === 0) continue
      left = Math.min(left, x)
      right = Math.max(right, x)
      top = Math.min(top, y)
      bottom = Math.max(bottom, y)
    }
  }
  return right < 0 ? null : { x: left, y: top, width: right - left + 1, height: bottom - top + 1 }
}

export function orientCrop(crop: Crop, width: number, height: number, rotation: number): Crop {
  const { x, y, width: w, height: h } = crop
  if (rotation === 90) return { x: height - y - h, y: x, width: h, height: w }
  if (rotation === 180) return { x: width - x - w, y: height - y - h, width: w, height: h }
  if (rotation === 270) return { x: y, y: width - x - w, width: h, height: w }
  return crop
}

export function padCrop(crop: Crop, width: number, height: number, fraction: number): Crop {
  const padding = Math.round(Math.min(crop.width, crop.height) * fraction)
  const x = Math.max(0, crop.x - padding)
  const y = Math.max(0, crop.y - padding)
  const right = Math.min(width, crop.x + crop.width + padding)
  const bottom = Math.min(height, crop.y + crop.height + padding)
  return { x, y, width: right - x, height: bottom - y }
}
