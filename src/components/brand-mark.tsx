import { cn } from '@cbrl/design'

type BrandMarkProps = {
  className?: string
}

/** App symbol. Same artwork as `src/app/icon.svg`; decorative next to the name. */
export function BrandMark({ className }: BrandMarkProps) {
  return (
    <svg
      viewBox="0 0 512 512"
      aria-hidden="true"
      focusable="false"
      className={cn('size-6 shrink-0', className)}
    >
      <rect width="512" height="512" rx="116" fill="#0B5D4B" />
      <rect x="112" y="140" width="288" height="252" rx="44" fill="#F3FFF6" />
      <rect x="172" y="108" width="30" height="66" rx="15" fill="#C6F36B" />
      <rect x="310" y="108" width="30" height="66" rx="15" fill="#C6F36B" />
      <circle cx="186" cy="214" r="12" fill="#0B5D4B" opacity=".35" />
      <circle cx="236" cy="214" r="12" fill="#0B5D4B" opacity=".35" />
      <circle cx="286" cy="214" r="12" fill="#0B5D4B" opacity=".35" />
      <circle cx="336" cy="214" r="12" fill="#0B5D4B" opacity=".35" />
      <path
        d="M112 300C176 248 238 344 310 290S382 262 400 276V348A44 44 0 0 1 356 392H156A44 44 0 0 1 112 348Z"
        fill="#C6F36B"
      />
      <path
        d="M112 300C176 248 238 344 310 290S382 262 400 276"
        fill="none"
        stroke="#0B5D4B"
        strokeWidth="14"
        strokeLinecap="round"
      />
    </svg>
  )
}
