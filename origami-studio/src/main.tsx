import { useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Circle, Image as CanvasImage, Layer, Line, Rect, Shape, Stage } from 'react-konva'
import type Konva from 'konva'
import gsap from 'gsap'
import { arrowStyles, blank, decode, download, labels, parseProject, patterns, readImage } from './project'
import type { ArrowStyle, Kind, Mark, Point, Project } from './project'
import { clamp, curve, defaultControl } from './geometry'
import { atelierStyle, defaultPaper, paperStyles, processAtelier, processPaper } from './paper'
import type { PaperSettings } from './paper'
import { orientCrop, padCrop, visibleBounds } from './crop'
import type { Crop } from './crop'
import './style.css'

const tools = ['select', 'valley', 'mountain', 'crease', 'arrow'] as const
type Tool = typeof tools[number]
const icons = { select: '↖', valley: '┄', mountain: '╍', crease: '╱', arrow: '⤴' }
const colors = ['#ffffff', '#253431', '#ce5c42', '#e8ba50', '#497e72']
const artwork = new URL('./sample.svg', import.meta.url).href

function App() {
  const [project, setProject] = useState<Project>(blank)
  const [photo, setPhoto] = useState<HTMLImageElement | null>(null)
  const [renderedPaper, setRenderedPaper] = useState<{
    settings: PaperSettings
    image: HTMLCanvasElement | HTMLImageElement
  } | null>(null)
  const [cropMargin, setCropMargin] = useState(3)
  const [showOriginal, setShowOriginal] = useState(false)
  const [processingError, setProcessingError] = useState('')
  const [tool, setTool] = useState<Tool>('select')
  const [selected, setSelected] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [startAnchored, setStartAnchored] = useState(false)
  const [draft, setDraft] = useState<Mark | null>(null)
  const [progress, setProgress] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [space, setSpace] = useState({ width: 640, height: 460 })
  const stage = useRef<Konva.Stage>(null)
  const guides = useRef<Konva.Layer>(null)
  const area = useRef<HTMLDivElement>(null)
  const photoInput = useRef<HTMLInputElement>(null)
  const jsonInput = useRef<HTMLInputElement>(null)
  const gesture = useRef<Mark | null>(null)
  const tween = useRef<gsap.core.Tween | null>(null)
  const numberedMarks = project.marks.map((mark, index) => ({ mark, number: index + 1 }))
  const stackedMarks = [
    ...numberedMarks.filter(({ mark }) => mark.kind !== 'arrow'),
    ...numberedMarks.filter(({ mark }) => mark.kind === 'arrow'),
  ]
  const active = project.marks.find(mark => mark.id === selected)
  const previewing = progress !== null
  const paper = project.photo?.paper ?? defaultPaper
  const method = paper.method ?? 'basic'
  const usesAtelierStyle = atelierStyle(paper.style)
  const photoSource = project.photo?.data
  const rotation = project.photo?.rotation ?? 0
  const sideways = rotation === 90 || rotation === 270
  const pixelWidth = photo ? (sideways ? photo.naturalHeight : photo.naturalWidth) : 0
  const pixelHeight = photo ? (sideways ? photo.naturalWidth : photo.naturalHeight) : 0
  const crop = project.photo?.crop
  const frame = photo && crop
    ? orientCrop(crop, photo.naturalWidth, photo.naturalHeight, rotation)
    : { x: 0, y: 0, width: pixelWidth || 640, height: pixelHeight || 480 }
  const ratio = frame.width / frame.height
  const viewWidth = Math.max(1, Math.min(space.width, space.height * ratio))
  const viewHeight = viewWidth / ratio
  const scale = viewWidth / frame.width
  const width = (pixelWidth || frame.width) * scale
  const height = (pixelHeight || frame.height) * scale
  const offsetX = frame.x * scale
  const offsetY = frame.y * scale

  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => setSpace({
      width: entry.contentRect.width, height: entry.contentRect.height,
    }))
    observer.observe(area.current!)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    setProcessingError('')
    if (!photo || (!paper.removeBackground && paper.style === 'original')) return
    const controller = new AbortController()
    const timer = window.setTimeout(async () => {
      try {
        const next = photoSource && (usesAtelierStyle || (paper.removeBackground && method === 'atelier'))
          ? await processAtelier(photoSource, paper, controller.signal)
          : processPaper(photo, paper)
        if (!controller.signal.aborted) setRenderedPaper({ settings: paper, image: next })
      } catch (error) {
        if (!controller.signal.aborted) {
          setProcessingError(error instanceof Error ? error.message : 'Could not process this image.')
        }
      }
    }, 120)
    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [photo, photoSource, paper, method, usesAtelierStyle])
  const edited = paper.removeBackground || paper.style !== 'original'
  const currentPaper = renderedPaper?.settings === paper
  const keepCutout = paper.removeBackground && renderedPaper?.settings.removeBackground
  const processed = currentPaper || keepCutout ? renderedPaper?.image : null
  const processing = edited && !currentPaper && !processingError
  const transparent = !showOriginal && !!processed && paper.removeBackground

  function setPaper(patch: Partial<PaperSettings>) {
    if (patch.removeBackground === false) setRenderedPaper(null)
    setProcessingError('')
    setShowOriginal(false)
    setProject(previous => previous.photo ? {
      ...previous, photo: { ...previous.photo, paper: { ...paper, ...patch } },
    } : previous)
  }
  function setCrop(next: Crop | undefined) {
    choose('select')
    setProject(previous => previous.photo ? {
      ...previous, photo: { ...previous.photo, crop: next },
    } : previous)
  }
  function trimPhoto() {
    if (!photo || !processed || !currentPaper || !transparent) return
    setError('')
    try {
      const canvas = document.createElement('canvas')
      canvas.width = photo.naturalWidth
      canvas.height = photo.naturalHeight
      const context = canvas.getContext('2d')
      if (!context) throw new Error()
      context.drawImage(processed, 0, 0)
      const bounds = visibleBounds(context.getImageData(0, 0, canvas.width, canvas.height))
      if (!bounds) {
        setError('No visible paper to crop. Adjust the background settings first.')
        return
      }
      const padded = padCrop(bounds, canvas.width, canvas.height, cropMargin / 100)
      if (padded.width === canvas.width && padded.height === canvas.height) {
        setCrop(undefined)
        setNotice('The crop with this margin already fills the photo.')
      } else {
        setCrop(padded)
        setNotice('Cropped to the paper with the selected margin.')
      }
    } catch {
      setError('Could not read the photo edges for cropping.')
    }
  }
  function stop() {
    tween.current?.kill()
    tween.current = null
    setProgress(null)
  }
  function selectMark(id: string | null) {
    if (id !== selected || id === null) setEditing(false)
    setSelected(id)
  }
  function choose(next: Tool) {
    gesture.current = null
    setDraft(null)
    setStartAnchored(false)
    setTool(next)
    if (next !== 'select') selectMark(null)
  }
  function update(id: string, patch: Partial<Mark>) {
    setProject(previous => ({ ...previous, marks: previous.marks.map(mark =>
      mark.id === id ? { ...mark, ...patch } : mark,
    ) }))
  }
  function remove() {
    setProject(previous => ({ ...previous, marks: previous.marks.filter(mark => mark.id !== selected) }))
    selectMark(null)
  }
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        stop()
        choose('select')
        selectMark(null)
        return
      }
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey ||
          event.target instanceof HTMLElement && event.target.closest('input, select, textarea, button, [contenteditable]') ||
          previewing || busy) return
      const index = ['v', '1', '2', '3', '4'].indexOf(event.key.toLowerCase())
      if (index >= 0) choose(tools[index])
      if (selected && ['Delete', 'Backspace'].includes(event.key)) {
        event.preventDefault()
        remove()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selected, previewing, busy])

  async function load(action: () => Promise<Project>) {
    setBusy(true)
    setError('')
    setNotice('')
    stop()
    try {
      const next = await action()
      const image = next.photo ? await decode(next.photo.data) : null
      const savedCrop = next.photo?.crop
      if (image && savedCrop && (savedCrop.x + savedCrop.width > image.naturalWidth ||
          savedCrop.y + savedCrop.height > image.naturalHeight)) {
        throw new Error('The saved crop falls outside the photo.')
      }
      setPhoto(image)
      setRenderedPaper(null)
      setShowOriginal(false)
      setProject(next)
      selectMark(null)
      choose('select')
      setNotice(next.photo ? `Opened ${next.photo.name}` : 'Project opened')
    } catch (problem) {
      setError(problem instanceof Error && problem.message ? problem.message : 'Could not open this file.')
    } finally {
      setBusy(false)
    }
  }
  function importPhoto(file?: File) {
    if (!file) return
    void load(async () => ({ ...project, photo: { name: file.name, data: await readImage(file) } }))
  }
  function rotatePhoto(clockwise: boolean) {
    choose('select')
    const rotatePoint = ({ x, y }: Point): Point => clockwise ? { x: 1 - y, y: x } : { x: y, y: 1 - x }
    setProject(previous => {
      if (!previous.photo) return previous
      return {
        ...previous,
        photo: {
          ...previous.photo,
          rotation: ((previous.photo.rotation ?? 0) + (clockwise ? 90 : 270)) % 360,
        },
        marks: previous.marks.map(mark => ({
          ...mark,
          start: rotatePoint(mark.start),
          end: rotatePoint(mark.end),
          control: rotatePoint(mark.control),
        })),
      }
    })
  }
  function pointer() {
    const pos = stage.current?.getPointerPosition()
    return pos && { x: clamp((pos.x + offsetX) / width), y: clamp((pos.y + offsetY) / height) }
  }
  function begin(event: Konva.KonvaEventObject<PointerEvent>) {
    if (previewing || busy || event.evt.button !== 0) return
    if (tool === 'select') {
      if (event.target === stage.current) selectMark(null)
      return
    }
    const start = pointer()
    if (!start) return
    const target = event.evt.target as Element
    target.setPointerCapture(event.evt.pointerId)
    if (startAnchored) return
    const next: Mark = {
      id: crypto.randomUUID(), kind: tool, start, end: start, control: start,
      color: tool === 'arrow' ? colors[0] : colors[3], width: 4, opacity: 1, hidden: false,
    }
    gesture.current = next
    setDraft(next)
  }
  function move() {
    const end = pointer()
    const current = gesture.current
    if (!end || !current) return
    const next = { ...current, end, control: defaultControl(current.start, end, width, height) }
    gesture.current = next
    setDraft(next)
  }
  function finish() {
    const end = pointer()
    const current = gesture.current
    if (!current || !end) return
    const distance = Math.hypot((end.x - current.start.x) * width, (end.y - current.start.y) * height)
    if (distance < (current.kind === 'arrow' ? 12 : 6)) {
      setStartAnchored(true)
      setDraft({ ...current, end: current.start, control: current.start })
      return
    }
    choose('select')
    const mark = { ...current, end, control: defaultControl(current.start, end, width, height) }
    setProject(previous => ({ ...previous, marks: [...previous.marks, mark] }))
    selectMark(mark.id)
  }
  function play() {
    const state = { value: 0 }
    setProgress(0)
    tween.current = gsap.to(state, {
      value: 1, duration: 1.6, ease: 'power2.inOut',
      onUpdate: () => setProgress(state.value),
      onComplete: stop,
    })
  }
  function save() {
    download(new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' }), 'origami.project.json')
    setNotice('Project downloaded')
  }
  async function exportPng() {
    if (!stage.current || !guides.current) return
    const layer = guides.current
    setError('')
    try {
      layer.hide()
      const canvas = stage.current.toCanvas({ pixelRatio: photo ? (frame.width + 1e-7) / viewWidth : 2 })
      layer.show()
      const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(result =>
        result ? resolve(result) : reject(new Error('Could not encode this canvas.')), 'image/png'))
      download(blob, 'origami.png')
      setNotice('PNG downloaded')
    } catch {
      setError('PNG export failed. The image may exceed your browser’s canvas size limit.')
    } finally {
      layer.show()
    }
  }
  function renderMark(mark: Mark) {
    const amount = progress ?? 1
    const unit = (sideways ? height : width) / 640
    const common = {
      key: mark.id, stroke: mark.color, opacity: mark.opacity,
      strokeWidth: mark.width * unit, hitStrokeWidth: 14,
      lineCap: 'round' as const, lineJoin: 'round' as const,
      listening: tool === 'select' && !previewing,
      onPointerDown: () => { if (!busy) selectMark(mark.id) },
    }
    if (mark.kind !== 'arrow') return <Line {...common} key={mark.id}
      points={[mark.start.x * width, mark.start.y * height, mark.end.x * width, mark.end.y * height]}
      dash={patterns[mark.kind].map(value => value * unit)}
      shadowColor={mark.color} shadowBlur={progress === null ? 0 : 14 * Math.sin(progress * Math.PI)}
      shadowOpacity={0.95}
    />
    const style = mark.arrowStyle ?? 'single'
    const forward = style === 'unfold' ? Math.min(1, amount * 2) : amount
    const { start, tip, partialControl, angle } = curve(mark, width, height, forward)
    const dx = mark.end.x - mark.start.x
    const dy = mark.end.y - mark.start.y
    const bend = dx * (mark.control.y - mark.start.y) - dy * (mark.control.x - mark.start.x)
    const side = bend < 0 ? -1 : 1
    const returnPath = style === 'unfold' && amount > 0.5 ? curve({
      ...mark, end: mark.start,
      start: { x: mark.end.x + dy * side * 0.32, y: mark.end.y - dx * side * 0.32 },
      control: {
        x: mark.control.x * 0.22 + (mark.start.x + mark.end.x) * 0.39,
        y: mark.control.y * 0.22 + (mark.start.y + mark.end.y) * 0.39,
      },
    }, width, height, amount * 2 - 1) : null
    const head = Math.min(Math.max(10 * unit, common.strokeWidth * 3.2),
      (Math.hypot(tip.x - partialControl.x, tip.y - partialControl.y) +
       Math.hypot(partialControl.x - start.x, partialControl.y - start.y)) * 0.75)
    return <Shape {...common} key={mark.id} sceneFunc={(context, shape) => {
      context.beginPath()
      context.moveTo(start.x, start.y)
      context.quadraticCurveTo(partialControl.x, partialControl.y, tip.x, tip.y)
      const arrowhead = (point: Point, direction: number) => {
        for (const wing of [-1, 1]) {
          context.moveTo(point.x, point.y)
          context.lineTo(
            point.x - head * Math.cos(direction + wing * 0.55),
            point.y - head * Math.sin(direction + wing * 0.55),
          )
        }
      }
      arrowhead(tip, angle)
      if (style === 'double') {
        const tangent = Math.hypot(start.x - partialControl.x, start.y - partialControl.y) > 0.01 ? partialControl : tip
        arrowhead(start, Math.atan2(start.y - tangent.y, start.x - tangent.x))
      }
      if (returnPath) {
        context.moveTo(returnPath.start.x, returnPath.start.y)
        context.quadraticCurveTo(returnPath.partialControl.x, returnPath.partialControl.y, returnPath.tip.x, returnPath.tip.y)
      }
      context.strokeShape(shape)
    }} />
  }
  const handleKeys = active?.kind === 'arrow' ? ['start', 'control', 'end'] as const : ['start', 'end'] as const

  return <>
    <header className="top">
      <div className="brand"><span className="logo" aria-hidden="true">◇</span><strong>Origami Studio</strong><span className="version">V0.1</span></div>
      <div className="actions">
        <button disabled={busy} onClick={() => jsonInput.current?.click()}>Open project</button>
        <button disabled={busy} onClick={save}>Save JSON</button>
        <button className="primary" disabled={previewing || busy || !!draft || (!showOriginal && (processing || !!processingError))} onClick={exportPng}>Export PNG ↗</button>
      </div>
      <input ref={jsonInput} type="file" accept=".json,application/json" hidden onChange={event => {
        const file = event.target.files?.[0]
        event.target.value = ''
        if (file) void load(async () => parseProject(await file.text()))
      }} />
      <input ref={photoInput} type="file" accept="image/*" hidden onChange={event => {
        importPhoto(event.target.files?.[0])
        event.target.value = ''
      }} />
    </header>
    <main>
      <div className="intro"><div className="eyebrow">PAPER / DIGITAL WORKBENCH</div><h1>Fold diagram</h1><p>Turn a paper fold into a clear, illustrated instruction.</p></div>
      <div className="workbench">
        <aside className="tools">
          <div className="section-title">TOOLS</div>
          <button className="import" disabled={previewing || busy} onClick={() => photoInput.current?.click()}>＋ Import photo</button>
          {tools.map((item, index) => <button key={item} aria-pressed={tool === item} disabled={previewing || busy}
            onClick={() => choose(item)}><span className="icon">{icons[item]}</span>{item === 'select' ? 'Select' : labels[item]}<kbd>{index || 'V'}</kbd></button>)}
          <div className="tip"><strong>Quick guide</strong><p>Click a start and end point to draw. Select a mark to fine-tune its handles.</p></div>
        </aside>
        <section className="editor" aria-label="Diagram editor">
          <div className="canvas-top"><strong>Canvas</strong>
            {photo && <div className="rotation-controls" aria-label="Photo rotation">
              <button disabled={busy || previewing} aria-label="Rotate photo counterclockwise" title="Rotate counterclockwise 90°" onClick={() => rotatePhoto(false)}>↶</button>
              <button disabled={busy || previewing} aria-label="Rotate photo clockwise" title="Rotate clockwise 90°" onClick={() => rotatePhoto(true)}>↷</button>
            </div>}
            <span>{photo ? `${frame.width} × ${frame.height}` : 'Blank artboard'}</span></div>
          <div className="mat">
            <div className="canvas-space" ref={area}>
              <div className={transparent ? "artboard transparent" : "artboard"} style={{ width: viewWidth, height: viewHeight, cursor: tool === 'select' ? 'default' : 'crosshair' }}>
                <Stage ref={stage} width={viewWidth} height={viewHeight} onPointerDown={begin} onPointerMove={move}
                  onPointerUp={() => { if (gesture.current) finish() }} onPointerCancel={() => choose(tool)}>
                  <Layer listening={false} x={-offsetX} y={-offsetY}>
                    {!photo && <Rect width={width} height={height} fill="#fcfaf3" />}
                    {photo && <CanvasImage image={(!showOriginal && processed) || photo} rotation={rotation}
                      x={rotation === 90 || rotation === 180 ? width : 0}
                      y={rotation === 180 || rotation === 270 ? height : 0}
                      width={sideways ? height : width} height={sideways ? width : height} />}
                  </Layer>
                  <Layer x={-offsetX} y={-offsetY}>{draft && draft.kind !== 'arrow' && renderMark(draft)}
                    {stackedMarks.filter(({ mark }) => !mark.hidden).map(({ mark }) => renderMark(mark))}
                    {draft?.kind === 'arrow' && renderMark(draft)}</Layer>
                  <Layer ref={guides} x={-offsetX} y={-offsetY}>
                    {startAnchored && draft && <Circle listening={false} radius={5} fill="#e8ba50" stroke="#28594e" strokeWidth={2}
                      x={draft.start.x * width} y={draft.start.y * height} />}
                    {active && !active.hidden && !previewing && <>
                      {active.kind === 'arrow' && <Line listening={false} stroke="#477368" opacity={0.7} dash={[4, 4]}
                        points={handleKeys.flatMap(key => [active[key].x * width, active[key].y * height])} />}
                      {handleKeys.map(key => <Circle key={key} name={key}
                        x={active[key].x * width} y={active[key].y * height} radius={7} hitStrokeWidth={12}
                        fill={key === 'control' ? '#e8ba50' : '#ffffff'} stroke="#28594e" strokeWidth={2}
                        draggable={!busy}
                        dragBoundFunc={position => ({
                          x: Math.max(0, Math.min(viewWidth, position.x)), y: Math.max(0, Math.min(viewHeight, position.y)),
                        })}
                        onDragMove={event => update(active.id, { [key]: {
                          x: clamp(event.target.x() / width), y: clamp(event.target.y() / height),
                        } })}
                      />)}
                    </>}
                  </Layer>
                </Stage>
                {!photo && project.marks.length === 0 && !draft && tool === 'select' && <div className="empty">
                  <span className="paper-icon" aria-hidden="true">◇</span>
                  <strong>Start with a photo</strong><p>Bring in a top-down shot of your fold.</p>
                  <button className="primary" disabled={busy} onClick={() => photoInput.current?.click()}>Import a photo</button>
                  <button disabled={busy} onClick={() => void load(async () => {
                    const response = await fetch(artwork)
                    if (!response.ok) throw new Error('Could not load the sample.')
                    const file = new File([await response.blob()], 'Sample fold.svg', { type: 'image/svg+xml' })
                    return { ...blank, photo: {
                      name: file.name, data: await readImage(file),
                      paper: { ...defaultPaper, method: 'basic', tolerance: 18 },
                    } }
                  })}>Try sample diagram</button>
                </div>}
              </div>
            </div>
          </div>
          <div className="canvas-bottom">
            <button className="preview" disabled={busy || !!draft || !project.marks.some(mark => !mark.hidden)}
              onClick={previewing ? stop : play}>{previewing ? '■  Stop preview' : '▶  Preview animation'}</button>
            <span>{previewing ? 'Playing preview…' : tool !== 'select' ? (startAnchored ? 'Click the end point' : 'Click the start point') : `${project.marks.length} annotation${project.marks.length === 1 ? '' : 's'}`}</span>
          </div>
        </section>
        <aside className="inspector">
          <div className="section-title">LAYERS</div>
          <div className="locked"><span aria-hidden="true">▧</span><div><strong>{project.photo?.name ?? 'Paper background'}</strong><small>Locked background</small></div><span aria-label="Locked">🔒</span></div>
          {photo && <fieldset className="paper-controls" disabled={busy || previewing}>
            <legend className="section-title">PAPER PHOTO</legend>
            <label className="check"><input type="checkbox" checked={paper.removeBackground}
              onChange={event => setPaper({ removeBackground: event.target.checked })} /> Remove background</label>
            {paper.removeBackground && <label>Background method
              <select value={usesAtelierStyle ? 'atelier' : method} disabled={usesAtelierStyle}
                onChange={event => setPaper({ method: event.target.value as PaperSettings['method'] })}>
                <option value="atelier">Paper Atelier</option>
                <option value="basic">Basic edge color</option>
              </select>
            </label>}
            {paper.removeBackground && method === 'basic' && !usesAtelierStyle && <label>Background tolerance <output>{paper.tolerance}</output>
              <input type="range" min="1" max="120" value={paper.tolerance}
                onChange={event => setPaper({ tolerance: +event.target.value })} />
            </label>}
            <label>Paper style
              <select value={paper.style} onChange={event => setPaper({ style: event.target.value as PaperSettings['style'] })}>
                {Object.entries(paperStyles).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
            <button disabled={!edited} aria-pressed={showOriginal} onClick={() => setShowOriginal(value => !value)}>
              {showOriginal ? 'Show processed photo' : 'Compare original'}
            </button>
            {transparent && <label>Crop margin <output>{cropMargin}%</output>
              <input type="range" min="0" max="15" step="1" value={cropMargin}
                onChange={event => setCropMargin(+event.target.value)} />
            </label>}
            <div className="crop-actions">
              {paper.removeBackground && <button disabled={!transparent || !currentPaper} onClick={trimPhoto}>Crop to paper</button>}
              {crop && <button onClick={() => { setCrop(undefined); setNotice('Restored the full canvas.') }}>Reset crop</button>}
            </div>
            {processing && <small role="status">Processing photo…</small>}
            {processingError && <small className="photo-error" role="alert">{processingError}</small>}
            {transparent && !processing && !processingError && <small role="status">Background removed. The checkerboard is transparent.</small>}
          </fieldset>}
          <div className="layer-list">
            {[...stackedMarks].reverse().map(({ mark, number }) => <div className="layer-row" key={mark.id}>
              <button className="layer-name" aria-pressed={selected === mark.id} disabled={busy || previewing} onClick={() => { choose('select'); selectMark(mark.id) }}>
                <span>{icons[mark.kind]}</span>{labels[mark.kind]} {number}
              </button>
              <button className="edit-mark" aria-label={`Edit ${labels[mark.kind]} ${number}`}
                aria-expanded={editing && selected === mark.id} aria-controls="annotation-style"
                title="Edit annotation" disabled={busy || previewing} onClick={() => {
                  choose('select')
                  selectMark(mark.id)
                  setEditing(!(editing && selected === mark.id))
                }}>
                <svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m14 6 4 4M4 20l4-1 12-12a2.83 2.83 0 0 0-4-4L4 15l-1 5z" />
                </svg>
              </button>
            </div>)}
          </div>
          {active && editing && <fieldset id="annotation-style" className="style-title" disabled={busy || previewing}>
            <div className="section-title">STYLE</div>
            {active.kind === 'arrow' && <label>Arrow style
              <select value={active.arrowStyle ?? 'single'} onChange={event => update(active.id, { arrowStyle: event.target.value as ArrowStyle })}>
                {Object.entries(arrowStyles).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>}
            {active.kind !== 'arrow' && <label>Fold type<select value={active.kind} onChange={event => update(active.id, { kind: event.target.value as Kind })}>
              <option value="valley">Valley fold</option><option value="mountain">Mountain fold</option><option value="crease">Crease</option>
            </select></label>}
            <label htmlFor="color">Stroke color</label>
            <div className="palette">{colors.map(color => <button key={color} aria-label={`Color ${color}`} aria-pressed={active.color === color}
              style={{ background: color }} onClick={() => update(active.id, { color })} />)}
              <input id="color" type="color" value={active.color} onChange={event => update(active.id, { color: event.target.value })} />
            </div>
            <label>Width <output>{active.width} px</output><input type="range" min="1" max="24" value={active.width}
              onChange={event => update(active.id, { width: +event.target.value })} /></label>
            <label>Opacity <output>{Math.round(active.opacity * 100)}%</output><input type="range" min="0.1" max="1" step="0.01" value={active.opacity}
              onChange={event => update(active.id, { opacity: +event.target.value })} /></label>
            <label className="annotation-visibility"><input type="checkbox" checked={!active.hidden}
              onChange={event => update(active.id, { hidden: !event.target.checked })} /> Visible on canvas</label>
            <button className="danger" onClick={remove}>Delete annotation</button>
          </fieldset>}
        </aside>
      </div>
      <footer><span>ORIGAMI STUDIO / DIAGRAM EDITOR</span><span role="status">{notice}</span>{error && <span role="alert">{error}</span>}<span>LOCAL WORKSPACE</span></footer>
    </main>
  </>
}

createRoot(document.getElementById('root')!).render(<App />)
