import { userDisplayName } from "@/lib/user-display-name";
import { quoteProducts } from "@/lib/quotes/products";
import { NextResponse } from "next/server";
import { requireUser, sameOrigin, Unauthorized } from "@/lib/auth";
import { logDataError } from "@/lib/data-error";
import {
  deleteQuote,
  getQuote,
  listQuotes,
  saveQuote,
  QuoteConflict,
} from "@/lib/quotes/store";
import { quoteLookup, quoteSuggestions } from "@/lib/quotes/suggestions";
import { QuoteValidation } from "@/lib/quotes/types";
export const runtime = "nodejs";
const json = (body: unknown, status = 200) =>
  NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
function failure(error: unknown) {
  if (error instanceof Unauthorized)
    return json({ error: "Sessão expirada." }, 401);
  if (error instanceof QuoteValidation)
    return json({ error: error.message }, 400);
  if (error instanceof QuoteConflict)
    return json({ error: error.message }, 409);
  const code = logDataError("quotes", error);
  return json(
    {
      error:
        "Não foi possível consultar ou salvar o orçamento. Tente novamente.",
      code,
    },
    503,
  );
}
export async function GET(request: Request) {
  try {
    const user = await requireUser(),
      p = new URL(request.url).searchParams;
    if (p.has("lookup")) return json(await quoteLookup(p));
    if (p.get("action") === "suggestions")
      return json(await quoteSuggestions(p));
    if (p.has("id")) {
      const quote = await getQuote(p.get("id")!);
      return json(
        (quote
          ? { ...quote, items: await quoteProducts(quote.items) }
          : null) || { error: "Orçamento não encontrado." },
        quote ? 200 : 404,
      );
    }
    return json({
      rows: await listQuotes(p.get("q") || ""),
      email: user.email,
    });
  } catch (error) {
    return failure(error);
  }
}
export async function POST(request: Request) {
  if (!sameOrigin(request)) return json({ error: "Origem inválida." }, 403);
  try {
    const user = await requireUser();
    const raw = await request.text();
    if (raw.length > 1500000)
      return json({ error: "Orçamento muito grande." }, 413);
    let body: unknown;
    try {
      body = JSON.parse(raw);
    } catch {
      return json({ error: "Orçamento inválido." }, 400);
    }
    return json(await saveQuote(body, user.email, userDisplayName(user)));
  } catch (error) {
    return failure(error);
  }
}

export async function DELETE(request: Request) {
  if (!sameOrigin(request)) return json({ error: "Origem inválida." }, 403);
  try {
    const user = await requireUser();
    const raw = await request.text();
    if (raw.length > 1000)
      return json({ error: "Dados excedem o limite." }, 413);
    let body;
    try {
      body = JSON.parse(raw);
    } catch {
      return json({ error: "Dados inválidos." }, 400);
    }
    return json(await deleteQuote(body, user.email, userDisplayName(user)));
  } catch (error) {
    return failure(error);
  }
}
