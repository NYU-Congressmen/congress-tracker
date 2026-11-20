import type { ComponentType } from 'react'
import { NavLink } from 'react-router-dom'
import { NAV_ITEMS } from '../../lib/constants'
import { AboutIcon, BillIcon, HomeIcon, PeopleIcon, type IconProps } from '../icons'

const TAB_ICONS: Record<string, ComponentType<IconProps>> = {
  '/': HomeIcon,
  '/bills': BillIcon,
  '/members': PeopleIcon,
  '/about': AboutIcon,
}

// Bottom navigation for phones, where the header has no room for links.
// CSS shows it only on narrow screens.
export function TabBar() {
  return (
    <nav className="tabbar" aria-label="Tabs">
      <ul className="tabbar__list">
        {NAV_ITEMS.map((item) => {
          const Icon = TAB_ICONS[item.to] ?? AboutIcon
          return (
            <li key={item.to}>
              <NavLink
                to={item.to}
                end={item.to === '/'}
                className={({ isActive }) => `tabbar__link${isActive ? ' is-active' : ''}`}
              >
                <Icon />
                {item.label}
              </NavLink>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
