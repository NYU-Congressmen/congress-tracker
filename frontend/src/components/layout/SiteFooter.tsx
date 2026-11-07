import { Link } from 'react-router-dom'
import { CONGRESS_NUMBER } from '../../lib/constants'
import { CapitolIcon } from '../icons'

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="container site-footer__grid">
        <div className="site-footer__about">
          <p className="site-footer__brand">
            <CapitolIcon size={22} /> Pull
          </p>
          <p>
            Follow the {CONGRESS_NUMBER}th Congress: search bills, browse members, and watch legislation move from
            introduction to law.
          </p>
        </div>
        <nav className="site-footer__col" aria-label="Explore">
          <h3>Explore</h3>
          <ul>
            <li>
              <Link to="/bills">Search bills</Link>
            </li>
            <li>
              <Link to="/members">Members of Congress</Link>
            </li>
            <li>
              <Link to="/about">About the project</Link>
            </li>
          </ul>
        </nav>
        <nav className="site-footer__col" aria-label="Data and API">
          <h3>Data &amp; API</h3>
          <ul>
            {import.meta.env.DEV && (
              <li>
                <a href="http://localhost:8000/docs" target="_blank" rel="noreferrer">
                  API documentation
                </a>
              </li>
            )}
            <li>
              <a href="https://www.congress.gov" target="_blank" rel="noreferrer">
                congress.gov
              </a>
            </li>
            <li>
              <a href="https://github.com/NYU-Congressmen/congress-tracker" target="_blank" rel="noreferrer">
                GitHub
              </a>
            </li>
          </ul>
        </nav>
      </div>
      <div className="site-footer__bottom">
        <div className="container">
          <p>
            Pull is an educational project and is not an official U.S. Government site. Its status
            summaries are simplified interpretations of congressional action.
          </p>
          <p>Legislative data courtesy of the U.S. Congress via congress.gov.</p>
        </div>
      </div>
    </footer>
  )
}
