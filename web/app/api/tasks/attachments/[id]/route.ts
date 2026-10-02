import { assertTaskAccess } from "@/lib/tasks/privacy";
import { taskAttachmentMime } from "@/lib/tasks/attachment-types";
import { requireUser, Unauthorized, Forbidden } from "@/lib/auth";
import { database } from "@/lib/db";
export const runtime = "nodejs";
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireUser();
    const { id } = await params;
    if (!/^\d{1,18}$/.test(id)) return new Response(null, { status: 404 });
    const row = (
      await database().query(
        "SELECT task_id,filename,content FROM web_task_attachments WHERE id=$1",
        [id],
      )
    ).rows[0];
    if (!row) return new Response(null, { status: 404 });
    await assertTaskAccess(String(row.task_id),user.email);
    return new Response(new Uint8Array(row.content), {
      headers: {
        "Content-Type": taskAttachmentMime(row.filename),
        "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(row.filename)}`,
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, no-store",
      },
    });
  } catch (e) {
    return new Response(null, {
      status: e instanceof Forbidden ? 403 : e instanceof Unauthorized ? 401 : 503,
    });
  }
}
