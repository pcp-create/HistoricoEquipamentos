import 'server-only';
import { database } from '../db';
import { geocodeLocality } from './geocode';
import { geocodePendingLocalities } from './locality-geocoding';
/** Existing n8n automation drives this job without loading a map or moving the API key. */
export async function processPendingLocalityPositions(deadline: number) {
  if (!process.env.GEOAPIFY_API_KEY || Date.now() >= deadline - 5000) return;
  const c = await database().connect();
  try {
    const result=await geocodePendingLocalities(c, {
      limit: 3,
      shouldStop:()=>Date.now()>=deadline-5000,
      locate:(address,key)=>geocodeLocality(address,key,(input,init)=>fetch(input,{
        ...init,signal:AbortSignal.any([init?.signal || new AbortController().signal,AbortSignal.timeout(Math.max(1,deadline-Date.now()))]),
      })),
    });
    console.info('LOCALITY_GEOCODING',result);
  } catch {console.error('LOCALITY_GEOCODING_DEFERRED');}
  finally {c.release();}
}
