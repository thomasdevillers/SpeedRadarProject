import { redirect } from "next/navigation";
import { demoAssignments, demoDashboard, demoEvents, demoOrganizations } from "@/lib/mock-data";
import { isDemoMode } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import type { CameraTestSummary, CommandStatus, DashboardData, DeploymentSummary, DeviceAssignmentSummary, OrganizationSummary, RadarEvent, ReleaseSummary, UserRole } from "@/lib/types";

export interface ViewerContext {
  userId: string;
  email: string;
  displayName: string;
  role: UserRole;
  organizationId: string | null;
  organizationName: string;
}

export interface OrganizationMember {
  userId: string;
  displayName: string;
  email: string;
  role: UserRole;
}

export async function getViewerContext(): Promise<ViewerContext> {
  if (isDemoMode()) {
    return {
      userId: "demo-admin",
      email: "admin@roadsafe.co.za",
      displayName: "RoadSafe Admin",
      role: "roadsafe_admin",
      organizationId: "00000000-0000-4000-8000-000000000010",
      organizationName: "RoadSafe Operations",
    };
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data, error } = await supabase.rpc("get_my_context");
  if (error) throw new Error(`Unable to load user context: ${error.message}`);
  const context = data as Record<string, string>;
  return {
    userId: user.id,
    email: user.email ?? "",
    displayName: context.displayName || user.email?.split("@")[0] || "RoadSafe user",
    role: (context.role as UserRole) || "client_viewer",
    organizationId: context.organizationId || null,
    organizationName: context.organizationName || "RoadSafe",
  };
}

export async function getNotificationRecipients(organizationId: string | null): Promise<string[]> {
  if (isDemoMode()) return ["info@roadsafe.co.za", "operations@example.co.za"];
  if (!organizationId) return [];
  const supabase = await createClient();
  const { data, error } = await supabase.from("notification_recipients").select("email").eq("organization_id", organizationId).eq("enabled", true).order("email");
  if (error) throw new Error(`Unable to load notification recipients: ${error.message}`);
  return (data ?? []).map((row) => row.email);
}

export async function getOrganizationMembers(viewer: ViewerContext): Promise<OrganizationMember[]> {
  if (isDemoMode()) return [
    { userId: "demo-admin", displayName: "RoadSafe Admin", email: "admin@roadsafe.co.za", role: "roadsafe_admin" },
    { userId: "demo-viewer", displayName: "Operations Viewer", email: "operations@example.co.za", role: "client_viewer" },
  ];
  if (!viewer.organizationId) return [{ userId: viewer.userId, displayName: viewer.displayName, email: viewer.email, role: viewer.role }];
  const supabase = await createClient();
  const { data: memberships, error: membershipError } = await supabase.from("organization_members").select("user_id, role").eq("organization_id", viewer.organizationId).order("created_at");
  if (membershipError) throw new Error(`Unable to load organisation members: ${membershipError.message}`);
  if (!memberships?.length) return [{ userId: viewer.userId, displayName: viewer.displayName, email: viewer.email, role: viewer.role }];
  const { data: profiles, error: profileError } = await supabase.from("profiles").select("user_id, display_name, email").in("user_id", memberships.map((member) => member.user_id));
  if (profileError) throw new Error(`Unable to load member profiles: ${profileError.message}`);
  const byUser = new Map((profiles ?? []).map((profile) => [profile.user_id, profile]));
  return memberships.map((membership) => ({ userId: membership.user_id, displayName: byUser.get(membership.user_id)?.display_name || "Organisation member", email: byUser.get(membership.user_id)?.email || "", role: membership.role }));
}

export async function getDashboardData(): Promise<DashboardData> {
  if (isDemoMode()) return demoDashboard;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_dashboard_payload", { p_days: 1 });
  if (error) throw new Error(`Unable to load dashboard: ${error.message}`);
  const dashboard = data as DashboardData;
  dashboard.recentEvents = await attachSignedPhotoUrls(supabase, dashboard.recentEvents);
  return dashboard;
}

export async function getEvents(limit = 200, offset = 0): Promise<RadarEvent[]> {
  if (isDemoMode()) return demoEvents.slice(offset, offset + limit);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_event_feed", { p_limit: limit, p_offset: offset });
  if (error) throw new Error(`Unable to load events: ${error.message}`);
  return attachSignedPhotoUrls(supabase, data as RadarEvent[]);
}

export async function getEventById(id: string): Promise<RadarEvent | null> {
  if (isDemoMode()) return demoEvents.find((event) => event.id === id) ?? null;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_event_by_id", { p_id: id });
  if (error) throw new Error(`Unable to load event: ${error.message}`);
  if (!data) return null;
  return (await attachSignedPhotoUrls(supabase, [data as RadarEvent]))[0] ?? null;
}

async function attachSignedPhotoUrls(supabase: Awaited<ReturnType<typeof createClient>>, events: RadarEvent[]): Promise<RadarEvent[]> {
  const paths = events.flatMap((event) => event.photoPath ? [event.photoPath] : []);
  if (!paths.length) return events;
  const { data } = await supabase.storage.from("radar-photos").createSignedUrls(paths, 300);
  const urls = new Map((data ?? []).map((item) => [item.path, item.signedUrl]));
  return events.map((event) => ({ ...event, photoUrl: event.photoPath ? urls.get(event.photoPath) ?? null : null }));
}

export async function getOrganizations(): Promise<OrganizationSummary[]> {
  if (isDemoMode()) return demoOrganizations;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_organization_summaries");
  if (error) throw new Error(`Unable to load organizations: ${error.message}`);
  return data as OrganizationSummary[];
}

export async function getDeviceAssignments(): Promise<DeviceAssignmentSummary[]> {
  if (isDemoMode()) return demoAssignments;
  const supabase = await createClient();
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("device_assignments")
    .select("id, device_id, organization_id, site_name, speed_limit_kph, starts_at, ends_at, devices(name, serial_number), organizations(name)")
    .or(`ends_at.is.null,ends_at.gt.${now}`)
    .order("starts_at", { ascending: true });
  if (error) throw new Error(`Unable to load radar assignments: ${error.message}`);
  return (data ?? []).map((row) => {
    const device = row.devices as unknown as { name: string; serial_number: string } | null;
    const organization = row.organizations as unknown as { name: string } | null;
    return {
      id: row.id,
      deviceId: row.device_id,
      deviceName: device?.name ?? "Unknown radar",
      serialNumber: device?.serial_number ?? "Unknown serial",
      organizationId: row.organization_id,
      organizationName: organization?.name ?? "Unknown client",
      siteName: row.site_name,
      speedLimitKph: row.speed_limit_kph,
      startsAt: row.starts_at,
      endsAt: row.ends_at,
      status: new Date(row.starts_at).getTime() > Date.now() ? "scheduled" : "active",
    };
  });
}

export async function getLatestCameraTest(deviceId: string): Promise<CameraTestSummary | null> {
  if (isDemoMode()) return {
    id: "demo-camera-test",
    status: "completed",
    requestedAt: new Date(Date.now() - 10 * 60_000).toISOString(),
    completedAt: new Date(Date.now() - 9 * 60_000).toISOString(),
    capturedAt: new Date(Date.now() - 9 * 60_000).toISOString(),
    photoUrl: "/api/demo-photo?variant=3",
    error: null,
  };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("device_commands")
    .select("id, status, requested_at, completed_at, result, error")
    .eq("device_id", deviceId)
    .eq("command_type", "capture_test")
    .order("requested_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`Unable to load the latest camera test: ${error.message}`);
  if (!data) return null;
  const result = (data.result as Record<string, unknown> | null) ?? {};
  const photoPath = typeof result.photoPath === "string" ? result.photoPath : null;
  let photoUrl: string | null = null;
  if (photoPath) {
    const { data: signed, error: signedError } = await supabase.storage.from("radar-photos").createSignedUrl(photoPath, 300);
    if (signedError) throw new Error(`Unable to load the camera test image: ${signedError.message}`);
    photoUrl = signed.signedUrl;
  }
  return {
    id: data.id,
    status: data.status as CommandStatus,
    requestedAt: data.requested_at,
    completedAt: data.completed_at,
    capturedAt: typeof result.capturedAt === "string" ? result.capturedAt : null,
    photoUrl,
    error: data.error,
  };
}

export async function getDeploymentData(): Promise<{ releases: ReleaseSummary[]; deployments: DeploymentSummary[] }> {
  if (isDemoMode()) return {
    releases: [{ version: "0.1.0-shadow", sha256: "b".repeat(64), releaseNotes: "Cloud queue and heartbeat pilot.", createdAt: new Date().toISOString() }],
    deployments: [{ id: "demo-deployment", deviceId: "rsr-0001", deviceName: "RSR-0001", version: "0.1.0-shadow", status: "healthy", requestedAt: new Date(Date.now() - 86_400_000).toISOString(), completedAt: new Date().toISOString(), error: null }],
  };
  const supabase = await createClient();
  const [{ data: releaseRows, error: releaseError }, { data: deploymentRows, error: deploymentError }] = await Promise.all([
    supabase.from("device_releases").select("version, sha256, release_notes, created_at").order("created_at", { ascending: false }),
    supabase.from("device_deployments").select("id, device_id, version, status, requested_at, completed_at, error, devices(name)").order("requested_at", { ascending: false }).limit(50),
  ]);
  if (releaseError) throw new Error(`Unable to load releases: ${releaseError.message}`);
  if (deploymentError) throw new Error(`Unable to load deployments: ${deploymentError.message}`);
  return {
    releases: (releaseRows ?? []).map((row) => ({ version: row.version, sha256: row.sha256, releaseNotes: row.release_notes, createdAt: row.created_at })),
    deployments: (deploymentRows ?? []).map((row) => ({ id: row.id, deviceId: row.device_id, deviceName: (row.devices as unknown as { name: string } | null)?.name ?? "Unknown radar", version: row.version, status: row.status, requestedAt: row.requested_at, completedAt: row.completed_at, error: row.error })),
  };
}
