// Prepare a state's full-fidelity district boundaries for the selection map.
//
// The Census Bureau serves survey-grade geometry: dense and smooth, but with
// genuine sharp corners (road ends, inlets, state lines), and adjacent
// districts share their borders as identical vertex sequences. Two
// consequences for simplification:
//
//  - A deviation-based decimation (Douglas-Peucker) turns the gently
//    wandering curves into saw-tooths, and a pure resampling bevels the
//    genuine corners. So we keep every sharp corner and resample only the
//    smooth spans between them.
//  - Simplifying each district independently lets shared borders drift apart,
//    leaving gaps, overlaps and double strokes. So every ring is split into
//    its maximal shared runs (consecutive segments walked by the same pair of
//    districts), each unique run is simplified exactly once, and every
//    district is rebuilt from those shared runs: common borders stay
//    point-for-point identical.

export type Position = [number, number]

interface GeoGeometry {
  type: string
  coordinates: unknown
}

export interface GeoFeature {
  type: 'Feature'
  properties: unknown
  geometry: GeoGeometry
}

export interface FeatureCollection {
  type: 'FeatureCollection'
  features: GeoFeature[]
}

// A single vertex turning this sharply is a genuine corner (a road end, an
// inlet, a state line), not survey wobble (~5°) or a gentle bend (<20°).
// Corners are always kept, so borders stay sharp where the boundary is sharp.
const CORNER_DEG = 30

// A position is an array of numbers; a ring (LinearRing) is an array of
// positions. Checking for the position one level down is what separates a
// ring from a polygon or multi-polygon, so we only resample at the right level.
function isPosition(value: unknown): boolean {
  return Array.isArray(value) && typeof value[0] === 'number'
}

function segmentLength(a: Position, b: Position): number {
  return Math.hypot(b[0] - a[0], b[1] - a[1])
}

// The turning angle (degrees) at vertex i of a run of m distinct vertices.
function turnAngle(points: Position[], i: number, m: number): number {
  const a = points[(i - 1 + m) % m]
  const b = points[i % m]
  const c = points[(i + 1) % m]
  const v1x = b[0] - a[0]
  const v1y = b[1] - a[1]
  const v2x = c[0] - b[0]
  const v2y = c[1] - b[1]
  const l1 = Math.hypot(v1x, v1y)
  const l2 = Math.hypot(v2x, v2y)
  if (l1 < 1e-12 || l2 < 1e-12) return 0
  const cos = Math.max(-1, Math.min(1, (v1x * v2x + v1y * v2y) / (l1 * l2)))
  return (Math.acos(cos) * 180) / Math.PI
}

interface Chain {
  // Distinct vertices, in the owning ring's traversal order. A closed chain
  // (one run around an isolated ring) loops back from the last vertex to the
  // first.
  ids: number[]
  points: Position[]
  closed: boolean
  // The owner signature: the sorted ring indices that walk this run. Two
  // chains with the same signature and path are the same shared border.
  signature: string
}

// Simplify one chain to roughly `budget` points: every sharp corner is kept
// exactly, and the smooth spans between consecutive kept vertices are
// resampled at a uniform arc length. The output lies on the original path.
function simplifyChain(points: Position[], budget: number, closed: boolean): Position[] {
  const m = points.length
  if (m < 3) return closed ? [points[0]] : points.slice()

  // Cumulative arc length along the run (unrolled one full loop for a closed
  // chain, so the wrap-around span has real length too).
  const cum: number[] = new Array(m + 1).fill(0)
  for (let i = 1; i < m; i += 1) cum[i] = cum[i - 1] + segmentLength(points[i - 1], points[i])
  const total = closed ? cum[m - 1] + segmentLength(points[m - 1], points[0]) : cum[m - 1]
  if (total === 0) return [points[0]]
  if (closed) cum[m] = total

  // Kept vertices: the endpoints (open chains), the anchor (closed chains),
  // and every sharp corner.
  const kept = new Set<number>()
  kept.add(0)
  if (!closed) kept.add(m - 1)
  const lastCorner = closed ? m : m - 1
  for (let i = 1; i < lastCorner; i += 1) {
    if (turnAngle(points, i, m) >= CORNER_DEG) kept.add(i)
  }
  const anchors = [...kept].sort((a, b) => a - b)

  // Spans between consecutive kept vertices; a closed chain wraps to vertex 0
  // at index m (one full loop).
  const spans: Array<[number, number]> = []
  if (closed) {
    for (let j = 0; j < anchors.length; j += 1) {
      spans.push([anchors[j], j + 1 < anchors.length ? anchors[j + 1] : m])
    }
  } else {
    for (let j = 0; j + 1 < anchors.length; j += 1) {
      spans.push([anchors[j], anchors[j + 1]])
    }
  }

  // Split the interior budget across spans in proportion to their length
  // (largest-remainder, so the counts add up exactly).
  const interiorBudget = Math.max(0, budget - spans.length)
  const exact = spans.map(([a, b]) => (interiorBudget * (cum[b] - cum[a])) / total)
  const innerCounts = exact.map(Math.floor)
  let remainder = interiorBudget - innerCounts.reduce((a, b) => a + b, 0)
  const order = exact
    .map((value, i) => [value - Math.floor(value), i] as const)
    .sort((x, y) => y[0] - x[0] || x[1] - y[1])
  for (let k = 0; k < remainder; k += 1) innerCounts[order[k % order.length][1]] += 1

  const pointAt = (absolute: number, a: number, b: number): Position => {
    let i = a
    while (i + 1 < b && cum[i + 1] < absolute) i += 1
    const span = cum[i + 1] - cum[i]
    const t = span === 0 ? 0 : (absolute - cum[i]) / span
    const p1 = points[i % m]
    const p2 = points[(i + 1) % m]
    return [p1[0] + (p2[0] - p1[0]) * t, p1[1] + (p2[1] - p1[1]) * t]
  }

  const out: Position[] = []
  spans.forEach(([a, b], j) => {
    out.push(points[a % m])
    const inner = innerCounts[j]
    for (let k = 0; k < inner; k += 1) {
      out.push(pointAt(cum[a] + ((cum[b] - cum[a]) * (k + 1)) / (inner + 1), a, b))
    }
    if (j === spans.length - 1 && !closed) out.push(points[b % m])
  })
  return out
}

// Corner-keep and resample every ring of a feature collection so the state's
// total point count lands near `targetPoints`. The budget is allocated in
// proportion to each run's length, so every boundary renders at the same
// smoothness. Shared borders (runs walked by two districts) are simplified
// once and reused, so they stay exactly coincident.
export function simplifyFeatureCollection(fc: FeatureCollection, targetPoints: number): FeatureCollection {
  // 1. De-duplicate exact vertices and capture every ring as a vertex sequence.
  const vertexIndex = new Map<string, number>()
  const vertexId = (p: Position): number => {
    const key = `${p[0]}|${p[1]}`
    const existing = vertexIndex.get(key)
    if (existing !== undefined) return existing
    const id = vertexIndex.size
    vertexIndex.set(key, id)
    return id
  }

  interface Ring {
    ids: number[]
    points: Position[]
    valid: boolean
  }
  const rings: Ring[] = []
  const walkFor = (value: unknown): void => {
    if (Array.isArray(value) && isPosition(value[0])) {
      const ring = value as Position[]
      const ids: number[] = []
      const points: Position[] = []
      for (const p of ring) {
        const last = points[points.length - 1]
        if (last && last[0] === p[0] && last[1] === p[1]) continue
        points.push(p)
        ids.push(vertexId(p))
      }
      if (ids.length >= 2 && ids[0] === ids[ids.length - 1]) {
        ids.pop()
        points.pop()
      }
      rings.push({ ids, points, valid: ids.length >= 3 })
    } else if (Array.isArray(value)) {
      value.forEach((part) => walkFor(part))
    }
  }
  for (const feature of fc.features) {
    if (!feature.geometry) continue
    walkFor(feature.geometry.coordinates)
  }

  // 2. Which rings walk each segment (shared borders appear in two of them).
  const segmentOwners = new Map<string, number[]>()
  rings.forEach((ring, ringIdx) => {
    if (!ring.valid) return
    for (let i = 0; i < ring.ids.length; i += 1) {
      const a = ring.ids[i]
      const b = ring.ids[(i + 1) % ring.ids.length]
      const key = a < b ? `${a}|${b}` : `${b}|${a}`
      const owners = segmentOwners.get(key) ?? []
      owners.push(ringIdx)
      segmentOwners.set(key, owners)
    }
  })

  // 3. Split each ring into its maximal runs: consecutive segments with the
  //    same owner signature. A run is the unit of simplification — a shared
  //    run is the exact border two districts have in common.
  const chainsByRing: Chain[][] = []
  rings.forEach((ring, ringIdx) => {
    const chains: Chain[] = []
    if (!ring.valid) {
      chainsByRing.push(chains)
      return
    }
    const n = ring.ids.length
    const ownerSignature = (a: number, b: number): string => {
      const key = a < b ? `${a}|${b}` : `${b}|${a}`
      const owners = segmentOwners.get(key) ?? [ringIdx]
      return [...owners].sort((x, y) => x - y).join('|')
    }
    const slice = (start: number, count: number): Chain => {
      const ids: number[] = []
      const points: Position[] = []
      for (let k = 0; k < count; k += 1) {
        const i = (start + k) % n
        ids.push(ring.ids[i])
        points.push(ring.points[i])
      }
      // Every segment in a run has the same owner set (that is what made it
      // one run), so the first real segment carries the run's signature.
      const signature = ownerSignature(ring.ids[start], ring.ids[(start + 1) % n])
      return { ids, points, closed: count >= n, signature }
    }
    // A run starts where the owner signature changes (or, if it never
    // changes, at the ring's first vertex).
    const starts: number[] = []
    for (let i = 0; i < n; i += 1) {
      const a = ring.ids[i]
      const b = ring.ids[(i + 1) % n]
      const prevB = ring.ids[(i - 1 + n) % n]
      if (ownerSignature(a, b) !== ownerSignature(prevB, a)) starts.push(i)
    }
    if (starts.length === 0) {
      chains.push(slice(0, n))
    } else {
      for (let j = 0; j < starts.length; j += 1) {
        const start = starts[j]
        const next = starts[(j + 1) % starts.length]
        const steps = (next - start + n) % n || n
        chains.push(slice(start, steps + 1))
      }
    }
    chainsByRing.push(chains)
  })

  // 4. Simplify each unique run once. Runs are keyed by owner signature and
  //    direction-normalized vertex path, so the two owners of a shared border
  //    always land on the same key.
  const chainKey = (chain: Chain): string => {
    let ids = chain.ids
    if (ids.length > 1 && ids[0] > ids[ids.length - 1]) ids = [...ids].reverse()
    let hash = 2166136261
    for (const id of ids) {
      hash ^= id
      hash = Math.imul(hash, 16777619)
    }
    return `${chain.signature}|${ids.length}|${hash >>> 0}`
  }

  // Whether a chain walks from its lower id to its higher id. Used to tell
  // whether a later owner traverses the stored run in the same direction.
  const isForward = (chain: Chain): boolean =>
    chain.ids.length <= 1 || chain.ids[0] < chain.ids[chain.ids.length - 1]

  const unique = new Map<
    string,
    { points: Position[]; closed: boolean; length: number; forward: boolean }
  >()
  for (const chains of chainsByRing) {
    for (const chain of chains) {
      const key = chainKey(chain)
      if (unique.has(key)) continue
      let length = 0
      for (let i = 1; i < chain.points.length; i += 1) {
        length += segmentLength(chain.points[i - 1], chain.points[i])
      }
      if (chain.closed) length += segmentLength(chain.points[chain.points.length - 1], chain.points[0])
      unique.set(key, {
        points: chain.points,
        closed: chain.closed,
        length,
        // The stored points run in THIS chain's traversal direction, so any
        // later owner must match (or flip against) this direction — not the
        // key's.
        forward: isForward(chain),
      })
    }
  }

  const totalLength = [...unique.values()].reduce((a, chain) => a + chain.length, 0)

  // 5. Budget per run (by length), then simplify in place.
  for (const chain of unique.values()) {
    const budget =
      totalLength === 0 ? 0 : Math.max(4, Math.round((targetPoints * chain.length) / totalLength))
    chain.points = simplifyChain(chain.points, budget, chain.closed)
  }

  // 6. Rebuild each ring from its (shared) simplified runs, in the ring's own
  //    traversal order, and close it.
  const rebuiltRings: Position[][] = []
  for (const chains of chainsByRing) {
    if (chains.length === 0) {
      rebuiltRings.push([])
      continue
    }
    const ringPts: Position[] = []
    for (const chain of chains) {
      const canonical = unique.get(chainKey(chain))
      if (!canonical) continue
      // Walk the stored run in this ring's direction: flip it only when this
      // chain traverses the opposite way the stored one does.
      const pts =
        isForward(chain) === canonical.forward
          ? canonical.points
          : [...canonical.points].reverse()
      if (ringPts.length === 0) {
        ringPts.push(...pts)
      } else {
        // The run starts where the previous one ended (a shared vertex).
        const first = pts[0]
        const last = ringPts[ringPts.length - 1]
        if (first && !(first[0] === last[0] && first[1] === last[1])) ringPts.push(first)
        ringPts.push(...pts.slice(1))
      }
    }
    const first = ringPts[0]
    const last = ringPts[ringPts.length - 1]
    if (first && last && !(first[0] === last[0] && first[1] === last[1])) ringPts.push(first)
    rebuiltRings.push(ringPts)
  }

  // 7. Swap the rebuilt rings back into the coordinate trees, in the exact
  //    order they were collected.
  let cursor = 0
  const swap = (value: unknown): unknown => {
    if (Array.isArray(value) && isPosition(value[0])) {
      const next = rebuiltRings[cursor] ?? []
      cursor += 1
      return next
    }
    if (Array.isArray(value)) return value.map((part) => swap(part))
    return value
  }
  const features: GeoFeature[] = []
  for (const feature of fc.features) {
    if (!feature.geometry) continue
    features.push({
      ...feature,
      geometry: { ...feature.geometry, coordinates: swap(feature.geometry.coordinates) },
    })
  }
  return { type: 'FeatureCollection', features }
}

// The smallest axis-aligned box enclosing a feature collection.
export function boundsOf(fc: FeatureCollection): [number, number, number, number] | null {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  let found = false
  const visit = (coordinates: unknown): void => {
    const first = coordinates as Position
    if (Array.isArray(first) && typeof first[0] === 'number') {
      found = true
      const [x, y] = first
      if (x < minX) minX = x
      if (y < minY) minY = y
      if (x > maxX) maxX = x
      if (y > maxY) maxY = y
      return
    }
    if (Array.isArray(coordinates)) coordinates.forEach(visit)
  }
  for (const feature of fc.features) visit(feature.geometry?.coordinates)
  if (!found) return null
  return [minX, minY, maxX, maxY]
}
