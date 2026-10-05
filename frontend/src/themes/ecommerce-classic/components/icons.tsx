/**
 * Inline stroke icons for the classic storefront chrome.
 * Kept local (no icon-font / lucide alias drift) so header, cards and PDP rail
 * render identically across builds.
 */
import type { SVGProps } from "react"

type IconProps = SVGProps<SVGSVGElement> & { size?: number }

function Svg({ size = 20, children, ...rest }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      {children}
    </svg>
  )
}

export const IconSearch = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
  </Svg>
)
export const IconUser = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="8" r="4" />
    <path d="M4.5 20.5c1.4-3.6 4.2-5.5 7.5-5.5s6.1 1.9 7.5 5.5" />
  </Svg>
)
export const IconHeart = (p: IconProps & { filled?: boolean }) => {
  const { filled, ...rest } = p
  return (
    <Svg {...rest}>
      <path
        d="M12 20.3s-7.8-4.6-7.8-10.3A4.4 4.4 0 0 1 12 7.4a4.4 4.4 0 0 1 7.8 2.6c0 5.7-7.8 10.3-7.8 10.3Z"
        fill={filled ? "currentColor" : "none"}
      />
    </Svg>
  )
}
export const IconStar = (p: IconProps) => (
  <svg width={p.size ?? 14} height={p.size ?? 14} viewBox="0 0 24 24" aria-hidden="true" className={p.className}>
    <path
      fill="#f9bc00"
      d="m12 2.8 2.8 5.8 6.3.9-4.6 4.4 1.1 6.3L12 17.2l-5.6 3 1.1-6.3L2.9 9.5l6.3-.9L12 2.8Z"
    />
  </svg>
)
export const IconMenu = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 7h16M4 12h16M4 17h10" />
  </Svg>
)
export const IconHome = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-4.5v-6h-5v6H5a1 1 0 0 1-1-1v-9.5Z" />
  </Svg>
)
export const IconBag = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5 8h14l-1.2 12.1a1 1 0 0 1-1 .9H7.2a1 1 0 0 1-1-.9L5 8Z" />
    <path d="M9 10V7a3 3 0 0 1 6 0v3" />
  </Svg>
)
export const IconBook = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3V4Z" />
    <path d="M5 17a3 3 0 0 1 3-3h11M9 8h6" />
  </Svg>
)
export const IconQuestion = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M9.6 9.3a2.5 2.5 0 0 1 4.8.9c0 1.7-2.4 2-2.4 3.6M12 17h.01" />
  </Svg>
)
export const IconMail = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3.5" y="5.5" width="17" height="13" rx="2" />
    <path d="m4 7 8 6 8-6" />
  </Svg>
)
export const IconInfo = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 11v5M12 8h.01" />
  </Svg>
)
export const IconPercent = (p: IconProps) => (
  <Svg {...p}>
    <path d="m7 17 10-10" />
    <circle cx="7.5" cy="7.5" r="1.8" />
    <circle cx="16.5" cy="16.5" r="1.8" />
  </Svg>
)
export const IconChevronLeft = (p: IconProps) => (
  <Svg {...p}>
    <path d="m14.5 6-6 6 6 6" />
  </Svg>
)
export const IconChevronRight = (p: IconProps) => (
  <Svg {...p}>
    <path d="m9.5 6 6 6-6 6" />
  </Svg>
)
export const IconChevronDown = (p: IconProps) => (
  <Svg {...p}>
    <path d="m6 9.5 6 6 6-6" />
  </Svg>
)
export const IconArrowRight = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </Svg>
)
export const IconShare = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="18" cy="5.5" r="2.5" />
    <circle cx="6" cy="12" r="2.5" />
    <circle cx="18" cy="18.5" r="2.5" />
    <path d="m8.2 10.8 7.6-4.1M8.2 13.2l7.6 4.1" />
  </Svg>
)
export const IconBell = (p: IconProps) => (
  <Svg {...p}>
    <path d="M6 16.5V11a6 6 0 1 1 12 0v5.5l1.5 1.5h-15L6 16.5Z" />
    <path d="M10 20.5a2 2 0 0 0 4 0" />
  </Svg>
)
export const IconCompare = (p: IconProps) => (
  <Svg {...p}>
    <path d="M7 4v13M7 17l-3-3M7 17l3-3M17 20V7M17 7l-3 3M17 7l3 3" />
  </Svg>
)
export const IconChart = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 19h16" />
    <path d="m5 15 4-4 3 3 6-7" />
  </Svg>
)
export const IconTruck = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 6h11v10H3zM14 9h4l3 3.5V16h-7" />
    <circle cx="7" cy="17.5" r="1.8" />
    <circle cx="17.5" cy="17.5" r="1.8" />
  </Svg>
)
export const IconCard = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3" y="5.5" width="18" height="13" rx="2" />
    <path d="M3 10h18M7 15h3" />
  </Svg>
)
export const IconShield = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 3.5 19 6v5.5c0 4.4-3 7.6-7 9-4-1.4-7-4.6-7-9V6l7-2.5Z" />
    <path d="m9 12 2 2 4-4" />
  </Svg>
)
export const IconBadge = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="10" r="6" />
    <path d="m8.5 14.8-1.5 6 5-2.3 5 2.3-1.5-6" />
  </Svg>
)
export const IconPin = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 21s-6.5-6-6.5-11a6.5 6.5 0 0 1 13 0c0 5-6.5 11-6.5 11Z" />
    <circle cx="12" cy="10" r="2.3" />
  </Svg>
)
export const IconCheck = (p: IconProps) => (
  <Svg {...p}>
    <path d="m5 12.5 4.5 4.5L19 7.5" />
  </Svg>
)
export const IconPhone = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5 4h3.5l1.5 4-2 1.3a10 10 0 0 0 6.7 6.7l1.3-2 4 1.5V19a1.5 1.5 0 0 1-1.5 1.5A15.5 15.5 0 0 1 3.5 5.5 1.5 1.5 0 0 1 5 4Z" />
  </Svg>
)
export const IconClock = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7.5V12l3 2" />
  </Svg>
)
export const IconSort = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 7h11M4 12h8M4 17h5M18 5v14M18 19l-2.5-2.5M18 19l2.5-2.5" />
  </Svg>
)
export const IconFilter = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 6h16l-6 7v5l-4 2v-7L4 6Z" />
  </Svg>
)
export const IconMinus = (p: IconProps) => (
  <Svg {...p}>
    <path d="M6 12h12" />
  </Svg>
)
export const IconPlus = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 6v12M6 12h12" />
  </Svg>
)
export const IconFire = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 21c-3.9 0-6.5-2.6-6.5-6.1 0-3.3 2.4-5.2 3.6-7.9.5 1.9 1.6 2.9 2.5 3.3.1-2.6 1.4-5.2 3.9-7.3-.3 3 1.3 4.7 2.6 6.6 1 1.4 1.4 2.7 1.4 4.2C19.5 18.1 16 21 12 21Z" />
  </Svg>
)
