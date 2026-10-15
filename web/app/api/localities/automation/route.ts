import { reportTokenMatches } from '@/lib/preventive-reports/access';
import { processPendingLocalityPositions } from '@/lib/service-scheduling/background-geocoding';
export const runtime = 'nodejs';
export const maxDuration = 60;
const headers = {'Cache-Control':'private, no-store'};
export async function POST(req: Request) {
  const deadline=Date.now()+45000;
  if (!reportTokenMatches(req.headers.get('authorization'),process.env.TASK_AUTOMATION_TOKEN || process.env.PREVENTIVE_REPORT_TOKEN))
    return Response.json({error:'Credencial inválida.'},{status:401,headers});
  try {
    const result=await processPendingLocalityPositions(deadline);
    return Response.json({ok:true,...result},{headers});
  } catch {
    return Response.json({error:'Não foi possível processar as localizações. Confira GEOAPIFY_API_KEY e a configuração do banco na Vercel.'},{status:503,headers});
  }
}
