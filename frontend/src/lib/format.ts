import type { BillType } from '../api/bills'

const BILL_TYPE_LABELS: Record<BillType, string> = {
  hr: 'H.R.',
  s: 'S.',
  hjres: 'H.J. Res.',
  sjres: 'S.J. Res.',
  hconres: 'H.Con. Res.',
  sconres: 'S.Con. Res.',
  hres: 'H.Res.',
  sres: 'S.Res.',
}

// Render a bill's type and number the way Congress.gov displays it: "H.R. 1234".
export function billNumber(type: BillType, number: number): string {
  return `${BILL_TYPE_LABELS[type] ?? type} ${number}`
}

export function billUrl(congress: number, type: BillType, number: number): string {
  return `https://www.congress.gov/bill/${congress}th-congress/${type}/${number}`
}

export function memberUrl(bioguideId: string): string {
  return `https://www.congress.gov/member/${bioguideId}`
}

// Parse the first "YYYY-MM-DD" of an ISO value as a local date so formatting
// never shifts the day across time zones.
function parseIsoDate(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value)
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  if (month < 1 || month > 12 || day < 1 || day > 31) return null
  return new Date(year, month - 1, day)
}

const DATE_FORMAT = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
const DATETIME_FORMAT = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
})

export function formatDate(value: string | null | undefined): string {
  if (!value) return ''
  const date = parseIsoDate(value)
  return date ? DATE_FORMAT.format(date) : ''
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return ''
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '' : DATETIME_FORMAT.format(date)
}

// "2 hours ago" style text for cache timestamps.
export function timeAgo(value: string | null | undefined): string {
  if (!value) return ''
  const then = new Date(value).getTime()
  if (Number.isNaN(then)) return ''
  const seconds = Math.max(0, Math.round((Date.now() - then) / 1000))
  const units: [number, string][] = [
    [31_536_000, 'year'],
    [2_592_000, 'month'],
    [604_800, 'week'],
    [86_400, 'day'],
    [3_600, 'hour'],
    [60, 'minute'],
  ]
  for (const [size, name] of units) {
    const count = Math.floor(seconds / size)
    if (count >= 1) return `${count} ${name}${count > 1 ? 's' : ''} ago`
  }
  return 'just now'
}

// "District 3" for a numbered seat, "At large" for a senator.
export function districtLabel(district: number | null): string | null {
  if (district === null) return 'At large'
  return `District ${district}`
}

export function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')
}
