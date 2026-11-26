import type { BillType } from './bills'
import { request } from './client'

export interface HouseVote {
  congress: number
  session: number
  roll_number: number
  vote_date: string | null
  question: string | null
  result: string | null
  source_url: string | null
  positions_complete: boolean
  totals: Record<string, number>
  positions: { bioguide_id: string; position: string }[]
}

export function getHouseVotes(
  congress: number, type: BillType, number: number, memberId?: string,
): Promise<HouseVote[]> {
  const query = new URLSearchParams(memberId ? { bioguide_id: memberId } : { include_positions: 'false' })
  return request<HouseVote[]>(`/api/bills/${congress}/${type}/${number}/house-votes?${query}`)
}
