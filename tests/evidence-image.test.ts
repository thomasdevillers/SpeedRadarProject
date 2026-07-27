import { describe, expect, it } from "vitest";
import { buildEvidenceBanner } from "@/lib/evidence-image";
import type { RadarEvent } from "@/lib/types";

const event: RadarEvent = {
  id: "event-1",
  deviceEventId: "abc-123",
  deviceId: "device-1",
  deviceName: "RSR-0001",
  organizationName: "Example Logistics",
  siteName: "North gate",
  capturedAt: "2026-07-27T08:15:30.000Z",
  speedKph: 96,
  speedLimitKph: 60,
  overspeedKph: 36,
  plate: "CA 482 719",
  plateRegion: "ZA",
  plateScore: 0.94,
  plateBox: null,
  photoPath: "events/evidence.jpg",
  photoUrl: "https://example.com/evidence.jpg",
  photoStatus: "uploaded",
  processingStatus: "complete",
  emailStatus: "delivered",
};

describe("buildEvidenceBanner", () => {
  it("includes the important event details in the rendered image overlay", () => {
    const banner = buildEvidenceBanner(event, 1600, 300).toString();

    expect(banner).toContain("96");
    expect(banner).toContain("60 km/h");
    expect(banner).toContain("+36 km/h");
    expect(banner).toContain("CA 482 719");
    expect(banner).toContain("27 July 2026");
    expect(banner).toContain("RSR-0001 · North gate");
    expect(banner).toContain("EVENT ABC-123");
  });

  it("escapes user-controlled labels before adding them to SVG", () => {
    const banner = buildEvidenceBanner({ ...event, siteName: "Gate <North> & East" }, 1600, 300).toString();

    expect(banner).toContain("Gate &lt;North&gt; &amp; East");
  });
});
