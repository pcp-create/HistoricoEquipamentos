import 'server-only';
import { database } from '../db';
import { geocodeLocality } from './geocode';
import { geocodePendingLocalities } from './locality-geocoding';
/** Dedicated n8n workflow drives this job using the API key stored on Vercel. */
export async function processPendingLocalityPositions(deadline: number) {
  if (!process.env.GEOAPIFY_API_KEY) throw new Error("Geocoding is not configured");
  if (Date.now() >= deadline - 5000) throw new Error("Geocoding deadline exceeded");
  const c = await database().connect();
  try {
    const result=await geocodePendingLocalities(c, {
      limit: 3,
      shouldStop:()=>Date.now()>=deadline-5000,
      locate:(address,key)=>geocodeLocality(address,key,(input,init)=>fetch(input,{
        ...init,signal:AbortSignal.any([init?.signal || new AbortController().signal,AbortSignal.timeout(Math.max(1,deadline-Date.now()))]),
      })),
    });
    if (!result.configured) throw new Error('Geocoding migration is missing');
    console.info('LOCALITY_GEOCODING',result);
    return result;
  }
  finally {c.release();}
}
