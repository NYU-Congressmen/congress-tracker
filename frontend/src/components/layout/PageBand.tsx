import type { ReactNode } from 'react'
import { DotMosaic } from '../ui/DotMosaic'

interface PageBandProps {
  children: ReactNode
  labelledBy?: string
  className?: string
}

// Set the page title and controls against the fading dot field.
export function PageBand({ children, labelledBy, className }: PageBandProps) {
  return (
    <section className={`band${className ? ` ${className}` : ''}`} aria-labelledby={labelledBy}>
      <div className="band__mosaic">
        <DotMosaic />
      </div>
      <div className="container band__in">{children}</div>
    </section>
  )
}
