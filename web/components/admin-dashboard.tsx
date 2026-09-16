"use client";
import "./admin-dashboard.css";
import { useEffect, useState } from "react";
import SiteHeader from "./site-header";
import { companyName } from "@/lib/company-names";
const date = (v: string) =>
  v
    ? new Date(v).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })
    : "Sem registro";
const eventNames: Record<string, string> = {
  login: "Login realizado",
  logout: "Saída do sistema",
  access_changed: "Permissão alterada",
};
export default function AdminDashboard() {
  const [data, setData] = useState<any>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [denied, setDenied] = useState(false);
  const [form, setForm] = useState({ email: "", role: "user", enabled: true });
  async function load() {
    try {
      const r = await fetch("/api/admin");
      if (r.status === 401) {
        window.location.assign("/login");
        return;
      }
      const body = await r.json();
      if (!r.ok) {
        if (r.status === 403) {
          setData(null);
          setDenied(true);
        }
        throw Error(body.error);
      }
      setDenied(false);
      setData(body);
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    void load();
    const timer = setInterval(load, 60000);
    return () => clearInterval(timer);
  }, []);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const r = await fetch("/api/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const b = await r.json();
      if (!r.ok) throw Error(b.error);
      setMessage("Permissões salvas.");
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <SiteHeader active="admin" email={data?.email} />
      <main className="catalog-settings admin-page">
        <section className="manual-card">
          <h1>Administração</h1>
          <p>Acessos da equipe e acompanhamento das integrações.</p>
          <button disabled={busy} onClick={load}>
            Atualizar registros
          </button>
        </section>
        {error && (
          <p role="alert" className="catalog-settings-error">
            {error}
          </p>
        )}
        {message && <p role="status">{message}</p>}
        {!data && !error && <p>Carregando administração…</p>}
        {data && !denied && (
          <>
            <section className="manual-card">
              <h2>Usuários e permissões</h2>
              <p className="muted">
                Administrador gerencia acessos e visualiza esta tela. Usuário
                mantém as funções operacionais do sistema. A conta e a senha
                continuam sendo cadastradas no Supabase.
              </p>
              <form onSubmit={save}>
                <fieldset disabled={busy}>
                  <legend>Liberar acesso ou alterar perfil</legend>
                  <div className="admin-form-grid">
                    <label>
                      E-mail
                      <input
                        type="email"
                        required
                        maxLength={254}
                        value={form.email}
                        onChange={(e) =>
                          setForm({ ...form, email: e.target.value })
                        }
                      />
                    </label>
                    <label>
                      Perfil
                      <select
                        aria-label="Perfil"
                        value={form.role}
                        onChange={(e) =>
                          setForm({ ...form, role: e.target.value })
                        }
                      >
                        <option value="user">Usuário</option>
                        <option value="admin">Administrador</option>
                      </select>
                    </label>
                    <label>
                      Acesso
                      <select
                        aria-label="Acesso"
                        value={String(form.enabled)}
                        onChange={(e) =>
                          setForm({
                            ...form,
                            enabled: e.target.value === "true",
                          })
                        }
                      >
                        <option value="true">Liberado</option>
                        <option value="false">Bloqueado</option>
                      </select>
                    </label>
                  </div>
                  <div className="catalog-editor-actions">
                    <button className="catalog-save-button">
                      Salvar permissões
                    </button>
                  </div>
                </fieldset>
              </form>
              <p className="muted">
                Online = tela visível com atividade nos últimos 2 minutos, não
                uma conexão contínua. Último acesso registra login; última
                atividade registra a presença na tela. Datas em Brasília.
                Registros anteriores à implantação podem não estar disponíveis.
              </p>
              <div className="admin-table">
                <table>
                  <thead>
                    <tr>
                      <th>Usuário</th>
                      <th>Perfil / acesso</th>
                      <th>Presença</th>
                      <th>Último acesso</th>
                      <th>Última atividade</th>
                      <th>Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.users.map((u: any) => (
                      <tr key={u.email}>
                        <td>
                          {u.display_name || "Nome ainda não registrado"}
                          <small>{u.email}</small>
                        </td>
                        <td>
                          {u.role === "admin" ? "Administrador" : "Usuário"}
                          <small>{u.enabled ? "Liberado" : "Bloqueado"}</small>
                        </td>
                        <td>
                          <span
                            className={`admin-status ${u.online ? "" : "admin-offline"}`}
                          >
                            {u.online ? "Online" : "Offline"}
                          </span>
                        </td>
                        <td>{date(u.last_login_at)}</td>
                        <td>{date(u.last_seen_at)}</td>
                        <td>
                          <button
                            onClick={() =>
                              setForm({
                                email: u.email,
                                role: u.role,
                                enabled: u.enabled,
                              })
                            }
                          >
                            Editar acesso
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
            <section className="manual-card">
              <h2>Integração de ordens de serviço</h2>
              <p className="muted">
                Horários confirmados na base e quantidade de OS pendentes.
                Ausência de erro não comprova que o processo esteja em execução
                agora.
              </p>
              <div className="admin-table">
                <table>
                  <thead>
                    <tr>
                      <th>Empresa</th>
                      <th>Última listagem</th>
                      <th>Último detalhe coletado</th>
                      <th>Pendentes</th>
                      <th>Com erro</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.orders.map((r: any) => (
                      <tr key={r.company_id}>
                        <td>{companyName(r.company_id)}</td>
                        <td>{date(r.inventory_at)}</td>
                        <td>{date(r.detail_at)}</td>
                        <td>{r.pending}</td>
                        <td>{r.errors}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
            <section className="manual-card">
              <h2>Integração de produtos</h2>
              <div className="admin-table">
                <table>
                  <thead>
                    <tr>
                      <th>Empresa</th>
                      <th>Rotina</th>
                      <th>Último sucesso</th>
                      <th>Última carga completa</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.products.map((r: any) => (
                      <tr key={`${r.company_id}:${r.mode}`}>
                        <td>{companyName(r.company_id)}</td>
                        <td>
                          {{
                            catalog: "Cadastro de produtos",
                            available: "Estoque disponível",
                            detail: "Detalhes e custos",
                          }[r.mode as string] || r.mode}
                        </td>
                        <td>{date(r.success_at)}</td>
                        <td>{date(r.full_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
            <section className="manual-card">
              <h2>Integração de equipamentos</h2>
              <p className="muted">
                O cadastro é compartilhado e coletado pela RJ Indústria.
                Vínculos são conferidos nas três empresas.
              </p>
              <div className="admin-table">
                <table>
                  <thead>
                    <tr>
                      <th>Empresa</th>
                      <th>Cadastro</th>
                      <th>Vínculos iniciais</th>
                      <th>Cruzamento com OS</th>
                      <th>Situação registrada</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.equipment.map((r: any) => (
                      <tr key={r.company_id}>
                        <td>{companyName(r.company_id)}</td>
                        <td>{date(r.catalog_at)}</td>
                        <td>{date(r.seed_at)}</td>
                        <td>{date(r.linked_at)}</td>
                        <td>
                          {r.has_error
                            ? "Erro registrado"
                            : "Sem erro registrado"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
            <section className="manual-card">
              <h2>Execuções registradas pelo integrador</h2>
              <p className="muted">
                Últimas 30 execuções disponíveis no log do integrador. Rotinas
                que não gravam nesse log aparecem nas tabelas de coleta acima.
              </p>
              <div className="admin-table">
                <table>
                  <thead>
                    <tr>
                      <th>Empresa</th>
                      <th>Início</th>
                      <th>Fim</th>
                      <th>Status</th>
                      <th>Registros recebidos</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.runs.map((r: any, i: number) => (
                      <tr key={i}>
                        <td>{companyName(r.company_id)}</td>
                        <td>{date(r.data_inicio)}</td>
                        <td>{date(r.data_fim)}</td>
                        <td>{r.status}</td>
                        <td>{r.registros_recebidos}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
            <section className="manual-card">
              <h2>Logs de acesso e administração</h2>
              <p className="muted">
                Últimos 100 eventos. Senhas e tokens não são registrados.
              </p>
              <div className="admin-table">
                <table>
                  <thead>
                    <tr>
                      <th>Data</th>
                      <th>Evento</th>
                      <th>Usuário</th>
                      <th>Responsável</th>
                      <th>Alteração</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.events.map((r: any, i: number) => (
                      <tr key={i}>
                        <td>{date(r.created_at)}</td>
                        <td>{eventNames[r.event] || r.event}</td>
                        <td>{r.email}</td>
                        <td>{r.actor}</td>
                        <td>
                          {r.details?.after
                            ? `${r.details.after.role === "admin" ? "Administrador" : "Usuário"} · ${r.details.after.enabled ? "Liberado" : "Bloqueado"}`
                            : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}
      </main>
    </>
  );
}
