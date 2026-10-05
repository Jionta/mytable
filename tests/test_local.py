import copy
import json
from pathlib import Path
import sys
import tempfile
import threading
import unittest
from concurrent.futures import ThreadPoolExecutor
from urllib.request import Request, urlopen
from urllib.error import HTTPError

sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import server

class LocalWorkflowTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory()
        server.DB_PATH=Path(self.temp.name)/'grow.sqlite3'
        server.initialize()
        self.http=server.ThreadingHTTPServer(('127.0.0.1',0),server.Handler)
        self.thread=threading.Thread(target=self.http.serve_forever,daemon=True)
        self.thread.start()
        self.url='http://127.0.0.1:'+str(self.http.server_port)
    def tearDown(self):
        self.http.shutdown();self.http.server_close();self.thread.join();self.temp.cleanup()
    def request(self,path,method='GET',data=None,token=True,origin=None):
        headers={}
        if token: headers['X-Grow-Token']=server.TOKEN
        if origin: headers['Origin']=origin
        req=Request(self.url+'/api/'+path,data=json.dumps(data).encode() if data is not None else None,headers=headers,method=method)
        try:
            with urlopen(req) as res: return res.status,json.load(res)
        except HTTPError as e: return e.code,json.load(e)
    def state(self):return self.request('state')[1]['data']
    def create(self,entity,data):
        status,result=self.request(entity,'POST',data)
        self.assertEqual(status,200,result)
        return result['record']
    def test_assets_storage_and_save_guards(self):
        for path in ('/','/app.js','/styles.css','/favicon.svg'):
            with urlopen(self.url+path) as res:self.assertEqual(res.status,200)
        original=self.state()
        self.assertEqual(len(original['businesses']),8)
        self.assertEqual(self.request('clients','POST',{'name':'No save'},token=False)[0],403)
        self.assertEqual(self.request('clients','POST',{'name':'No save'},origin='https://example.com')[0],403)
        r=self.create('clients',{'name':'Real client','business_id':'artbit','status':'Active','fee':100000})
        server.initialize()
        self.assertTrue(any(x['id']==r['id'] for x in self.state()['clients']))
        self.assertFalse(r['demo'])
        self.assertEqual(self.request('clients/'+r['id'],'PATCH',{'fee':12.5})[0],400)
        self.assertEqual(self.request('projects','POST',{'title':'Invalid cross-client','business_id':'qfs','client_id':r['id'],'status':'Planned'})[0],400)
    def test_content_approval_and_protected_copy(self):
        c=self.create('content',{'title':'Real draft','business_id':'vidzones','channel':'Instagram','format':'Post','status':'Draft','copy':'Original'})
        url='content/'+c['id']
        self.assertEqual(self.request(url,'PATCH',{'status':'Published'})[0],400)
        for stage in ('In review','Approved'):
            self.assertEqual(self.request(url,'PATCH',{'status':stage})[0],200)
        self.assertEqual(self.request(url,'PATCH',{'copy':'Unreviewed change'})[0],400)
        self.assertEqual(self.request(url,'PATCH',{'status':'Scheduled'})[0],400)
        self.assertEqual(self.request(url,'PATCH',{'status':'Scheduled','date':'2026-10-05'})[0],200)
        self.assertEqual(self.request(url,'PATCH',{'status':'Published'})[0],200)
        self.assertEqual(self.request(url,'PATCH',{'status':'Draft'})[0],400)
        self.assertEqual(self.request(url,'PATCH',{'copy':'Change history'})[0],400)
    def test_invoice_payments_atomic_and_concurrent(self):
        inv=self.create('invoices',{'title':'Real invoice','business_id':'artbit','amount':10000,'date':'2026-10-01','due':'2026-10-10'})
        self.assertEqual(self.request('invoices/'+inv['id'],'PATCH',{'paid':100})[0],400)
        payload={'amount':7000,'date':'2026-10-05'}
        with ThreadPoolExecutor(max_workers=2) as pool:
            results=list(pool.map(lambda _:self.request('invoices/'+inv['id']+'/payment','POST',payload),range(2)))
        self.assertEqual(sorted(x[0] for x in results),[200,400])
        state=self.state()
        payments=[t for t in state['transactions'] if t.get('invoice_id')==inv['id']]
        self.assertEqual(len(payments),1)
        self.assertEqual(payments[0]['amount'],7000)
        saved=next(i for i in state['invoices'] if i['id']==inv['id'])
        self.assertEqual(saved['paid'],7000)
        self.assertEqual(self.request('invoices/'+inv['id']+'/payment','POST',{'amount':3000,'date':'2026-10-05'})[0],200)
        self.assertEqual(self.request('invoices/'+inv['id']+'/payment','POST',{'amount':1,'date':'2026-10-05'})[0],400)
        self.assertEqual(self.request('transactions/'+payments[0]['id'],'DELETE',{})[0],400)
        self.assertEqual(self.request('invoices/'+inv['id'],'DELETE',{})[0],400)
        self.assertEqual(self.request('invoices/'+inv['id'],'PATCH',{'business_id':'qfs'})[0],400)
        self.assertEqual(self.request('transactions','POST',{'title':'Bad date','business_id':'artbit','kind':'Income','amount':100,'date':'20261005'})[0],400)
    def test_task_import_updates_ids_and_rolls_back_bad_batch(self):
        task={'external_id':'real-1','title':'External task','business_id':'artbit','status':'Open'}
        self.assertEqual(self.request('import-tasks','POST',{'tasks':[task]})[0],200)
        first=self.state()['tasks'][0]
        self.assertEqual(first['priority'],'Medium')
        self.assertEqual(self.request('import-tasks','POST',{'tasks':[dict(task,status='Done')]})[0],200)
        updated=self.state()['tasks'][0]
        self.assertEqual(first['id'],updated['id'])
        self.assertEqual(updated['status'],'Done')
        broken=[dict(task,external_id='new-valid'),dict(task,external_id='invalid',business_id='missing')]
        self.assertEqual(self.request('import-tasks','POST',{'tasks':broken})[0],400)
        self.assertEqual(len(self.state()['tasks']),1)
        self.assertEqual(self.request('tasks/'+first['id'],'PATCH',{'status':'Open'})[0],400)
    def test_backup_restore_and_clear_samples(self):
        c=self.create('content',{'title':'Keep my work','business_id':'artbit','client_id':'nahar','channel':'Facebook','format':'Post','status':'Draft'})
        backup=self.request('backup')[1]
        invalid=copy.deepcopy(backup)
        invalid['data']['content'][0]['business_id']='missing'
        original=self.state()
        self.assertEqual(self.request('restore','POST',invalid)[0],400)
        self.assertEqual(self.state(),original)
        invalid_finance=copy.deepcopy(backup)
        invalid_finance['data']['invoices'][0]['paid']=100
        self.assertEqual(self.request('restore','POST',invalid_finance)[0],400)
        self.assertEqual(self.state(),original)
        self.assertEqual(self.request('clear-samples','POST',{})[0],200)
        cleared=self.state()
        self.assertEqual(len(cleared['businesses']),8)
        self.assertEqual(len(cleared['content']),1)
        self.assertEqual(cleared['content'][0]['id'],c['id'])
        self.assertEqual(cleared['content'][0]['client_id'],'')
        self.assertEqual(len(cleared['transactions']),0)
        self.assertEqual(self.request('restore','POST',backup)[0],200)
        restored=self.state()
        self.assertEqual(len(restored['content']),len(backup['data']['content']))
        self.assertEqual(len(restored['transactions']),len(backup['data']['transactions']))

if __name__=='__main__':unittest.main()
