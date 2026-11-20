import { useEffect, useRef } from 'react'
import { BILL_STATUSES } from '../../api/bills'
import { useStageCounts, type StageCounts } from '../../lib/stageCounts'

// One CSS color token per stage, in BILL_STATUSES order. The last one is the
// highlight, so laws stand out from the rest of the field.
const DOT_TOKENS = ['--d1', '--d2', '--d3', '--d4', '--d5', '--d6']
const LAW = BILL_STATUSES.length - 1

// The fill-in animation plays on the first page of a visit only.
let filledOnce = false

// Every bill becomes one stage index, shuffled with a fixed seed so the
// pattern looks the same on every page and every visit.
function dotOrder(counts: StageCounts): Uint8Array {
  const total = BILL_STATUSES.reduce((sum, status) => sum + counts[status], 0)
  const order = new Uint8Array(total)
  let next = 0
  BILL_STATUSES.forEach((status, stage) => {
    for (let n = 0; n < counts[status]; n += 1) order[next++] = stage
  })
  let seed = 119
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    return seed / 4294967296
  }
  for (let i = total - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1))
    const swap = order[i]
    order[i] = order[j]
    order[j] = swap
  }
  return order
}

// The field of dots behind each page header: one dot per bill in the 119th
// Congress, colored by stage. It is decoration, so it is hidden from assistive
// technology, and it draws nothing until the stage counts arrive.
export function DotMosaic() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const counts = useStageCounts()

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !counts) return
    const order = dotOrder(counts)
    if (order.length === 0) return
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
    let frame = 0

    function draw(animate: boolean) {
      if (!canvas) return
      const context = canvas.getContext('2d')
      const width = canvas.clientWidth
      const height = canvas.clientHeight
      if (!context || !width || !height) return
      const ratio = Math.min(2, window.devicePixelRatio || 1)
      canvas.width = Math.round(width * ratio)
      canvas.height = Math.round(height * ratio)
      context.setTransform(ratio, 0, 0, ratio, 0, 0)
      context.clearRect(0, 0, width, height)

      const style = getComputedStyle(document.documentElement)
      const colors = DOT_TOKENS.map((token) => style.getPropertyValue(token).trim())
      const ring = style.getPropertyValue('--d6-ring').trim()
      const cell = Math.max(6, Math.sqrt((width * height) / order.length))
      const columns = Math.ceil(width / cell)
      const radius = cell * 0.33

      const dot = (index: number) => {
        const y = Math.floor(index / columns) * cell + cell / 2
        if (y > height + cell) return
        const x = (index % columns) * cell + cell / 2
        const law = order[index] === LAW
        context.fillStyle = colors[order[index]]
        context.beginPath()
        context.arc(x, y, law ? radius * 1.35 : radius, 0, Math.PI * 2)
        context.fill()
        if (law && ring && ring !== 'transparent') {
          context.lineWidth = 0.9
          context.strokeStyle = ring
          context.stroke()
        }
      }

      if (!animate) {
        for (let i = 0; i < order.length; i += 1) dot(i)
        return
      }
      // Fill the field in a few frames, then let the laws land last.
      const step = Math.ceil(order.length / 14)
      let start = 0
      const fill = () => {
        const end = Math.min(order.length, start + step)
        for (let i = start; i < end; i += 1) if (order[i] !== LAW) dot(i)
        start = end
        if (start < order.length) {
          frame = requestAnimationFrame(fill)
        } else {
          frame = requestAnimationFrame(() => {
            for (let i = 0; i < order.length; i += 1) if (order[i] === LAW) dot(i)
          })
        }
      }
      frame = requestAnimationFrame(fill)
    }

    draw(!filledOnce && !reduceMotion)
    filledOnce = true

    const redraw = () => {
      cancelAnimationFrame(frame)
      draw(false)
    }
    const resize = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(redraw)
    resize?.observe(canvas)
    const theme = new MutationObserver(redraw)
    theme.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    const scheme = window.matchMedia?.('(prefers-color-scheme: dark)')
    scheme?.addEventListener('change', redraw)
    return () => {
      cancelAnimationFrame(frame)
      resize?.disconnect()
      theme.disconnect()
      scheme?.removeEventListener('change', redraw)
    }
  }, [counts])

  return <canvas ref={canvasRef} className="band__dots" aria-hidden="true" />
}
