import { clearDevSession, AccessDeniedError } from "@/lib/auth";
import { assertAiRequestOrigin } from "@/lib/ai/input-validation";
import { AiError } from "@/lib/ai/errors";
import { apiFailure } from "@/lib/api-errors";

export async function POST(request: Request) {
  try {
    assertAiRequestOrigin(request);
    await clearDevSession();
    return Response.json({ cleared: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof AccessDeniedError || error instanceof AiError) {
      return Response.json({ error: "Demo session reset is allowed only in local development from this application." },
        { status: 403, headers: { "Cache-Control": "no-store" } });
    }
    return apiFailure(error, "dev-session-reset");
  }
}
