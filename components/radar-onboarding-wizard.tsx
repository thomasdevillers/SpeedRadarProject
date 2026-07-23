"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Building2,
  Camera,
  Check,
  Circle,
  Clipboard,
  ExternalLink,
  Gauge,
  MapPinned,
  RadioTower,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Terminal,
  UserPlus,
  Wifi,
} from "lucide-react";
import { toLocalDateTimeInput } from "@/lib/client-time";
import type { DeviceSummary, OrganizationSummary } from "@/lib/types";

const steps = [
  { title: "Client", detail: "Account & access", icon: Building2 },
  { title: "Hardware", detail: "Identity & token", icon: RadioTower },
  { title: "Assignment", detail: "Site & operating rule", icon: MapPinned },
  { title: "Pi setup", detail: "Install & activate", icon: Terminal },
  { title: "Commission", detail: "Live field checks", icon: Activity },
  { title: "Complete", detail: "Handover record", icon: ShieldCheck },
];

type OnboardingStatus = {
  device: {
    id: string;
    name: string;
    serialNumber: string;
    activatedAt: string | null;
    lastSeenAt: string | null;
    softwareVersion: string;
    online: boolean;
  };
  assignment: {
    organizationId: string;
    organizationName: string;
    siteName: string;
    speedLimitKph: number;
  } | null;
  heartbeat: {
    radarConnected: boolean;
    cameraConnected: boolean;
    radarServiceActive: boolean;
    queueDepth: number;
    tailscaleIp: string | null;
    lastError: string | null;
    recordedAt?: string;
  } | null;
  cameraTest: {
    id: string;
    status: string;
    error: string | null;
    requestedAt: string;
    completedAt: string | null;
    photoUrl: string | null;
  } | null;
  latestEvent: {
    id: string;
    captured_at: string;
    speed_kph: number;
    photo_status: string;
    processing_status: string;
    email_status: string;
  } | null;
};

function CopyBlock({ label, value, secret = false }: { label: string; value: string; secret?: boolean }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }
  return (
    <div className={`onboarding-command${secret ? " secret" : ""}`}>
      <div><span>{label}</span>{secret && <small>One-time credential</small>}</div>
      <pre><code>{value}</code></pre>
      <button type="button" onClick={copy} aria-label={`Copy ${label}`}><Clipboard size={15} /> {copied ? "Copied" : "Copy"}</button>
    </div>
  );
}

function CheckItem({ ok, title, detail }: { ok: boolean; title: string; detail: string }) {
  return (
    <div className={`commission-check ${ok ? "passed" : "waiting"}`}>
      <span>{ok ? <Check size={17} /> : <Circle size={14} />}</span>
      <div><strong>{title}</strong><small>{detail}</small></div>
    </div>
  );
}

export function RadarOnboardingWizard({
  initialOrganizations,
  existingDevices,
}: {
  initialOrganizations: OrganizationSummary[];
  existingDevices: DeviceSummary[];
}) {
  const demoMode = process.env.NEXT_PUBLIC_DEMO_MODE === "true";
  const [step, setStep] = useState(0);
  const [furthestStep, setFurthestStep] = useState(0);
  const [organizations, setOrganizations] = useState(initialOrganizations);
  const [clientMode, setClientMode] = useState<"existing" | "new">(initialOrganizations.length ? "existing" : "new");
  const [organizationId, setOrganizationId] = useState(initialOrganizations[0]?.id ?? "");
  const [organizationName, setOrganizationName] = useState(initialOrganizations[0]?.name ?? "");
  const [newClientName, setNewClientName] = useState("");
  const [inviteClient, setInviteClient] = useState(false);
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactRole, setContactRole] = useState<"client_admin" | "client_viewer">("client_admin");
  const [alertEmail, setAlertEmail] = useState("");
  const [deviceMode, setDeviceMode] = useState<"new" | "resume">("new");
  const [resumeDeviceId, setResumeDeviceId] = useState(existingDevices[0]?.id ?? "");
  const [deviceId, setDeviceId] = useState("");
  const [deviceName, setDeviceName] = useState("");
  const [serialNumber, setSerialNumber] = useState("");
  const [activationToken, setActivationToken] = useState("");
  const [siteName, setSiteName] = useState("");
  const [speedLimitKph, setSpeedLimitKph] = useState(60);
  const [startsAt, setStartsAt] = useState(() => toLocalDateTimeInput());
  const [status, setStatus] = useState<OnboardingStatus | null>(null);
  const [demoCameraComplete, setDemoCameraComplete] = useState(false);
  const [manualChecks, setManualChecks] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const selectedOrganization = organizations.find((organization) => organization.id === organizationId);
  const selectedResumeDevice = existingDevices.find((device) => device.id === resumeDeviceId);
  const coreReady = Boolean(
    status?.device.activatedAt
    && status.device.online
    && status.assignment
    && status.heartbeat?.radarServiceActive
    && status.heartbeat.radarConnected
    && status.heartbeat.cameraConnected
    && status.cameraTest?.status === "completed"
    && status.cameraTest.photoUrl
  );

  function goTo(nextStep: number) {
    setStep(nextStep);
    setFurthestStep((current) => Math.max(current, nextStep));
    setMessage("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function api(path: string, options?: RequestInit) {
    const response = await fetch(path, options);
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "The request could not be completed");
    return result;
  }

  const demoStatus = useCallback((cameraComplete = demoCameraComplete): OnboardingStatus => ({
    device: {
      id: deviceId || "00000000-0000-4000-8000-000000000099",
      name: deviceName || "RSR-DEMO-NEW",
      serialNumber: serialNumber || "RSR-DEMO-2026",
      activatedAt: new Date().toISOString(),
      lastSeenAt: new Date().toISOString(),
      softwareVersion: "0.1.0-shadow",
      online: true,
    },
    assignment: {
      organizationId,
      organizationName: organizationName || selectedOrganization?.name || "RoadSafe Pilot",
      siteName: siteName || "Commissioning lane",
      speedLimitKph,
    },
    heartbeat: {
      radarConnected: true,
      cameraConnected: true,
      radarServiceActive: true,
      queueDepth: 0,
      tailscaleIp: "100.64.0.22",
      lastError: null,
    },
    cameraTest: cameraComplete ? {
      id: "demo-onboarding-camera",
      status: "completed",
      error: null,
      requestedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      photoUrl: "/api/demo-photo?variant=3",
    } : null,
    latestEvent: null,
  }), [demoCameraComplete, deviceId, deviceName, organizationId, organizationName, selectedOrganization?.name, serialNumber, siteName, speedLimitKph]);

  const refreshStatus = useCallback(async () => {
    if (!deviceId) return;
    try {
      if (demoMode) {
        setStatus(demoStatus());
        return;
      }
      const response = await fetch(`/api/admin/devices/${deviceId}/onboarding-status`, { cache: "no-store" });
      if (!response.ok) return;
      setStatus(await response.json());
    } catch {
      // Polling remains silent; the manual refresh button surfaces a clear state.
    }
  }, [demoMode, demoStatus, deviceId]);

  useEffect(() => {
    if (!deviceId || step < 3 || step > 4) return;
    const initial = window.setTimeout(() => void refreshStatus(), 0);
    const timer = window.setInterval(() => void refreshStatus(), 5000);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(timer);
    };
  }, [deviceId, refreshStatus, step]);

  async function saveClient(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage(clientMode === "new" ? "Creating client account…" : "Saving client setup…");
    try {
      let nextOrganizationId = organizationId;
      let nextOrganizationName = selectedOrganization?.name ?? organizationName;
      if (clientMode === "new") {
        if (demoMode) {
          nextOrganizationId = "00000000-0000-4000-8000-000000000088";
          nextOrganizationName = newClientName;
        } else {
          const created = await api("/api/admin/organizations", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ name: newClientName }),
          });
          nextOrganizationId = created.id;
          nextOrganizationName = created.name;
        }
        setOrganizations((current) => [...current, { id: nextOrganizationId, name: nextOrganizationName, status: "active", memberCount: 0, deviceCount: 0 }]);
        setOrganizationId(nextOrganizationId);
        setClientMode("existing");
        setNewClientName("");
      }
      setOrganizationName(nextOrganizationName);

      if (inviteClient && !demoMode) {
        await api("/api/admin/invitations", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ organizationId: nextOrganizationId, displayName: contactName, email: contactEmail, role: contactRole }),
        });
      }
      if (alertEmail && !demoMode) {
        await api(`/api/admin/organizations/${nextOrganizationId}/alert-recipient`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ email: alertEmail }),
        });
      }
      goTo(1);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to save the client setup");
    } finally {
      setBusy(false);
    }
  }

  async function provisionHardware(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage(deviceMode === "new" ? "Provisioning secure device identity…" : "Inspecting existing radar…");
    try {
      if (deviceMode === "new") {
        if (demoMode) {
          const id = "00000000-0000-4000-8000-000000000099";
          setDeviceId(id);
          setActivationToken(`${id}.${"demo-onboarding-token".padEnd(48, "x")}`);
        } else {
          const result = await api("/api/admin/devices", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ name: deviceName, serialNumber }),
          });
          setDeviceId(result.device.id);
          setDeviceName(result.device.name);
          setSerialNumber(result.device.serial_number);
          setActivationToken(result.activationToken);
        }
      } else {
        if (!selectedResumeDevice) throw new Error("Select a radar to resume");
        setDeviceId(selectedResumeDevice.id);
        setDeviceName(selectedResumeDevice.name);
        setSerialNumber(selectedResumeDevice.serialNumber);
        if (demoMode) {
          setActivationToken(`${selectedResumeDevice.id}.${"demo-onboarding-token".padEnd(48, "x")}`);
        } else {
          const current = await api(`/api/admin/devices/${selectedResumeDevice.id}/onboarding-status`);
          setStatus(current);
          if (!current.device.activatedAt) {
            const token = await api(`/api/admin/devices/${selectedResumeDevice.id}/activation-token`, { method: "POST" });
            setActivationToken(token.activationToken);
          } else {
            setActivationToken("");
          }
        }
      }
      goTo(2);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to provision the radar");
    } finally {
      setBusy(false);
    }
  }

  async function saveAssignment(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("Linking radar, client and site…");
    try {
      const effectiveStart = startsAt < toLocalDateTimeInput() ? toLocalDateTimeInput() : startsAt;
      setStartsAt(effectiveStart);
      if (!demoMode) {
        await api("/api/admin/assignments", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            deviceId,
            organizationId,
            siteName,
            speedLimitKph,
            startsAt: new Date(effectiveStart).toISOString(),
            endsAt: null,
          }),
        });
      }
      goTo(3);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to assign the radar");
    } finally {
      setBusy(false);
    }
  }

  async function runCameraTest() {
    setBusy(true);
    setMessage("Queueing a live camera test…");
    try {
      if (demoMode) {
        await new Promise((resolve) => window.setTimeout(resolve, 500));
        setDemoCameraComplete(true);
        setStatus(demoStatus(true));
      } else {
        await api("/api/admin/commands", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ deviceId, commandType: "capture_test", payload: {} }),
        });
        await refreshStatus();
      }
      setMessage("Camera test queued. Live checks refresh every five seconds.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to test the camera");
    } finally {
      setBusy(false);
    }
  }

  function resetWizard() {
    if (!window.confirm("Start a new onboarding session? Your current one-time token will disappear from this page.")) return;
    setStep(0);
    setFurthestStep(0);
    setDeviceId("");
    setDeviceName("");
    setSerialNumber("");
    setActivationToken("");
    setSiteName("");
    setSpeedLimitKph(60);
    setStartsAt(toLocalDateTimeInput());
    setStatus(null);
    setManualChecks({});
    setMessage("");
  }

  const commandInstall = `sudo apt update
sudo apt install -y git python3-venv python3-pip python3-dev build-essential ffmpeg libgl1 libglib2.0-0
mkdir -p /home/tomdev/Documents
cd /home/tomdev/Documents
git clone https://github.com/thomasdevillers/SpeedRadarProject.git
cd SpeedRadarProject
python3 -m venv venv
venv/bin/python -m pip install --upgrade pip setuptools wheel
venv/bin/python -m pip install -r device/requirements.txt`;
  const commandStage = `cd /home/tomdev/Documents/SpeedRadarProject/device
PYTHONPATH=. ../venv/bin/python -m unittest discover -s tests -v
sudo ./install_device.sh
sudo nano /etc/roadsafe-radar/device.env`;
  const commandActivate = `read -rsp "Paste activation token: " ROADSAFE_ACTIVATION_TOKEN
echo
sudo /home/tomdev/Documents/SpeedRadarProject/venv/bin/python \\
  /opt/roadsafe-radar/current/cloud_agent.py activate \\
  --api-url https://portal.roadsafe.co.za \\
  --token "$ROADSAFE_ACTIVATION_TOKEN" \\
  --output /etc/roadsafe-radar/device.env
unset ROADSAFE_ACTIVATION_TOKEN`;
  const commandStart = `cd /home/tomdev/Documents/SpeedRadarProject/device
sudo ./install_device.sh
sudo systemctl restart run_radar.service roadsafe-cloud-agent.service
sleep 20
systemctl --no-pager --full status run_radar.service roadsafe-cloud-agent.service`;

  const summary = useMemo(() => ({
    client: organizationName || selectedOrganization?.name || "Not selected",
    radar: deviceName || selectedResumeDevice?.name || "Not provisioned",
    serial: serialNumber || selectedResumeDevice?.serialNumber || "—",
    site: siteName || status?.assignment?.siteName || "Not assigned",
    limit: status?.assignment?.speedLimitKph ?? speedLimitKph,
  }), [deviceName, organizationName, selectedOrganization?.name, selectedResumeDevice?.name, selectedResumeDevice?.serialNumber, serialNumber, siteName, speedLimitKph, status?.assignment?.siteName, status?.assignment?.speedLimitKph]);

  return (
    <section className="onboarding-shell">
      <aside className="onboarding-rail" aria-label="Radar onboarding progress">
        <div className="onboarding-rail-head">
          <span>Commissioning rail</span>
          <strong>{Math.min(furthestStep + 1, steps.length)}/{steps.length}</strong>
        </div>
        <ol>
          {steps.map((item, index) => {
            const Icon = item.icon;
            const complete = index < step || step === 5;
            const active = index === step;
            const available = index <= furthestStep;
            return (
              <li key={item.title} className={`${complete ? "complete " : ""}${active ? "active" : ""}`}>
                <button type="button" disabled={!available} onClick={() => available && setStep(index)} aria-current={active ? "step" : undefined}>
                  <span className="onboarding-step-icon">{complete ? <Check size={17} /> : <Icon size={17} />}</span>
                  <span><strong>{item.title}</strong><small>{item.detail}</small></span>
                  <b>{String(index + 1).padStart(2, "0")}</b>
                </button>
              </li>
            );
          })}
        </ol>
        <button className="onboarding-reset" type="button" onClick={resetWizard}><RotateCcw size={15} /> Start over</button>
      </aside>

      <div className="onboarding-stage">
        <div className="onboarding-stage-bar">
          <div><span>Step {step + 1}</span><strong>{steps[step].title}</strong></div>
          <div className="onboarding-summary-mini"><span>{summary.radar}</span><b>{summary.client}</b></div>
        </div>

        {step === 0 && (
          <form className="onboarding-panel" onSubmit={saveClient}>
            <div className="onboarding-panel-title"><span className="onboarding-number">01</span><div><span className="eyebrow">Account boundary</span><h2>Choose who owns the data</h2><p>The active assignment decides exactly which client can see this radar and its evidence.</p></div></div>
            <div className="choice-cards">
              <label className={clientMode === "existing" ? "selected" : ""}><input type="radio" name="clientMode" checked={clientMode === "existing"} disabled={!organizations.length} onChange={() => setClientMode("existing")} /><Building2 /><span><strong>Existing client</strong><small>Attach the radar to an active organisation.</small></span></label>
              <label className={clientMode === "new" ? "selected" : ""}><input type="radio" name="clientMode" checked={clientMode === "new"} onChange={() => setClientMode("new")} /><UserPlus /><span><strong>Create new client</strong><small>Create the tenant before provisioning hardware.</small></span></label>
            </div>
            <div className="onboarding-fields">
              {clientMode === "existing" ? (
                <label className="field-wide"><span>Client organisation</span><select value={organizationId} onChange={(event) => { setOrganizationId(event.target.value); setOrganizationName(organizations.find((item) => item.id === event.target.value)?.name ?? ""); }} required>{organizations.map((organization) => <option key={organization.id} value={organization.id}>{organization.name}</option>)}</select></label>
              ) : (
                <label className="field-wide"><span>New client name</span><input value={newClientName} onChange={(event) => setNewClientName(event.target.value)} placeholder="Company or municipality" minLength={2} required /></label>
              )}
              <label className="onboarding-toggle field-wide"><input type="checkbox" checked={inviteClient} onChange={(event) => setInviteClient(event.target.checked)} /><span><strong>Invite a client contact now</strong><small>Client admins can change assigned radar limits and alert recipients.</small></span></label>
              {inviteClient && <>
                <label><span>Contact name</span><input value={contactName} onChange={(event) => setContactName(event.target.value)} placeholder="Operations manager" required /></label>
                <label><span>Contact email</span><input type="email" value={contactEmail} onChange={(event) => setContactEmail(event.target.value)} placeholder="contact@client.co.za" required /></label>
                <label><span>Portal role</span><select value={contactRole} onChange={(event) => setContactRole(event.target.value as "client_admin" | "client_viewer")}><option value="client_admin">Client admin</option><option value="client_viewer">Client viewer</option></select></label>
              </>}
              <label className="field-wide"><span>Internal test alert recipient <small>Optional</small></span><input type="email" value={alertEmail} onChange={(event) => setAlertEmail(event.target.value)} placeholder="operations@roadsafe.co.za" /></label>
            </div>
            <div className="onboarding-note"><ShieldCheck /><p><strong>Tenant isolation is enforced in the database.</strong> A client cannot access another organisation’s radar by changing a URL.</p></div>
            <div className="onboarding-actions"><span aria-live="polite">{message}</span><button className="button primary" type="submit" disabled={busy}>{busy ? "Saving…" : <>Continue to hardware <ArrowRight size={16} /></>}</button></div>
          </form>
        )}

        {step === 1 && (
          <form className="onboarding-panel" onSubmit={provisionHardware}>
            <div className="onboarding-panel-title"><span className="onboarding-number">02</span><div><span className="eyebrow">Secure identity</span><h2>Provision the field unit</h2><p>Every Pi receives a unique device ID and credential. Never clone credentials between units.</p></div></div>
            <div className="choice-cards">
              <label className={deviceMode === "new" ? "selected" : ""}><input type="radio" name="deviceMode" checked={deviceMode === "new"} onChange={() => setDeviceMode("new")} /><RadioTower /><span><strong>New radar</strong><small>Create a clean identity and one-time token.</small></span></label>
              <label className={deviceMode === "resume" ? "selected" : ""}><input type="radio" name="deviceMode" checked={deviceMode === "resume"} disabled={!existingDevices.length} onChange={() => setDeviceMode("resume")} /><RefreshCw /><span><strong>Resume setup</strong><small>Continue an existing or interrupted installation.</small></span></label>
            </div>
            <div className="onboarding-fields">
              {deviceMode === "new" ? <>
                <label><span>Radar name</span><input value={deviceName} onChange={(event) => setDeviceName(event.target.value)} placeholder="RSR-0002" minLength={2} required /></label>
                <label><span>Serial number</span><input value={serialNumber} onChange={(event) => setSerialNumber(event.target.value)} placeholder="RSR-2026-0002" minLength={4} required /></label>
              </> : (
                <label className="field-wide"><span>Existing radar</span><select value={resumeDeviceId} onChange={(event) => setResumeDeviceId(event.target.value)} required>{existingDevices.map((device) => <option key={device.id} value={device.id}>{device.name} · {device.serialNumber} · {device.organizationName ?? "Unassigned"}</option>)}</select></label>
              )}
            </div>
            <div className="onboarding-warning"><AlertTriangle /><p><strong>The activation token appears once and expires after 24 hours.</strong> Resume setup can issue a replacement token for an unactivated radar and invalidates its older token.</p></div>
            <div className="onboarding-actions"><button className="button secondary" type="button" onClick={() => goTo(0)}><ArrowLeft size={16} /> Back</button><span aria-live="polite">{message}</span><button className="button primary" type="submit" disabled={busy}>{busy ? "Provisioning…" : <>Provision & continue <ArrowRight size={16} /></>}</button></div>
          </form>
        )}

        {step === 2 && (
          <form className="onboarding-panel" onSubmit={saveAssignment}>
            <div className="onboarding-panel-title"><span className="onboarding-number">03</span><div><span className="eyebrow">Operating assignment</span><h2>Set the site rules</h2><p>This links future events, evidence, speed limits and client access to the correct account.</p></div></div>
            {activationToken && <CopyBlock label="Activation token — save before leaving this page" value={activationToken} secret />}
            {!activationToken && status?.device.activatedAt && <div className="onboarding-success"><Check /><p><strong>This radar is already activated.</strong> It does not need another device token.</p></div>}
            <div className="assignment-lockup">
              <div><span>Radar</span><strong>{deviceName || selectedResumeDevice?.name}</strong><small>{serialNumber || selectedResumeDevice?.serialNumber}</small></div>
              <ArrowRight />
              <div><span>Client</span><strong>{organizationName || selectedOrganization?.name}</strong><small>Private tenant assignment</small></div>
            </div>
            <div className="onboarding-fields">
              <label className="field-wide"><span>Site name and direction</span><input value={siteName} onChange={(event) => setSiteName(event.target.value)} placeholder="Main Road · Northbound" minLength={2} required /></label>
              <label><span>Speed limit</span><span className="onboarding-unit-input"><input type="number" min="10" max="180" value={speedLimitKph} onChange={(event) => setSpeedLimitKph(Number(event.target.value))} required /><small>km/h</small></span></label>
              <label><span>Assignment starts</span><input type="datetime-local" min={toLocalDateTimeInput()} value={startsAt} onChange={(event) => setStartsAt(event.target.value)} required /></label>
            </div>
            <div className="onboarding-actions"><button className="button secondary" type="button" onClick={() => goTo(1)}><ArrowLeft size={16} /> Back</button><span aria-live="polite">{message}</span><button className="button primary" type="submit" disabled={busy}>{busy ? "Assigning…" : <>Assign radar <ArrowRight size={16} /></>}</button></div>
          </form>
        )}

        {step === 3 && (
          <div className="onboarding-panel">
            <div className="onboarding-panel-title"><span className="onboarding-number">04</span><div><span className="eyebrow">Raspberry Pi setup</span><h2>Install and activate</h2><p>Work through these commands on the new Pi as the <code>tomdev</code> user. The live connection indicator updates automatically.</p></div></div>
            <div className="install-brief">
              <div><Wifi /><span><strong>Internet</strong><small>Wi-Fi or managed uplink</small></span></div>
              <div><Camera /><span><strong>Camera LAN</strong><small>eth0 · 192.168.1.64</small></span></div>
              <div><Gauge /><span><strong>Radar USB</strong><small>dialout access required</small></span></div>
            </div>
            <div className="onboarding-command-stack">
              <CopyBlock label="1. Install software and Python environment" value={commandInstall} />
              <CopyBlock label="2. Test, stage and edit hardware configuration" value={commandStage} />
              <div className="hardware-env-card">
                <span>Required values in device.env</span>
                <code>HIKVISION_RTSP_URL=rtsp://USER:PASSWORD@192.168.1.64:554/Streaming/Channels/101</code>
                <code>RADAR_PORT=/dev/serial/by-id/YOUR_RADAR_USB_DEVICE</code>
                <code>RADAR_BAUDRATE=115200</code>
                <small>Use URL encoding if the camera password contains @, :, /, # or %.</small>
              </div>
              {activationToken ? <>
                <CopyBlock label="3. One-time activation token" value={activationToken} secret />
                <CopyBlock label="4. Activate securely" value={commandActivate} />
              </> : <div className="onboarding-success"><Check /><p><strong>Activation already complete.</strong> Continue with installation and service checks.</p></div>}
              <CopyBlock label={`${activationToken ? "5" : "3"}. Install services and start`} value={commandStart} />
            </div>
            <fieldset className="manual-checklist">
              <legend>Field engineer checklist</legend>
              {[
                ["network", "Internet and camera network tested"],
                ["serial", "Radar serial path confirmed"],
                ["environment", "Camera URL and radar settings saved"],
                ["install", "Installer completed without errors"],
                ["services", "Both systemd services show active"],
              ].map(([key, label]) => <label key={key}><input type="checkbox" checked={Boolean(manualChecks[key])} onChange={(event) => setManualChecks((current) => ({ ...current, [key]: event.target.checked }))} /><span>{manualChecks[key] ? <Check /> : <Circle />}{label}</span></label>)}
            </fieldset>
            <div className={`connection-banner ${status?.device.activatedAt ? "connected" : ""}`}>
              <span>{status?.device.activatedAt ? <Activity /> : <RefreshCw />}</span>
              <div><strong>{status?.device.activatedAt ? "Cloud activation detected" : "Waiting for the Pi"}</strong><small>{status?.device.activatedAt ? `${status.device.name} · ${status.device.softwareVersion}` : "This page checks the portal every five seconds."}</small></div>
              <button type="button" onClick={() => void refreshStatus()}><RefreshCw size={15} /> Check now</button>
            </div>
            <div className="onboarding-actions"><button className="button secondary" type="button" onClick={() => goTo(2)}><ArrowLeft size={16} /> Back</button><span aria-live="polite">{message}</span><button className="button primary" type="button" disabled={!status?.device.activatedAt && !demoMode} onClick={() => { if (demoMode && !status) setStatus(demoStatus()); goTo(4); }}>Continue to live checks <ArrowRight size={16} /></button></div>
          </div>
        )}

        {step === 4 && (
          <div className="onboarding-panel">
            <div className="onboarding-panel-title"><span className="onboarding-number">05</span><div><span className="eyebrow">Live commissioning</span><h2>Prove the complete path</h2><p>These checks come from the real Pi and cloud database. Green means the signal has reached the portal.</p></div></div>
            <div className="commission-layout">
              <div className="commission-list">
                <CheckItem ok={Boolean(status?.assignment)} title="Client assignment" detail={status?.assignment ? `${status.assignment.organizationName} · ${status.assignment.siteName}` : "Waiting for an active assignment"} />
                <CheckItem ok={Boolean(status?.device.activatedAt)} title="Unique device credential" detail={status?.device.activatedAt ? "Activation token consumed successfully" : "Waiting for activation"} />
                <CheckItem ok={Boolean(status?.device.online)} title="Cloud heartbeat" detail={status?.device.online ? `Online · ${status?.device.softwareVersion}` : "No heartbeat in the last three minutes"} />
                <CheckItem ok={Boolean(status?.heartbeat?.radarServiceActive)} title="Radar service" detail={status?.heartbeat?.radarServiceActive ? "run_radar.service is active" : "Service has not reported healthy"} />
                <CheckItem ok={Boolean(status?.heartbeat?.radarConnected)} title="Radar serial link" detail={status?.heartbeat?.radarConnected ? "Radar messages received" : "Check USB path and dialout group"} />
                <CheckItem ok={Boolean(status?.heartbeat?.cameraConnected)} title="Hikvision stream" detail={status?.heartbeat?.cameraConnected ? "Camera frames are available" : "Check eth0, camera IP and RTSP URL"} />
                <CheckItem ok={status?.cameraTest?.status === "completed" && Boolean(status.cameraTest.photoUrl)} title="Diagnostic image" detail={status?.cameraTest?.status === "failed" ? status.cameraTest.error || "Camera test failed" : status?.cameraTest?.photoUrl ? "Private test frame uploaded" : "Run a camera test below"} />
                <CheckItem ok={Boolean(status?.latestEvent)} title="First field event" detail={status?.latestEvent ? `${status.latestEvent.speed_kph} km/h · cloud ingestion confirmed` : "Optional: pass a controlled test target"} />
                <CheckItem ok={Boolean(status?.latestEvent && ["complete", "not_required"].includes(status.latestEvent.processing_status))} title="OCR & evidence pipeline" detail={status?.latestEvent ? `Processing: ${status.latestEvent.processing_status} · Photo: ${status.latestEvent.photo_status}` : "Waiting for a controlled field event"} />
                <CheckItem ok={Boolean(status?.latestEvent && ["sent", "delivered", "not_required"].includes(status.latestEvent.email_status))} title="Alert workflow" detail={status?.latestEvent ? `Email: ${status.latestEvent.email_status}` : "Use an internal recipient before client handover"} />
              </div>
              <aside className="commission-live">
                <div className="commission-live-head"><span>Live field signal</span><button type="button" onClick={() => void refreshStatus()}><RefreshCw size={15} /> Refresh</button></div>
                <div className="commission-radar-mark"><RadioTower /><span className={status?.device.online ? "pulse" : ""} /></div>
                <strong>{status?.device.online ? "ONLINE" : "WAITING"}</strong>
                <dl>
                  <div><dt>Queue</dt><dd>{status?.heartbeat?.queueDepth ?? "—"}</dd></div>
                  <div><dt>Tailscale</dt><dd>{status?.heartbeat?.tailscaleIp ?? "Not reported"}</dd></div>
                  <div><dt>Limit</dt><dd>{status?.assignment?.speedLimitKph ?? speedLimitKph} km/h</dd></div>
                </dl>
                {status?.heartbeat?.lastError && <p className="commission-error">{status.heartbeat.lastError}</p>}
              </aside>
            </div>
            {status?.cameraTest?.photoUrl && <div className="commission-photo">
              {/* Supabase diagnostic images use short-lived signed URLs. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={status.cameraTest.photoUrl} alt={`Live diagnostic view from ${deviceName}`} />
              <div><span>Private diagnostic frame</span><a href={status.cameraTest.photoUrl} target="_blank" rel="noreferrer">Open full image <ExternalLink size={14} /></a></div>
            </div>}
            <div className="commission-actions">
              <button className="button secondary" type="button" disabled={busy || !status?.device.online} onClick={runCameraTest}><Camera size={16} /> {busy ? "Queueing…" : "Test camera"}</button>
              {deviceId && <Link className="button secondary" href={`/devices/${deviceId}`} target="_blank">Open radar <ExternalLink size={15} /></Link>}
            </div>
            <div className="onboarding-actions"><button className="button secondary" type="button" onClick={() => goTo(3)}><ArrowLeft size={16} /> Back</button><span aria-live="polite">{message}</span><button className="button primary" type="button" disabled={!coreReady} onClick={() => goTo(5)}>Complete onboarding <Check size={16} /></button></div>
          </div>
        )}

        {step === 5 && (
          <div className="onboarding-panel onboarding-complete">
            <div className="complete-mark"><ShieldCheck /><span><Check /></span></div>
            <span className="eyebrow">Commissioning complete</span>
            <h2>{summary.radar} is ready</h2>
            <p>The radar has a private client assignment, a healthy field connection and a verified camera upload.</p>
            <div className="handover-grid">
              <div><span>Client</span><strong>{summary.client}</strong></div>
              <div><span>Radar</span><strong>{summary.radar}</strong><small>{summary.serial}</small></div>
              <div><span>Site</span><strong>{summary.site}</strong></div>
              <div><span>Limit</span><strong>{summary.limit} km/h</strong></div>
              <div><span>Software</span><strong>{status?.device.softwareVersion}</strong></div>
              <div><span>Remote access</span><strong>{status?.heartbeat?.tailscaleIp ?? "Not configured"}</strong></div>
            </div>
            {!status?.latestEvent && <div className="onboarding-note"><AlertTriangle /><p><strong>Field event still recommended.</strong> Before customer handover, pass a controlled target and confirm the event, OCR and internal alert workflow.</p></div>}
            <div className="complete-actions"><Link className="button primary" href={`/devices/${deviceId}`}>Open live radar <ArrowRight size={16} /></Link><Link className="button secondary" href="/admin/fleet">Return to fleet</Link><button className="button secondary" type="button" onClick={resetWizard}>Onboard another</button></div>
          </div>
        )}
      </div>
    </section>
  );
}
