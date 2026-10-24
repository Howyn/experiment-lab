const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = Number(process.env.PORT || 3000);
const ACCESS_PASSWORD = process.env.ACCESS_PASSWORD || 'change-me-now';
const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, 'data');
const DATA_FILE = path.join(DATA_DIR, 'experiments.json');
const publicDir = path.join(ROOT, 'public');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, JSON.stringify({ version: 1, experiments: [] }, null, 2));

function readDb() { try { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); } catch { return { version: 1, experiments: [] }; } }
function writeDb(db) { const tmp = DATA_FILE + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(db, null, 2)); fs.renameSync(tmp, DATA_FILE); }
function json(res, status, body) { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(body)); }
function body(req) { return new Promise((resolve, reject) => { let s = ''; req.on('data', c => { s += c; if (s.length > 5e6) reject(new Error('too large')); }); req.on('end', () => { try { resolve(s ? JSON.parse(s) : {}); } catch { reject(new Error('invalid json')); } }); }); }
function token(req) { return (req.headers.authorization || '').replace(/^Bearer\s+/i, ''); }
function id() { return crypto.randomUUID(); }
function now() { return new Date().toISOString(); }
function clean(x) { return typeof x === 'string' ? x.trim() : ''; }

const server = http.createServer(async (req, res) => {
  try {
    if (req.url === '/api/auth' && req.method === 'POST') {
      const data = await body(req);
      if (data.password !== ACCESS_PASSWORD) return json(res, 401, { error: '访问口令不正确' });
      return json(res, 200, { token: crypto.createHash('sha256').update(ACCESS_PASSWORD).digest('hex') });
    }
    if (req.url.startsWith('/api/')) {
      const expected = crypto.createHash('sha256').update(ACCESS_PASSWORD).digest('hex');
      if (token(req) !== expected) return json(res, 401, { error: '请先输入访问口令' });
      const db = readDb(); const parsed = new URL(req.url, 'http://localhost');
      if (parsed.pathname === '/api/export' && req.method === 'GET') return json(res, 200, { ...db, exportedAt: now() });
      if (parsed.pathname === '/api/import' && req.method === 'POST') {
        const incoming = await body(req); if (!incoming || !Array.isArray(incoming.experiments)) return json(res, 400, { error: '文件格式不正确' });
        const existing = new Map(db.experiments.map(e => [e.id, e])); incoming.experiments.forEach(e => { if (e.id) existing.set(e.id, { ...e, updatedAt: now() }); });
        db.experiments = [...existing.values()]; writeDb(db); return json(res, 200, { count: incoming.experiments.length });
      }
      if (parsed.pathname === '/api/trash' && req.method === 'DELETE') {
        const removed = db.experiments.filter(e => e.deletedAt).length;
        db.experiments = db.experiments.filter(e => !e.deletedAt);
        writeDb(db);
        return json(res, 200, { removed });
      }
      if (parsed.pathname === '/api/experiments' && req.method === 'GET') return json(res, 200, db);
      if (parsed.pathname === '/api/experiments' && req.method === 'POST') {
        const d = await body(req); const type = d.type === 'observation' ? 'observation' : 'task';
        const t = now(); const requestedStatus = type === 'task' && ['todo', 'active', 'done'].includes(d.status) ? d.status : type === 'observation' && ['active', 'ended'].includes(d.status) ? d.status : type === 'task' ? 'todo' : 'active';
        const e = { id: id(), type, title: clean(d.title) || (type === 'task' ? '未命名任务实验' : '未命名观察实验'), status: requestedStatus, result: clean(d.result), createdAt: t, updatedAt: t, startedAt: requestedStatus === 'active' ? t : '', completedAt: requestedStatus === 'done' ? t : '', target: clean(d.target), phenomenon: clean(d.phenomenon), bug: clean(d.bug), adjustment: clean(d.adjustment), observationGoal: clean(d.observationGoal), hypothesis: clean(d.hypothesis), indicators: clean(d.indicators), conclusion: clean(d.conclusion), records: Array.isArray(d.records) ? d.records.map(r => ({ date: clean(r.date), text: clean(r.text) })).filter(r => r.date || r.text) : [], deletedAt: '' };
        db.experiments.unshift(e); writeDb(db); return json(res, 201, e);
      }
      const match = parsed.pathname.match(/^\/api\/experiments\/([^/]+)$/);
      if (match) { const i = db.experiments.findIndex(e => e.id === match[1]); if (i < 0) return json(res, 404, { error: '实验不存在' });
        if (req.method === 'DELETE') {
          if (db.experiments[i].deletedAt) {
            const [removed] = db.experiments.splice(i, 1);
            writeDb(db);
            return json(res, 200, { ...removed, permanentlyDeleted: true });
          }
          db.experiments[i].deletedAt = now(); db.experiments[i].updatedAt = now(); writeDb(db); return json(res, 200, db.experiments[i]);
        }
        if (req.method === 'PUT') { const d = await body(req); const old = db.experiments[i]; const next = { ...old, ...d, id: old.id, type: old.type, updatedAt: now() }; if (next.status !== old.status) { if (next.status === 'active' && !next.startedAt) next.startedAt = now(); if (next.status === 'done' && !next.completedAt) next.completedAt = now(); } db.experiments[i] = next; writeDb(db); return json(res, 200, next); }
      }
      return json(res, 404, { error: '接口不存在' });
    }
    let file = decodeURIComponent(req.url.split('?')[0]); if (file === '/') file = '/index.html';
    const full = path.normalize(path.join(publicDir, file)); if (!full.startsWith(publicDir)) return res.writeHead(403).end();
    fs.readFile(full, (err, data) => { if (err) return res.writeHead(404).end('Not found'); const ext = path.extname(full); const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml' }; res.writeHead(200, { 'Content-Type': types[ext] || 'application/octet-stream', 'Cache-Control': 'no-store, no-cache, must-revalidate' }); res.end(data); });
  } catch (e) { json(res, 500, { error: e.message }); }
});
server.listen(PORT, () => console.log(`Experiment Lab listening on http://0.0.0.0:${PORT}`));
