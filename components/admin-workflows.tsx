"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, MapPin, RadioTower } from "lucide-react";
import { toLocalDateTimeInput } from "@/lib/client-time";
import { formatDateTime } from "@/lib/format";
import type { DeviceAssignmentSummary, DeviceSummary, OrganizationSummary } from "@/lib/types";

export function InviteClientUserForm({ organizations }: { organizations: OrganizationSummary[] }) {
  const router = useRouter();
  const [message, setMessage] = useState("");

  async function submit(formData: FormData) {
    setMessage("Sending invitation…");
    const payload = Object.fromEntries(formData.entries());
    if (process.env.NEXT_PUBLIC_DEMO_MODE === "true") {
      await new Promise((resolve) => window.setTimeout(resolve, 450));
      setMessage("Invitation sent");
      router.refresh();
      return;
    }
    const response = await fetch("/api/admin/invitations", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
    const result = await response.json();
    setMessage(response.ok ? `Invitation sent to ${result.email}` : result.error || "Invitation failed");
    if (response.ok) router.refresh();
  }

  return (
    <form action={submit} className="workflow-form">
      <label><span>Client</span><select name="organizationId" required>{organizations.filter((item) => item.status === "active").map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <label><span>Name</span><input name="displayName" required placeholder="Client contact" /></label>
      <label><span>Email</span><input name="email" type="email" required placeholder="contact@client.co.za" /></label>
      <label><span>Role</span><select name="role"><option value="client_viewer">Client viewer</option><option value="client_admin">Client admin</option></select></label>
      <button className="button primary" type="submit">Send invitation</button><p aria-live="polite">{message}</p>
    </form>
  );
}

interface AssignmentFormProps {
  organizations: OrganizationSummary[];
  devices: DeviceSummary[];
  assignments: DeviceAssignmentSummary[];
}

export function AssignmentForm({ organizations, devices, assignments }: AssignmentFormProps) {
  const router = useRouter();
  const activeOrganizations = useMemo(() => organizations.filter((item) => item.status === "active"), [organizations]);
  const [deviceId, setDeviceId] = useState(devices[0]?.id ?? "");
  const selectedAssignment = assignments.find((assignment) => assignment.deviceId === deviceId);
  const selectedDevice = devices.find((device) => device.id === deviceId);
  const initialOrganization = selectedAssignment && activeOrganizations.some((item) => item.id === selectedAssignment.organizationId)
    ? selectedAssignment.organizationId
    : activeOrganizations[0]?.id ?? "";
  const [organizationId, setOrganizationId] = useState(initialOrganization);
  const [siteName, setSiteName] = useState(selectedAssignment?.siteName ?? (selectedDevice?.siteName === "Unassigned" ? "" : selectedDevice?.siteName ?? ""));
  const [speedLimitKph, setSpeedLimitKph] = useState(selectedAssignment?.speedLimitKph ?? selectedDevice?.speedLimitKph ?? 60);
  const [minimumStart] = useState(() => toLocalDateTimeInput());
  const [startsAt, setStartsAt] = useState(minimumStart);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [endingId, setEndingId] = useState<string | null>(null);

  function selectDevice(nextDeviceId: string) {
    const assignment = assignments.find((item) => item.deviceId === nextDeviceId);
    const device = devices.find((item) => item.id === nextDeviceId);
    setDeviceId(nextDeviceId);
    setOrganizationId(assignment && activeOrganizations.some((item) => item.id === assignment.organizationId) ? assignment.organizationId : activeOrganizations[0]?.id ?? "");
    setSiteName(assignment?.siteName ?? (device?.siteName === "Unassigned" ? "" : device?.siteName ?? ""));
    setSpeedLimitKph(assignment?.speedLimitKph ?? device?.speedLimitKph ?? 60);
    setStartsAt(toLocalDateTimeInput());
    setMessage("");
  }

  async function submit() {
    setBusy(true);
    setMessage(selectedAssignment ? "Reassigning radar…" : "Assigning radar…");
    try {
      const currentMinute = toLocalDateTimeInput();
      const effectiveStart = startsAt < currentMinute ? currentMinute : startsAt;
      if (effectiveStart !== startsAt) setStartsAt(effectiveStart);
      const payload = { deviceId, organizationId, siteName, speedLimitKph, startsAt: new Date(effectiveStart).toISOString(), endsAt: null };
      if (process.env.NEXT_PUBLIC_DEMO_MODE === "true") {
        await new Promise((resolve) => window.setTimeout(resolve, 450));
      } else {
        const response = await fetch("/api/admin/assignments", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Assignment failed");
      }
      setMessage(selectedAssignment ? "Radar reassigned successfully." : "Radar assigned successfully.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Assignment failed");
    } finally {
      setBusy(false);
    }
  }

  async function endAssignment(assignment: DeviceAssignmentSummary) {
    const scheduled = assignment.status === "scheduled";
    const prompt = scheduled
      ? `Cancel the scheduled assignment of ${assignment.deviceName} to ${assignment.organizationName}?`
      : `Unassign ${assignment.deviceName} from ${assignment.organizationName}?`;
    if (!window.confirm(prompt)) return;
    setEndingId(assignment.id);
    setMessage(scheduled ? "Cancelling scheduled assignment…" : "Unassigning radar…");
    try {
      if (process.env.NEXT_PUBLIC_DEMO_MODE === "true") {
        await new Promise((resolve) => window.setTimeout(resolve, 450));
      } else {
        const response = await fetch(`/api/admin/assignments/${assignment.id}`, { method: "DELETE" });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Unable to end assignment");
      }
      setMessage(scheduled ? "Scheduled assignment cancelled." : "Radar unassigned successfully.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to end assignment");
    } finally {
      setEndingId(null);
    }
  }

  const formUnavailable = !devices.length || !activeOrganizations.length;

  return (
    <div className="assignment-workspace">
      <form action={submit} className="assignment-form">
        <div className="assignment-form-intro">
          <strong>{selectedAssignment ? "Change this radar’s rental" : "Set up a new rental"}</strong>
          <span>{selectedAssignment ? "The current assignment will close when the new one starts—no duplicate or overlap." : "The assignment becomes active at the selected start time."}</span>
        </div>
        <label className="assignment-device"><span>Radar</span><select name="deviceId" required value={deviceId} onChange={(event) => selectDevice(event.target.value)} disabled={!devices.length}>{devices.map((device) => <option key={device.id} value={device.id}>{device.name} · {device.serialNumber}</option>)}</select></label>
        <label className="assignment-client"><span>Client</span><select name="organizationId" required value={organizationId} onChange={(event) => setOrganizationId(event.target.value)} disabled={!activeOrganizations.length}>{activeOrganizations.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label className="assignment-site"><span>Site name</span><input name="siteName" required placeholder="Main Road · Northbound" value={siteName} onChange={(event) => setSiteName(event.target.value)} /></label>
        <label className="assignment-limit"><span>Limit (km/h)</span><input name="speedLimitKph" type="number" min="10" max="180" value={speedLimitKph} onChange={(event) => setSpeedLimitKph(Number(event.target.value))} required /></label>
        <label className="assignment-start"><span>Starts</span><input name="startsAt" type="datetime-local" min={minimumStart} value={startsAt} onChange={(event) => setStartsAt(event.target.value)} required /></label>
        <button className="button primary assignment-submit" type="submit" disabled={formUnavailable || busy}>{busy ? "Saving…" : selectedAssignment ? "Reassign radar" : "Assign radar"}</button>
        {formUnavailable && <p className="assignment-message">Provision a radar and create an active client before making an assignment.</p>}
        {!formUnavailable && <p className="assignment-message" aria-live="polite">{message}</p>}
      </form>

      <div className="assignment-register">
        <div className="assignment-register-head">
          <div><span className="eyebrow">Rental register</span><strong>Current & scheduled</strong></div>
          <span>{assignments.length} {assignments.length === 1 ? "assignment" : "assignments"}</span>
        </div>
        {assignments.length ? (
          <div className="assignment-list">
            {assignments.map((assignment) => {
              const scheduled = assignment.status === "scheduled";
              return (
                <div className="assignment-row" key={assignment.id}>
                  <div className="assignment-radar"><RadioTower size={18} /><span><strong>{assignment.deviceName}</strong><small>{assignment.serialNumber}</small></span></div>
                  <div><span className="assignment-row-label">Client</span><strong>{assignment.organizationName}</strong></div>
                  <div><span className="assignment-row-label"><MapPin size={12} /> Site</span><strong>{assignment.siteName}</strong></div>
                  <div><span className="assignment-row-label"><CalendarClock size={12} /> {scheduled ? "Scheduled" : "Active since"}</span><strong>{formatDateTime(assignment.startsAt)}</strong></div>
                  <div className="assignment-limit-chip"><strong>{assignment.speedLimitKph}</strong><span>km/h</span></div>
                  <button className="button secondary small" type="button" disabled={endingId !== null} onClick={() => endAssignment(assignment)}>{endingId === assignment.id ? "Working…" : scheduled ? "Cancel" : "Unassign"}</button>
                </div>
              );
            })}
          </div>
        ) : <p className="assignment-empty">No radar rentals are active or scheduled.</p>}
      </div>
    </div>
  );
}
