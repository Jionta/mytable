import {ARTBIT_SOURCE,ARTBIT_SUMMARY_URL,parseArtbitSummary} from './contract.js';

// Fixed SELECT only. This Worker has no routes, no SQL input, and no write handler.
export const ARTBIT_SUMMARY_SQL = `SELECT
  (SELECT COUNT(*) FROM leads WHERE status='new') AS newLeads,
  (SELECT COUNT(*) FROM course_applications WHERE status='new') AS newCourseApplications,
  (SELECT COUNT(*) FROM wedding_orders WHERE status='new' AND archived_at IS NULL AND trashed_at IS NULL) AS newWeddingOrders,
  (SELECT COUNT(*) FROM job_applications WHERE status='new') AS newJobApplications,
  (SELECT COUNT(*) FROM clients) AS clients,
  (SELECT COUNT(*) FROM invoices WHERE paid_bdt < total_bdt) AS invoicesWithBalance,
  (SELECT COUNT(*) FROM articles WHERE is_published=1) AS publishedArticles,
  (SELECT COUNT(*) FROM articles WHERE is_published=0) AS articleDrafts`;

const reply=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});

export default {
  async fetch(request,env){
    if(request.url!==ARTBIT_SUMMARY_URL)return reply({error:'Not found.'},404);
    if(request.method!=='GET')return reply({error:'Method not allowed.'},405);
    try{
      const counts=await env.ARTBIT_DB.prepare(ARTBIT_SUMMARY_SQL).first();
      return reply(parseArtbitSummary({source:ARTBIT_SOURCE,checkedAt:new Date().toISOString(),counts}));
    }catch(error){
      console.error(JSON.stringify({event:'artbit_site_summary_failed',kind:error.name}));
      return reply({error:'Website summary unavailable.'},503);
    }
  }
};
