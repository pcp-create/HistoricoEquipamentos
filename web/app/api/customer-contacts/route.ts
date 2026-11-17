import { after } from "next/server";
import { syncContact } from "@/lib/visits/contact-sync";
import { refreshCustomerContacts } from "@/lib/visits/contacts";
import { updateContactJob } from "@/lib/visits/contact-job";
import { requireUser, sameOrigin, Forbidden, Unauthorized } from "@/lib/auth";
import { AdminInputError } from "@/lib/admin-store";
import {
  listCustomerContacts,
  createCustomerContact,
} from "@/lib/visits/contacts";
import { M8RequestError } from "@/lib/service-orders/m8";
const json = (x: unknown, status = 200) =>
  Response.json(x, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
const fail = (e: unknown) =>
  json(
    {
      error:
        e instanceof AdminInputError || e instanceof M8RequestError
          ? e.message
          : "Não foi possível acessar os contatos.",
    },
    e instanceof Unauthorized
      ? 401
      : e instanceof Forbidden
        ? 403
        : e instanceof AdminInputError || e instanceof M8RequestError
          ? 400
          : 503,
  );
export async function GET(r: Request) {
  try {
    const u = await requireUser();
    const key = new URL(r.url).searchParams.get("customer") || "";
    const contacts = await listCustomerContacts(key, u.email);
    if (!new URL(r.url).searchParams.has("local"))
      after(async () => {
        try {
          await refreshCustomerContacts(key, u.email);
          for (const contact of contacts
            .filter(
              (c: any) =>
                c.sync_requested &&
                (!c.sync_attempted_at ||
                  Date.now() - Date.parse(c.sync_attempted_at) > 300000),
            )
            .slice(0, 3))
            await syncContact(contact.id, u.email);
        } catch {}
      });
    return json({ contacts });
  } catch (e) {
    return fail(e);
  }
}
export async function POST(r: Request) {
  if (!sameOrigin(r)) return json({ error: "Origem inválida." }, 403);
  try {
    const u = await requireUser(),
      raw = await r.text();
    if (raw.length > 12000)
      throw new AdminInputError("Dados excedem o limite.");
    let b;
    try {
      b = JSON.parse(raw);
    } catch {
      throw new AdminInputError("Dados do contato inválidos.");
    }
    if (!b || typeof b !== "object" || Array.isArray(b))
      throw new AdminInputError("Dados do contato inválidos.");
    const contact = await createCustomerContact(b.customer, b, u.email);
    after(() => syncContact(contact.id, u.email));
    return json({ contact });
  } catch (e) {
    return fail(e);
  }
}

export async function PATCH(r: Request) {
  if (!sameOrigin(r)) return json({ error: "Origem inválida." }, 403);
  try {
    const u = await requireUser(),
      raw = await r.text();
    if (raw.length > 12000)
      throw new AdminInputError("Dados excedem o limite.");
    let b;
    try {
      b = JSON.parse(raw);
    } catch {
      throw new AdminInputError("Dados inválidos.");
    }
    if (!b || typeof b !== "object" || Array.isArray(b))
      throw new AdminInputError("Dados inválidos.");
    const contact = await updateContactJob(b, u.email);
    after(() => syncContact(contact.id, u.email));
    return json({ contact });
  } catch (e) {
    return fail(e);
  }
}

export const maxDuration = 120;
