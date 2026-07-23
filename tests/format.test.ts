import { describe, expect, it } from "vitest";
import { toLocalDateTimeInput } from "@/lib/client-time";
import { formatDateTime, formatNumber, timeAgo } from "@/lib/format";

describe("portal formatting", () => {
  it("formats South African numbers", () => {
    expect(formatNumber(1283)).toMatch(/1[\s,]283/);
  });

  it("formats an invalid timestamp defensively", () => {
    expect(timeAgo(null)).toBe("never");
  });

  it("produces a South African date and time", () => {
    const value = formatDateTime("2026-07-22T10:30:00.000Z");
    expect(value).toContain("2026");
    expect(value).toMatch(/12:30|12:30:00/);
  });

  it("defaults assignment starts to the current minute instead of five minutes ahead", () => {
    const now = new Date();
    const inputTime = new Date(toLocalDateTimeInput(now));
    now.setSeconds(0, 0);
    expect(inputTime.getTime()).toBe(now.getTime());
  });
});
