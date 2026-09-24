import { desktopRequestError } from "@/lib/auth/desktop";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  if (desktopRequestError(request.headers)) {
    return Response.json({ ready: false }, { status: 403, headers: { "Cache-Control": "no-store" } });
  }
  try {
    const owner = await prisma.user.findUnique({
      where: { email: "facilitator@example.com" }, select: { id: true },
    });
    return Response.json({ ready: Boolean(owner) }, {
      status: owner ? 200 : 503, headers: { "Cache-Control": "no-store" },
    });
  } catch {
    console.error("Desktop database readiness check failed.");
    return Response.json({ ready: false }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
