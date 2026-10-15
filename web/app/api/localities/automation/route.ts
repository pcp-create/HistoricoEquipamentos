import { automationAuthError, automationAuthCheck } from '@/lib/automation/access';
import { processPendingLocalityPositions } from '@/lib/service-scheduling/background-geocoding';
export const runtime = 'nodejs';
export const maxDuration = 60;
const headers = {'Cache-Control':'private, no-store'};
export async function POST(req: Request) {
  const deadline=Date.now()+45000;
  const authError = automationAuthError(req);
  if (authError) return authError;
  try {
    const result=await processPendingLocalityPositions(deadline);
    return Response.json({ok:true,...result},{headers});
  } catch {
    return Response.json({error:'Não foi possível processar as localizações. Confira GEOAPIFY_API_KEY e a configuração do banco na Vercel.'},{status:503,headers});
  }
}

// Read-only credential test; no provider requests or database updates.
export async function GET(req: Request) {
  return automationAuthCheck(req);
}
