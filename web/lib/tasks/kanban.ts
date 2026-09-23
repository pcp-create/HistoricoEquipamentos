export const taskColumns = {
  pending: "Pendentes",
  in_progress: "Em andamento",
  overdue: "Atrasadas",
  completed: "Concluídas",
} as const;
export type TaskColumn = keyof typeof taskColumns;
export function taskColumn(
  task: {
    status: string;
    kanban_column?: string | null;
    due_date?: string | Date | null;
  },
  today = new Date().toLocaleDateString("sv-SE", {
    timeZone: "America/Sao_Paulo",
  }),
): TaskColumn {
  if (task.status === "completed") return "completed";
  const due =
    task.due_date instanceof Date
      ? task.due_date.toISOString().slice(0, 10)
      : task.due_date?.slice(0, 10);
  if (due && due < today) return "overdue";
  if (
    task.kanban_column &&
    ["pending", "in_progress", "overdue"].includes(task.kanban_column)
  )
    return task.kanban_column as TaskColumn;
  return task.status === "in_progress" ? "in_progress" : "pending";
}
