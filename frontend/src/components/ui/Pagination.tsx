import { ChevronLeftIcon, ChevronRightIcon } from '../icons'

interface PaginationProps {
  page: number
  pageCount: number
  onPageChange: (page: number) => void
}

type PageItem = number | 'gap'

// Keep the current page's neighbors and the two ends, collapsing the rest.
function pageItems(page: number, pageCount: number): PageItem[] {
  const wanted = new Set<number>([1, 2, pageCount - 1, pageCount, page - 1, page, page + 1])
  const pages = [...wanted].filter((p) => p >= 1 && p <= pageCount).sort((a, b) => a - b)
  const items: PageItem[] = []
  let previous = 0
  for (const p of pages) {
    if (p - previous > 1) items.push('gap')
    items.push(p)
    previous = p
  }
  return items
}

export function Pagination({ page, pageCount, onPageChange }: PaginationProps) {
  if (pageCount <= 1) return null
  return (
    <nav className="pagination" aria-label="Results pages">
      <button
        type="button"
        className="pagination__btn"
        disabled={page <= 1}
        onClick={() => onPageChange(page - 1)}
      >
        <ChevronLeftIcon />
        <span>Previous</span>
      </button>
      <ol className="pagination__pages">
        {pageItems(page, pageCount).map((item, index) =>
          item === 'gap' ? (
            <li key={`gap-${index}`} className="pagination__gap" aria-hidden="true">
              …
            </li>
          ) : (
            <li key={item}>
              <button
                type="button"
                className={`pagination__num${item === page ? ' is-current' : ''}`}
                aria-current={item === page ? 'page' : undefined}
                disabled={item === page}
                onClick={() => item !== page && onPageChange(item)}
              >
                {item}
              </button>
            </li>
          ),
        )}
      </ol>
      <button
        type="button"
        className="pagination__btn"
        disabled={page >= pageCount}
        onClick={() => onPageChange(page + 1)}
      >
        <span>Next</span>
        <ChevronRightIcon />
      </button>
    </nav>
  )
}
