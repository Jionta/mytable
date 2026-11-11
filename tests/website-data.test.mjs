import assert from 'node:assert/strict';
import {test} from 'node:test';
import {DatabaseSync} from 'node:sqlite';
import worker from '../integrations/website-data/artbit-worker.js';
import {ARTBIT_SUMMARY_URL} from '../integrations/website-data/contract.js';

test('reads the Artbit schema and returns only summary counts without writing',async()=>{
  const db=new DatabaseSync(':memory:');
  try {
    db.exec(`
      CREATE TABLE leads(status TEXT, email TEXT);
      CREATE TABLE course_applications(status TEXT);
      CREATE TABLE wedding_orders(status TEXT, archived_at TEXT, trashed_at TEXT);
      CREATE TABLE job_applications(status TEXT);
      CREATE TABLE clients(id TEXT);
      CREATE TABLE invoices(paid_bdt INTEGER,total_bdt INTEGER);
      CREATE TABLE articles(is_published INTEGER);
      INSERT INTO leads VALUES ('new','never-return@example.test'),('contacted','never-return@example.test'),('new','never-return@example.test');
      INSERT INTO course_applications VALUES ('new'),('closed');
      INSERT INTO wedding_orders VALUES ('new',NULL,NULL),('new','archived',NULL),('new',NULL,'trashed'),('confirmed',NULL,NULL);
      INSERT INTO job_applications VALUES ('new'),('new'),('rejected');
      INSERT INTO clients VALUES ('one'),('two'),('three');
      INSERT INTO invoices VALUES (20,30),(30,30),(50,40),(0,120);
      INSERT INTO articles VALUES (1),(1),(0);
    `);
    const before=db.prepare('SELECT total_changes() AS n').get().n;
    const result=await worker.fetch(new Request(ARTBIT_SUMMARY_URL),{
      ARTBIT_DB:{prepare:sql=>({first:()=>db.prepare(sql).get()})}
    });
    assert.equal(result.status,200);
    const data=await result.json();
    assert.deepEqual(data.counts,{
      newLeads:2,newCourseApplications:1,newWeddingOrders:1,newJobApplications:2,
      clients:3,invoicesWithBalance:2,publishedArticles:2,articleDrafts:1,
    });
    assert.deepEqual(Object.keys(data).sort(),['checkedAt','counts','source']);
    assert.equal(data.source,'artbit');
    assert.equal(db.prepare('SELECT total_changes() AS n').get().n,before);
  }finally{db.close();}
});

test('rejects non-summary routes and non-GET requests before touching D1',async()=>{
  const env={get ARTBIT_DB(){assert.fail('must not access D1');}};
  assert.equal((await worker.fetch(new Request(ARTBIT_SUMMARY_URL,{method:'POST'}),env)).status,405);
  assert.equal((await worker.fetch(new Request(ARTBIT_SUMMARY_URL+'?query=custom'),env)).status,404);
  assert.equal((await worker.fetch(new Request('https://public.example.test/v1/summary'),env)).status,404);
});
