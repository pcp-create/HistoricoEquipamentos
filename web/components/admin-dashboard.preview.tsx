"use client";
import UserPhotoEditor from "./user-photo-editor";
import IntegrationItems from "./integration-items";
import SupportPicker from "./support-picker";
import SaveActionIcon from "./save-action-icon";
import { userTaskColor } from "@/lib/tasks/user-color";
import { apiFetch } from "@/lib/client-api-cache";
import "./admin-dashboard.css";
import { Fragment, useEffect, useState } from "react";
import {Search, UserPlus} from "lucide-react";
import SiteHeader from "./site-header";
import { companyName } from "@/lib/company-names";
const emptyEmployee = {
  email: "",
  display_name: "",
  department: "",
  job_title: "",
  hourly_cost: "",
  m8_employee_id: "",
  managers: [] as string[],
  phone: "",
  task_color: null as string | null,
  role: "user",
  enabled: true,
  alert_preventive: false,
  alert_rental: false,
  alert_email: true,
  alert_whatsapp: false,
};
const date = (v: string) =>
  v
    ? new Date(v).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })
    : "Sem registro";
const eventNames: Record<string, string> = {
  photo_updated: "Foto do usuário atualizada",
  photo_removed: "Foto do usuário removida",
  login: "Login realizado",
  logout: "Saída do sistema",
  access_changed: "Cadastro / permissão alterados",
  account_created: "Conta de acesso criada",
  password_reset: "Senha redefinida pelo administrador",
  password_changed: "Senha alterada pelo usuário",
};
export default function AdminDashboard() {
  const [data, setData] = useState<any>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [denied, setDenied] = useState(false);
  const [form, setForm] = useState(emptyEmployee);
  const [editing, setEditing] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [tab, setTab] = useState("users");
  const [userSearch,setUserSearch] = useState("");
  const normalizeSearch=(value:string)=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR');
  const searchTerms=normalizeSearch(userSearch.trim()).split(/\s+/).filter(Boolean);
  const filteredUsers=(data?.users||[]).filter((u:any)=>{const text=normalizeSearch([u.display_name,u.email,u.department,u.job_title,u.phone].filter(Boolean).join(' '));return searchTerms.every(term=>text.includes(term));});
  const hasLogin = Boolean(data?.users?.find((u: any) => u.email === form.email)?.user_id);
  async function load() {
    try {
      const r = await apiFetch("/api/admin");
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
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, 60000);
    return () => clearInterval(timer);
  }, []);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    const before = data;
    if (editing && data)
      setData({
        ...data,
        users: data.users.map((u: any) =>
          u.email === form.email ? { ...u, ...form } : u,
        ),
      });
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const r = await apiFetch("/api/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, mode: editing ? "update" : "create" }),
      });
      const b = await r.json();
      if (!r.ok) throw Error(b.error);
      setMessage(
        "Funcionário salvo. As preferências serão consideradas na próxima execução dos fluxos atualizados.",
      );
      setEditing(true);
      await load();
    } catch (e) {
      setData(before);
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function createLogin(reset = false) {
    if(reset && !confirm("Redefinir a senha deste usuário para 123456? Ele receberá as instruções pelo WhatsApp cadastrado e deverá trocá-la no próximo acesso."))return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const r = await apiFetch("/api/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: reset ? "reset-password" : "create-login",
          email: form.email,
        }),
      });
      const b = await r.json();
      if (!r.ok) throw Error(b.error);
      setMessage(
        reset
          ? "Senha redefinida para 123456. Aviso agendado para envio pelo assistente no WhatsApp cadastrado. A troca será obrigatória no próximo acesso."
          : "Conta criada com senha inicial 123456. A troca será obrigatória no primeiro acesso.",
      );
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const employeeEditor = formOpen && data ? (
                  <>
                    <form onSubmit={save} autoComplete="off">
                      <fieldset disabled={busy}>
                        <legend>
                          {editing ? "Editar funcionário" : "Novo funcionário"}
                        </legend>
                        {editing ? <UserPhotoEditor key={form.email} email={form.email}/> : <p>Salve o cadastro para anexar a foto do usuário.</p>}
                        <div className="admin-form-grid">
                          {(
                            [
                              ["display_name", "Nome completo"],
                              ["department", "Setor"],
                              ["job_title", "Cargo"], ["m8_employee_id", "ID do técnico no M8"],
                              ["phone", "WhatsApp (país + DDD + número)"],
                            ] as const
                          ).map(([key, label]) => (
                            <label key={key}>
                              {label}
                              <input
                                type={key === "m8_employee_id" ? "number" : "text"}
                                min={key === "m8_employee_id" ? 1 : undefined}
                                max={key === "m8_employee_id" ? 2147483647 : undefined}
                                required={key === "display_name"}
                                maxLength={
                                  key === "phone"
                                    ? 40
                                    : key === "display_name"
                                      ? 160
                                      : 120
                                }
                                value={form[key] ?? ""}
                                onChange={(e) =>
                                  setForm({ ...form, [key]: e.target.value })
                                }
                              />
                            </label>
                          ))}
                          <div className="employee-managers">
                            <span className="employee-managers-label">Gestores para aprovação</span>
                            <SupportPicker
                              className="employee-managers-picker"
                              label="Gestores para aprovação"
                              filterLabel="Pesquisar gestor"
                              removeLabel="Remover gestor"
                              disabled={busy || data.managersAvailable===false}
                              users={data.users.filter((u:any)=>u.email!==form.email && (u.enabled || (form.managers||[]).includes(u.email)))}
                              selected={form.managers||[]}
                              onChange={(managers:string[])=>setForm({...form,managers})}
                            />
                            {data.managersAvailable===false&&<small>O cadastro de gestores aguarda habilitação.</small>}
                          </div>
                          <label>Custo de mão de obra por hora (R$)<input type="number" min="0" max="1000000" step="0.01" value={form.hourly_cost??""} onChange={e=>setForm({...form,hourly_cost:e.target.value})}/></label>
                          <label>
                            Cor nas tarefas
                            <input
                              type="color"
                              aria-label="Cor nas tarefas"
                              value={userTaskColor(form.email, form.task_color)}
                              onChange={(e) =>
                                setForm({ ...form, task_color: e.target.value })
                              }
                            />
                            <small>
                              Identifica este funcionário no Kanban e no
                              calendário.
                            </small>
                          </label>
                          <label>
                            E-mail
                            <input
                              type="email"
                              readOnly={editing}
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
                              <option value="manager">Gestor</option>
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
                        <fieldset>
                          <legend>Recebimento de alertas</legend>
                          {(
                            [
                              [
                                "alert_preventive",
                                "Recebe alerta de preventiva?",
                              ],
                              [
                                "alert_rental",
                                "Recebe alerta de locação/empréstimo?",
                              ],
                              ["alert_email", "Receber por e-mail"],
                              ["alert_whatsapp", "Receber pelo WhatsApp"],
                            ] as const
                          ).map(([key, label]) => (
                            <label key={key} className="admin-alert-option">
                              <input
                                type="checkbox"
                                checked={form[key]}
                                onChange={(e) =>
                                  setForm({ ...form, [key]: e.target.checked })
                                }
                              />{" "}
                              <span>{label}</span>
                            </label>
                          ))}
                          <p className="muted">
                            Valem os horários dos relatórios diários, semanais e
                            mensais. WhatsApp usa o número pessoal informado;
                            grupos continuam sendo destinos separados da
                            automação.
                          </p>
                        </fieldset>
                        <div className="catalog-editor-actions">
                          <button className="catalog-save-button" aria-label="Salvar funcionário" title="Salvar funcionário"><SaveActionIcon /></button>
                          <button
                            type="button"
                            onClick={() => {
                              setFormOpen(false);
                              setForm(emptyEmployee);
                              setEditing(false);
                              setError("");
                              setMessage("");
                            }}
                          >
                            Fechar cadastro
                          </button>
                        </div>
                      </fieldset>
                    </form>
                    {editing && (
                      <fieldset disabled={busy}>
                        <legend>Conta de acesso</legend>
                        {!data.loginProvisioningConfigured && (
                          <p role="note">
                            A criação de contas e a redefinição de senhas precisam
                            ser configuradas no servidor.
                          </p>
                        )}
                        <p>
                          {hasLogin
                            ? "O reset define a senha padrão 123456 e exige uma nova senha no próximo acesso."
                            : "Salve o cadastro e crie a conta com a senha inicial automática 123456."}
                        </p>
                        <button
                          type="button"
                          disabled={!data.loginProvisioningConfigured || busy}
                          onClick={() => void createLogin(hasLogin)}
                        >
                          {hasLogin ? "Reset de senha" : "Criar conta de acesso"}
                        </button>
                      </fieldset>
                    )}
                  </>
  ) : null;
  return (
    <>
      <SiteHeader active="admin" email={data?.email} />
      <main className="catalog-settings admin-page">
        <header className="admin-page-heading">
          <h1>Administração</h1>
          <p>Acessos da equipe e acompanhamento das integrações.</p>
        </header>
        {error && (
          <p role="alert" className="catalog-settings-error">
            {error}
          </p>
        )}
        {message && <p role="status">{message}</p>}
        {!data && !error && <p>Carregando administração…</p>}
        {data && !denied && (
          <section className="admin-workspace">
            <nav
              className="admin-tabs app-section-tabs"
              aria-label="Seções da administração"
            >
              {[
                ["users", "Usuários"],
                ["integrations", "Integrações"],
                ["logs", "Logs de acesso"],
              ].map(([key, label]) => (
                <button
                  type="button"
                  key={key}
                  aria-pressed={tab === key}
                  onClick={() => setTab(key)}
                >
                  {label}
                </button>
              ))}
            </nav>
            <div hidden={tab !== "users"}>
              <section className="manual-card">
                <h2>Funcionários e acessos</h2>
                <p className="muted">
                  Gerencie os cadastros, as permissões e os acessos da equipe.
                </p>
                <div className="admin-users-toolbar">
                  <label className="admin-user-search">
                    <span>Pesquisar usuários</span>
                    <div><Search size={18} aria-hidden="true"/><input type="search" placeholder="Nome, e-mail, cargo ou setor" value={userSearch} onChange={e=>setUserSearch(e.target.value)}/></div>
                  </label>
                {!formOpen && (
                  <button
                    className="admin-new-user"
                    type="button"
                    onClick={() => {
                      setForm(emptyEmployee);
                      setEditing(false);
                      setError("");
                      setMessage("");
                      setFormOpen(true);
                    }}
                  >
                    <UserPlus size={18} aria-hidden="true"/> Novo funcionário
                  </button>
                )}
                </div>
                <p className="admin-user-count" role="status">{filteredUsers.length} de {data.users.length} usuário(s)</p>
                {formOpen && !editing && employeeEditor}
                <div className="admin-table">
                  <table>
                    <thead>
                      <tr>
                        <th>Usuário</th>
                        <th>Perfil / acesso</th>
                        <th>Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredUsers.map((u: any) => (
                        <Fragment key={u.email}>
                        <tr className={formOpen && editing && form.email===u.email ? "admin-user-editing" : undefined}>
                          <td>
                            {u.display_name || "Nome ainda não registrado"}
                            <small>{u.email}</small>
                            <small>
                              {[u.department, u.job_title, u.phone]
                                .filter(Boolean)
                                .join(" · ")}
                            </small>
                            <small>
                              Alertas:{" "}
                              {[
                                u.alert_preventive && "Preventivas",
                                u.alert_rental && "Locações/Empréstimos",
                              ]
                                .filter(Boolean)
                                .join(" · ") || "Nenhum"}
                            </small>
                          </td>
                          <td>
                            {u.role === "admin" ? "Administrador" : u.role === "manager" ? "Gestor" : "Usuário"}
                            <small>
                              {u.enabled ? "Liberado" : "Bloqueado"}
                            </small>
                          </td>

                          <td>
                            <button
                              type="button"
                              disabled={busy}
                              aria-expanded={formOpen && editing && form.email===u.email}
                              onClick={() => {
                                setForm({
                                  ...emptyEmployee,
                                  ...Object.fromEntries(
                                    Object.keys(emptyEmployee).map((k) => [
                                      k,
                                      u[k] ??
                                        emptyEmployee[
                                          k as keyof typeof emptyEmployee
                                        ],
                                    ]),
                                  ),
                                });
                                setFormOpen(true);
                                setEditing(true);
                                setError("");
                                setMessage("");
                              }}
                            >
                              Editar funcionário
                            </button>
                          </td>
                        </tr>
                        {formOpen && editing && form.email===u.email && <tr className="admin-user-editor-row"><td colSpan={3}><div className="admin-user-inline-editor">{employeeEditor}</div></td></tr>}
                        </Fragment>
                      ))}
                      {!filteredUsers.length && <tr><td colSpan={3} className="admin-users-empty">{userSearch.trim()?"Nenhum usuário encontrado. Tente outro nome, e-mail ou cargo.":"Nenhum usuário cadastrado."}</td></tr>}
                    </tbody>
                  </table>
                </div>
              </section>
            </div>
            {tab === "integrations" && <>
              <IntegrationItems />
              <details><summary>Resumo das coletas e execuções do integrador</summary>
              <section className="manual-card">
                <h2>Integração de ordens de serviço</h2>
                <p className="muted">
                  Horários confirmados na base e quantidade de OS pendentes.
                  Ausência de erro não comprova que o processo esteja em
                  execução agora.
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
              </details>
            </>}
            <div hidden={tab !== "logs"}>
              <section className="manual-card">
                <h2>Presença e últimos acessos</h2>
                <p className="muted">
                  Online = tela visível com atividade nos últimos 15 minutos,
                  não uma conexão contínua. Último acesso registra login; última
                  atividade registra a presença na tela. Datas em Brasília.
                  Registros anteriores à implantação podem não estar
                  disponíveis.
                </p>
                <div className="admin-table">
                  <table>
                    <thead>
                      <tr>
                        <th>Usuário</th>
                        <th>Presença</th>
                        <th>Último acesso</th>
                        <th>Última atividade</th>
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
                            <span
                              className={`admin-status ${u.online ? "" : "admin-offline"}`}
                            >
                              <span
                                className="admin-presence-light"
                                aria-hidden="true"
                              />
                              {u.online ? "Online" : "Offline"}
                            </span>
                          </td>
                          <td>{date(u.last_login_at)}</td>
                          <td>{date(u.last_seen_at)}</td>
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
                              ? `${r.details.after.role === "admin" ? "Administrador" : r.details.after.role === "manager" ? "Gestor" : "Usuário"} · ${r.details.after.enabled ? "Liberado" : "Bloqueado"}`
                              : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </div>
          </section>
        )}
      </main>
    </>
  );
}
