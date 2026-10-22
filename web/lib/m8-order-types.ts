import "server-only";
// Server-side credentials follow the same integration contract as product images.
export async function fetchOrderTypes(transport:typeof fetch=fetch, kind:"orders"|"quotes"="orders") {
 const base=(process.env.M8_API_URL||process.env.M8_BASE_URL||"https://api.integra.m8sistemas.com.br").replace(/\/+$/,"");
 const url=new URL(base);
 if(url.protocol!=="https:"||url.username||url.password||url.pathname!=="/"||url.search||url.hash)throw new Error("Endereço M8 inválido");
 const required=(name:string)=>{const value=process.env[name];if(!value?.trim())throw new Error("Integração M8 não configurada");return value;};
 const auth=await transport(base+"/v1/auth/token",{method:"POST",cache:"no-store",redirect:"error",signal:AbortSignal.timeout(12000),headers:{"Content-Type":"application/json"},body:JSON.stringify({tenant:required("M8_TENANT"),username:required("M8_USERNAME"),password:required("M8_PASSWORD"),company:1,domain:process.env.M8_DOMAIN||"app.erpm8.cloud"})});
 if(!auth.ok)throw new Error("Autenticação M8 indisponível");
 const body=await auth.json();
 if(body.errors?.length||typeof body.data?.token!=="string"||!body.data.token)throw new Error("Resposta de autenticação inválida");
 const response=await transport(base+(kind==="quotes"?"/v1/crm/tipoorcamento":"/v1/faturamento/tipoordemservico")+"?Page=0&PageSize=0",{cache:"no-store",redirect:"error",signal:AbortSignal.timeout(25000),headers:{Authorization:`Bearer ${body.data.token}`}});
 if(!response.ok)throw new Error("Consulta M8 indisponível");
 return response.json();
}
