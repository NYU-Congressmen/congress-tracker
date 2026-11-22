import { Link } from 'react-router-dom'
import { PageBand } from '../components/layout/PageBand'

export default function NotFoundPage() {
  return (
    <PageBand labelledBy="notfound-title" className="notfound">
      <p className="notfound__code" aria-hidden="true">
        404
      </p>
      <h1 id="notfound-title" className="page-title">
        Page not found
      </h1>
      <p className="page-lede">The page you are looking for does not exist or may have moved.</p>
      <Link to="/" className="btn btn--hl notfound__home">
        Back to the home page
      </Link>
    </PageBand>
  )
}
