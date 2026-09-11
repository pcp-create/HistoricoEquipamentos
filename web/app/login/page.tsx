"use client";
import { useState, type FormEvent } from "react";
import {
  ArrowRight,
  Wrench,
  ShieldCheck,
  LoaderCircle,
  Layers3,
} from "lucide-react";
export default function Login() {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const data = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: data.get("email"),
          password: data.get("password"),
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      window.location.assign("/");
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Não foi possível entrar.",
      );
      setBusy(false);
    }
  }
  return (
    <main className="login">
      <section className="login-story">
        <div className="brand">
          <span className="brand-icon">
            <Wrench size={25} />
          </span>
          <span>
            Histórico<span className="brand-small">EQUIPAMENTOS & PEÇAS</span>
          </span>
        </div>
        <div>
          <span className="eyebrow">INFORMAÇÃO QUE CONECTA</span>
          <h1>
            Cada equipamento
            <br />
            tem uma história.
            <br />
            <em>Encontre a sua.</em>
          </h1>
          <p>
            Ordens de serviço, clientes e materiais aplicados.
            <br />
            Todo o histórico da sua operação em um só lugar.
          </p>
          <div className="login-feature">
            <Layers3 size={22} />
            <span>Uma base integrada. Uma pesquisa completa.</span>
          </div>
        </div>
        <small>Histórico de Equipamentos e Peças · Acesso da equipe</small>
      </section>
      <section className="login-form">
        <form onSubmit={submit}>
          <span className="section-icon">
            <ShieldCheck />
          </span>
          <h2>Bem-vindo de volta</h2>
          <p>Entre com sua conta para consultar o histórico.</p>
          <label>
            E-mail
            <input
              name="email"
              type="email"
              autoComplete="username"
              placeholder="voce@empresa.com.br"
              required
              maxLength={254}
            />
          </label>
          <label>
            Senha
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              placeholder="Sua senha"
              required
              maxLength={256}
            />
          </label>
          {error && (
            <div className="error" role="alert">
              {error}
            </div>
          )}
          <button className="primary" disabled={busy}>
            {busy ? (
              <LoaderCircle className="spin" size={18} />
            ) : (
              <>
                Entrar no histórico
                <ArrowRight size={18} />
              </>
            )}
          </button>
          <div className="login-help">
            <ShieldCheck size={16} />
            Acesso individual e protegido
          </div>
          <p className="login-contact">
            Precisa de acesso ou esqueceu sua senha?
            <br />
            Entre em contato com o administrador.
          </p>
        </form>
      </section>
    </main>
  );
}
