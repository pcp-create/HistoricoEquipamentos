import { taskColumn } from "./kanban";
type SummaryTask = {
  assigned_to: string | null;
  status: string;
  kanban_column?: string | null;
  due_date?: string | Date | null;
};
type Recipient = {
  email: string;
  display_name: string | null;
  phone: string;
  enabled: boolean;
};
export function dailyTaskSummaries(
  tasks: SummaryTask[],
  users: Recipient[],
  origin: string,
  today: string,
) {
  const counts = new Map<
    string,
    { pending: number; in_progress: number; overdue: number; total: number }
  >();
  let unassigned = 0;
  for (const task of tasks) {
    const status = taskColumn(task, today);
    if (status === "completed") continue;
    if (!task.assigned_to) {
      unassigned++;
      continue;
    }
    const email = task.assigned_to.trim().toLowerCase();
    const row = counts.get(email) || {
      pending: 0,
      in_progress: 0,
      overdue: 0,
      total: 0,
    };
    row[status]++;
    row.total++;
    counts.set(email, row);
  }
  const summaries = [],
    skipped = [];
  const date = today.split("-").reverse().join("/");
  for (const [email, count] of counts) {
    const user = users.find((u) => u.email.toLowerCase() === email);
    if (!user?.enabled || !/^\d{10,15}$/.test(user.phone || "")) {
      skipped.push({
        email,
        reason: !user?.enabled
          ? "Usuário inativo ou ausente"
          : "WhatsApp não cadastrado ou inválido",
        total: count.total,
      });
      continue;
    }
    const name = user.display_name || "Responsável";
    summaries.push({
      email,
      name,
      number: user.phone,
      ...count,
      text: `📋 *Gestão Integrada | Resumo diário de tarefas*\n📅 ${date} · Horário de Brasília\n\nOlá, *${name}*!\nEstas são as tarefas em aberto atribuídas a você:\n\n📌 *Total em aberto: ${count.total}*\n⏳ Pendentes: *${count.pending}*\n🔵 Em andamento: *${count.in_progress}*\n🔴 Atrasadas: *${count.overdue}*\n\n🔗 Acompanhar minhas tarefas:\n${origin}/tarefas?mine=1\n\nTarefas concluídas não entram neste resumo.`,
    });
  }
  return { date: today, summaries, skipped, unassigned };
}
