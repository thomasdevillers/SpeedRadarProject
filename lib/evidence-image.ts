import type { RadarEvent } from "@/lib/types";

function escapeXml(value: string): string {
  return value.replace(/[<>&'"]/g, (character) => ({
    "<": "&lt;",
    ">": "&gt;",
    "&": "&amp;",
    "'": "&apos;",
    '"': "&quot;",
  })[character] ?? character);
}

function truncate(value: string, maximumLength: number): string {
  return value.length > maximumLength ? `${value.slice(0, maximumLength - 1)}…` : value;
}

function formatEvidenceDate(value: string): string {
  return new Intl.DateTimeFormat("en-ZA", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZone: "Africa/Johannesburg",
    timeZoneName: "short",
  }).format(new Date(value));
}

export function buildEvidenceBanner(event: RadarEvent, width: number, height: number): Buffer {
  const plate = event.plate ?? "PENDING";
  const eventId = event.deviceEventId.toUpperCase();
  const context = `${event.deviceName} · ${event.siteName}`;
  const organisation = event.organizationName ?? "RoadSafe internal";

  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <rect width="${width}" height="${height}" fill="#111817"/>
    <rect width="12" height="${height}" fill="#ff642f"/>
    <text x="52" y="52" fill="#8fa09c" font-family="Arial, sans-serif" font-size="20" font-weight="700" letter-spacing="2">ROADSAFE VERIFIED EVIDENCE</text>

    <text x="52" y="125" fill="#ffffff" font-family="Arial, sans-serif" font-size="60" font-weight="800">${event.speedKph}</text>
    <text x="143" y="124" fill="#b9c3c0" font-family="Arial, sans-serif" font-size="23">km/h</text>
    <text x="52" y="164" fill="#8fa09c" font-family="Arial, sans-serif" font-size="19">DETECTED SPEED</text>

    <text x="300" y="104" fill="#8fa09c" font-family="Arial, sans-serif" font-size="18">ACTIVE LIMIT</text>
    <text x="300" y="145" fill="#ffffff" font-family="Arial, sans-serif" font-size="34" font-weight="700">${event.speedLimitKph} km/h</text>
    <text x="500" y="104" fill="#8fa09c" font-family="Arial, sans-serif" font-size="18">OVER LIMIT</text>
    <text x="500" y="145" fill="#ff642f" font-family="Arial, sans-serif" font-size="34" font-weight="700">+${event.overspeedKph} km/h</text>

    <text x="760" y="104" fill="#8fa09c" font-family="Arial, sans-serif" font-size="18">LICENCE PLATE</text>
    <rect x="760" y="118" width="360" height="57" rx="4" fill="#f7f4e8"/>
    <text x="940" y="158" text-anchor="middle" fill="#111817" font-family="monospace" font-size="31" font-weight="700" letter-spacing="3">${escapeXml(truncate(plate, 18))}</text>

    <line x1="52" y1="198" x2="${width - 52}" y2="198" stroke="#34413f"/>
    <text x="52" y="239" fill="#ffffff" font-family="Arial, sans-serif" font-size="23" font-weight="700">${escapeXml(formatEvidenceDate(event.capturedAt))}</text>
    <text x="52" y="272" fill="#8fa09c" font-family="Arial, sans-serif" font-size="19">${escapeXml(truncate(context, 70))}</text>
    <text x="${width - 52}" y="239" text-anchor="end" fill="#ffffff" font-family="monospace" font-size="19">EVENT ${escapeXml(eventId)}</text>
    <text x="${width - 52}" y="272" text-anchor="end" fill="#8fa09c" font-family="Arial, sans-serif" font-size="18">${escapeXml(truncate(organisation, 42))}</text>
  </svg>`);
}
