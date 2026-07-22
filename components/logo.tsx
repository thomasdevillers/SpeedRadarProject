import Link from "next/link";

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <Link href="/dashboard" className="brand" aria-label="RoadSafe radar dashboard">
      <span className="brand-mark" aria-hidden="true"><i /><i /><i /></span>
      {!compact && (
        <span className="brand-copy">
          <strong>ROADSAFE</strong>
          <small>RADAR CONTROL</small>
        </span>
      )}
    </Link>
  );
}

