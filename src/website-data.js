import {ARTBIT_SUMMARY_URL,parseArtbitSummary} from '../integrations/website-data/contract.js';

export async function readArtbitWebsite(env) {
  if(!env.ARTBIT_SITE_DATA)throw new Error('Website connection is not configured.');
  const response=await env.ARTBIT_SITE_DATA.fetch(ARTBIT_SUMMARY_URL,{
    method:'GET',redirect:'manual',signal:AbortSignal.timeout(8000),
  });
  if(!response.ok)throw new Error('Website connection is unavailable.');
  return parseArtbitSummary(await response.json());
}
