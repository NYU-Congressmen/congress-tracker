import { describe, expect, test } from 'vitest'
import { billNumber, billUrl, formatDate, districtLabel, initialsOf, memberUrl, timeAgo } from './format'

describe('billNumber', () => {
  test('renders the congressional abbreviation', () => {
    expect(billNumber('hr', 1234)).toBe('H.R. 1234')
    expect(billNumber('s', 77)).toBe('S. 77')
    expect(billNumber('hjres', 5)).toBe('H.J. Res. 5')
    expect(billNumber('sjres', 3)).toBe('S.J. Res. 3')
    expect(billNumber('hconres', 9)).toBe('H.Con. Res. 9')
    expect(billNumber('hres', 42)).toBe('H.Res. 42')
    expect(billNumber('sres', 8)).toBe('S.Res. 8')
  })
})

describe('links', () => {
  test('billUrl points at the congress.gov bill page', () => {
    expect(billUrl(119, 'hr', 1234)).toBe('https://www.congress.gov/bill/119th-congress/hr/1234')
  })

  test('memberUrl points at the congress.gov member page', () => {
    expect(memberUrl('M000147')).toBe('https://www.congress.gov/member/M000147')
  })
})

describe('dates', () => {
  test('formatDate renders ISO dates as local dates', () => {
    expect(formatDate('2026-03-03')).toBe('Mar 3, 2026')
    expect(formatDate(null)).toBe('')
    expect(formatDate('not a date')).toBe('')
  })

  test('timeAgo renders relative durations', () => {
    const twoHoursAgo = new Date(Date.now() - 2 * 3_600_000).toISOString()
    expect(timeAgo(twoHoursAgo)).toBe('2 hours ago')
    expect(timeAgo(null)).toBe('')
    expect(timeAgo('garbage')).toBe('')
  })
})

describe('members', () => {
  test('districtLabel distinguishes at-large seats', () => {
    expect(districtLabel(null)).toBe('At large')
    expect(districtLabel(14)).toBe('District 14')
  })

  test('initialsOf takes the first letter of the first two words', () => {
    expect(initialsOf('Alexandria Ocasio-Cortez')).toBe('AO')
    expect(initialsOf('Ted Cruz')).toBe('TC')
    expect(initialsOf('   ')).toBe('')
  })
})
