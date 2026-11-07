// A small inline icon set so the app has no icon dependency.
// Icons inherit the current color and size from their container.

export interface IconProps {
  size?: number
  className?: string
}
// Capitol icon from svgrepo.com, licensed to the Public Domain
export function CapitolIcon({ size = 28, className }: IconProps) {
  return (
    <svg viewBox="0 0 512 512" width={size} height={size} className={className} aria-hidden="true" fill="currentColor">
      <rect x="193.939" y="385.88" className="st0" width="22.939" height="40.14"/>
      <rect x="215.787" y="312.176" className="st0" width="26.301" height="36.572"/>
      <rect x="143.347" y="385.88" className="st0" width="22.939" height="40.14"/>
      <rect x="269.919" y="312.176" className="st0" width="26.294" height="36.572"/>
      <rect x="161.667" y="312.176" className="st0" width="26.294" height="36.572"/>
      <rect x="244.531" y="385.88" className="st0" width="22.939" height="40.14"/>
      <rect x="295.122" y="385.88" className="st0" width="22.94" height="40.14"/>
      <path className="st0" d="M423.571,402.456v-9.599c5.026-7.469,7.822-16.342,7.822-25.536c0-16.881-9.174-31.659-22.793-39.614
      c9.792-8.614,16.003-21.208,16.003-35.101c0-13.713-6.178-26.341-16.083-35.034c0.34-2.524,0.453-5.086,0.066-7.656
      c-8.447-55.977-47.336-102.687-99.485-121.866c0-0.007,0-0.007,0-0.014c2.21-4.553,3.448-9.652,3.448-15.044
      c0-9.606-3.954-18.293-10.304-24.564c0.658-2.782,1.038-5.671,1.038-8.647V60.47c0-4.979-0.965-9.845-2.909-14.565l-9.439-22.64
      C285.023,9.134,271.311,0,256,0c-15.311,0-29.024,9.134-34.948,23.299l-9.412,22.593c-1.937,4.633-2.916,9.54-2.916,14.579v19.311
      c0,2.976,0.38,5.865,1.032,8.647c-6.35,6.264-10.312,14.958-10.312,24.564c0,5.392,1.238,10.491,3.455,15.044
      c-0.006,0.007-0.006,0.007-0.006,0.014c-52.15,19.184-91.038,65.896-99.472,121.866c-0.386,2.57-0.273,5.126,0.066,7.649
      c-9.912,8.7-16.09,21.322-16.09,35.041c0,13.893,6.21,26.487,16.003,35.101c-13.62,7.948-22.793,22.733-22.793,39.614
      c0,9.187,2.796,18.067,7.822,25.53v9.605c-17.601,7.323-30.002,24.697-30.002,44.913v37.365c0,15.057,12.208,27.266,27.266,27.266
      h340.614c15.057,0,27.266-12.209,27.266-27.266v-37.365C453.573,427.152,441.171,409.778,423.571,402.456z M235.989,60.47
      c0-1.398,0.273-2.783,0.812-4.074l9.419-22.613c1.651-3.948,5.505-6.518,9.779-6.518c4.273,0,8.128,2.57,9.779,6.518l9.426,22.613
      c0.532,1.291,0.812,2.675,0.812,4.074v19.311c0,5.851-4.746,10.591-10.598,10.591H246.58c-5.851,0-10.591-4.74-10.591-10.591V60.47
      z M229.406,148.7c-1.631-1.338-2.696-3.342-2.696-5.618c0-4.021,3.268-7.283,7.302-7.283h1.178v-15.523h-1.178
      c-4.034,0-7.302-3.256-7.302-7.283s3.268-7.289,7.302-7.289h43.988c4.021,0,7.283,3.262,7.283,7.289s-3.262,7.283-7.283,7.283
      h-1.185v15.523h1.185c4.021,0,7.283,3.262,7.283,7.283c0,2.276-1.066,4.28-2.69,5.618c51.351,10.93,91.125,52.874,99.034,105.283
      H130.38C138.282,201.574,178.056,159.63,229.406,148.7z M426.307,484.734H85.693v-37.365c0-11.789,9.56-21.348,21.348-21.348h8.654
      v-43.616c-4.72-3.368-7.822-8.846-7.822-15.084c0-10.257,8.314-18.572,18.565-18.572h7.403V312.13
      c-10.624-0.213-19.178-8.854-19.178-19.524c0-8.96,6.058-16.429,14.273-18.752h254.129c8.214,2.324,14.272,9.793,14.272,18.752
      c0,10.67-8.554,19.311-19.172,19.524v36.618h7.395c10.252,0,18.566,8.315,18.566,18.572c0,6.238-3.102,11.723-7.822,15.091v43.609
      h8.66c11.782,0,21.342,9.559,21.342,21.348V484.734z"/>
      <rect x="345.713" y="385.88" className="st0" width="22.933" height="40.14"/>
      <rect x="324.039" y="312.176" className="st0" width="26.294" height="36.572"/>
    </svg>
  )
}

export function FlagIcon({ size = 22, className }: IconProps) {
  return (
    <svg viewBox="0 0 22 15" width={size} height={Math.round(size * 0.68)} className={className} aria-hidden="true">
      <rect width="22" height="15" fill="#ffffff" />
      <path
        d="M0 0h22v1.15H0zM0 2.3h22v1.15H0zM0 4.6h22v1.15H0zM0 6.9h22v1.15H0zM0 9.2h22v1.15H0zM0 11.5h22v1.15H0zM0 13.8h22v1.2H0z"
        fill="#b31942"
      />
      <rect width="9.9" height="8" fill="#0a3161" />
      <g fill="#ffffff">
        <circle cx="1.4" cy="1.4" r="0.5" />
        <circle cx="3.3" cy="1.4" r="0.5" />
        <circle cx="5.2" cy="1.4" r="0.5" />
        <circle cx="7.1" cy="1.4" r="0.5" />
        <circle cx="2.4" cy="3" r="0.5" />
        <circle cx="4.3" cy="3" r="0.5" />
        <circle cx="6.2" cy="3" r="0.5" />
        <circle cx="1.4" cy="4.6" r="0.5" />
        <circle cx="3.3" cy="4.6" r="0.5" />
        <circle cx="5.2" cy="4.6" r="0.5" />
        <circle cx="7.1" cy="4.6" r="0.5" />
        <circle cx="2.4" cy="6.2" r="0.5" />
        <circle cx="4.3" cy="6.2" r="0.5" />
        <circle cx="6.2" cy="6.2" r="0.5" />
      </g>
    </svg>
  )
}

export function SearchIcon({ size = 20, className }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" width={size} height={size} className={className} aria-hidden="true" fill="currentColor">
      <path d="M10.5 3a7.5 7.5 0 1 1-4.2 13.7l-4.3 4.3-1.1-1.1 4.3-4.3A7.5 7.5 0 0 1 10.5 3zm0 2a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11z" />
    </svg>
  )
}

export function ChevronLeftIcon({ size = 16, className }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" width={size} height={size} className={className} aria-hidden="true" fill="currentColor">
      <path d="M12.4 3.4 5.7 10l6.7 6.6 1.4-1.4L8.5 10l5.3-5.2z" />
    </svg>
  )
}

export function ChevronRightIcon({ size = 16, className }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" width={size} height={size} className={className} aria-hidden="true" fill="currentColor">
      <path d="M7.6 3.4 6.2 4.8 11.5 10l-5.3 5.2 1.4 1.4 6.7-6.6z" />
    </svg>
  )
}

export function ExternalLinkIcon({ size = 16, className }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" width={size} height={size} className={className} aria-hidden="true" fill="currentColor">
      <path d="M11 2h7v7h-2V6.4l-7.3 7.3-1.4-1.4L14.6 5H11zM4 5h5v2H6v8h8v-3h2v5H4z" />
    </svg>
  )
}

export function CheckIcon({ size = 16, className }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" width={size} height={size} className={className} aria-hidden="true" fill="currentColor">
      <path d="M7.6 13.2 3.9 9.5l-1.4 1.4 5.1 5.1 9-9-1.4-1.4z" />
    </svg>
  )
}

export function AlertIcon({ size = 24, className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} className={className} aria-hidden="true" fill="currentColor">
      <path d="M12 2 1 21h22L12 2zm1 14h-2v2h2zm0-7h-2v5h2z" />
    </svg>
  )
}

export function InfoIcon({ size = 18, className }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" width={size} height={size} className={className} aria-hidden="true" fill="currentColor">
      <path d="M10 1a9 9 0 1 1 0 18 9 9 0 0 1 0-18zm1 8H9v7h2zm0-4H9v2h2z" />
    </svg>
  )
}

export function CalendarIcon({ size = 18, className }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" width={size} height={size} className={className} aria-hidden="true" fill="currentColor">
      <path d="M6 1h2v2H6zm6 0h2v2h-2zM4 5h13v13H4zm2 2v9h9V7z" />
    </svg>
  )
}
// SunIcon from svgrepo.com, made by wishforge-games
export function SunIcon({ size = 18, className }: IconProps) {
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} className={className} aria-hidden="true" fill="currentColor">
      <path d="M16,8c-4.4,0-8,3.6-8,8s3.6,8,8,8s8-3.6,8-8S20.4,8,16,8z"/>
      <path d="M16,7c0.6,0,1-0.4,1-1V3c0-0.6-0.4-1-1-1s-1,0.4-1,1v3C15,6.6,15.4,7,16,7z"/>
      <path d="M8.2,9.6c0.2,0.2,0.5,0.3,0.7,0.3s0.5-0.1,0.7-0.3c0.4-0.4,0.4-1,0-1.4L7.5,6.1c-0.4-0.4-1-0.4-1.4,0s-0.4,1,0,1.4L8.2,9.6
      z"/>
      <path d="M7,16c0-0.6-0.4-1-1-1H3c-0.6,0-1,0.4-1,1s0.4,1,1,1h3C6.6,17,7,16.6,7,16z"/>
      <path d="M8.2,22.4l-2.1,2.1c-0.4,0.4-0.4,1,0,1.4c0.2,0.2,0.5,0.3,0.7,0.3s0.5-0.1,0.7-0.3l2.1-2.1c0.4-0.4,0.4-1,0-1.4
      S8.6,22,8.2,22.4z"/>
      <path d="M16,25c-0.6,0-1,0.4-1,1v3c0,0.6,0.4,1,1,1s1-0.4,1-1v-3C17,25.4,16.6,25,16,25z"/>
      <path d="M23.8,22.4c-0.4-0.4-1-0.4-1.4,0s-0.4,1,0,1.4l2.1,2.1c0.2,0.2,0.5,0.3,0.7,0.3s0.5-0.1,0.7-0.3c0.4-0.4,0.4-1,0-1.4
      L23.8,22.4z"/>
      <path d="M29,15h-3c-0.6,0-1,0.4-1,1s0.4,1,1,1h3c0.6,0,1-0.4,1-1S29.6,15,29,15z"/>
      <path d="M23.1,9.9c0.3,0,0.5-0.1,0.7-0.3l2.1-2.1c0.4-0.4,0.4-1,0-1.4s-1-0.4-1.4,0l-2.1,2.1c-0.4,0.4-0.4,1,0,1.4
      C22.6,9.8,22.8,9.9,23.1,9.9z"/>
    </svg>
  )
}
// MoonIcon based on icon from svgrepo.com, made by wishforge-games
export function MoonIcon({ size = 18, className }: IconProps) {
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} className={className} aria-hidden="true" fill="currentColor">
      <path d="M31,15h-3.1c0-0.3-0.1-0.7-0.1-1H29c0.6,0,1-0.4,1-1s-0.4-1-1-1h-1.6c-2-6.3-8.6-10.1-15.2-8.7c-0.2,0.1-0.5,0.1-0.7,0.2
      l-0.1,0c-0.4,0.1-0.7,0.5-0.7,1c0,0.2,0.1,0.4,0.2,0.6c3.6,0.5,6.4,3.3,7.1,6.9H6c-0.6,0-1,0.4-1,1s0.4,1,1,1h12
      c0,0.3-0.1,0.7-0.1,1H1c-0.6,0-1,0.4-1,1s0.4,1,1,1h16.2c-0.2,0.3-0.3,0.7-0.5,1H11c-0.6,0-1,0.4-1,1s0.4,1,1,1h4
      c-1.5,1.2-3.4,2-5.5,2c-2.4,0-4.5-1-6-2.5c-0.1,0-0.2,0.1-0.2,0.1c-0.4,0.3-0.5,0.7-0.3,1.2c2,5.1,6.8,8.3,12,8.3
      c1,0,1.9-0.1,2.9-0.3c3.4-0.8,6.3-2.8,8.1-5.7c0.6-0.9,1-1.9,1.4-3H28c0.6,0,1-0.4,1-1s-0.4-1-1-1h-0.2c0.1-0.3,0.1-0.7,0.1-1h3
      c0.6,0,1-0.4,1-1S31.6,15,31,15z M20,12h6c0.6,0,1,0.4,1,1s-0.4,1-1,1h-6c-0.6,0-1-0.4-1-1S19.4,12,20,12z M26,20h-8
      c-0.6,0-1-0.4-1-1s0.4-1,1-1h8c0.6,0,1,0.4,1,1S26.6,20,26,20z M27,17h-8c-0.6,0-1-0.4-1-1s0.4-1,1-1h8c0.6,0,1,0.4,1,1
      S27.6,17,27,17z"/>
    </svg>
  )
}

// AutoIcon from svgrepo.com, made by wishforge-games
export function AutoIcon({ size = 18, className }: IconProps) {
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} className={className} aria-hidden="true" fill="currentColor">
      <path d="M8.2,9.6c0.2,0.2,0.5,0.3,0.7,0.3s0.5-0.1,0.7-0.3c0.4-0.4,0.4-1,0-1.4L7.5,6.1c-0.4-0.4-1-0.4-1.4,0s-0.4,1,0,1.4L8.2,9.6
      z"/>
      <path d="M7,16c0-0.6-0.4-1-1-1H3c-0.6,0-1,0.4-1,1s0.4,1,1,1h3C6.6,17,7,16.6,7,16z"/>
      <path d="M8.2,22.4l-2.1,2.1c-0.4,0.4-0.4,1,0,1.4c0.2,0.2,0.5,0.3,0.7,0.3s0.5-0.1,0.7-0.3l2.1-2.1c0.4-0.4,0.4-1,0-1.4
      S8.6,22,8.2,22.4z"/>
      <path d="M29.4,16.2c-0.4-0.2-0.9-0.1-1.2,0.3c-0.8,1-2,1.5-3.2,1.5c-2.3,0-4.3-1.9-4.3-4.3c0-1.6,0.9-3,2.3-3.8
      c0.4-0.2,0.6-0.7,0.5-1.1C23.4,8.4,23,8,22.5,8c-0.1,0-0.3,0-0.4,0c-1.9,0-3.7,0.7-5.1,1.8V3c0-0.6-0.4-1-1-1s-1,0.4-1,1v5.1
      c-3.9,0.5-7,3.9-7,7.9s3.1,7.4,7,7.9V29c0,0.6,0.4,1,1,1s1-0.4,1-1v-6.8c1.4,1.2,3.2,1.8,5.1,1.8c4,0,7.3-2.9,7.9-6.8
      C30.1,16.8,29.8,16.3,29.4,16.2z M17,20c0,0.6-0.4,1-1,1s-1-0.4-1-1v-8c0-0.6,0.4-1,1-1s1,0.4,1,1V20z"/>
    </svg>
  )
}
