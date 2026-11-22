import { Link } from 'react-router-dom'
import { getMember, listMembers } from '../../api/members'
import type { Member } from '../../api/members'
import type { BillSummary } from '../../api/bills'
import { representativesForDistrict, stateName, districtHeading } from '../../lib/districts'
import { useApi } from '../../hooks/useApi'
import { BillListItem } from '../bills/BillListItem'
import { EmptyState } from '../ui/EmptyState'
import { ErrorState } from '../ui/ErrorState'
import { LoadingState } from '../ui/LoadingState'

const FEED_SIZE = 8

interface DistrictBillsProps {
  state: string
  district: number | null
}

// The bills that most directly concern the person's district: the ones their
// representatives have sponsored or co-sponsored, listed in the same format as
// "Latest activity". The representatives themselves are listed on the Members
// page, not here.
export function DistrictBills({ state, district }: DistrictBillsProps) {
  const { data: members, loading: membersLoading, error: membersError, refetch: refetchMembers } = useApi(
    () => listMembers({ state }),
    [state],
  )

  const { house, senate } = members
    ? representativesForDistrict(members.data, state, district)
    : { house: [], senate: [] }
  const reps: Member[] = [...house, ...senate]
  const repIds = reps.map((member) => member.bioguide_id).join(',')

  // One cached call per representative; a failed lookup just leaves that
  // member's bills out of the list.
  const bills = useApi(async () => {
    const results = await Promise.all(
      reps.map(async (rep) => {
        try {
          const detail = await getMember(rep.bioguide_id)
          return [...detail.sponsored_bills, ...(detail.co_sponsored_bills ?? [])]
        } catch {
          return []
        }
      }),
    )
    const byId = new Map<string, BillSummary>()
    for (const bill of results.flat()) byId.set(bill.bill_id, bill)
    return [...byId.values()]
      .sort((a, b) => (b.latest_action_date ?? '').localeCompare(a.latest_action_date ?? ''))
      .slice(0, FEED_SIZE)
  }, [repIds])

  return (
    <>
      <div className="panel__heading-row">
        <h2>Your district</h2>
        <Link to="/members?view=mine" className="link-more">
          My representatives
        </Link>
      </div>
      <p className="panel__count">{districtHeading(state, district)}</p>

      {membersLoading ? (
        <LoadingState message="Finding the bills for your district…" />
      ) : membersError ? (
        <ErrorState
          title="Your district could not be loaded"
          message={membersError.message}
          onRetry={refetchMembers}
        />
      ) : reps.length === 0 ? (
        <EmptyState
          title="No representatives on record"
          hint={`The member directory has no current representatives for ${stateName(state)} yet. Check the Members page for the full directory.`}
        />
      ) : bills.loading ? (
        <LoadingState message="Collecting the bills for your district…" />
      ) : bills.error ? (
        <ErrorState title="The district bills could not be loaded" message={bills.error.message} onRetry={bills.refetch} />
      ) : bills.data === null || bills.data.length === 0 ? (
        <EmptyState
          title="No bills on record yet"
          hint="Your representatives have not sponsored or co-sponsored a bill in this Congress yet."
        />
      ) : (
        <ul className="bill-list bill-list--compact" aria-label={`Bills for ${districtHeading(state, district)}`}>
          {bills.data.map((bill) => (
            <BillListItem key={bill.bill_id} bill={bill} />
          ))}
        </ul>
      )}
    </>
  )
}
