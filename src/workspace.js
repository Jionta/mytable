import { DurableObject } from 'cloudflare:workers';
import schema from './schema.json';
import seedTemplate from './seed-template.json';

const { fields: FIELDS, required: REQUIRED, transitions: TRANSITIONS } = schema;
const entities = Object.keys(FIELDS);
const now = () => new Date().toISOString();
export const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dhaka', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
export class ValidationError extends Error {}
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);

export class GrowWorkspace extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    ctx.storage.transactionSync(() => {
      this.sql.exec(`
        CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY,value TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS records(entity TEXT NOT NULL,id TEXT NOT NULL,payload TEXT NOT NULL,created_at TEXT NOT NULL,PRIMARY KEY(entity,id));
        CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY,value TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS activity(id TEXT PRIMARY KEY,at TEXT NOT NULL,action TEXT NOT NULL,entity TEXT NOT NULL,record_id TEXT NOT NULL,detail TEXT NOT NULL);
        CREATE INDEX IF NOT EXISTS idx_activity_at ON activity(at);
        CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY,csrf TEXT NOT NULL,expires INTEGER NOT NULL);
        CREATE TABLE IF NOT EXISTS login_attempts(ip_hash TEXT PRIMARY KEY,attempts INTEGER NOT NULL,expires INTEGER NOT NULL);
      `);
      if (!this.sql.exec("SELECT value FROM meta WHERE key='version'").toArray().length) {
        const dayShift = Date.parse(today()) - Date.parse('2026-10-05');
        for (const entity of entities) {
          for (const raw of seedTemplate[entity]) {
            const item = { ...raw };
            for (const [key, type] of Object.entries(FIELDS[entity])) {
              if (type === 'date' && item[key]) item[key] = new Date(Date.parse(item[key]) + dayShift).toISOString().slice(0, 10);
            }
            const record = this.validate(entity, item, null, true);
            Object.assign(record, { id: item.id, demo: item.demo === true });
            if (item.invoice_id) record.invoice_id = item.invoice_id;
            this.put(entity, record);
          }
        }
        this.saveSettings({ task_manager_url: '', owner: 'Jubayer', review_days: 'Sunday and Thursday', workspace_name: 'GROW', currency: 'BDT' });
        this.sql.exec("INSERT INTO meta(key,value) VALUES('version','1')");
      }
    });
  }

  rows(entity) {
    return this.sql.exec('SELECT payload FROM records WHERE entity=? ORDER BY created_at', entity).toArray().map(row => JSON.parse(row.payload));
  }
  one(entity, id) {
    const row = this.sql.exec('SELECT payload FROM records WHERE entity=? AND id=?', entity, id).toArray()[0];
    if (!row) throw new ValidationError('Record no longer exists. Refresh and try again.');
    return JSON.parse(row.payload);
  }
  put(entity, record) {
    this.sql.exec('INSERT INTO records(entity,id,payload,created_at) VALUES(?,?,?,?) ON CONFLICT(entity,id) DO UPDATE SET payload=excluded.payload', entity, record.id, JSON.stringify(record), record.created_at || now());
  }
  audit(action, entity, id, detail = '') {
    this.sql.exec('INSERT INTO activity(id,at,action,entity,record_id,detail) VALUES(?,?,?,?,?,?)', crypto.randomUUID(), now(), action, entity, id, detail.slice(0, 300));
  }
  validate(entity, data, old = null, restoring = false) {
    if (!Object.hasOwn(FIELDS, entity)) throw new ValidationError('Unknown record type.');
    if (!isObject(data)) throw new ValidationError('Expected an object.');
    const out = {};
    for (const [key, type] of Object.entries(FIELDS[entity])) {
      let value = Object.hasOwn(data, key) ? data[key] : old?.[key];
      if (value === undefined || value === null) {
        value = type === 'bool' ? false : type === 'money' ? 0 : type.startsWith('enum:') && !REQUIRED[entity].includes(key) ? (entity === 'tasks' && key === 'priority' ? 'Medium' : type.slice(5).split(',')[0]) : '';
      }
      if (type === 'bool') {
        if (typeof value !== 'boolean') throw new ValidationError(key + ' must be true or false.');
      } else if (type === 'money') {
        if (!Number.isSafeInteger(value) || value < 0 || value > 10 ** 14) throw new ValidationError(key + ' must be a nonnegative amount in paisa.');
      } else {
        if (typeof value !== 'string' || value.length > 20000) throw new ValidationError(key + ' is invalid or too long.');
        value = value.trim();
        if (type.startsWith('enum:') && !type.slice(5).split(',').includes(value)) throw new ValidationError('Choose a valid ' + key + '.');
        if (type === 'date' && value) {
          const parsed = Date.parse(value + 'T00:00:00Z');
          if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(parsed) || new Date(parsed).toISOString().slice(0, 10) !== value) throw new ValidationError('Enter a valid YYYY-MM-DD date for ' + key + '.');
        }
        if (type === 'url' && value) {
          let url;
          try { url = new URL(value); } catch { throw new ValidationError('Use an http or https URL without credentials.'); }
          if (!['http:', 'https:'].includes(url.protocol) || !url.hostname || url.username || url.password) throw new ValidationError('Use an http or https URL without credentials.');
        }
        if (type.startsWith('ref:') && value && !restoring) this.one(type.slice(4).replace(/\?$/, ''), value);
      }
      out[key] = value;
    }
    for (const key of REQUIRED[entity]) {
      if (out[key] === '' || (FIELDS[entity][key] === 'money' && out[key] <= 0)) throw new ValidationError(key.replaceAll('_', ' ') + ' is required.');
    }
    if (out.client_id && !restoring && this.one('clients', out.client_id).business_id !== out.business_id) throw new ValidationError('This client belongs to another business.');
    if (entity === 'invoices') {
      if (out.paid > out.amount) throw new ValidationError('Payment cannot exceed invoice amount.');
      if (!restoring && out.paid !== (old?.paid || 0)) throw new ValidationError('Record invoice payments with the payment action.');
      if (!restoring && old?.paid > 0 && ['business_id', 'client_id'].some(key => out[key] !== old[key])) throw new ValidationError('A paid invoice cannot be moved to another business or client.');
      if (out.due < out.date) throw new ValidationError('Due date cannot precede the invoice date.');
    }
    if (entity === 'content' && !restoring) {
      if (!old && !['Idea', 'Draft'].includes(out.status)) throw new ValidationError('Create content as an idea or draft before review.');
      if (old && old.status !== out.status && !TRANSITIONS[old.status].includes(out.status)) throw new ValidationError('This content status change is not allowed.');
      if (old && ['Approved', 'Scheduled', 'Published'].includes(old.status) && ['title', 'copy', 'channel', 'format', 'business_id', 'client_id'].some(key => out[key] !== old[key])) throw new ValidationError('Return approved content to Draft before changing its content.');
      if (['Scheduled', 'Published'].includes(out.status) && !out.date) throw new ValidationError('Choose a planned publish date first.');
    }
    Object.assign(out, { id: old?.id || crypto.randomUUID(), created_at: old?.created_at || now(), updated_at: now(), demo: old?.demo === true });
    if (old?.invoice_id) out.invoice_id = old.invoice_id;
    return out;
  }
  validateSettings(settings) {
    if (!isObject(settings)) throw new ValidationError('Invalid settings.');
    const out = {};
    for (const key of ['owner', 'task_manager_url', 'review_days', 'workspace_name', 'currency']) {
      if (!Object.hasOwn(settings, key)) continue;
      const value = settings[key];
      if (typeof value !== 'string' || value.length > 1000) throw new ValidationError('Invalid setting.');
      if (key === 'currency' && value !== 'BDT') throw new ValidationError('The ledger uses BDT.');
      if (key === 'task_manager_url' && value) {
        let url;
        try { url = new URL(value); } catch { throw new ValidationError('Enter a valid task manager URL without credentials.'); }
        if (!['http:', 'https:'].includes(url.protocol) || !url.hostname || url.username || url.password) throw new ValidationError('Enter a valid task manager URL without credentials.');
      }
      out[key] = value.trim();
    }
    return out;
  }
  saveSettings(settings) {
    for (const [key, value] of Object.entries(settings)) this.sql.exec('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value', key, JSON.stringify(value));
  }
  snapshot() {
    const data = Object.fromEntries(entities.map(entity => [entity, this.rows(entity)]));
    data.settings = Object.fromEntries(this.sql.exec('SELECT key,value FROM settings').toArray().map(row => [row.key, JSON.parse(row.value)]));
    data.activity = this.sql.exec('SELECT * FROM activity ORDER BY at DESC LIMIT 60').toArray();
    return data;
  }
  restore(payload) {
    if (!isObject(payload) || payload.grow_version !== 1 || !isObject(payload.data)) throw new ValidationError('Choose a GROW version 1 JSON backup.');
    const staged = {}, indexes = {};
    let total = 0;
    for (const entity of entities) {
      const items = payload.data[entity];
      if (!Array.isArray(items)) throw new ValidationError('Backup is missing ' + entity + '.');
      total += items.length;
      if (total > 10000) throw new ValidationError('Backup exceeds 10,000 records.');
      staged[entity] = []; indexes[entity] = new Map();
      for (const item of items) {
        if (!isObject(item) || typeof item.id !== 'string' || !item.id || item.id.length > 200 || indexes[entity].has(item.id)) throw new ValidationError('Invalid or duplicate record id.');
        const record = this.validate(entity, item, null, true);
        Object.assign(record, { id: item.id, demo: item.demo === true });
        for (const key of ['created_at', 'updated_at']) if (typeof item[key] === 'string' && item[key].length < 100 && Number.isFinite(Date.parse(item[key]))) record[key] = item[key];
        if (entity === 'transactions' && item.invoice_id) {
          if (typeof item.invoice_id !== 'string' || item.invoice_id.length > 200) throw new ValidationError('Invalid invoice reference.');
          record.invoice_id = item.invoice_id;
        }
        staged[entity].push(record); indexes[entity].set(record.id, record);
      }
    }
    const payments = new Map();
    for (const entity of entities) for (const item of staged[entity]) {
      for (const [key, type] of Object.entries(FIELDS[entity])) if (type.startsWith('ref:') && item[key] && !indexes[type.slice(4).replace(/\?$/, '')].has(item[key])) throw new ValidationError('Backup contains a missing reference.');
      if (item.client_id && indexes.clients.get(item.client_id).business_id !== item.business_id) throw new ValidationError('Backup contains mismatched clients.');
      if (item.invoice_id) {
        const invoice = indexes.invoices.get(item.invoice_id);
        if (!invoice) throw new ValidationError('Backup contains a missing invoice.');
        if (item.kind !== 'Income' || item.business_id !== invoice.business_id || item.client_id !== invoice.client_id) throw new ValidationError('Backup invoice payment belongs to the wrong business or client.');
        payments.set(invoice.id, (payments.get(invoice.id) || 0) + item.amount);
      }
    }
    for (const invoice of staged.invoices) if ((payments.get(invoice.id) || 0) !== invoice.paid) throw new ValidationError('Backup invoice payments do not match the ledger.');
    const settings = this.validateSettings(payload.data.settings || {});
    this.sql.exec('DELETE FROM records');
    for (const entity of entities) for (const item of staged[entity]) this.put(entity, item);
    this.sql.exec('DELETE FROM settings'); this.saveSettings(settings);
    this.sql.exec('DELETE FROM activity'); this.audit('Restored', 'workspace', '', total + ' records restored from backup');
  }
  mutate(method, path, data) {
    try {
      const record = this.ctx.storage.transactionSync(() => this.mutateSync(method, path, data));
      return { status: 200, payload: { ok: true, record } };
    } catch (error) {
      if (error instanceof ValidationError) return { status: 400, payload: { error: error.message } };
      console.error(JSON.stringify({ event: 'workspace_save_failed', error: error.message }));
      return { status: 500, payload: { error: 'Save failed. Your previous data is safe. Please try again.' } };
    }
  }
  mutateSync(method, path, data) {
    if (!isObject(data)) throw new ValidationError('Expected an object.');
    const parts = path.split('/').filter(Boolean);
    if (path === '/api/restore' && method === 'POST') { this.restore(data); return {}; }
    if (path === '/api/settings' && method === 'PATCH') { this.saveSettings(this.validateSettings(data)); this.audit('Updated', 'settings', ''); return {}; }
    if (path === '/api/clear-samples' && method === 'POST') {
      const demoIds = new Set(entities.flatMap(entity => this.rows(entity).filter(record => record.demo).map(record => record.id)));
      for (const entity of entities) for (const record of this.rows(entity)) {
        if (record.demo) { this.sql.exec('DELETE FROM records WHERE entity=? AND id=?', entity, record.id); continue; }
        for (const [key, type] of Object.entries(FIELDS[entity])) if (type.startsWith('ref:') && demoIds.has(record[key])) {
          if (key === 'business_id' && !type.endsWith('?')) throw new ValidationError('Move your records out of sample businesses before clearing samples.');
          record[key] = '';
        }
        if (demoIds.has(record.invoice_id)) throw new ValidationError('Back up first: a real payment references a sample invoice.');
        this.put(entity, record);
      }
      this.audit('Cleared samples', 'workspace', ''); return {};
    }
    if (path === '/api/import-tasks' && method === 'POST') {
      if (!Array.isArray(data.tasks) || data.tasks.length > 1000) throw new ValidationError('Choose JSON with a tasks array (maximum 1,000 items).');
      const seen = new Set(), existing = new Map(this.rows('tasks').map(record => [record.external_id, record]));
      for (const raw of data.tasks) {
        const record = this.validate('tasks', raw);
        if (seen.has(record.external_id)) throw new ValidationError('Duplicate external_id in task import.');
        seen.add(record.external_id);
        const old = existing.get(record.external_id);
        if (old) Object.assign(record, { id: old.id, created_at: old.created_at });
        this.put('tasks', record);
      }
      this.audit('Imported', 'tasks', '', data.tasks.length + ' task statuses imported'); return { count: data.tasks.length };
    }
    if (parts.length === 4 && parts[1] === 'invoices' && parts[3] === 'payment' && method === 'POST') {
      const invoice = this.one('invoices', parts[2]);
      if (!Number.isSafeInteger(data.amount) || data.amount <= 0 || data.amount > invoice.amount - invoice.paid) throw new ValidationError('Payment must be greater than zero and no more than the balance.');
      const transaction = this.validate('transactions', { title: 'Payment · ' + invoice.title, business_id: invoice.business_id, client_id: invoice.client_id, kind: 'Income', amount: data.amount, date: data.date ?? today(), category: 'Client payment', notes: 'Invoice payment' });
      Object.assign(transaction, { invoice_id: invoice.id, demo: invoice.demo === true });
      this.put('transactions', transaction);
      invoice.paid += data.amount; invoice.updated_at = now(); this.put('invoices', invoice);
      this.audit('Recorded payment', 'invoices', invoice.id, invoice.title); return transaction;
    }
    const entity = parts[1];
    if (parts[0] !== 'api' || ![2, 3].includes(parts.length) || !Object.hasOwn(FIELDS, entity)) throw new ValidationError('Endpoint not found.');
    if (entity === 'tasks') throw new ValidationError('Tasks are read-only snapshots. Update them in your task manager, then import again.');
    const old = parts.length === 3 ? this.one(entity, parts[2]) : null;
    if (method === 'DELETE' && old) {
      if (old.invoice_id) throw new ValidationError('An invoice payment cannot be deleted from the ledger.');
      if (entity === 'invoices' && old.paid > 0) throw new ValidationError('Paid invoices are retained to protect the ledger.');
      for (const type of entities) for (const record of this.rows(type)) if (Object.entries(FIELDS[type]).some(([key, fieldtype]) => fieldtype.startsWith('ref:') && fieldtype.slice(4).replace(/\?$/, '') === entity && record[key] === old.id)) throw new ValidationError('This record is in use. Remove or reassign its linked records first.');
      this.sql.exec('DELETE FROM records WHERE entity=? AND id=?', entity, old.id); this.audit('Deleted', entity, old.id, old.title || old.name); return {};
    }
    if ((method === 'POST' && !old) || (method === 'PATCH' && old)) {
      if (old?.invoice_id) throw new ValidationError('Invoice payments cannot be edited separately from their invoice.');
      const record = this.validate(entity, data, old); this.put(entity, record); this.audit(old ? 'Updated' : 'Created', entity, record.id, record.title || record.name); return record;
    }
    throw new ValidationError('Invalid record operation.');
  }

  reserveLogin(ipHash) {
    const time = Date.now();
    return this.ctx.storage.transactionSync(() => {
      this.sql.exec('DELETE FROM login_attempts WHERE expires<?', time);
      const row = this.sql.exec('SELECT * FROM login_attempts WHERE ip_hash=?', ipHash).toArray()[0];
      if (row?.attempts >= 8) return false;
      this.sql.exec('INSERT INTO login_attempts(ip_hash,attempts,expires) VALUES(?,1,?) ON CONFLICT(ip_hash) DO UPDATE SET attempts=attempts+1', ipHash, time + 15 * 60 * 1000);
      return true;
    });
  }
  createSession(tokenHash, ipHash) {
    const csrf = crypto.randomUUID();
    this.ctx.storage.transactionSync(() => {
      this.sql.exec('DELETE FROM sessions WHERE expires<?', Date.now());
      this.sql.exec('DELETE FROM login_attempts WHERE ip_hash=?', ipHash);
      this.sql.exec('INSERT INTO sessions(token_hash,csrf,expires) VALUES(?,?,?)', tokenHash, csrf, Date.now() + 7 * 86400000);
    });
    return csrf;
  }
  getSession(tokenHash) {
    return this.sql.exec('SELECT csrf,expires FROM sessions WHERE token_hash=? AND expires>?', tokenHash, Date.now()).toArray()[0] || null;
  }
  deleteSession(tokenHash) { this.sql.exec('DELETE FROM sessions WHERE token_hash=?', tokenHash); }
}
