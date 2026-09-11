import { NextResponse } from "next/server";
import { requireUser, Unauthorized } from "@/lib/auth";
import {
  imageIdentity,
  ImageServiceError,
  productImages,
} from "@/lib/product-images";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
const headers = {
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
};
export async function GET(
  request: Request,
  context: { params: Promise<{ company: string; id: string }> },
) {
  try {
    await requireUser();
    const { company, id } = await context.params;
    const image = new URL(request.url).searchParams.get("image");
    try {
      imageIdentity(company, id);
      if (image !== null && !/^[a-f0-9]{64}$/.test(image)) throw new Error();
    } catch {
      return NextResponse.json(
        { error: "Produto, empresa ou imagem inválidos." },
        { status: 400, headers },
      );
    }
    const data = await productImages().get(company, id);
    if (image) {
      const item = data.images.find((i) => i.key === image);
      if (!item)
        return NextResponse.json(
          { error: "Esta foto não está mais disponível. Reabra a galeria." },
          { status: 404, headers },
        );
      return new Response(new Uint8Array(item.bytes), {
        headers: {
          ...headers,
          "Content-Type": item.mime,
          "Content-Security-Policy": "default-src 'none'; sandbox",
          "Content-Disposition": "inline",
        },
      });
    }
    return NextResponse.json(
      {
        images: data.images.map((i) => ({
          key: i.key,
          url: `/api/products/${company}/${id}/images?image=${i.key}`,
        })),
        unsupported: data.unsupported,
        collectedAt: data.collectedAt,
      },
      { headers },
    );
  } catch (error) {
    const status = error instanceof Unauthorized ? 401 : 503;
    return NextResponse.json(
      {
        error:
          status === 401
            ? "Sua sessão expirou. Entre novamente."
            : error instanceof ImageServiceError
              ? error.message
              : "Não foi possível carregar as fotos. Tente novamente.",
      },
      { status, headers },
    );
  }
}
