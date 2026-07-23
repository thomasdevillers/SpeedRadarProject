import { z } from "zod";
import { apiError } from "@/lib/device-auth";
import { isDemoMode } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

const speedLimitSchema = z.object({
  speedLimitKph: z.number().int().min(10).max(180),
});

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const [{ id }, input] = await Promise.all([
      params,
      request.json().then((body) => speedLimitSchema.parse(body)),
    ]);
    if (isDemoMode()) {
      return Response.json({ deviceId: id, speedLimitKph: input.speedLimitKph, source: "assignment" });
    }
    const deviceId = z.uuid().parse(id);

    const supabase = await createClient();
    const { data, error } = await supabase.rpc("update_device_speed_limit", {
      p_device_id: deviceId,
      p_speed_limit_kph: input.speedLimitKph,
    });
    if (error) throw error;
    return Response.json(data);
  } catch (error) {
    return apiError(error);
  }
}
