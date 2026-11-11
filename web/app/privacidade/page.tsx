import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import styles from "./privacy.module.css";

export const metadata: Metadata = {
  title: "Política de Privacidade | RJ Compressores",
  description: "Como a Gestão Integrada e o Portal Técnico RJ tratam dados pessoais, localização e registros de atendimento.",
  alternates: { canonical: "https://rjcompressores.app/privacidade" },
};

export default function PrivacyPolicy() {
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <Image src="/logo-rj.png" alt="RJ Compressores" width={96} height={64} style={{objectFit:"contain"}} />
        <span>Gestão Integrada · Portal Técnico RJ</span>
        <Link href="/login">Acessar o sistema</Link>
      </header>
      <article className={styles.document}>
        <p className={styles.eyebrow}>TRANSPARÊNCIA E PROTEÇÃO DE DADOS</p>
        <h1>Política de Privacidade</h1>
        <p>Última atualização: <time dateTime="2026-11-11">11 de novembro de 2026</time>.</p>
        <p>Esta política explica o tratamento de dados pessoais no sistema Gestão Integrada RJ Compressores, no Portal Técnico RJ para Android e nos portais de vendas e visitas disponíveis em rjcompressores.app. Aplica-se a usuários autorizados, técnicos, vendedores, clientes e pessoas identificadas nos atendimentos.</p>

        <h2>1. Responsável e contato</h2>
        <p>A RJ Compressores administra a plataforma. Os dados dos atendimentos são tratados pela empresa do grupo responsável pela relação comercial ou de trabalho: RJ Compressores, RJ Serrana ou Criciúma Compressores, conforme o cadastro e a ordem de serviço.</p>
        <p>Para assuntos de privacidade, utilize o canal geral <a href="mailto:contato@rjcompressores.com.br?subject=Privacidade%20e%20dados%20pessoais">contato@rjcompressores.com.br</a> ou o telefone <a href="tel:+554735226652">(47) 3522-6652</a>, solicitando encaminhamento ao responsável pela proteção de dados. Endereço de contato: Rua Plásio Bilk Júnior, Galpão nº 250, Taboão, Rio do Sul/SC, CEP 89160-408.</p>

        <h2>2. Dados utilizados e finalidades</h2>
        <ul>
          <li><strong>Conta e acesso:</strong> nome, e-mail, telefone, identificação profissional, perfil de permissão e dados de autenticação, para identificar usuários e controlar o acesso.</li>
          <li><strong>Clientes e equipamentos:</strong> nomes, documentos, endereços, contatos, dados comerciais, modelos, séries, vínculos com clientes e horímetros, para organizar visitas, vendas, manutenção e ordens de serviço.</li>
          <li><strong>Execução dos serviços:</strong> programação, deslocamentos, apontamentos de horas, checklists, medições, observações, ocorrências, peças, tarefas e decisões de revisão ou aprovação, para executar, acompanhar e comprovar os atendimentos.</li>
          <li><strong>Fotos, assinaturas e documentos:</strong> imagens e arquivos incluídos pelo usuário, nome do responsável pelo aceite e assinatura desenhada na tela, para documentar o serviço e o aceite. A assinatura é utilizada como registro do atendimento, sem reconhecimento biométrico automatizado.</li>
          <li><strong>Dados técnicos:</strong> endereço IP, datas de acesso, informações do navegador ou aplicativo, sessões e registros de erros e sincronização, para segurança, suporte e funcionamento do serviço.</li>
        </ul>
        <p>Inclua apenas informações necessárias ao atendimento. Evite registrar dados pessoais de terceiros sem necessidade ou autorização aplicável.</p>

        <h2>3. Localização do técnico</h2>
        <p>O Portal Técnico RJ coleta localização precisa, incluindo latitude, longitude, precisão e horário, para registrar apontamentos e deslocamentos, apoiar a programação e exibir a posição dos técnicos aos usuários autorizados da gestão.</p>
        <p>No Android, o serviço de localização pode continuar coletando e transmitindo posições periodicamente enquanto estiver ativo, inclusive com o aplicativo fora da tela ou o aparelho bloqueado. O serviço utiliza uma notificação persistente indicando que a localização está ativa e busca atualizar a posição aproximadamente a cada cinco minutos, conforme conexão e disponibilidade do GPS.</p>
        <p>O aplicativo solicita a permissão de localização do Android. É possível gerenciá-la nas configurações do aparelho. Sem a autorização e a localização ativada, o acesso ao Portal Técnico e funções dependentes de localização podem ficar indisponíveis. A localização é utilizada para a operação dos serviços, não para publicidade.</p>

        <h2>4. Armazenamento no celular e sincronização</h2>
        <p>O aplicativo mantém programação, rascunhos, relatórios, fotos e registros pendentes no aparelho para permitir trabalho sem internet e recuperação de informações. Quando há conexão, os registros são enviados ao servidor e a fila de sincronização é atualizada conforme as confirmações recebidas.</p>
        <p>Cópias locais e arquivos exportados pelo usuário podem continuar no dispositivo mesmo após o envio. Desinstalar o aplicativo ou limpar seus dados pode apagar registros ainda não sincronizados. Para solicitar a exclusão de dados, siga o canal indicado nesta política e informe se há registros pendentes no aparelho.</p>
        <p>Se a opção “Lembrar-me” for utilizada no Android, as credenciais de acesso são guardadas localmente de forma protegida pelo armazenamento criptográfico do aparelho. Não compartilhe sua conta ou um dispositivo desbloqueado.</p>

        <h2>5. Integrações, destinatários e compartilhamento</h2>
        <p>Os dados necessários ao serviço são acessados por pessoas autorizadas conforme suas atribuições e podem ser compartilhados com:</p>
        <ul>
          <li>O ERP M8, para cadastros, vínculos de equipamentos, ordens de serviço, anexos e atualizações operacionais.</li>
          <li>Provedores de hospedagem, banco de dados, autenticação e infraestrutura, incluindo Vercel e Supabase, para disponibilizar e proteger a plataforma.</li>
          <li>Clientes, responsáveis pelo atendimento e destinatários selecionados pelo usuário, por meio de relatórios, anexos e comunicações relacionadas ao serviço.</li>
          <li>Autoridades ou outros destinatários quando houver obrigação legal ou necessidade de exercício de direitos.</li>
        </ul>
        <p>A infraestrutura de terceiros pode envolver processamento fora do Brasil. Esse tratamento deve observar os mecanismos de proteção e transferência internacional aplicáveis. Os dados não são comercializados nem utilizados pela plataforma para publicidade comportamental.</p>

        <h2>6. Conexão opcional com Google e Gmail</h2>
        <p>Quando o usuário escolhe conectar uma conta Google, a autorização permite identificar a conta de e-mail e criar rascunhos ou enviar mensagens com o relatório e os anexos selecionados. Os destinatários, assunto, mensagem e PDF são enviados ao Gmail para essa finalidade. A conexão é opcional e a senha Google não é solicitada pela plataforma.</p>
        <p>O token de autorização é utilizado no navegador durante a operação e descartado do fluxo ao finalizar. A funcionalidade não utiliza a caixa de entrada para pesquisas ou análises. Mensagens e rascunhos criados permanecem na conta Gmail e podem ser gerenciados pelo titular.</p>
        <p>O uso e a transferência de informações recebidas das APIs Google seguem a <a href="https://developers.google.com/terms/api-services-user-data-policy">Política de Dados do Usuário dos Serviços de API do Google</a>, incluindo os requisitos de Uso Limitado. Esses dados não são utilizados para anúncios ou treinamento de modelos de inteligência artificial. A autorização pode ser revogada nas <a href="https://myaccount.google.com/connections">conexões da Conta Google</a>; a revogação não apaga mensagens já enviadas ou documentos do atendimento.</p>

        <h2>7. Fundamentos e segurança do tratamento</h2>
        <p>Conforme a finalidade, o tratamento se apoia na execução de contratos e procedimentos relacionados, em obrigações legais ou regulatórias, no exercício de direitos, em interesses legítimos avaliados para a gestão e segurança do serviço ou no consentimento, quando exigido. A permissão técnica concedida no aparelho não substitui as bases legais aplicáveis.</p>
        <p>São utilizados conexão HTTPS, autenticação, controle de acesso por perfil e mecanismos de proteção das sessões e do armazenamento. O acesso deve ocorrer apenas por pessoas autorizadas. Nenhum sistema elimina integralmente os riscos; comunique suspeitas de acesso indevido pelo canal de contato.</p>
        <p>Cookies de sessão e armazenamento local são utilizados para autenticação, preferências, rascunhos e funcionamento offline.</p>

        <h2>8. Conservação e exclusão</h2>
        <p>Os dados são mantidos pelo período necessário à finalidade do atendimento, à relação contratual ou de trabalho, às obrigações legais e à defesa de direitos. Os prazos variam conforme a categoria: registros de manutenção, documentos comerciais e comprovações de serviço podem exigir conservação após o encerramento da conta.</p>
        <p>Quando a conservação deixar de ser necessária ou obrigatória, os dados devem ser eliminados ou anonimizados. Cópias de segurança seguem os ciclos de retenção da infraestrutura e não são utilizadas para retomar o uso de dados excluídos, salvo necessidade de recuperação ou obrigação aplicável. Exclusão de conta não implica apagar documentos que devam ser conservados; eventuais restrições serão informadas na resposta ao pedido.</p>

        <h2 id="exclusao">9. Seus direitos e solicitação de exclusão</h2>
        <p>Você pode solicitar confirmação e acesso aos seus dados, correção, informações sobre compartilhamento, portabilidade quando aplicável, anonimização, bloqueio ou eliminação de dados desnecessários e revogação de consentimento. Também pode apresentar solicitações à <a href="https://www.gov.br/anpd/pt-br/assuntos/titular-de-dados/direito-dos-titulares">Autoridade Nacional de Proteção de Dados (ANPD)</a>.</p>
        <p>Para solicitar exclusão da conta e dos dados associados, envie um e-mail para <a href="mailto:contato@rjcompressores.com.br?subject=Exclus%C3%A3o%20de%20conta%20-%20Portal%20T%C3%A9cnico%20RJ">contato@rjcompressores.com.br</a> com o assunto “Exclusão de conta — Portal Técnico RJ”. Informe o e-mail da conta e quais dados deseja excluir. O mesmo canal atende pedidos relativos aos demais portais e a dados de clientes. Não envie senhas.</p>
        <p>A solicitação pode ser feita sem login. Poderemos confirmar sua identidade antes do atendimento para evitar exclusões indevidas. Contas de usuários são disponibilizadas pela administração da empresa; o pedido será encaminhado ao responsável e serão informadas as providências, os dados conservados e o motivo de eventual conservação, nos prazos legais aplicáveis.</p>

        <h2>10. Alterações e informações adicionais</h2>
        <p>Esta política pode ser atualizada para refletir mudanças no serviço ou nas regras aplicáveis. A versão vigente e a data de atualização estarão nesta página. Novos usos de dados que exijam informação ou autorização adicional serão apresentados ao usuário antes de sua adoção.</p>
        <p>Dúvidas sobre este documento podem ser encaminhadas pelo contato informado na seção 1.</p>
      </article>
      <footer className={styles.footer}>RJ Compressores · Gestão Integrada · <Link href="/login">Voltar ao acesso</Link></footer>
    </main>
  );
}
