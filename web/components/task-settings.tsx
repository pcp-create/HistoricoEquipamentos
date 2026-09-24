"use client";
import { useEffect, useState } from "react";
import { apiFetch, clearApiCache } from "@/lib/client-api-cache";
import {
  assignmentLocked,
  assignmentLockReason,
} from "@/lib/tasks/assignment-policy";
import TaskTerritories from "./task-territories";
export default function TaskSettings() {
  const [data, setData] = useState<any>(null),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  async function load() {
    const r = await apiFetch("/api/task-settings");
    const b = await r.json();
    if (!r.ok) throw Error(b.error);
    setData(b);
  }
  useEffect(() => {
    void load().catch((e) => setError(e.message));
  }, []);
  async function save(rule: any, assignee: string) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const r = await apiFetch("/api/task-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          origin: rule.origin,
          version: rule.version,
          assignee: assignee || null,
        }),
      });
      const b = await r.json();
      if (!r.ok) throw Error(b.error);
      await load();
      setMessage("Regra salva. Será aplicada às novas tarefas.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="task-settings">
      <h2>Configurações de Tarefas</h2>
      <p>
        Origens automáticas, regras de vencimento e atribuição de responsáveis.
        Alterações de atribuição valem para novas tarefas; os responsáveis das
        tarefas existentes são preservados.
      </p>
      {error && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
      <button
        disabled={busy}
        onClick={() => {
          clearApiCache();
          void load().catch((e) => setError(e.message));
        }}
      >
        Atualizar configurações
      </button>
      {!data ? (
        <p>Carregando configurações…</p>
      ) : (
        <>
          {!data.canEdit && (
            <p>Somente administradores podem editar as configurações.</p>
          )}
          <div className="task-table-wrap">
            <table className="task-settings-table">
              <thead>
                <tr>
                  <th>Origem</th>
                  <th>Quando cria a tarefa</th>
                  <th>Vencimento da tarefa</th>
                  <th>Atribuição automática</th>
                </tr>
              </thead>
              <tbody>
                {data.rules.map((r: any) => {
                  const locked = assignmentLocked(r.origin);
                  const rental =
                    r.origin === "Máquina de Locação" ||
                    r.origin === "Máquina Emprestada";
                  return (
                    <tr key={r.origin}>
                      <td>{r.origin}</td>
                      <td>
                        {rental
                          ? "Contrato vencido ou com menos de 30 dias para vencer."
                          : "Preventiva vencida, vencendo hoje ou nos próximos 30 dias."}
                      </td>
                      <td>
                        {rental
                          ? "Data final da locação ou empréstimo."
                          : "Previsão do plano: horas ou meses, o limite que chegar primeiro."}
                      </td>
                      <td>
                        <form
                          key={r.version}
                          onSubmit={(e) => {
                            e.preventDefault();
                            if (locked) return;
                            void save(
                              r,
                              String(
                                new FormData(e.currentTarget).get("assignee") ||
                                  "",
                              ),
                            );
                          }}
                        >
                          <label>
                            Responsável por {r.origin}
                            <select
                              name="assignee"
                              defaultValue={r.assignee || ""}
                              disabled={locked || !data.canEdit || busy}
                            >
                              <option value="">
                                Não atribuir automaticamente
                              </option>
                              {r.assignee && !r.enabled && (
                                <option value={r.assignee}>
                                  {r.display_name || "Funcionário"} (inativo)
                                </option>
                              )}
                              {data.users.map((u: any) => (
                                <option key={u.email} value={u.email}>
                                  {u.display_name || "Funcionário sem nome"}
                                </option>
                              ))}
                            </select>
                          </label>
                          {data.canEdit && (
                            <button disabled={locked || busy}>
                              Salvar atribuição
                            </button>
                          )}
                          {locked && (
                            <p className="task-assignment-locked">
                              {assignmentLockReason}
                            </p>
                          )}
                        </form>
                      </td>
                    </tr>
                  );
                })}
                <tr>
                  <td>Preventiva de Equipamento de Cliente</td>
                  <td>
                    Preventiva vencida, vencendo hoje ou nos próximos 30 dias.
                  </td>
                  <td>
                    Previsão do plano: horas ou meses, o limite que chegar
                    primeiro.
                  </td>
                  <td>
                    <strong>Conforme Divisão Comercial</strong>
                  </td>
                </tr>
                <tr>
                  <td>Tarefa manual</td>
                  <td>Criada pelo usuário em “Nova tarefa”.</td>
                  <td>Data informada na criação da tarefa.</td>
                  <td>Responsável escolhido na tarefa.</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p>
            As datas acompanham o processo de origem. Para alterar o vencimento,
            ajuste a locação, o empréstimo ou o plano preventivo. Tarefas
            abertas com data anterior a hoje aparecem como atrasadas,
            considerando Brasília. A regularização do processo conclui a tarefa
            automática.
          </p>
          {data.canEdit && <TaskTerritories />}
        </>
      )}
    </section>
  );
}
