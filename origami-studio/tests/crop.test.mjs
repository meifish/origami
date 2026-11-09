import assert from 'node:assert/strict'
import { test } from 'node:test'
import { orientCrop, padCrop, visibleBounds } from '../src/crop.ts'

test('trim includes partially transparent paper edges and ignores empty margins', () => {
  const image = { width: 8, height: 6, data: new Uint8ClampedArray(8 * 6 * 4) }
  assert.equal(visibleBounds(image), null)
  image.data[(2 * 8 + 1) * 4 + 3] = 1
  image.data[(4 * 8 + 5) * 4 + 3] = 255
  const crop = visibleBounds(image)
  assert.deepEqual(crop, { x: 1, y: 2, width: 5, height: 3 })
  assert.deepEqual(orientCrop(crop, 8, 6, 90), { x: 1, y: 1, width: 3, height: 5 })
  assert.deepEqual(orientCrop(crop, 8, 6, 180), { x: 2, y: 1, width: 5, height: 3 })
  assert.deepEqual(orientCrop(crop, 8, 6, 270), { x: 2, y: 2, width: 3, height: 5 })
})

test('crop margin pads each side within the source frame', () => {
  const paper = { x: 3, y: 15, width: 100, height: 80 }
  assert.deepEqual(padCrop(paper, 120, 100, 0), paper)
  assert.deepEqual(padCrop(paper, 120, 100, 0.1), { x: 0, y: 7, width: 111, height: 93 })
  assert.deepEqual(padCrop(paper, 120, 100, 0.03), { x: 1, y: 13, width: 104, height: 84 })
})
