import Image from "next/image";
import Link from "next/link";
import { CalendarDays, ClipboardCheck, Mail, Settings2 } from "lucide-react";
import styles from "./public-home.module.css";

export default function PublicHome() {
  return <main className={styles.page}>
    <header className={styles.header}>
      <Link href="/" className={styles.brand} aria-label="Gestão Integrada — RJ Compressores">
        <Image src="/logo-rj.png" alt="RJ Compressores" width={78} height={52} priority />
        <span><strong>Gestão Integrada</strong><small>RJ Compressores</small></span>
      </Link>
      <Link href="/login" className={styles.login}>Acessar o sistema</Link>
    </header>
    <section className={styles.hero}>
      <p className={styles.eyebrow}>PLATAFORMA DA RJ COMPRESSORES</p>
      <h1>Gestão Integrada</h1>
      <p>Uma plataforma para organizar atendimentos técnicos, equipamentos e atividades comerciais da RJ Compressores.</p>
      <Link href="/login" className={styles.primary}>Entrar na plataforma</Link>
      <small>O acesso às ferramentas é destinado a usuários autorizados.</small>
    </section>
    <section className={styles.features} aria-labelledby="funcoes">
      <h2 id="funcoes">O que você pode fazer</h2>
      <div className={styles.grid}>
        <article><CalendarDays aria-hidden="true"/><h3>Programar atendimentos</h3><p>Organizar ordens de serviço, agenda e atividades das equipes.</p></article>
        <article><ClipboardCheck aria-hidden="true"/><h3>Registrar serviços</h3><p>Preencher relatórios, checklists e apontamentos dos atendimentos técnicos.</p></article>
        <article><Settings2 aria-hidden="true"/><h3>Acompanhar equipamentos</h3><p>Consultar máquinas, histórico de manutenção e informações comerciais.</p></article>
        <article><Mail aria-hidden="true"/><h3>Compartilhar relatórios</h3><p>Preparar relatórios técnicos em PDF e enviá-los aos destinatários escolhidos.</p></article>
      </div>
    </section>
    <section className={styles.google}>
      <h2>Conexão com o Google</h2>
      <p>A conexão com o Gmail é opcional. Quando autorizada pelo usuário, a plataforma usa a conta Google para criar um rascunho ou enviar o relatório técnico e os anexos escolhidos. A mensagem e os destinatários são conferidos no sistema antes da ação.</p>
      <p>A plataforma usa o endereço de e-mail da conta para abrir os rascunhos da conta selecionada. Saiba como os dados são tratados e como revogar o acesso na <Link href="/privacidade">Política de Privacidade</Link>.</p>
    </section>
    <footer className={styles.footer}><span>RJ Compressores · Gestão Integrada</span><Link href="/privacidade">Política de Privacidade</Link><a href="mailto:contato@rjcompressores.com.br">Contato</a></footer>
  </main>;
}
