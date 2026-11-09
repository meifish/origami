import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

const script = fileURLToPath(new URL('./processing/stylize.py', import.meta.url))
const styles = new Set(['original', 'editorial', 'texture', 'graphic'])
const maxBytes = 32 * 1024 * 1024

function attach(server) {
  server.middlewares.use('/api/paper', async (request, response) => {
    const fail = (status, message) => {
      if (response.destroyed || response.writableEnded) return
      response.statusCode = status
      response.end(message)
    }
    if (request.method !== 'POST') return fail(405, 'Use POST.')
    if (!/^image\//.test(request.headers['content-type'] ?? '')) return fail(415, 'Choose an image file.')
    const options = new URL(request.url, 'http://localhost').searchParams
    const style = options.get('style')
    if (!styles.has(style)) return fail(400, 'Unknown paper style.')
    const chunks = []
    let size = 0
    for await (const chunk of request) {
      size += chunk.length
      if (size > maxBytes) {
        fail(413, 'Choose an image smaller than 32 MB.')
        return
      }
      chunks.push(chunk)
    }
    const child = spawn(process.env.ORIGAMI_PYTHON || 'python3', [script, style, String(options.get('remove') === 'true')])
    const output = []
    const errors = []
    const timeout = setTimeout(() => {
      fail(504, 'Paper processing took too long.')
      child.kill()
    }, 90_000)
    response.on('close', () => { if (!response.writableEnded) child.kill() })
    child.stdin.on('error', () => {})
    child.stdout.on('data', chunk => output.push(chunk))
    child.stderr.on('data', chunk => errors.push(chunk))
    child.on('error', () => fail(503, 'Install the Python photo-processing dependencies to use Paper Atelier.'))
    child.on('close', code => {
      clearTimeout(timeout)
      if (response.destroyed || response.writableEnded) return
      if (code !== 0) {
        const detail = Buffer.concat(errors).toString().trim()
        return fail(422, detail.startsWith('No cool-colored') ? detail :
          'Paper Atelier could not process this photo. Check the Python dependencies and image format.')
      }
      response.setHeader('Content-Type', 'image/png')
      response.end(Buffer.concat(output))
    })
    child.stdin.end(Buffer.concat(chunks))
  })
}

export default defineConfig({
  plugins: [{ name: 'origami-paper-atelier', configureServer: attach, configurePreviewServer: attach }],
})
