export async function crmApi(query = "", body?: any, signal?: AbortSignal) {
  const response = await fetch("/api/crm" + query, {
    cache: "no-store",
    signal,
    ...(body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}),
  });
  if (!response.headers.get("content-type")?.includes("application/json")) {
    if (response.redirected || response.status === 401) {
      throw Error("Sua sessão expirou. Entre novamente para acessar o CRM.");
    }
    throw Error("Não foi possível carregar o CRM: o serviço retornou uma resposta inválida (HTTP " + response.status + "). Atualize a página e tente novamente.");
  }
  const data = await response.json();
  if (!response.ok) throw Error(data.error || "Não foi possível concluir.");
  return data;
}

export const crmStatus=(value:string)=>({open:'Aberta',pending:'Pendente',creating:'Em criação',in_review:'Em revisão',reviewed:'Revisada',sent:'Enviada ao cliente',converting:'Criando OS',won:'Concretizada',not_selected:'Outra proposta ganha',lost:'Perdida',cancelled:'Cancelada',complete:'OS criada',preparing:'Preparando',ready:'Pronta para envio',partial:'Envio parcial',sending:'Enviando',uncertain:'Conferência no M8 necessária',rejected:'Envio recusado',validation_failed:'Dados precisam de correção'}[value]||value);
export const crmMoney=(v:any)=>(Number(v)/100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
export const crmDate=(v:any)=>new Date(v).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'});
