import { describe, expect, test, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { DistrictMap } from './DistrictMap'
import { simplifyFeatureCollection, type FeatureCollection } from '../../geo/simplify'

// Two adjacent square districts sharing the edge x=1, like the map of a tiny
// state. District numbers come from the CD119 property.
const FEATURES: FeatureCollection = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: { CD119: '1' },
      geometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]] },
    },
    {
      type: 'Feature',
      properties: { CD119: '2' },
      geometry: { type: 'Polygon', coordinates: [[[1, 0], [2, 0], [2, 1], [1, 1], [1, 0]]] },
    },
  ],
}

function renderMap(onSelect = vi.fn()) {
  render(<DistrictMap features={FEATURES} state="CA" selected={null} onSelect={onSelect} />)
  return onSelect
}

// jsdom reports zero layout, so give the svg a plausible box; the pan math
// (and the moved-flag threshold) need a non-zero width.
function svgSurface(): SVGSVGElement {
  const svg = document.querySelector<SVGSVGElement>('svg.district-map__svg')
  if (!svg) throw new Error('the district map svg was not rendered')
  svg.getBoundingClientRect = () =>
    ({
      width: 400,
      height: 300,
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 400,
      bottom: 300,
      toJSON: () => ({}),
    }) as DOMRect
  return svg
}

describe('DistrictMap selection', () => {
  test('selects the district under a clean press-and-release', () => {
    const onSelect = renderMap()
    const district = screen.getByRole('button', { name: 'District 1' })
    svgSurface()

    fireEvent.pointerDown(district, { button: 0, pointerId: 1, clientX: 100, clientY: 100 })
    fireEvent.pointerUp(district, { pointerId: 1, clientX: 100, clientY: 100 })

    expect(onSelect).toHaveBeenCalledWith(1)
  })

  test('does not select when the press was really a pan', () => {
    const onSelect = renderMap()
    const district = screen.getByRole('button', { name: 'District 2' })
    svgSurface()

    fireEvent.pointerDown(district, { button: 0, pointerId: 1, clientX: 100, clientY: 100 })
    fireEvent.pointerMove(district, { pointerId: 1, clientX: 200, clientY: 100 })
    fireEvent.pointerUp(district, { pointerId: 1, clientX: 200, clientY: 100 })

    expect(onSelect).not.toHaveBeenCalled()
  })

  test('does not select when the press lands on empty map', () => {
    const onSelect = renderMap()
    const svg = svgSurface()

    // A point outside both districts (the viewBox is padded around the state).
    fireEvent.pointerDown(svg, { button: 0, pointerId: 1, clientX: 395, clientY: 295 })
    fireEvent.pointerUp(svg, { pointerId: 1, clientX: 395, clientY: 295 })

    expect(onSelect).not.toHaveBeenCalled()
  })

  test('still selects with the keyboard', () => {
    const onSelect = renderMap()
    const district = screen.getByRole('button', { name: 'District 1' })

    fireEvent.keyDown(district, { key: 'Enter' })

    expect(onSelect).toHaveBeenCalledWith(1)
  })

  test('reports the selected district with aria-pressed', () => {
    render(<DistrictMap features={FEATURES} state="CA" selected={1} onSelect={() => {}} />)
    expect(screen.getByRole('button', { name: 'District 1' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('button', { name: 'District 2' }).getAttribute('aria-pressed')).toBe('false')
  })

  test('keeps Alaska geometry near the date line together', () => {
    const alaska = simplifyFeatureCollection({
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        properties: { CD119: '00' },
        geometry: {
          type: 'Polygon',
          coordinates: [[[179, 52], [-179, 52], [-179, 54], [179, 54], [179, 52]]],
        },
      }],
    }, 100, true)
    render(<DistrictMap features={alaska} state="AK" selected={null} onSelect={() => {}} />)
    const width = Number(svgSurface().getAttribute('viewBox')?.split(' ')[2])
    expect(width).toBeGreaterThan(1)
    expect(width).toBeLessThan(3)
  })

  test('applies small trackpad deltas as small, reversible zoom changes', () => {
    renderMap()
    const svg = svgSurface()
    const width = () => Number(svg.getAttribute('viewBox')?.split(' ')[2])
    const initialWidth = width()

    fireEvent.wheel(svg, { deltaY: -4, clientX: 200, clientY: 150 })
    expect(width()).toBeLessThan(initialWidth)
    expect(width()).toBeGreaterThan(initialWidth * 0.98)
    fireEvent.wheel(svg, { deltaY: 4, clientX: 200, clientY: 150 })
    expect(width()).toBeCloseTo(initialWidth)
  })

  test('zooms around two touch contacts without selecting a district', () => {
    const onSelect = renderMap()
    const svg = svgSurface()
    const district = screen.getByRole('button', { name: 'District 1' })
    const view = () => svg.getAttribute('viewBox')!.split(' ').map(Number)
    const [initialX, , initialWidth] = view()
    const first = { pointerId: 1, pointerType: 'touch', clientX: 150, clientY: 150 }
    const second = { pointerId: 2, pointerType: 'touch', clientX: 250, clientY: 150 }

    fireEvent.pointerDown(district, first)
    fireEvent.pointerDown(svg, second)
    fireEvent.pointerMove(svg, { ...first, clientX: 100 })
    fireEvent.pointerMove(svg, { ...second, clientX: 300 })
    const [zoomedX, , zoomedWidth] = view()
    expect(zoomedWidth / initialWidth).toBeCloseTo(0.366)
    expect(zoomedX + zoomedWidth / 2).toBeCloseTo(initialX + initialWidth / 2)

    fireEvent.pointerMove(svg, first)
    fireEvent.pointerMove(svg, second)
    expect(view()[2]).toBeCloseTo(initialWidth)
    fireEvent.pointerUp(svg, first)
    fireEvent.pointerUp(svg, second)
    expect(onSelect).not.toHaveBeenCalled()

    fireEvent.pointerDown(district, first)
    fireEvent.pointerUp(district, first)
    expect(onSelect).toHaveBeenCalledWith(1)
  })

  test('handles Safari trackpad gestures independently of wheel scrolling', () => {
    renderMap()
    const svg = svgSurface()
    const width = () => Number(svg.getAttribute('viewBox')?.split(' ')[2])
    const initialWidth = width()
    const gesture = (type: string, scale: number) =>
      Object.assign(new MouseEvent(type, { bubbles: true, cancelable: true, clientX: 200, clientY: 150 }), { scale })

    expect(fireEvent(svg, gesture('gesturestart', 1))).toBe(false)
    fireEvent(svg, gesture('gesturechange', 1.5))
    expect(width() / initialWidth).toBeCloseTo(0.556)
    fireEvent(svg, gesture('gesturechange', 1))
    expect(width()).toBeCloseTo(initialWidth)
    fireEvent(svg, gesture('gestureend', 1))
  })
})
