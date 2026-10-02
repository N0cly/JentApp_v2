import { checkHealth } from "@/server/health";

export const dynamic = "force-dynamic";

export async function GET() {
  const { httpStatus, body } = await checkHealth();
  return Response.json(body, {
    status: httpStatus,
    headers: { "Cache-Control": "no-store" },
  });
}
