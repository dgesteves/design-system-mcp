/** The mark: four design-system tiles, one of them checked. Same artwork as app/icon.svg. */
export function LogoMark({ className = 'size-7' }: { className?: string }) {
  return (
    <svg viewBox="0 0 512 512" className={className} aria-hidden="true">
      <rect width="512" height="512" rx="112" fill="#11161b" />
      <rect x="105" y="105" width="136" height="136" rx="32" fill="#22d3ee" />
      <rect
        x="277"
        y="111"
        width="124"
        height="124"
        rx="26"
        fill="#14181d"
        stroke="#353c47"
        strokeWidth="12"
      />
      <rect
        x="111"
        y="277"
        width="124"
        height="124"
        rx="26"
        fill="#14181d"
        stroke="#353c47"
        strokeWidth="12"
      />
      <rect
        x="271"
        y="271"
        width="136"
        height="136"
        rx="32"
        fill="#14181d"
        stroke="#22d3ee"
        strokeWidth="12"
      />
      <path
        d="M 305 341 L 329 365 L 375 317"
        fill="none"
        stroke="#22d3ee"
        strokeWidth="18"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
