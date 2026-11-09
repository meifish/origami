import assert from 'node:assert/strict'
import { test } from 'node:test'
import { defaultPaper, processPaper } from '../src/paper.ts'

test('removes edge-connected background and tones paper while keeping fold contrast', () => {
  const width = 5
  const height = 5
  const image = { naturalWidth: width, naturalHeight: height }
  const pixels = new Uint8ClampedArray(width * height * 4)
  const index = (x, y) => (y * width + x) * 4
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const shade = x === 0 || y === 0 || x === 4 || y === 4 || (x === 2 && y === 2) ? 35
        : x === 1 ? 140 : 220
      pixels.set([shade, shade, shade, 255], index(x, y))
    }
  }
  const original = pixels.slice()
  let result
  globalThis.document = {
    createElement: () => ({
      getContext: () => ({
        drawImage() {},
        getImageData: () => ({ data: pixels.slice() }),
        putImageData: ({ data }) => { result = data },
      }),
    }),
  }
  try {
    processPaper(image, { ...defaultPaper, removeBackground: true, style: 'sage' })
    assert.equal(result[index(0, 0) + 3], 0)
    assert.equal(result[index(0, 2) + 3], 0)
    assert.equal(result[index(2, 2) + 3], 255)
    assert.equal(result[index(3, 2) + 3], 255)
    assert.ok(result[index(1, 2)] < result[index(3, 2)])
    assert.ok(result[index(3, 2) + 1] > result[index(3, 2)])
    assert.deepEqual(pixels, original)
    processPaper(image, defaultPaper)
    assert.deepEqual(result, original)
  } finally {
    delete globalThis.document
  }
})
