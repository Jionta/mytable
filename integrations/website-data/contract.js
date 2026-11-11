export const ARTBIT_SOURCE = 'artbit';
export const ARTBIT_SUMMARY_URL = 'https://grow-site-data.internal/v1/summary';
export const ARTBIT_METRICS = Object.freeze([
  'newLeads','newCourseApplications','newWeddingOrders','newJobApplications',
  'clients','invoicesWithBalance','publishedArticles','articleDrafts',
]);

// Rebuild the response, never relay unexpected fields to the browser.
export function parseArtbitSummary(input) {
  if(input?.source!==ARTBIT_SOURCE || !input.counts || typeof input.counts!=='object')
    throw new Error('Invalid website summary.');
  const checkedAt=input.checkedAt;
  if(typeof checkedAt!=='string'||!Number.isFinite(Date.parse(checkedAt))||new Date(checkedAt).toISOString()!==checkedAt)
    throw new Error('Invalid website check time.');
  const counts={};
  for(const key of ARTBIT_METRICS){
    const value=input.counts[key];
    if(!Number.isSafeInteger(value)||value<0)throw new Error('Invalid website count.');
    counts[key]=value;
  }
  return {source:ARTBIT_SOURCE,checkedAt,counts};
}
