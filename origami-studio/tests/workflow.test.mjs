import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import { chromium } from 'playwright-core'

const macChrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

test('import, annotate, edit, preview, save, reload, and export', async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH || (existsSync(macChrome) ? macChrome : undefined),
    args: ["--disable-crash-reporter", "--disable-crashpad-for-testing"],
  })
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 940 } })
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    await page.goto(process.env.STUDIO_URL || 'http://127.0.0.1:5173')
    const input = page.locator('input[type=file][accept="image/*"]')
    const data = await page.evaluate(() => {
      const canvas = document.createElement('canvas')
      canvas.width = 800
      canvas.height = 600
      const context = canvas.getContext('2d')
      context.fillStyle = '#769985'
      context.fillRect(0, 0, canvas.width, canvas.height)
      return canvas.toDataURL('image/png')
    })
    await input.setInputFiles({
      name: 'test-fold.png', mimeType: 'image/png', buffer: Buffer.from(data.split(',')[1], 'base64'),
    })
    await page.getByText('test-fold.png', { exact: true }).waitFor()
    const surface = page.locator('.konvajs-content')
    const bounds = await surface.boundingBox()
    async function drag(x1, y1, x2, y2) {
      await page.mouse.move(bounds.x + bounds.width * x1, bounds.y + bounds.height * y1)
      await page.mouse.down()
      await page.mouse.move(bounds.x + bounds.width * x2, bounds.y + bounds.height * y2, { steps: 8 })
      await page.mouse.up()
    }
    for (const [index, name] of ['Valley fold', 'Mountain fold', 'Crease', 'Curved arrow'].entries()) {
      await page.locator('.tools').getByRole('button', { name: new RegExp(name) }).click()
      const y = bounds.y + bounds.height * (0.22 + index * 0.15)
      await page.mouse.click(bounds.x + bounds.width * 0.24, y)
      await page.getByText('Click the end point', { exact: true }).waitFor()
      await page.mouse.click(bounds.x + bounds.width * 0.76, y)
      await page.locator('.layer-name').filter({ hasText: name }).waitFor()
    }
    const arrowRow = page.locator('.layer-name').filter({ hasText: 'Curved arrow' })
    assert.equal(await arrowRow.getAttribute('aria-pressed'), 'true')
    await drag(0.5, 0.9612, 0.48, 0.9)
    await drag(0.76, 0.67, 0.71, 0.57)
    await drag(0.24, 0.67, 0.28, 0.71)
    await page.getByLabel('Arrow style').selectOption('double')
    assert.equal(JSON.parse(await save()).marks[3].arrowStyle, 'double')
    await page.getByLabel('Arrow style').selectOption('unfold')
    await page.getByRole('button', { name: 'Color #ce5c42' }).click()
    await page.locator('input[type=range]').first().fill('9')
    await page.locator('input[type=range]').last().fill('0.72')
    await page.getByRole('button', { name: /Hide Crease/ }).click()
    async function save() {
      const event = page.waitForEvent('download')
      await page.getByRole('button', { name: 'Save JSON' }).click()
      return readFile(await (await event).path(), 'utf8')
    }
    const json = await save()
    const project = JSON.parse(json)
    assert.equal(project.photo.data, data)
    assert.deepEqual(project.marks.map(mark => mark.kind), ['valley', 'mountain', 'crease', 'arrow'])
    assert.equal(project.marks[2].hidden, true)
    const arrow = project.marks[3]
    assert.equal(arrow.arrowStyle, 'unfold')
    assert.equal(arrow.color, '#ce5c42')
    assert.equal(arrow.width, 9)
    assert.equal(arrow.opacity, 0.72)
    assert.ok(Math.abs(arrow.control.y - 0.9) < 0.02, JSON.stringify(arrow))
    assert.ok(Math.abs(arrow.start.x - 0.28) < 0.02, JSON.stringify(arrow))
    assert.ok(Math.abs(arrow.end.y - 0.57) < 0.02, JSON.stringify(arrow))

    await page.getByRole('button', { name: /Preview animation/ }).click()
    await page.getByText('Playing preview…').waitFor()
    assert.equal(await page.getByRole('button', { name: /Export PNG/ }).isDisabled(), true)
    await page.getByRole('button', { name: /Preview animation/ }).waitFor()
    assert.equal(await save(), json)

    const open = page.locator('input[type=file][accept^=".json"]')
    await open.setInputFiles({ name: 'invalid.json', mimeType: 'application/json', buffer: Buffer.from('{}') })
    await page.getByRole('alert').waitFor()
    assert.equal(await save(), json)

    await page.reload()
    await open.setInputFiles({ name: 'roundtrip.json', mimeType: 'application/json', buffer: Buffer.from(json) })
    await page.getByText('test-fold.png', { exact: true }).waitFor()
    assert.equal(await save(), json)
    await arrowRow.click()
    async function exportImage() {
      const event = page.waitForEvent('download')
      await page.getByRole('button', { name: /Export PNG/ }).click()
      return readFile(await (await event).path())
    }
    const png = await exportImage()
    assert.equal(png.subarray(1, 4).toString(), 'PNG')
    assert.equal(png.readUInt32BE(16), 800)
    assert.equal(png.readUInt32BE(20), 600)
    await page.getByRole('button', { name: 'Rotate photo counterclockwise' }).click()
    await page.getByText('600 × 800', { exact: true }).waitFor()
    const rotatedJson = await save()
    const rotated = JSON.parse(rotatedJson)
    assert.equal(rotated.photo.rotation, 270)
    assert.equal(rotated.photo.data, data)
    for (const key of ['start', 'end', 'control']) {
      assert.deepEqual(rotated.marks[3][key], { x: arrow[key].y, y: 1 - arrow[key].x })
    }
    await page.reload()
    await open.setInputFiles({ name: 'rotated.json', mimeType: 'application/json', buffer: Buffer.from(rotatedJson) })
    await page.getByText('600 × 800', { exact: true }).waitFor()
    assert.equal(await save(), rotatedJson)
    const rotatedPng = await exportImage()
    assert.equal(rotatedPng.readUInt32BE(16), 600)
    assert.equal(rotatedPng.readUInt32BE(20), 800)
    await page.getByRole('button', { name: 'Rotate photo clockwise' }).click()
    await page.getByText('800 × 600', { exact: true }).waitFor()
    await arrowRow.click()
    await page.getByRole('button', { name: /Delete annotation/ }).click()
    assert.equal(JSON.parse(await save()).marks.length, 3)
    assert.notDeepEqual(await exportImage(), png)
    await page.reload()
    await page.getByRole('button', { name: 'Try sample diagram' }).click()
    await page.getByText('Sample fold.svg', { exact: true }).waitFor()
    await page.getByRole('checkbox', { name: 'Remove background' }).check()
    const cutout = page.locator('.artboard.transparent')
    await cutout.waitFor()
    await page.evaluate(() => {
      const artboard = document.querySelector('.artboard')
      artboard.dataset.cutoutFlash = 'false'
      new MutationObserver(records => {
        if (!artboard.classList.contains('transparent') ||
            records.some(record => !record.oldValue.split(' ').includes('transparent'))) {
          artboard.dataset.cutoutFlash = 'true'
        }
      }).observe(artboard, { attributes: true, attributeFilter: ['class'], attributeOldValue: true })
    })
    await page.getByLabel('Paper style').selectOption('sage')
    await page.getByText('Background removed. The checkerboard is transparent.').waitFor()
    assert.equal(await cutout.getAttribute('data-cutout-flash'), 'false')
    await page.getByRole('button', { name: 'Crop to paper' }).click()
    await page.getByRole('button', { name: 'Reset crop' }).waitFor()
    const croppedProject = JSON.parse(await save())
    assert.ok(croppedProject.photo.crop.width < 960)
    assert.ok(croppedProject.photo.crop.height < 720)
    const croppedPng = await exportImage()
    assert.equal(croppedPng.readUInt32BE(16), croppedProject.photo.crop.width)
    assert.equal(croppedPng.readUInt32BE(20), croppedProject.photo.crop.height)
    await page.getByRole('button', { name: 'Reset crop' }).click()
    await page.getByText('960 × 720', { exact: true }).waitFor()
    await page.getByRole('checkbox', { name: 'Remove background' }).uncheck()
    await cutout.waitFor({ state: 'detached' })
    assert.deepEqual(errors, [])
  } finally {
    await browser.close()
  }
})
