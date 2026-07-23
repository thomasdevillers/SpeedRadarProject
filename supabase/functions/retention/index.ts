import { createClient } from "npm:@supabase/supabase-js@2.110.8";

const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const internalSecret = Deno.env.get("INTERNAL_JOB_SECRET")!;

Deno.serve(async (request) => {
  if (request.headers.get("x-internal-job-secret") !== internalSecret) return new Response("Unauthorized", { status: 401 });
  await supabase.rpc("refresh_daily_device_stats", { p_day: new Date(Date.now() - 86400000).toISOString().slice(0, 10) });
  const cutoff = new Date(Date.now() - 90 * 86400000).toISOString();
  const heartbeatCutoff = new Date(Date.now() - 7 * 86400000).toISOString();
  let removedEvents = 0;
  while (true) {
    const { data: events, error } = await supabase.from("radar_events").select("id, photo_path").lt("captured_at", cutoff).limit(500);
    if (error) return Response.json({ error: error.message }, { status: 500 });
    if (!events?.length) break;
    const paths = events.flatMap((event) => event.photo_path ? [event.photo_path] : []);
    if (paths.length) {
      const { error: storageError } = await supabase.storage.from("radar-photos").remove(paths);
      if (storageError) return Response.json({ error: storageError.message }, { status: 500 });
    }
    const { error: deleteError } = await supabase.from("radar_events").delete().in("id", events.map((event) => event.id));
    if (deleteError) return Response.json({ error: deleteError.message }, { status: 500 });
    removedEvents += events.length;
  }
  await supabase.from("device_heartbeats").delete().lt("recorded_at", heartbeatCutoff);
  let removedDiagnosticPhotos = 0;
  while (true) {
    const { data: commands, error: commandError } = await supabase
      .from("device_commands")
      .select("id, result")
      .eq("command_type", "capture_test")
      .lt("requested_at", cutoff)
      .in("status", ["completed", "failed", "expired"])
      .limit(500);
    if (commandError) return Response.json({ error: commandError.message }, { status: 500 });
    if (!commands?.length) break;
    const diagnosticPaths = commands.flatMap((command) => {
      const result = command.result as Record<string, unknown> | null;
      return typeof result?.photoPath === "string" ? [result.photoPath] : [];
    });
    if (diagnosticPaths.length) {
      const { error: diagnosticError } = await supabase.storage.from("radar-photos").remove(diagnosticPaths);
      if (diagnosticError) return Response.json({ error: diagnosticError.message }, { status: 500 });
      removedDiagnosticPhotos += diagnosticPaths.length;
    }
    const { error: commandDeleteError } = await supabase.from("device_commands").delete().in("id", commands.map((command) => command.id));
    if (commandDeleteError) return Response.json({ error: commandDeleteError.message }, { status: 500 });
  }
  await supabase.from("device_commands").delete().lt("requested_at", cutoff).in("status", ["completed", "failed", "expired"]);
  return Response.json({ removedEvents, removedDiagnosticPhotos, cutoff });
});
