import { fa } from '@/i18n/fa';
import { QR_QUIET_ZONE, qrPath, qrSize } from './installQr';

/**
 * The published address as a code the phone camera can read. Drawn from the
 * frozen module rows as one SVG path: no image file, no library at runtime, and
 * it stays sharp in any size (printed or on screen).
 */
export function SiteQrCode({ className }: { className?: string }) {
  const size = qrSize() + QR_QUIET_ZONE * 2;
  return (
    <svg
      viewBox={`${-QR_QUIET_ZONE} ${-QR_QUIET_ZONE} ${size} ${size}`}
      className={className}
      role="img"
      aria-label={fa.settings.installQrAria}
      shapeRendering="crispEdges"
    >
      <rect x={-QR_QUIET_ZONE} y={-QR_QUIET_ZONE} width={size} height={size} fill="#ffffff" />
      <path d={qrPath()} fill="#111827" />
    </svg>
  );
}
