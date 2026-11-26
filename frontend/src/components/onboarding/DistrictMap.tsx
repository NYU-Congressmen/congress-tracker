import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

// Note: the parent remounts this component (keyed by state) when a different
// state's geometry arrives, so the initial viewBox is always derived fresh.
import type { FeatureCollection, GeoFeature } from '../../geo/simplify'
import { boundsOf } from '../../geo/simplify'
import { citiesForState } from '../../geo/cities'

interface DistrictMapProps {
  features: FeatureCollection
  // The state on screen, used to choose which city labels to draw.
  state: string
  selected: number | null
  onSelect: (district: number) => void
}

type View = [number, number, number, number]
type Point = [number, number]
type PointerPosition = { clientX: number; clientY: number }

const MIN_VIEW_WIDTH = 0.02
const WHEEL_SENSITIVITY = 0.003
const PINCH_SENSITIVITY = 1.45

// Describe the two contacts in screen coordinates.
function pinchBetween(first: PointerPosition, second: PointerPosition) {
  return {
    distance: Math.max(1, Math.hypot(second.clientX - first.clientX, second.clientY - first.clientY)),
    midpoint: {
      clientX: (first.clientX + second.clientX) / 2,
      clientY: (first.clientY + second.clientY) / 2,
    },
  }
}

// Scale the view around the anchor and place it under the current gesture position.
function scaleView([x, y, w, h]: View, factor: number, maxWidth: number, anchor: Point, position = anchor): View {
  const nextWidth = Math.min(Math.max(w * factor, MIN_VIEW_WIDTH), maxWidth)
  const scale = nextWidth / w
  return [anchor[0] - (position[0] - x) * scale, anchor[1] - (position[1] - y) * scale, nextWidth, h * scale]
}

// Read the district number a feature carries, whatever the property name is.
function districtOf(feature: GeoFeature): number | null {
  const props = feature.properties as Record<string, unknown> | null
  if (!props) return null
  for (const key of ['CD119', 'CD', 'DISTRICT', 'district']) {
    const value = Number(props[key] ?? undefined)
    if (Number.isInteger(value) && value >= 0) return value
  }
  return null
}

interface GeometryData {
  path: string
  bounds: View
  centroid: [number, number]
}

const GEOMETRY = new WeakMap<GeoFeature, GeometryData | null>()

// Project a feature into its path, bounds and centroid, once per feature.
// The projection is fixed for the life of one map (it is keyed by state), so
// caching on the feature object is safe.
function geometryFor(feature: GeoFeature, project: (lng: number, lat: number) => [number, number]): GeometryData | null {
  const cached = GEOMETRY.get(feature)
  if (cached !== undefined) return cached
  if (!feature.geometry) {
    GEOMETRY.set(feature, null)
    return null
  }
  const polygons =
    feature.geometry.type === 'Polygon'
      ? [feature.geometry.coordinates as number[][][]]
      : feature.geometry.type === 'MultiPolygon'
        ? (feature.geometry.coordinates as number[][][][])
        : null
  if (!polygons) {
    GEOMETRY.set(feature, null)
    return null
  }
  let path = ''
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  let cx = 0
  let cy = 0
  let count = 0
  for (const polygon of polygons) {
    for (const ring of polygon) {
      if (ring.length < 3) continue
      const projected = ring.map(([lng, lat]) => project(lng, lat))
      path += `M${projected.map(([x, y]) => `${x.toFixed(4)},${y.toFixed(4)}`).join('L')}Z`
      for (const [x, y] of projected) {
        if (x < minX) minX = x
        if (y < minY) minY = y
        if (x > maxX) maxX = x
        if (y > maxY) maxY = y
        cx += x
        cy += y
      }
      count += projected.length
    }
  }
  if (!path || count === 0) {
    GEOMETRY.set(feature, null)
    return null
  }
  const data: GeometryData = {
    path,
    bounds: [minX, minY, maxX, maxY],
    centroid: [cx / count, cy / count],
  }
  GEOMETRY.set(feature, data)
  return data
}

// Show the state's districts on a pannable, zoomable map.
//
// Coordinates are equirectangular with north up: latitude is flipped (SVG y
// grows downward, latitude grows upward) and longitude is scaled by the
// cosine of the state's mid-latitude, so the state is neither upside down nor
// stretched sideways.
export function DistrictMap({ features, state, selected, onSelect }: DistrictMapProps) {
  const bounds = useMemo(() => boundsOf(features), [features])

  const kx = useMemo(() => {
    if (!bounds) return 1
    const midLat = ((bounds[1] + bounds[3]) / 2) * (Math.PI / 180)
    return Math.max(Math.cos(midLat), 0.25)
  }, [bounds])

  const project = useCallback((lng: number, lat: number): [number, number] => [lng * kx, -lat], [kx])

  // Projected extent of the whole state. The projection is linear, so this is
  // the raw bounds with longitude scaled and latitude flipped.
  const fullBounds = useMemo<View>(() => {
    if (!bounds) return [0, 0, 10, 10]
    const [minX, minY, maxX, maxY] = bounds
    return [minX * kx, -maxY, (maxX - minX) * kx, maxY - minY]
  }, [bounds, kx])

  const initial = useMemo<View>(() => {
    // Open on the main Hawaiian islands. Zooming out still shows the full district.
    const [bx, by, bw, bh] = state === 'HI' ? [-161 * kx, -22.7, 6.5 * kx, 4.2] : fullBounds
    const padX = bw * 0.06
    const padY = bh * 0.06
    return [bx - padX, by - padY, bw + padX * 2, bh + padY * 2]
  }, [fullBounds, kx, state])

  const [view, setView] = useState<View>(initial)
  const dragging = useRef<{ startX: number; startY: number; origin: [number, number]; moved: boolean } | null>(null)
  const pointers = useRef(new Map<number, PointerPosition>())
  const pinch = useRef<{ view: View; distance: number; anchor: Point } | null>(null)
  const trackpadPinch = useRef<{ view: View; anchor: Point } | null>(null)
  // The district under the pointer at press time. Pointer capture retargets
  // the release (and the derived click) to the svg, so selection is decided
  // here on pointer-up instead of in a click handler on the path.
  const pressedDistrict = useRef<number | null>(null)
  const surface = useRef<SVGSVGElement | null>(null)

  const maxWidth = Math.max(initial[2], fullBounds[2] * 1.12)

  const zoomAt = useCallback(
    (factor: number, point: Point | null) => {
      setView((current) => {
        const [x, y, w, h] = current
        return scaleView(current, factor, maxWidth, point ?? [x + w / 2, y + h / 2])
      })
    },
    [maxWidth],
  )

  // Convert a pointer position to map coordinates, so the zoom stays under the cursor.
  const pointFromEvent = useCallback(
    (event: PointerPosition, box: View = view): Point | null => {
      const svg = surface.current
      if (!svg || !Number.isFinite(event.clientX) || !Number.isFinite(event.clientY)) return null
      const rect = svg.getBoundingClientRect()
      if (rect.width === 0 || rect.height === 0) return null
      // The viewBox keeps the map's aspect ratio centered, so map the visible
      // box proportionally inside the element.
      const [x, y, w, h] = box
      const aspect = w / h
      const elementAspect = rect.width / rect.height
      let mapWidth = w
      let mapHeight = h
      let offsetX = x
      let offsetY = y
      if (elementAspect > aspect) {
        mapWidth = h * elementAspect
        offsetX = x - (mapWidth - w) / 2
      } else {
        mapHeight = w / elementAspect
        offsetY = y - (mapHeight - h) / 2
      }
      return [
        offsetX + ((event.clientX - rect.left) / rect.width) * mapWidth,
        offsetY + ((event.clientY - rect.top) / rect.height) * mapHeight,
      ]
    },
    [view],
  )

  useEffect(() => {
    const svg = surface.current
    if (!svg) return
    const onWheel = (event: WheelEvent) => {
      event.preventDefault()
      if (trackpadPinch.current) return
      const units = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? svg.clientHeight : 1
      const delta = Math.max(-80, Math.min(80, event.deltaY * units))
      const sensitivity = event.ctrlKey ? WHEEL_SENSITIVITY * PINCH_SENSITIVITY : WHEEL_SENSITIVITY
      if (delta) zoomAt(Math.exp(delta * sensitivity), pointFromEvent(event))
    }
    svg.addEventListener('wheel', onWheel, { passive: false })
    return () => svg.removeEventListener('wheel', onWheel)
  }, [zoomAt, pointFromEvent])

  useEffect(() => {
    const svg = surface.current
    if (!svg) return

    // Safari can report a trackpad pinch as a gesture without touch pointers.
    const start = (event: Event) => {
      if (pointers.current.size) return
      event.preventDefault()
      const [x, y, w, h] = view
      const anchor = pointFromEvent(event as MouseEvent) ?? [x + w / 2, y + h / 2]
      trackpadPinch.current = { view, anchor }
    }
    const change = (event: Event) => {
      const gesture = trackpadPinch.current
      if (!gesture || pointers.current.size) return
      event.preventDefault()
      const { scale } = event as Event & { scale: number }
      if (scale > 0) setView(scaleView(gesture.view, scale ** -PINCH_SENSITIVITY, maxWidth, gesture.anchor))
    }
    const end = () => { trackpadPinch.current = null }
    svg.addEventListener('gesturestart', start, { passive: false })
    svg.addEventListener('gesturechange', change, { passive: false })
    svg.addEventListener('gestureend', end)
    return () => {
      svg.removeEventListener('gesturestart', start)
      svg.removeEventListener('gesturechange', change)
      svg.removeEventListener('gestureend', end)
    }
  }, [view, maxWidth, pointFromEvent])

  const onPointerDown = (event: React.PointerEvent<SVGSVGElement>) => {
    const active = pointers.current
    if (event.button !== 0 || active.size >= 2 || (active.size && event.pointerType !== 'touch')) return
    active.set(event.pointerId, { clientX: event.clientX, clientY: event.clientY })
    event.currentTarget.setPointerCapture?.(event.pointerId)

    if (active.size === 2) {
      const [first, second] = active.values()
      const { distance, midpoint } = pinchBetween(first, second)
      const anchor = pointFromEvent(midpoint)
      pinch.current = anchor ? { view, distance, anchor } : null
      // A second contact turns the press into a gesture and clears the pending selection.
      dragging.current = null
      pressedDistrict.current = null
      return
    }

    const target = event.target as Element | null | undefined
    const holder = target?.closest?.('[data-district]') ?? null
    pressedDistrict.current = holder ? Number(holder.getAttribute('data-district')) : null
    dragging.current = { startX: event.clientX, startY: event.clientY, origin: [view[0], view[1]], moved: false }
  }

  const onPointerMove = (event: React.PointerEvent<SVGSVGElement>) => {
    const active = pointers.current
    if (!active.has(event.pointerId)) return
    active.set(event.pointerId, { clientX: event.clientX, clientY: event.clientY })
    const gesture = pinch.current
    if (gesture && active.size === 2) {
      const [first, second] = active.values()
      const { distance, midpoint } = pinchBetween(first, second)
      const position = pointFromEvent(midpoint, gesture.view)
      if (position) {
        const factor = (gesture.distance / distance) ** PINCH_SENSITIVITY
        setView(scaleView(gesture.view, factor, maxWidth, gesture.anchor, position))
      }
      return
    }

    const drag = dragging.current
    if (!drag) return
    const svg = surface.current
    if (!svg) return
    const rect = svg.getBoundingClientRect()
    if (rect.width === 0 || rect.height === 0) return
    const dx = event.clientX - drag.startX
    const dy = event.clientY - drag.startY
    if (!drag.moved && Math.hypot(dx, dy) <= 5) return
    drag.moved = true
    const unitsPerPixel = Math.max(view[2] / rect.width, view[3] / rect.height)
    setView([drag.origin[0] - dx * unitsPerPixel, drag.origin[1] - dy * unitsPerPixel, view[2], view[3]])
  }

  const onPointerUp = (event: React.PointerEvent<SVGSVGElement>) => {
    if (!pointers.current.delete(event.pointerId)) return
    pinch.current = null
    const moved = dragging.current?.moved ?? false
    dragging.current = null
    const district = pressedDistrict.current
    pressedDistrict.current = null
    // A clean press-and-release is a selection; a pan (or a cancelled
    // gesture) is not.
    if (event.type === 'pointerup' && !moved && district !== null) {
      onSelect(district)
    }
  }

  const [x, y, w] = view
  const font = w * 0.028
  const cityFont = w * 0.024
  const cities = useMemo(() => citiesForState(state), [state])
  const [vx, vy, vw, vh] = view
  const cityMarginX = vw * 0.2
  const cityMarginY = vh * 0.2

  return (
    <div className="district-map">
      <div className="district-map__canvas">
        <svg
          ref={surface}
          className="district-map__svg"
          viewBox={`${x} ${y} ${w} ${view[3]}`}
          preserveAspectRatio="xMidYMid meet"
          role="group"
          aria-label="District map. Drag to pan or pinch to zoom."
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onLostPointerCapture={onPointerUp}
          onDoubleClick={(event) => {
            event.preventDefault()
            zoomAt(0.85, pointFromEvent(event))
          }}
        >
          {features.features.map((feature, index) => {
            const district = districtOf(feature)
            if (district === null) return null
            const data = geometryFor(feature, project)
            if (!data) return null
            const isSelected = selected === district
            return (
              <g key={index}>
                <path
                  d={data.path}
                  className={`district-map__district${isSelected ? ' is-selected' : ''}`}
                  data-district={district}
                  role="button"
                  tabIndex={0}
                  aria-label={district === 0 ? 'At-large district' : `District ${district}`}
                  aria-pressed={isSelected}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      onSelect(district)
                    }
                  }}
                />
                <text
                  className="district-map__label"
                  x={data.centroid[0]}
                  y={data.centroid[1]}
                  fontSize={font}
                  aria-hidden="true"
                >
                  {district}
                </text>
              </g>
            )
          })}
          {cities.map((city) => {
            const [cx, cy] = project(city.lng, city.lat)
            // Only label cities near the current window, so dense areas stay
            // readable as the reader zooms in.
            if (cx < vx - cityMarginX || cx > vx + vw + cityMarginX) return null
            if (cy < vy - cityMarginY || cy > vy + vh + cityMarginY) return null
            return (
              <g key={`${city.state}-${city.name}`} className="district-map__city" aria-hidden="true" pointerEvents="none">
                <circle cx={cx} cy={cy} r={cityFont * 0.3} />
                <text x={cx} y={cy - cityFont * 0.55} fontSize={cityFont}>
                  {city.name}
                </text>
              </g>
            )
          })}
        </svg>
      </div>
    </div>
  )
}
