import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, test } from 'vitest'
import { ChamberComposition } from './ChamberComposition'
import type { ChamberCounts } from '../../lib/stats'

const COUNTS: ChamberCounts = {
  both: { total: 541, D: 259, I: 2, R: 280, unaffiliated: 0, other: {} },
  house: { total: 441, D: 214, I: 0, R: 227, unaffiliated: 0, other: {} },
  senate: { total: 100, D: 45, I: 2, R: 53, unaffiliated: 0, other: {} },
}

function seats(floor: HTMLElement, party?: string) {
  const selector = party ? `circle.composition-dot--${party}` : 'circle'
  return Array.from(floor.querySelectorAll(selector), (seat) => ({
    x: Number(seat.getAttribute('cx')),
    y: Number(seat.getAttribute('cy')),
    radius: Number(seat.getAttribute('r')),
    stroke: Number(seat.getAttribute('stroke-width')),
  }))
}

describe('ChamberComposition', () => {
  test('shows one combined horseshoe with one mark per member of both chambers', () => {
    render(<ChamberComposition counts={COUNTS} />)

    const switcher = within(screen.getByRole('group', { name: 'Chamber view' }))
    expect(screen.getByRole('heading', { name: 'Seats' }).parentElement).toBe(
      screen.getByRole('group', { name: 'Chamber view' }).parentElement,
    )
    expect(switcher.getAllByRole('button').map((button) => button.textContent)).toEqual(['House', 'Senate', 'Joint session'])
    expect(switcher.getByRole('button', { name: 'House', pressed: true })).toBeTruthy()
    fireEvent.click(switcher.getByRole('button', { name: 'Joint session' }))
    const combined = screen.getByRole('img', { name: /^Joint session seating,/ })
    expect(screen.getAllByRole('img')).toHaveLength(1)
    expect(seats(combined)).toHaveLength(541)
    expect(combined.parentElement?.querySelector('.composition-total__count')?.textContent).toBe('541')
    const legend = screen.getByRole('list', { name: 'Party counts' })
    expect(legend.querySelector('.composition-legend__item--d .composition-legend__icon > span')?.getAttribute('style')).toContain('/chambers/donkey.webp')
    expect(legend.querySelector('.composition-legend__item--r .composition-legend__icon > span')?.getAttribute('style')).toContain('/chambers/elephant.webp')
  })

  test('keeps party sectors in order with concentric rows and an open bottom', () => {
    render(<ChamberComposition counts={COUNTS} />)

    const layouts = [
      { view: 'Joint session', rows: 10, seatWidth: 1.82 },
      { view: 'House', rows: 9, seatWidth: 2.02 },
      { view: 'Senate', rows: 4, seatWidth: 3.5 },
    ]
    for (const { view, rows, seatWidth } of layouts) {
      fireEvent.click(screen.getByRole('button', { name: view }))
      const floor = screen.getByRole('img')
      const positions = seats(floor)
      const angle = ({ x, y }: (typeof positions)[number]) => Math.atan2(x - 50, 49 - y)
      const radii = positions.map(({ x, y }) => Math.hypot(x - 50, 49 - y).toFixed(3))
      expect(floor.getAttribute('viewBox')).toBe('0 0 100 86')
      expect(positions.every(({ radius, stroke }) => radius * 2 === seatWidth && stroke === 0.3)).toBe(true)
      expect(new Set(radii).size).toBe(rows)
      expect(positions.every((position) => Math.abs(angle(position)) < 2.31)).toBe(true)
      expect(Math.max(...seats(floor, 'd').map(angle))).toBeLessThan(Math.min(...seats(floor, 'r').map(angle)))
      let minimumGap = Infinity
      positions.forEach((seat, index) => {
        for (const another of positions.slice(index + 1)) {
          minimumGap = Math.min(minimumGap, Math.hypot(seat.x - another.x, seat.y - another.y))
        }
      })
      expect(minimumGap).toBeGreaterThan(seatWidth + 0.3)
    }

    expect(seats(screen.getByRole('img', { name: /^Senate seating,/ }), 'i')).toHaveLength(2)
  })

  test('switches chambers and updates the legend and total', () => {
    render(<ChamberComposition counts={COUNTS} />)

    fireEvent.click(screen.getByRole('button', { name: 'House' }))
    expect(screen.getAllByRole('img')).toHaveLength(1)
    expect(seats(screen.getByRole('img', { name: /^House seating,/ }))).toHaveLength(441)
    expect(screen.getByRole('img', { name: /441 current members/ })).toBeTruthy()
    const total = screen.getByText('441')
    const anchor = total.closest('.composition-chart')

    fireEvent.click(screen.getByRole('button', { name: 'Senate' }))
    expect(screen.getByRole('button', { name: 'Senate' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getAllByRole('img')).toHaveLength(1)
    const senate = screen.getByRole('img', { name: /^Senate seating,/ })
    expect(senate.classList.contains('composition-floor--senate')).toBe(true)
    expect(seats(senate)).toHaveLength(100)
    expect(screen.getByText('100')).toBe(total)
    expect(senate.parentElement).toBe(anchor)
    const legend = screen.getByRole('list', { name: 'Party counts' })
    expect(within(legend).getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      '45 Democrats',
      '53 Republicans',
    ])
    expect(screen.getByRole('list', { name: 'Additional affiliations' }).textContent).toBe('2 Independents')
    expect(senate.getAttribute('aria-label')).toContain('100 current members')
  })

  test('ranks smaller groups, breaks ties for Independents and rolls up the rest', () => {
    render(<ChamberComposition counts={{
      ...COUNTS,
      house: {
        total: 25, D: 2, I: 4, R: 3, unaffiliated: 1,
        other: { Civic: 4, Green: 3, Liberty: 6, Reform: 2 },
      },
    }} />)

    const list = screen.getByRole('list', { name: 'Additional affiliations' })
    const legend = within(list)
    expect(legend.getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      '6 Liberty',
      '4 Independents',
      '4 Civic',
      '3 Green',
      '1 Unaffiliated',
      '2 Others',
    ])
    const chart = screen.getByRole('img', { name: /^House seating,/ })
    expect(list.parentElement).toBe(chart.parentElement)
    expect(seats(chart)).toHaveLength(25)
    expect(seats(chart, 'other')).toHaveLength(2)
    expect(seats(chart, 'unaffiliated')).toHaveLength(1)
  })
})
