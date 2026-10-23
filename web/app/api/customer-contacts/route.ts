import { requireUser, sameOrigin, Forbidden, Unauthorized } from "@/lib/auth";
import { AdminInputError } from "@/lib/admin-store";
import {
  listCustomerContacts,
  createCustomerContact,
} from "@/lib/visits/contacts";
const json = (x: unknown, status = 200) =>
  Response.json(x, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
const fail = (e: unknown) =>
  json(
    {
      error:
        e instanceof AdminInputError
          ? e.message
          : "Não foi possível acessar os contatos.",
    },
    e instanceof Unauthorized
      ? 401
      : e instanceof Forbidden
        ? 403
        : e instanceof AdminInputError
          ? 400
          : 503,
  );
export async function GET(r: Request) {
  try {
    const u = await requireUser();
    return json({
      contacts: await listCustomerContacts(
        new URL(r.url).searchParams.get("customer") || "",
        u.email,
      ),
    });
  } catch (e) {
    return fail(e);
  }
}
export async function POST(r: Request) {
  if (!sameOrigin(r)) return json({ error: "Origem inválida." }, 403);
  try {
    const u = await requireUser(),
      raw = await r.text();
    if (raw.length > 2000) throw new AdminInputError("Dados excedem o limite.");
    const b = JSON.parse(raw);
    return json({
      contact: await createCustomerContact(b.customer, b, u.email),
    });
  } catch (e) {
    return fail(e);
  }
}
