"use client";

import { useMemo, useState } from "react";
import { EventTable } from "@/components/event-table";
import type { RadarEvent } from "@/lib/types";

export function EventExplorer({ events }: { events: RadarEvent[] }) {
  const [query, setQuery] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [type, setType] = useState("all");
  const filtered = useMemo(() => events.filter((event) => {
    const term = query.trim().toLowerCase();
    if (term && ![event.plate, event.deviceName, event.siteName, event.deviceEventId].some((value) => value?.toLowerCase().includes(term))) return false;
    const captured = new Date(event.capturedAt).getTime();
    if (from && captured < new Date(`${from}T00:00:00`).getTime()) return false;
    if (to && captured > new Date(`${to}T23:59:59.999`).getTime()) return false;
    if (type === "overspeed" && event.overspeedKph <= 0) return false;
    if (type === "photos" && event.photoStatus !== "uploaded") return false;
    return true;
  }), [events, query, from, to, type]);
  return <><div className="filter-bar"><label><span>Search this page</span><input type="search" placeholder="Plate, device or site…" value={query} onChange={(event) => setQuery(event.target.value)} /></label><label><span>From</span><input type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></label><label><span>To</span><input type="date" value={to} onChange={(event) => setTo(event.target.value)} /></label><label><span>Event type</span><select value={type} onChange={(event) => setType(event.target.value)}><option value="all">All vehicles</option><option value="overspeed">Overspeed only</option><option value="photos">With photographs</option></select></label><button type="button" className="button secondary" onClick={() => { setQuery(""); setFrom(""); setTo(""); setType("all"); }}>Clear</button></div><p className="panel-copy" aria-live="polite">Showing {filtered.length} of {events.length} events on this page.</p><EventTable events={filtered} /></>;
}
