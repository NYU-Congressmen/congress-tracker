import { Link } from 'react-router-dom'

export default function NotFoundPage() {
  return (
    <div className="container page notfound">
      <p className="notfound__code" aria-hidden="true">
        404
      </p>
      <h1>Page not found</h1>
      <p className="page__lede">The page you are looking for does not exist or may have moved.</p>
      <Link to="/" className="btn btn--primary">
        Back to the dashboard
      </Link>
    </div>
  )
}
