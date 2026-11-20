import type { BillAction } from '../api/bills'

// Milestones show as a centered event instead of a message.
const MILESTONES = [
  /Became Public Law/i,
  /Signed by President/i,
  /Presented to President/i,
  /Passed\/agreed to in (House|Senate)/i,
  /Resolving differences/i,
]

// Who "said" an action, read from its type and wording. Congress.gov does not
// name the chamber on each action, so this is a best guess for the label only;
// the message itself is the official text.
export function speakerOf(action: BillAction): string {
  const text = action.text ?? ''
  if (action.type === 'Committee') return 'Committee'
  if (action.type === 'President' || action.type === 'BecameLaw' || /President/.test(text)) return 'President'
  if (/\bSenate\b/.test(text)) return 'Senate'
  if (/\bHouse\b/.test(text)) return 'House'
  return 'Congress'
}

// Congress.gov lists actions newest first. Sort them oldest first by date, and
// keep same-day actions in their reverse listed order so the day reads in sequence.
function chronological(actions: BillAction[]): BillAction[] {
  return actions
    .map((action, index) => ({ action, index }))
    .sort((a, b) => {
      const left = a.action.action_date ?? '9999'
      const right = b.action.action_date ?? '9999'
      if (left !== right) return left < right ? -1 : 1
      return b.index - a.index
    })
    .map((item) => item.action)
}

export type ThreadRow =
  | { kind: 'date'; date: string }
  | { kind: 'event'; text: string }
  | { kind: 'message'; who: string; text: string }

// The rows of the conversation: a date stamp whenever the day changes, then
// each action as a milestone event or as a message from its chamber.
export function threadRows(actions: BillAction[]): ThreadRow[] {
  const rows: ThreadRow[] = []
  let lastDate: string | null = null
  for (const action of chronological(actions)) {
    if (action.action_date && action.action_date !== lastDate) {
      lastDate = action.action_date
      rows.push({ kind: 'date', date: action.action_date })
    }
    const text = action.text ?? '—'
    if (MILESTONES.some((pattern) => pattern.test(text))) {
      rows.push({ kind: 'event', text })
    } else {
      rows.push({ kind: 'message', who: speakerOf(action), text })
    }
  }
  return rows
}
