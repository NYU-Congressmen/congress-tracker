import { describe, expect, test } from 'vitest'
import { simplifyFeatureCollection, boundsOf } from './simplify'
import type { FeatureCollection } from './simplify'

// A dense circle of `steps` points, centered at the origin with radius r.
function circle(steps: number, r: number): number[][] {
  const ring: number[][] = []
  for (let i = 0; i <= steps; i += 1) {
    const t = (i / steps) * Math.PI * 2
    ring.push([r * Math.cos(t), r * Math.sin(t)])
  }
  ring.push(ring[0]) // close the ring
  return ring
}

function firstRing(fc: FeatureCollection): number[][] {
  const feature = fc.features[0]
  return (feature.geometry.coordinates as unknown[][])[0] as number[][]
}

function ringOf(featureIndex: number, fc: FeatureCollection): number[][] {
  const feature = fc.features[featureIndex]
  return (feature.geometry.coordinates as unknown[][])[0] as number[][]
}

describe('simplifyFeatureCollection', () => {
  test('keeps the shared border of two adjacent districts point-for-point identical', () => {
    // Two rectangles sharing the vertical edge x=1, each edge densely
    // sampled. District 1 walks the shared edge up, district 2 walks it
    // down.
    const sharedUp = Array.from({ length: 101 }, (_, i) => [1, i / 100] as number[])
    const sharedDown = [...sharedUp].reverse()
    const fc: FeatureCollection = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: { CD120: '1' },
          geometry: {
            type: 'Polygon',
            coordinates: [[[0, 0], ...sharedUp, [0, 1], [0, 0]]],
          },
        },
        {
          type: 'Feature',
          properties: { CD120: '2' },
          geometry: {
            type: 'Polygon',
            coordinates: [[[1, 0], [2, 0], [2, 1], ...sharedDown.slice(0, -1), [1, 0]]],
          },
        },
      ],
    }

    const result = simplifyFeatureCollection(fc, 20)
    const ring1 = ringOf(0, result)
    const ring2 = ringOf(1, result)

    // The shared border is a contiguous run of points on x=1 in each ring
    // (longest run, so the ring's closing duplicate cannot distort it).
    const sharedRun = (ring: number[][]) => {
      let best: number[][] = []
      let current: number[][] = []
      for (const point of ring) {
        if (point[0] === 1) {
          current.push(point)
        } else if (current.length > best.length) {
          best = current
          current = []
        }
      }
      if (current.length > best.length) best = current
      return best
    }

    const run1 = sharedRun(ring1)
    const run2 = sharedRun(ring2)

    // The border was simplified (far fewer than the 101 source points) but
    // is still a real edge.
    expect(run1.length).toBeGreaterThan(1)
    expect(run1.length).toBeLessThan(30)

    // District 2 walks the same border down: exactly the same points in
    // reverse order. That is the no-gaps, no-overlaps guarantee — the two
    // districts cannot drift apart along their common border.
    expect(run2).toEqual([...run1].reverse())
  })

  test('keeps sharp corners exactly, even under a coarse budget', () => {
    // A rectangle with one side replaced by a dense quarter-arc; the four
    // corners are 90° turns that must survive any budget.
    const arc = Array.from({ length: 101 }, (_, i) => {
      const t = (i / 100) * (Math.PI / 2)
      return [4 + Math.cos(t) * 0.001, 1 + Math.sin(t) * 0.001] as number[]
    })
    const ring: number[][] = [[0, 0], [4, 0], ...arc.slice(1), [4, 2], [0, 2], [0, 0]]
    const fc: FeatureCollection = {
      type: 'FeatureCollection',
      features: [{ type: 'Feature', properties: { CD120: '1' }, geometry: { type: 'Polygon', coordinates: [ring] } }],
    }

    const result = simplifyFeatureCollection(fc, 12)
    const out = firstRing(result)
    for (const corner of [[0, 0], [4, 0], [4, 2], [0, 2]]) {
      expect(out.some((point) => point[0] === corner[0] && point[1] === corner[1])).toBe(true)
    }
  })

  test('reduces a dense smooth ring to roughly the budget, keeping it on the path', () => {
    const fc: FeatureCollection = {
      type: 'FeatureCollection',
      features: [
        { type: 'Feature', properties: { CD120: '1' }, geometry: { type: 'Polygon', coordinates: [circle(2000, 5)] } },
      ],
    }

    const result = simplifyFeatureCollection(fc, 40)
    const out = firstRing(result)

    expect(out.length).toBeGreaterThanOrEqual(30)
    expect(out.length).toBeLessThanOrEqual(60)
    // The ring stays closed and every output point lies (almost) on the
    // original circle: it is a resampling, not a redrawn shape.
    expect(out[0]).toEqual(out[out.length - 1])
    for (const [x, y] of out) {
      expect(Math.hypot(x, y)).toBeCloseTo(5, 4)
    }
  })

  test('allocates the budget by perimeter, so bigger rings get more points', () => {
    const fc: FeatureCollection = {
      type: 'FeatureCollection',
      features: [
        { type: 'Feature', properties: null, geometry: { type: 'Polygon', coordinates: [circle(2000, 10)] } },
        { type: 'Feature', properties: null, geometry: { type: 'Polygon', coordinates: [circle(2000, 1)] } },
      ],
    }
    const result = simplifyFeatureCollection(fc, 40)
    expect(ringOf(0, result).length).toBeGreaterThan(ringOf(1, result).length)
  })

  test('handles multi-polygons and keeps properties', () => {
    const fc: FeatureCollection = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: { CD120: '7' },
          geometry: { type: 'MultiPolygon', coordinates: [[circle(1000, 5)], [circle(1000, 1)]] },
        },
      ],
    }
    const result = simplifyFeatureCollection(fc, 60)
    expect(result.features).toHaveLength(1)
    expect(result.features[0].properties).toEqual({ CD120: '7' })
    const polygons = (result.features[0].geometry.coordinates as unknown[][][]).map((polygon) => polygon[0] as number[][])
    // Both rings get a usable share of the budget, the bigger one more.
    expect(polygons[0].length).toBeGreaterThanOrEqual(10)
    expect(polygons[1].length).toBeGreaterThanOrEqual(4)
    expect(polygons[0].length).toBeGreaterThan(polygons[1].length)
  })

  test('keeps every feature and closes every output ring', () => {
    const fc: FeatureCollection = {
      type: 'FeatureCollection',
      features: [
        { type: 'Feature', properties: { CD120: '2' }, geometry: { type: 'Polygon', coordinates: [circle(500, 2)] } },
        { type: 'Feature', properties: { CD120: '3' }, geometry: { type: 'Polygon', coordinates: [circle(500, 3)] } },
      ],
    }
    const result = simplifyFeatureCollection(fc, 100)
    expect(result.type).toBe('FeatureCollection')
    expect(result.features.map((feature) => feature.properties)).toEqual([{ CD120: '2' }, { CD120: '3' }])
    for (const feature of result.features) {
      const ring = (feature.geometry.coordinates as unknown[][])[0] as number[][]
      expect(ring[0]).toEqual(ring[ring.length - 1])
    }
  })
})

describe('boundsOf', () => {
  test('returns the smallest box enclosing the features', () => {
    const fc: FeatureCollection = {
      type: 'FeatureCollection',
      features: [
        { type: 'Feature', properties: null, geometry: { type: 'Polygon', coordinates: [[[0, 0], [2, 0], [2, 1], [0, 1], [0, 0]]] } },
        { type: 'Feature', properties: null, geometry: { type: 'Polygon', coordinates: [[[-1, -3], [1, -3], [1, -1], [-1, -1], [-1, -3]]] } },
      ],
    }
    expect(boundsOf(fc)).toEqual([-1, -3, 2, 1])
  })

  test('returns null for an empty collection', () => {
    expect(boundsOf({ type: 'FeatureCollection', features: [] })).toBeNull()
  })
})
