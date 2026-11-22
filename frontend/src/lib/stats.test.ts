import { describe, expect, test } from 'vitest'
import type { Member } from '../api/members'
import { countByChamber, countByParty } from './stats'

const BASE_MEMBER: Omit<Member, 'party' | 'chamber'> = {
  bioguide_id: 'M000001',
  name: 'Test Member',
  state: 'CA',
  district: 1,
  image_url: null,
  is_current: true,
}

function member(party: string, chamber: string): Member {
  return { ...BASE_MEMBER, party, chamber }
}

describe('countByParty', () => {
  test('tallies every party and the total', () => {
    expect(
      countByParty([member('D', 'House'), member('D', 'Senate'), member('R', 'Senate'), member('I', 'House')]),
    ).toEqual({ total: 4, D: 2, R: 1, I: 1 })
  })

  test('ignores members with no party on record', () => {
    expect(countByParty([member('D', 'House'), { ...member('D', 'Senate'), party: null }])).toEqual({
      total: 2,
      D: 1,
      R: 0,
      I: 0,
    })
  })
})

describe('countByChamber', () => {
  test('splits the membership by chamber and keeps the combined total', () => {
    const members = [
      member('D', 'House'),
      member('R', 'House'),
      member('R', 'Senate'),
      member('D', 'Senate'),
      member('I', 'Senate'),
    ]
    expect(countByChamber(members)).toEqual({
      both: { total: 5, D: 2, R: 2, I: 1 },
      house: { total: 2, D: 1, R: 1, I: 0 },
      senate: { total: 3, D: 1, R: 1, I: 1 },
    })
  })

  test('counts members without a chamber only in the combined view', () => {
    const members = [member('D', 'House'), { ...member('R', 'House'), chamber: null }]
    expect(countByChamber(members)).toEqual({
      both: { total: 2, D: 1, R: 1, I: 0 },
      house: { total: 1, D: 1, R: 0, I: 0 },
      senate: { total: 0, D: 0, R: 0, I: 0 },
    })
  })
})
