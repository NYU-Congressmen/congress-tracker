import { useState } from 'react'
import type { FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { searchBills, type BillStatus } from '../api/bills'
import { BillListItem } from '../components/bills/BillListItem'
import { EmptyState } from '../components/ui/EmptyState'
import { ErrorState } from '../components/ui/ErrorState'
import { LoadingState } from '../components/ui/LoadingState'
import { Pagination } from '../components/ui/Pagination'
import { SelectField, TextField } from '../components/ui/Fields'
import { useApi } from '../hooks/useApi'
import { STATUS_META } from '../lib/constants'

const PAGE_SIZE = 15

interface FilterValues {
  q: string
  status: string
  from: string
  to: string
}

interface BillsFiltersFormProps {
  initial: FilterValues
  hasFilters: boolean
  onApply: (values: FilterValues) => void
}

// The form's draft state is seeded from the URL. The page remounts it with a
// key whenever the URL changes, so the fields always reflect the live filters.
function BillsFiltersForm({ initial, hasFilters, onApply }: BillsFiltersFormProps) {
  const [formQ, setFormQ] = useState(initial.q)
  const [formStatus, setFormStatus] = useState(initial.status)
  const [formFrom, setFormFrom] = useState(initial.from)
  const [formTo, setFormTo] = useState(initial.to)

  return (
    <form
      className="filters"
      role="search"
      onSubmit={(event: FormEvent) => {
        event.preventDefault()
        onApply({ q: formQ, status: formStatus, from: formFrom, to: formTo })
      }}
    >
      <TextField
        id="bill-q"
        label="Keyword"
        type="search"
        value={formQ}
        onChange={setFormQ}
        placeholder="e.g. clean water"
        className="filters__keyword"
      />
      <SelectField
        id="bill-status"
        label="Stage"
        value={formStatus}
        onChange={setFormStatus}
        options={[{ value: '', label: 'Any stage' }, ...STATUS_META.map((meta) => ({ value: meta.value, label: meta.label }))]}
      />
      <TextField id="bill-from" label="Introduced on or after" type="date" value={formFrom} onChange={setFormFrom} />
      <TextField id="bill-to" label="On or before" type="date" value={formTo} onChange={setFormTo} />
      <div className="filters__actions">
        <button type="submit" className="btn btn--primary">
          Apply filters
        </button>
        {hasFilters ? (
          <button
            type="button"
            className="btn btn--ghost"
            onClick={() => onApply({ q: '', status: '', from: '', to: '' })}
          >
            Clear
          </button>
        ) : null}
      </div>
    </form>
  )
}

// Filters live in the URL so results are shareable and the dashboard's
// stage chips deep-link straight into a pre-filtered list.
export default function BillsPage() {
  const [params, setParams] = useSearchParams()
  const q = params.get('q') ?? ''
  const status = params.get('status') ?? ''
  const from = params.get('from') ?? ''
  const to = params.get('to') ?? ''
  const page = Math.max(1, Number(params.get('page') ?? '1') || 1)

  const { data, loading, error, refetch } = useApi(
    () =>
      searchBills({
        q: q || undefined,
        status: (status || undefined) as BillStatus | undefined,
        from: from || undefined,
        to: to || undefined,
        page,
        limit: PAGE_SIZE,
      }),
    [q, status, from, to, page],
  )

  function applyFilters(values: FilterValues) {
    const search = new URLSearchParams()
    if (values.q.trim()) search.set('q', values.q.trim())
    if (values.status) search.set('status', values.status)
    if (values.from) search.set('from', values.from)
    if (values.to) search.set('to', values.to)
    setParams(search)
  }

  function onPageChange(nextPage: number) {
    const search = new URLSearchParams(params)
    search.set('page', String(nextPage))
    setParams(search)
    if (window.scrollY > 0) window.scrollTo(0, 0)
  }

  const hasFilters = Boolean(q || status || from || to)
  const pageCount = data ? Math.max(1, Math.ceil(data.total / data.limit)) : 1
  const statusLabel = STATUS_META.find((meta) => meta.value === status)?.label
  const filtersKey = [q, status, from, to].join('|')

  return (
    <div className="container page">
      <header className="page__header">
        <h1>Bills</h1>
        <p className="page__lede">
          Search legislation from the 119th Congress by keyword, stage, or the date it was introduced.
        </p>
      </header>

      <BillsFiltersForm
        key={filtersKey}
        initial={{ q, status, from, to }}
        hasFilters={hasFilters}
        onApply={applyFilters}
      />

      {hasFilters ? (
        <p className="active-filters" aria-live="polite">
          <span className="active-filters__label">Filtering by:</span>
          {q ? <span className="chip chip--active">“{q}”</span> : null}
          {status ? <span className="chip chip--active">{statusLabel ?? status}</span> : null}
          {from ? <span className="chip chip--active">since {from}</span> : null}
          {to ? <span className="chip chip--active">through {to}</span> : null}
        </p>
      ) : null}

      {error ? (
        <ErrorState title="Bills could not be loaded" message={error.message} onRetry={refetch} />
      ) : loading ? (
        <LoadingState message="Searching bills…" />
      ) : data && data.data.length === 0 ? (
        <EmptyState
          title="No bills match those filters"
          hint="Try a broader keyword, or clear the stage and date filters."
        />
      ) : data ? (
        <>
          <p className="results-count" aria-live="polite">
            {data.total.toLocaleString()} {data.total === 1 ? 'bill' : 'bills'} found
          </p>
          <ul className="bill-list">
            {data.data.map((bill) => (
              <BillListItem key={bill.bill_id} bill={bill} />
            ))}
          </ul>
          <Pagination page={page} pageCount={pageCount} onPageChange={onPageChange} />
        </>
      ) : null}
    </div>
  )
}
