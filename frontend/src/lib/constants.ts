import type { BillStatus } from '../api/bills'

// The sync job stores the 119th Congress; new Congresses can be added here
// without touching the pages that display them.
export const CONGRESS_NUMBER = 119

export interface StatusMeta {
  value: BillStatus
  label: string
  description: string
}

// One place to add a legislative stage: label, help text and the CSS hook
// used by the badge colors.
export const STATUS_META: StatusMeta[] = [
  {
    value: 'introduced',
    label: 'Introduced',
    description: 'The bill has been presented to its chamber.',
  },
  {
    value: 'committee',
    label: 'In committee',
    description: 'The bill is being reviewed by a committee.',
  },
  {
    value: 'passed_one_chamber',
    label: 'Passed one chamber',
    description: 'The bill has passed either the House or the Senate.',
  },
  {
    value: 'passed_both_chambers',
    label: 'Passed both chambers',
    description: 'The bill has been passed in both chambers.',
  },
  {
    value: 'to_president',
    label: 'With the President',
    description: 'The bill has been sent to the President for action.',
  },
  {
    value: 'became_law',
    label: 'Became law',
    description: 'The bill has been enacted into law.',
  },
]

export const STATUS_LABELS: Record<BillStatus, string> = {
  introduced: 'Introduced',
  committee: 'In committee',
  passed_one_chamber: 'Passed one chamber',
  passed_both_chambers: 'Passed both chambers',
  to_president: 'With the President',
  became_law: 'Became law',
}

export interface SelectOption {
  value: string
  label: string
}

export const PARTY_OPTIONS: SelectOption[] = [
  { value: 'R', label: 'Republican' },
  { value: 'D', label: 'Democrat' },
  { value: 'I', label: 'Independent' },
]

export const PARTY_LABELS: Record<string, string> = {
  R: 'Republican',
  D: 'Democrat',
  I: 'Independent',
}

export const CHAMBER_OPTIONS: SelectOption[] = [
  { value: 'House', label: 'House of Representatives' },
  { value: 'Senate', label: 'Senate' },
]

// States and territories represented in Congress, for the member filters.
export const STATE_OPTIONS: SelectOption[] = [
  { value: 'AL', label: 'Alabama' },
  { value: 'AK', label: 'Alaska' },
  { value: 'AS', label: 'American Samoa' },
  { value: 'AZ', label: 'Arizona' },
  { value: 'AR', label: 'Arkansas' },
  { value: 'CA', label: 'California' },
  { value: 'CO', label: 'Colorado' },
  { value: 'CT', label: 'Connecticut' },
  { value: 'DE', label: 'Delaware' },
  { value: 'DC', label: 'District of Columbia' },
  { value: 'FL', label: 'Florida' },
  { value: 'GA', label: 'Georgia' },
  { value: 'GU', label: 'Guam' },
  { value: 'HI', label: 'Hawaii' },
  { value: 'ID', label: 'Idaho' },
  { value: 'IL', label: 'Illinois' },
  { value: 'IN', label: 'Indiana' },
  { value: 'IA', label: 'Iowa' },
  { value: 'KS', label: 'Kansas' },
  { value: 'KY', label: 'Kentucky' },
  { value: 'LA', label: 'Louisiana' },
  { value: 'ME', label: 'Maine' },
  { value: 'MD', label: 'Maryland' },
  { value: 'MA', label: 'Massachusetts' },
  { value: 'MI', label: 'Michigan' },
  { value: 'MN', label: 'Minnesota' },
  { value: 'MS', label: 'Mississippi' },
  { value: 'MO', label: 'Missouri' },
  { value: 'MT', label: 'Montana' },
  { value: 'NE', label: 'Nebraska' },
  { value: 'NV', label: 'Nevada' },
  { value: 'NH', label: 'New Hampshire' },
  { value: 'NJ', label: 'New Jersey' },
  { value: 'NM', label: 'New Mexico' },
  { value: 'NY', label: 'New York' },
  { value: 'NC', label: 'North Carolina' },
  { value: 'ND', label: 'North Dakota' },
  { value: 'MP', label: 'Northern Mariana Islands' },
  { value: 'OH', label: 'Ohio' },
  { value: 'OK', label: 'Oklahoma' },
  { value: 'OR', label: 'Oregon' },
  { value: 'PA', label: 'Pennsylvania' },
  { value: 'PR', label: 'Puerto Rico' },
  { value: 'RI', label: 'Rhode Island' },
  { value: 'SC', label: 'South Carolina' },
  { value: 'SD', label: 'South Dakota' },
  { value: 'TN', label: 'Tennessee' },
  { value: 'TX', label: 'Texas' },
  { value: 'UT', label: 'Utah' },
  { value: 'VT', label: 'Vermont' },
  { value: 'VA', label: 'Virginia' },
  { value: 'WA', label: 'Washington' },
  { value: 'WV', label: 'West Virginia' },
  { value: 'WI', label: 'Wisconsin' },
  { value: 'WY', label: 'Wyoming' },
  { value: 'FM', label: 'Federated States of Micronesia' },
  { value: 'MH', label: 'Marshall Islands' },
  { value: 'VI', label: 'U.S. Virgin Islands' },
]

// Primary navigation. Add an entry here (and a matching route in App.tsx)
// when a new tracking category lands.
export const NAV_ITEMS: { to: string; label: string }[] = [
  { to: '/', label: 'Home' },
  { to: '/bills', label: 'Bills' },
  { to: '/members', label: 'Members' },
  { to: '/about', label: 'About' },
]
