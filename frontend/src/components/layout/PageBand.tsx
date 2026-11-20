import type { ReactNode } from 'react'
import { DotMosaic } from '../ui/DotMosaic'

interface PageBandProps {
  children: ReactNode
  labelledBy?: string
  className?: string
}

// The top of every page: the dot field behind the page's title and main
// controls, fading into the page below.
export function PageBand({ children, labelledBy, className }: PageBandProps) {
  return (
    <section className={`band${className ? ` ${className}` : ''}`} aria-labelledby={labelledBy}>
      <DotMosaic />
      <div className="container band__in">{children}</div>
    </section>
  )
}
