import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, test } from 'vitest'
import { ChamberComposition } from './ChamberComposition'
import type { ChamberCounts } from '../../lib/stats'

const COUNTS: ChamberCounts = {
  both: { total: 10, D: 4, I: 1, R: 5 },
  house: { total: 6, D: 3, I: 0, R: 3 },
  senate: { total: 4, D: 1, I: 1, R: 2 },
}

// 13 members in a 4 × 4 grid: a shortfall of 3 to split between the ends.
const SPLIT_COUNTS: ChamberCounts = {
  both: { total: 13, D: 6, I: 1, R: 6 },
  house: { total: 0, D: 0, I: 0, R: 0 },
  senate: { total: 0, D: 0, I: 0, R: 0 },
}

const SUFFIXES = ['d', 'i', 'r'] as const

function partyOf(dot: Element): string {
  return SUFFIXES.find((suffix) => dot.classList.contains(`composition-dot--${suffix}`)) ?? '?'
}

// The dots in DOM order. The component places every dot explicitly, so the
// first `rows` dots are the first column and the last `rows` the last one.
function gridDots(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll('.composition-grid .composition-dot')).map(partyOf)
}

function gridGeometry(container: HTMLElement): { rows: number; cols: number } {
  const grid = container.querySelector('.composition-grid') as HTMLElement | null
  expect(grid).toBeTruthy()
  return {
    rows: Number(grid?.style.getPropertyValue('--composition-rows')),
    cols: Number(grid?.style.getPropertyValue('--composition-cols')),
  }
}

function dotCells(container: HTMLElement): { row: number; col: number }[] {
  return Array.from(container.querySelectorAll('.composition-grid .composition-dot')).map((dot) => ({
    row: Number((dot as HTMLElement).style.gridRowStart),
    col: Number((dot as HTMLElement).style.gridColumnStart),
  }))
}

function renderComposition(counts: ChamberCounts = COUNTS) {
  return render(<ChamberComposition counts={counts} />)
}

describe('ChamberComposition', () => {
  test('shows both chambers by default, one circle per member', () => {
    const { container } = renderComposition()

    expect(screen.getByRole('button', { name: 'Both chambers' }).getAttribute('aria-pressed')).toBe('true')
    expect(gridDots(container).join('')).toBe('ddddirrrrr')
    expect(gridGeometry(container)).toEqual({ rows: 4, cols: 3 })
    expect(container.querySelector('.composition-total')?.textContent).toBe('10 current members')
  })

  test('places Democrats in the left columns and Republicans in the right columns', () => {
    const { container } = renderComposition()
    const dots = gridDots(container)
    const { rows } = gridGeometry(container)

    const leftColumn = dots.slice(0, rows)
    const rightColumn = dots.slice(dots.length - rows)
    // Democrats (left-leaning) hold the left side: the leftmost column
    // starts with Democrats and holds no Republicans.
    expect(leftColumn[0]).toBe('d')
    expect(leftColumn.every((party) => party === 'd' || party === 'i')).toBe(true)
    // Republicans (right-leaning) hold the right side.
    expect(rightColumn.every((party) => party === 'r')).toBe(true)
    // Independents sit between the two, with no party stacked outside
    // that order.
    expect(dots.join('')).toMatch(/^d*i*r*$/)
    expect(dots.join('')).not.toMatch(/r.*d/)
  })

  test('keeps the outline even: the 10-member grid misses one at the top of the first column and one at the bottom of the last', () => {
    const { container } = renderComposition()
    const cells = dotCells(container)
    const at = (row: number, col: number) => cells.some((cell) => cell.row === row && cell.col === col)

    // 4 rows × 3 cols = 12 cells for 10 members, so the shortfall of 2
    // splits one each: top of column 1, bottom of column 3.
    expect(at(1, 1)).toBe(false)
    expect(at(4, 3)).toBe(false)
    expect(at(2, 1)).toBe(true)
    expect(at(4, 1)).toBe(true)
    expect(at(1, 3)).toBe(true)
    expect(at(3, 3)).toBe(true)
    // The middle column stays full.
    expect(at(1, 2)).toBe(true)
    expect(at(4, 2)).toBe(true)
  })

  test('splits a larger shortfall between the ends: ceil half on top, the rest on the bottom', () => {
    const { container } = renderComposition(SPLIT_COUNTS)
    const cells = dotCells(container)
    const at = (row: number, col: number) => cells.some((cell) => cell.row === row && cell.col === col)

    // 13 members in 4 × 4: shortfall 3 → the first column misses 2 at its
    // top, the last column misses 1 at its bottom.
    expect(at(1, 1)).toBe(false)
    expect(at(2, 1)).toBe(false)
    expect(at(3, 1)).toBe(true)
    expect(at(4, 1)).toBe(true)
    expect(at(4, 4)).toBe(false)
    expect(at(3, 4)).toBe(true)
    // Middle columns are full top to bottom.
    expect(at(1, 2)).toBe(true)
    expect(at(4, 2)).toBe(true)
    expect(at(1, 3)).toBe(true)
    expect(at(4, 3)).toBe(true)
    expect(cells.length).toBe(13)
  })

  test('switches to the House: only its members, its count, a smaller even grid', () => {
    const { container } = renderComposition()
    fireEvent.click(screen.getByRole('button', { name: 'House' }))

    expect(screen.getByRole('button', { name: 'House' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('button', { name: 'Both chambers' }).getAttribute('aria-pressed')).toBe('false')
    expect(gridDots(container).join('')).toBe('dddrrr')
    expect(gridGeometry(container)).toEqual({ rows: 3, cols: 2 })
    // Left column Democrats, right column Republicans; 6 members fill
    // 3 × 2 exactly, so no cells are missing.
    const cells = dotCells(container)
    expect(cells).toEqual([
      { row: 1, col: 1 },
      { row: 2, col: 1 },
      { row: 3, col: 1 },
      { row: 1, col: 2 },
      { row: 2, col: 2 },
      { row: 3, col: 2 },
    ])
    expect(container.querySelector('.composition-total')?.textContent).toBe('6 current members')
  })

  test('switches to the Senate: only its members, its count, an even smaller grid', () => {
    const { container } = renderComposition()
    fireEvent.click(screen.getByRole('button', { name: 'Senate' }))

    expect(gridDots(container).join('')).toBe('dirr')
    expect(gridGeometry(container)).toEqual({ rows: 2, cols: 2 })
    // The left column holds the Democrat and the Independent; the right
    // column is all Republicans.
    expect(gridDots(container).slice(0, 2)).toEqual(['d', 'i'])
    expect(gridDots(container).slice(2)).toEqual(['r', 'r'])
    expect(container.querySelector('.composition-total')?.textContent).toBe('4 current members')
  })

  test('lists each party count in the legend for the active view', () => {
    const { container } = renderComposition()

    const legend = Array.from(container.querySelectorAll('.composition-legend__item'))
    expect(legend.map((item) => item.textContent)).toEqual([
      'Democrat 4',
      'Independent 1',
      'Republican 5',
    ])

    fireEvent.click(screen.getByRole('button', { name: 'Senate' }))
    expect(legend.map((item) => item.textContent)).toEqual([
      'Democrat 1',
      'Independent 1',
      'Republican 2',
    ])
  })
})
