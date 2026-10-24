import { requireUser, Unauthorized, Forbidden } from "@/lib/auth";
import { customerFleet } from "@/lib/equipment-management/customer-fleet";
export async function GET(r: Request) {
  try {
    await requireUser();
    return Response.json(
      await customerFleet(new URL(r.url).searchParams.get("customer") || ""),
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (e) {
    return Response.json(
      { error: "Não foi possível carregar o parque de máquinas." },
      {
        status:
          e instanceof Unauthorized
            ? 401
            : e instanceof Forbidden
              ? 403
              : e instanceof Error && e.message === "INVALID_CUSTOMER"
                ? 400
                : 503,
      },
    );
  }
}
