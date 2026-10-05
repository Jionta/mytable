#!/usr/bin/env python3
"""GROW local OS. Standard-library-only server with transactional SQLite storage."""
import argparse
import datetime as dt
import json
import os
import re
from pathlib import Path
import secrets
import sqlite3
import sys
import threading
import uuid
import webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, unquote

ROOT = Path(__file__).resolve().parent
DB_PATH = Path(os.environ.get('GROW_DATA_DIR', str(ROOT / 'data'))) / 'grow.sqlite3'
TOKEN = secrets.token_urlsafe(32)
VERSION = 1
FIELDS = {
 'businesses': {'name':'text', 'kind':'text', 'focus':'text', 'color':'text', 'channels':'text', 'target':'text', 'pillars':'text', 'goal':'text'},
 'clients': {'name':'text', 'business_id':'ref:businesses', 'contact':'text', 'email':'text', 'fee':'money', 'status':'enum:Active,Onboarding,Paused', 'notes':'text'},
 'projects': {'title':'text', 'business_id':'ref:businesses', 'client_id':'ref:clients?', 'due':'date', 'status':'enum:Planned,In progress,Review,Done', 'notes':'text'},
 'content': {'title':'text', 'business_id':'ref:businesses', 'client_id':'ref:clients?', 'channel':'enum:Facebook,Instagram,LinkedIn,YouTube,YouTube Shorts,X,TikTok,Website', 'format':'enum:Post,Carousel,Reel,Article,Video,Script', 'status':'enum:Idea,Draft,In review,Changes requested,Approved,Scheduled,Published,Rejected', 'date':'date', 'copy':'text', 'notes':'text'},
 'leads': {'name':'text', 'business_id':'ref:businesses', 'contact':'text', 'email':'text', 'value':'money', 'stage':'enum:Lead,Qualified,Contacted,Meeting,Proposal,Negotiation,Won,Lost', 'next_date':'date', 'notes':'text'},
 'transactions': {'title':'text', 'business_id':'ref:businesses', 'client_id':'ref:clients?', 'kind':'enum:Income,Expense', 'amount':'money', 'date':'date', 'category':'text', 'notes':'text'},
 'invoices': {'title':'text', 'business_id':'ref:businesses', 'client_id':'ref:clients?', 'amount':'money', 'paid':'money', 'date':'date', 'due':'date', 'notes':'text'},
 'resources': {'name':'text', 'business_id':'ref:businesses?', 'type':'enum:Subscription,Domain,Hosting,Team,Asset,SOP,Software', 'cost':'money', 'renewal':'date', 'cycle':'enum:Monthly,Annual,One-time,None', 'url':'url', 'owner':'text', 'notes':'text'},
 'plans': {'title':'text', 'business_id':'ref:businesses', 'objective':'text', 'audience':'text', 'channels':'text', 'pillars':'text', 'cadence':'text', 'kpi':'text', 'date':'date', 'notes':'text'},
 'reviews': {'title':'text', 'date':'date', 'wins':'text', 'blockers':'text', 'decisions':'text', 'next_week':'text'},
 'tasks': {'title':'text', 'business_id':'ref:businesses', 'client_id':'ref:clients?', 'status':'enum:Open,In progress,Blocked,Done', 'due':'date', 'priority':'enum:High,Medium,Low', 'external_id':'text', 'url':'url'},
 'recipes': {'title':'text', 'business_id':'ref:businesses?', 'trigger':'text', 'steps':'text', 'output':'text', 'enabled':'bool'},
}
REQUIRED = {
 'businesses':['name'], 'clients':['name','business_id'], 'projects':['title','business_id'],
 'content':['title','business_id','channel','format','status'], 'leads':['name','business_id','stage'],
 'transactions':['title','business_id','kind','amount','date'], 'invoices':['title','business_id','amount','date','due'],
 'resources':['name','type'], 'plans':['title','business_id'], 'reviews':['title','date'],
 'tasks':['title','business_id','status','external_id'], 'recipes':['title','trigger','steps'],
}
TRANSITIONS = {
 'Idea': ['Draft','Rejected'], 'Draft':['In review','Rejected'],
 'In review':['Approved','Changes requested','Rejected'], 'Changes requested':['Draft','In review','Rejected'],
 'Approved':['Scheduled','Draft','Rejected'], 'Scheduled':['Published','Approved'],
 'Published':[], 'Rejected':['Draft'],
}

class ValidationError(Exception): pass

def connection():
    c = sqlite3.connect(DB_PATH, timeout=10)
    c.row_factory = sqlite3.Row
    c.execute('PRAGMA foreign_keys=ON')
    return c

def now(): return dt.datetime.now(dt.timezone.utc).isoformat()
def today(): return (dt.datetime.now(dt.timezone.utc) + dt.timedelta(hours=6)).date()

def rows(c, entity):
    return [json.loads(r['payload']) for r in c.execute('SELECT payload FROM records WHERE entity=? ORDER BY created_at', (entity,))]

def one(c, entity, rid):
    row = c.execute('SELECT payload FROM records WHERE entity=? AND id=?', (entity,rid)).fetchone()
    if not row: raise ValidationError('Record no longer exists. Refresh and try again.')
    return json.loads(row['payload'])

def audit(c, action, entity, rid, detail=''):
    c.execute('INSERT INTO activity(id,at,action,entity,record_id,detail) VALUES(?,?,?,?,?,?)', (uuid.uuid4().hex,now(),action,entity,rid,detail[:300]))

def put(c, entity, obj):
    c.execute('INSERT INTO records(entity,id,payload,created_at) VALUES(?,?,?,?) ON CONFLICT(entity,id) DO UPDATE SET payload=excluded.payload', (entity,obj['id'],json.dumps(obj),obj.get('created_at',now())))

def validate(c, entity, data, old=None, restoring=False):
    if entity not in FIELDS: raise ValidationError('Unknown record type.')
    if not isinstance(data,dict): raise ValidationError('Expected an object.')
    out = {}
    for key, typ in FIELDS[entity].items():
        value = data.get(key, old.get(key) if old else None)
        if value is None:
            value = False if typ=='bool' else 0 if typ=='money' else ('Medium' if entity=='tasks' and key=='priority' else typ[5:].split(',')[0]) if typ.startswith('enum:') and key not in REQUIRED[entity] else ''
        if typ=='bool':
            if not isinstance(value,bool): raise ValidationError(key+' must be true or false.')
        elif typ=='money':
            if isinstance(value,bool) or not isinstance(value,int) or value < 0 or value > 10**14: raise ValidationError(key+' must be a nonnegative amount in paisa.')
        else:
            if not isinstance(value,str) or len(value)>20000: raise ValidationError(key+' is invalid or too long.')
            value = value.strip()
            if typ.startswith('enum:') and value not in typ[5:].split(','): raise ValidationError('Choose a valid '+key+'.')
            if typ=='date' and value:
                if not re.fullmatch(r'\d{4}-\d{2}-\d{2}',value): raise ValidationError('Use YYYY-MM-DD for '+key+'.')
                try: dt.date.fromisoformat(value)
                except ValueError: raise ValidationError('Enter a valid date for '+key+'.')
            if typ=='url' and value:
                parsed=urlparse(value)
                if parsed.scheme not in ('http','https') or not parsed.hostname or parsed.username or parsed.password: raise ValidationError('Use an http or https URL without credentials.')
            if typ.startswith('ref:'):
                target=typ[4:].rstrip('?')
                if value and not restoring: one(c,target,value)
        out[key]=value
    for key in REQUIRED[entity]:
        if out[key] == '' or (FIELDS[entity][key]=='money' and out[key]<=0): raise ValidationError(key.replace('_',' ')+' is required.')
    if entity in ('transactions','invoices') and out['amount']<=0: raise ValidationError('Amount must be greater than zero.')
    if out.get('client_id') and not restoring:
        client = one(c,'clients',out['client_id'])
        if client['business_id'] != out.get('business_id'): raise ValidationError('This client belongs to another business.')
    if entity=='invoices':
        if out['paid']>out['amount']: raise ValidationError('Payment cannot exceed invoice amount.')
        if not restoring and out['paid'] != (old['paid'] if old else 0): raise ValidationError('Record invoice payments with the payment action.')
        if not restoring and old and old['paid']>0 and any(out[k]!=old[k] for k in ('business_id','client_id')): raise ValidationError('A paid invoice cannot be moved to another business or client.')
        if out['due']<out['date']: raise ValidationError('Due date cannot precede the invoice date.')
    if entity=='content' and not restoring:
        if not old and out['status']!='Draft' and out['status']!='Idea': raise ValidationError('Create content as an idea or draft before review.')
        if old and old['status']!=out['status'] and out['status'] not in TRANSITIONS[old['status']]: raise ValidationError('This content status change is not allowed.')
        if old and old['status'] in ('Approved','Scheduled','Published') and any(out[k]!=old.get(k) for k in ('title','copy','channel','format','business_id','client_id')): raise ValidationError('Return approved content to Draft before changing its content.')
        if out['status'] in ('Scheduled','Published') and not out['date']: raise ValidationError('Choose a planned publish date first.')
    out['id']=old['id'] if old else uuid.uuid4().hex
    out['created_at']=old.get('created_at',now()) if old else now()
    out['updated_at']=now()
    out['demo']=old.get('demo',False) if old else False
    if old and old.get('invoice_id'): out['invoice_id']=old['invoice_id']
    return out

def seed(c):
    from seed import build_seed
    for entity, items in build_seed(today()).items():
        for item in items:
            record=validate(c,entity,item,restoring=True)
            record.update(id=item['id'],demo=item.get('demo',False))
            if item.get('invoice_id'): record['invoice_id']=item['invoice_id']
            put(c,entity,record)
    defaults={'task_manager_url':'','owner':'Jubayer','review_days':'Sunday and Thursday','workspace_name':'GROW','currency':'BDT'}
    for key,value in defaults.items(): c.execute('INSERT INTO settings(key,value) VALUES(?,?)',(key,json.dumps(value)))

def initialize():
    DB_PATH.parent.mkdir(parents=True,exist_ok=True)
    with connection() as c:
        c.execute('PRAGMA journal_mode=WAL')
        c.executescript('''
        CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY,value TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS records(entity TEXT NOT NULL,id TEXT NOT NULL,payload TEXT NOT NULL,created_at TEXT NOT NULL,PRIMARY KEY(entity,id));
        CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY,value TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS activity(id TEXT PRIMARY KEY,at TEXT NOT NULL,action TEXT NOT NULL,entity TEXT NOT NULL,record_id TEXT NOT NULL,detail TEXT NOT NULL);
        CREATE INDEX IF NOT EXISTS idx_activity_at ON activity(at);
        ''')
        if not c.execute("SELECT value FROM meta WHERE key='version'").fetchone():
            seed(c)
            c.execute("INSERT INTO meta(key,value) VALUES('version',?)",(str(VERSION),))
        c.execute('PRAGMA optimize')

def snapshot(c):
    result={key:rows(c,key) for key in FIELDS}
    result['settings']={r['key']:json.loads(r['value']) for r in c.execute('SELECT key,value FROM settings')}
    result['activity']=[dict(r) for r in c.execute('SELECT * FROM activity ORDER BY at DESC LIMIT 60')]
    return result

def restore(c, payload):
    if not isinstance(payload,dict) or payload.get('grow_version')!=VERSION or not isinstance(payload.get('data'),dict): raise ValidationError('Choose a GROW version 1 JSON backup.')
    data=payload['data']
    staged={}
    total=0
    for entity in FIELDS:
        items=data.get(entity)
        if not isinstance(items,list): raise ValidationError('Backup is missing '+entity+'.')
        total+=len(items)
        if total>10000: raise ValidationError('Backup exceeds 10,000 records.')
        staged[entity]=[]
        ids=set()
        for item in items:
            rid=item.get('id') if isinstance(item,dict) else None
            if not isinstance(rid,str) or not rid or len(rid)>200 or rid in ids: raise ValidationError('Invalid or duplicate record id.')
            ids.add(rid)
            out=validate(c,entity,item,restoring=True)
            out.update(id=rid,demo=item.get('demo') is True)
            if entity=='transactions' and item.get('invoice_id'): out['invoice_id']=str(item['invoice_id'])
            staged[entity].append(out)
    for entity, items in staged.items():
        for item in items:
            for key,typ in FIELDS[entity].items():
                if typ.startswith('ref:') and item[key] and not any(r['id']==item[key] for r in staged[typ[4:].rstrip('?')]): raise ValidationError('Backup contains a missing reference.')
            if item.get('client_id'):
                client=next(r for r in staged['clients'] if r['id']==item['client_id'])
                if client['business_id']!=item['business_id']: raise ValidationError('Backup contains mismatched clients.')
            if item.get('invoice_id') and not any(r['id']==item['invoice_id'] for r in staged['invoices']): raise ValidationError('Backup contains a missing invoice.')
    for invoice in staged['invoices']:
        payments=[t for t in staged['transactions'] if t.get('invoice_id')==invoice['id']]
        if sum(t['amount'] for t in payments)!=invoice['paid']: raise ValidationError('Backup invoice payments do not match the ledger.')
        if any(t['kind']!='Income' or t['business_id']!=invoice['business_id'] or t['client_id']!=invoice['client_id'] for t in payments): raise ValidationError('Backup invoice payment belongs to the wrong business or client.')
    settings=data.get('settings',{})
    if not isinstance(settings,dict): raise ValidationError('Invalid settings.')
    settings=validate_settings(settings)
    c.execute('DELETE FROM records')
    for entity,items in staged.items():
        for item in items: put(c,entity,item)
    c.execute('DELETE FROM settings')
    for key,val in settings.items(): c.execute('INSERT INTO settings(key,value) VALUES(?,?)',(key,json.dumps(val)))
    c.execute('DELETE FROM activity')
    audit(c,'Restored','workspace','',str(total)+' records restored from backup')

def validate_settings(settings):
    out={}
    for key in ('owner','task_manager_url','review_days','workspace_name','currency'):
        if key not in settings: continue
        value=settings[key]
        if not isinstance(value,str) or len(value)>1000: raise ValidationError('Invalid setting.')
        if key=='currency' and value!='BDT': raise ValidationError('The local ledger uses BDT.')
        if key=='task_manager_url' and value:
            u=urlparse(value)
            if u.scheme not in ('http','https') or not u.hostname or u.username or u.password: raise ValidationError('Enter a valid task manager URL without credentials.')
        out[key]=value.strip()
    return out

class Handler(BaseHTTPRequestHandler):
    def log_message(self,*args): pass
    def respond(self,status,payload,ctype='application/json; charset=utf-8',download=None):
        body=json.dumps(payload).encode() if ctype.startswith('application/json') else payload
        self.send_response(status)
        self.send_header('Content-Type',ctype)
        self.send_header('Content-Length',str(len(body)))
        self.send_header('Cache-Control','no-store')
        self.send_header('X-Content-Type-Options','nosniff')
        self.send_header('Referrer-Policy','no-referrer')
        self.send_header('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'")
        if download: self.send_header('Content-Disposition','attachment; filename="'+download+'"')
        self.end_headers()
        self.wfile.write(body)
    def guarded(self):
        host=self.headers.get('Host','')
        return host in ('127.0.0.1:'+str(self.server.server_port),'localhost:'+str(self.server.server_port))
    def do_GET(self):
        if not self.guarded(): return self.respond(403,{'error':'Use the local address printed by GROW.'})
        path=urlparse(self.path).path
        try:
            if path=='/api/state':
                with connection() as c: data=snapshot(c)
                return self.respond(200,{'data':data,'csrf':TOKEN,'version':VERSION,'today':today().isoformat()})
            if path=='/api/backup':
                with connection() as c: data=snapshot(c)
                return self.respond(200,{'grow_version':VERSION,'exported_at':now(),'data':data},download='grow-backup-'+today().isoformat()+'.json')
            if path=='/api/health': return self.respond(200,{'ok':True,'version':VERSION})
            if path.startswith('/api/'): return self.respond(404,{'error':'Endpoint not found.'})
            target=(ROOT/'dist'/unquote(path).lstrip('/')).resolve() if path!='/' else ROOT/'dist'/'index.html'
            if not target.is_relative_to(ROOT/'dist') or not target.is_file(): return self.respond(404,{'error':'File not found.'})
            ctypes={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.svg':'image/svg+xml'}
            return self.respond(200,target.read_bytes(),ctypes.get(target.suffix,'application/octet-stream'))
        except (OSError,sqlite3.Error): return self.respond(500,{'error':'Cannot read local data. Check the data folder and available disk space.'})
    def do_POST(self): self.mutate('POST')
    def do_PATCH(self): self.mutate('PATCH')
    def do_DELETE(self): self.mutate('DELETE')
    def mutate(self,method):
        if not self.guarded() or self.headers.get('X-Grow-Token')!=TOKEN: return self.respond(403,{'error':'Refresh GROW before saving.'})
        origin=self.headers.get('Origin')
        if origin and origin not in ('http://127.0.0.1:'+str(self.server.server_port),'http://localhost:'+str(self.server.server_port)): return self.respond(403,{'error':'Cross-origin saves are not allowed.'})
        try:
            length=int(self.headers.get('Content-Length','0'))
            if length<0 or length>4*1024*1024: raise ValidationError('File is too large (4 MB maximum).')
            data=json.loads(self.rfile.read(length) or '{}')
            parts=urlparse(self.path).path.strip('/').split('/')
            result={}
            with connection() as c:
                c.execute('BEGIN IMMEDIATE')
                if parts==['api','restore'] and method=='POST': restore(c,data)
                elif parts==['api','clear-samples'] and method=='POST':
                    demo_ids={r['id'] for entity in FIELDS for r in rows(c,entity) if r.get('demo')}
                    for entity in FIELDS:
                        for record in rows(c,entity):
                            if record.get('demo'): c.execute('DELETE FROM records WHERE entity=? AND id=?',(entity,record['id']))
                            else:
                                for key,typ in FIELDS[entity].items():
                                    if typ.startswith('ref:') and record.get(key) in demo_ids:
                                        if key=='business_id' and not typ.endswith('?'): raise ValidationError('Move your records out of sample businesses before clearing samples.')
                                        record[key]=''
                                if record.get('invoice_id') in demo_ids: raise ValidationError('Back up first: a real payment references a sample invoice.')
                                put(c,entity,record)
                    audit(c,'Cleared samples','workspace','')
                elif parts==['api','settings'] and method=='PATCH':
                    for key,val in validate_settings(data).items(): c.execute('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',(key,json.dumps(val)))
                    audit(c,'Updated','settings','')
                elif parts==['api','import-tasks'] and method=='POST':
                    if not isinstance(data,dict) or not isinstance(data.get('tasks'),list) or len(data['tasks'])>1000: raise ValidationError('Choose JSON with a tasks array (maximum 1,000 items).')
                    imported=0
                    seen=set()
                    for raw in data['tasks']:
                        out=validate(c,'tasks',raw)
                        if out['external_id'] in seen: raise ValidationError('Duplicate external_id in task import.')
                        seen.add(out['external_id'])
                        existing=next((r for r in rows(c,'tasks') if r['external_id']==out['external_id']),None)
                        if existing: out['id']=existing['id']
                        put(c,'tasks',out)
                        imported+=1
                    audit(c,'Imported','tasks','',str(imported)+' task statuses imported')
                    result={'count':imported}
                elif len(parts)==4 and parts[:2]==['api','invoices'] and parts[3]=='payment' and method=='POST':
                    inv=one(c,'invoices',parts[2])
                    amount=data.get('amount')
                    date=data.get('date',today().isoformat())
                    if isinstance(amount,bool) or not isinstance(amount,int) or amount<=0 or amount>inv['amount']-inv['paid']: raise ValidationError('Payment must be greater than zero and no more than the balance.')
                    t=validate(c,'transactions',{'title':'Payment · '+inv['title'],'business_id':inv['business_id'],'client_id':inv.get('client_id',''),'kind':'Income','amount':amount,'date':date,'category':'Client payment','notes':'Invoice payment'})
                    t['invoice_id']=inv['id']
                    t['demo']=inv.get('demo',False)
                    put(c,'transactions',t)
                    inv['paid']+=amount
                    inv['updated_at']=now()
                    put(c,'invoices',inv)
                    audit(c,'Recorded payment','invoices',inv['id'],inv['title'])
                    result=t
                elif len(parts) in (2,3) and parts[0]=='api' and parts[1] in FIELDS:
                    entity=parts[1]
                    if entity=='tasks': raise ValidationError('Tasks are read-only snapshots. Update them in your task manager, then import again.')
                    old=one(c,entity,parts[2]) if len(parts)==3 else None
                    if method=='DELETE' and old:
                        if old.get('invoice_id'): raise ValidationError('An invoice payment cannot be deleted from the ledger.')
                        if entity=='invoices' and old['paid']>0: raise ValidationError('Paid invoices are retained to protect the ledger.')
                        for typ in FIELDS:
                            for rec in rows(c,typ):
                                if any(fieldtype.startswith('ref:') and fieldtype[4:].rstrip('?')==entity and rec.get(key)==old['id'] for key,fieldtype in FIELDS[typ].items()): raise ValidationError('This record is in use. Remove or reassign its linked records first.')
                        c.execute('DELETE FROM records WHERE entity=? AND id=?',(entity,old['id']))
                        audit(c,'Deleted',entity,old['id'],old.get('title',old.get('name','')))
                    elif method=='POST' and not old or method=='PATCH' and old:
                        if old and old.get('invoice_id'): raise ValidationError('Invoice payments cannot be edited separately from their invoice.')
                        result=validate(c,entity,data,old)
                        put(c,entity,result)
                        audit(c,'Updated' if old else 'Created',entity,result['id'],result.get('title',result.get('name','')))
                    else: raise ValidationError('Invalid record operation.')
                else: return self.respond(404,{'error':'Endpoint not found.'})
            return self.respond(200,{'ok':True,'record':result})
        except (ValidationError,ValueError,TypeError,KeyError) as exc: return self.respond(400,{'error':str(exc) or 'Invalid data.'})
        except sqlite3.Error: return self.respond(500,{'error':'Save failed. Your previous data is safe. Check available disk space.'})

def main():
    if sys.version_info < (3,10):
        print('GROW requires Python 3.10 or newer. Install a newer Python version, then reopen the launcher.',flush=True)
        return 1
    parser=argparse.ArgumentParser(description='Run GROW on your computer.')
    parser.add_argument('--port',type=int,default=8765)
    parser.add_argument('--no-browser',action='store_true')
    args=parser.parse_args()
    initialize()
    try: server=ThreadingHTTPServer(('127.0.0.1',args.port),Handler)
    except OSError:
        print('GROW could not start. The port may be in use. Try: python server.py --port 8766',flush=True)
        return 1
    print('GROW running at http://127.0.0.1:'+str(server.server_port),flush=True)
    print('Data is saved in '+str(DB_PATH)+'. Press Ctrl+C to stop.',flush=True)
    if not args.no_browser: threading.Timer(0.7,lambda:webbrowser.open('http://127.0.0.1:'+str(server.server_port))).start()
    try: server.serve_forever()
    except KeyboardInterrupt: pass
    finally: server.server_close()
    return 0

if __name__=='__main__': raise SystemExit(main())
