import { apiError } from "@/lib/device-auth";
import { authorizeCron, invokeInternalFunction } from "@/lib/cron";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const rejected = authorizeCron(request);
  if (rejected) return rejected;
  try {
    return Response.json(await invokeInternalFunction("process-events"));
  } catch (error) {
    return apiError(error);
  }
}
