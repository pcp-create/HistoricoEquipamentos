import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { requireUser, sameOrigin, Unauthorized } from "@/lib/auth";
import { logDataError } from "@/lib/data-error";
import {
  catalogFields,
  validateCatalogRecords,
} from "@/lib/manufacturer/configuration";
import {
  CatalogInputError,
  catalogConfiguration,
  catalogConfigurationItems,
  saveCatalogRecords,
  updateCatalogItem,
} from "@/lib/manufacturer/configuration-store";
export const runtime = "nodejs";
export const maxDuration = 60;
const json = (body: unknown, status = 200) =>
  NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
function failure(e: unknown) {
  if (e instanceof CatalogInputError) return json({ error: e.message }, 400);
  if (e instanceof Unauthorized)
    return json({ error: "Sessão expirada." }, 401);
  logDataError("catalog-configuration", e);
  return json(
    {
      error:
        "Não foi possível concluir a operação. Confira os dados e tente novamente.",
    },
    503,
  );
}
export async function GET(request: Request) {
  try {
    const user = await requireUser();
    const p = new URL(request.url).searchParams;
    if (p.get("template") === "1") {
      const book = XLSX.utils.book_new();
      const sheet = XLSX.utils.aoa_to_sheet([
        catalogFields.map(([, label]) => label),
      ]);
      for (let row = 1; row <= 1000; row++) {
        for (let col = 0; col < catalogFields.length; col++) {
          sheet[XLSX.utils.encode_cell({ r: row, c: col })] = {
            t: "s",
            v: "",
            z: "@",
          };
        }
      }
      sheet["!ref"] = "A1:I1001";
      sheet["!cols"] = catalogFields.map(() => ({ wch: 28 }));
      XLSX.utils.book_append_sheet(book, sheet, "Itens");
      XLSX.utils.book_append_sheet(
        book,
        XLSX.utils.aoa_to_sheet([
          ["Como preencher"],
          [
            "Preencha a aba Itens. Uma peça por linha. Até 1.000 linhas por arquivo.",
          ],
          [
            "Obrigatórios: fabricante, modelo, versão, grupo, descrição, referência genuína, intervalo em horas.",
          ],
          [
            "Referência: texto, de 6 a 24 letras/dígitos com ao menos um número. Preserve os zeros iniciais.",
          ],
          [
            "Intervalo: inteiro de 1 a 100000, sem unidade ou separador. Ex.: 4000.",
          ],
          [
            "Faixa de série opcional: BQD100000 ... ou DE BQD100000 ATÉ BQD199999.",
          ],
          [
            "Faixa vazia: aplicação sem série confirmada. Use versões diferentes para faixas diferentes.",
          ],
          [
            "Observações opcionais: condições, especificações e orientações do fabricante.",
          ],
          [
            "Os dados serão adicionados ao catálogo. Itens idênticos não serão duplicados.",
          ],
          [
            "Referências se vinculam aos produtos M8 pela referência fabricante e código de similaridade.",
          ],
        ]),
        "Instruções",
      );
      return new Response(
        new Uint8Array(XLSX.write(book, { type: "buffer", bookType: "xlsx" })),
        {
          headers: {
            "Content-Type":
              "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "Content-Disposition":
              'attachment; filename="modelo-catalogo-fabricante.xlsx"',
            "Cache-Control": "private, no-store",
          },
        },
      );
    }
    if (p.has("variant"))
      return json({
        items: await catalogConfigurationItems(p.get("variant")!.slice(0, 200)),
      });
    return json({ ...(await catalogConfiguration()), email: user.email });
  } catch (e) {
    return failure(e);
  }
}
export async function POST(request: Request) {
  if (!sameOrigin(request)) return json({ error: "Origem inválida." }, 403);
  try {
    const user = await requireUser();
    if (Number(request.headers.get("content-length")) > 2_000_000)
      return json({ error: "Arquivo ou dados excedem 2 MB." }, 413);
    const bytes = await request.arrayBuffer();
    if (bytes.byteLength > 2_000_000)
      return json({ error: "Arquivo ou dados excedem 2 MB." }, 413);
    if (new URL(request.url).searchParams.get("preview") === "1") {
      let rows;
      try {
        const book = XLSX.read(bytes, {
          type: "array",
          sheetRows: 1002,
          cellFormula: true,
        });
        const sheet = book.Sheets.Itens;
        if (!sheet)
          return json(
            { error: "Utilize o modelo: a aba Itens não foi encontrada." },
            400,
          );
        const range = XLSX.utils.decode_range(
          sheet["!fullref"] || sheet["!ref"] || "A1",
        );
        if (range.e.r > 1000)
          return json(
            { error: "Use no máximo 1.000 linhas de itens por arquivo." },
            400,
          );
        if (
          Object.values(sheet).some(
            (cell: any) => cell && typeof cell === "object" && cell.f,
          )
        )
          return json(
            { error: "Substitua as fórmulas por valores antes de importar." },
            400,
          );
        const data = XLSX.utils.sheet_to_json<string[]>(sheet, {
          header: 1,
          raw: false,
          defval: "",
          blankrows: false,
        });
        if (
          JSON.stringify(data[0]) !==
          JSON.stringify(catalogFields.map(([, label]) => label))
        )
          return json(
            { error: "As colunas devem seguir exatamente a planilha modelo." },
            400,
          );
        rows = data
          .slice(1)
          .filter((row) => row.some((value) => String(value).trim()))
          .map((row) =>
            Object.fromEntries(
              catalogFields.map(([key], i) => [key, String(row[i] ?? "")]),
            ),
          );
      } catch {
        return json(
          {
            error:
              "Planilha inválida. Utilize um arquivo XLSX no formato do modelo.",
          },
          400,
        );
      }
      return json(validateCatalogRecords(rows));
    }
    let body;
    try {
      body = JSON.parse(new TextDecoder().decode(bytes));
    } catch {
      return json({ error: "Dados inválidos." }, 400);
    }
    const checked = validateCatalogRecords(body?.records);
    if (checked.errors.length)
      return json({ error: checked.errors.slice(0, 20).join("\n") }, 400);
    return json(await saveCatalogRecords(checked.records, user.email));
  } catch (e) {
    return failure(e);
  }
}

export async function PATCH(request: Request) {
  if (!sameOrigin(request)) return json({ error: "Origem inválida." }, 403);
  try {
    const user = await requireUser();
    const bytes = await request.arrayBuffer();
    if (bytes.byteLength > 32000)
      return json({ error: "Dados excedem o limite." }, 413);
    let body;
    try {
      body = JSON.parse(new TextDecoder().decode(bytes));
    } catch {
      return json({ error: "Dados inválidos." }, 400);
    }
    return json(await updateCatalogItem(body, user.email));
  } catch (e) {
    return failure(e);
  }
}
