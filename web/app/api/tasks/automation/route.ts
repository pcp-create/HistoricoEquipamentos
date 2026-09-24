import { dailyTaskSummaries } from "@/lib/tasks/daily-summary";
import { database } from "@/lib/db";
import { brazilToday } from "@/lib/equipment-management/planning";
import { reportTokenMatches } from "@/lib/preventive-reports/access";
import { syncTasks, TaskInputError, TaskConflict } from "@/lib/tasks/store";
import {
  claimNotifications,
  acknowledgeNotification,
} from "@/lib/tasks/notifications";
export const runtime = "nodejs";
export const maxDuration = 60;
const headers = { "Cache-Control": "private, no-store" };
export async function POST(req: Request) {
  if (
    !reportTokenMatches(
      req.headers.get("authorization"),
      process.env.TASK_AUTOMATION_TOKEN || process.env.PREVENTIVE_REPORT_TOKEN,
    )
  )
    return Response.json(
      { error: "Credencial inválida." },
      { status: 401, headers },
    );
  try {
    const raw = await req.text();
    if (raw.length > 1000) throw new TaskInputError("Dados excedem o limite.");
    const body = JSON.parse(raw);
    if (body.action === "ack") {
      await acknowledgeNotification(body.id, body.token);
      return Response.json({ ok: true }, { headers });
    }
    if (body.action === "daily-summary") {
      await syncTasks();
      const db = database();
      const tasks = (
        await db.query(
          "SELECT assigned_to,status,kanban_column,due_date FROM web_tasks WHERE status<>'completed'",
        )
      ).rows;
      const users = (
        await db.query(
          "SELECT email,display_name,phone,enabled FROM web_user_access",
        )
      ).rows;
      return Response.json(
        dailyTaskSummaries(
          tasks,
          users,
          new URL(req.url).origin,
          brazilToday(),
        ),
        { headers },
      );
    }
    if (body.action !== "sync") throw new TaskInputError("Operação inválida.");
    const result = await syncTasks();
    const notifications =
      body.deliver === true
        ? await claimNotifications(new URL(req.url).origin)
        : [];
    return Response.json({ ...result, notifications }, { headers });
  } catch (e) {
    console.error("TASK_AUTOMATION_FAILED");
    return Response.json(
      {
        error:
          e instanceof TaskInputError || e instanceof TaskConflict
            ? e.message
            : "Falha na automação. Nenhuma confirmação de entrega foi registrada.",
      },
      {
        status:
          e instanceof TaskInputError
            ? 400
            : e instanceof TaskConflict
              ? 409
              : 503,
        headers,
      },
    );
  }
}
