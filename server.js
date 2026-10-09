require('dotenv').config();
const express = require('express'), mongoose = require('mongoose'), bcrypt = require('bcryptjs'), jwt = require('jsonwebtoken'), path = require('path');
const { MONGO_URI, JWT_SECRET, PORT = 3000 } = process.env;
const ENV_OK = !!(MONGO_URI && JWT_SECRET);
if (!ENV_OK) console.error('Set MONGO_URI and JWT_SECRET (in .env locally, or in Vercel settings)');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Connect to MongoDB lazily and reuse the connection (works locally and on Vercel serverless).
let conn;
app.use('/api', async (q, s, n) => {
  if (!ENV_OK) return s.status(500).json({ error: 'Server is missing MONGO_URI or JWT_SECRET' });
  try {
    if (mongoose.connection.readyState !== 1) await (conn = conn || mongoose.connect(MONGO_URI, { serverSelectionTimeoutMS: 8000 }));
    n();
  } catch (e) { conn = null; console.error('MongoDB error:', e.message); s.status(500).json({ error: 'Database unavailable' }); }
});

const User = mongoose.model('User', new mongoose.Schema({
  name: String,
  username: { type: String, unique: true, lowercase: true, trim: true },
  hash: String,
  role: { type: String, default: 'user' }          // first account = 'admin'
}));
const Person = mongoose.model('Person', new mongoose.Schema({
  name: { type: String, unique: true }, phone: { type: String, default: '' }
}));
const Expense = mongoose.model('Expense', new mongoose.Schema({
  title: String, amount: Number,                    // amount in paisa
  payer: String, parts: [String],
  addedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  date: { type: Date, default: Date.now }
}));

const wrap = f => (q, s, n) => f(q, s, n).catch(e => {
  if (e.code === 11000) return s.status(409).json({ error: 'Already exists' });
  console.error(e); s.status(500).json({ error: 'Server error' });
});
const me = u => ({ id: u._id, name: u.name, username: u.username, role: u.role });
// No expiresIn => the token never expires: log in once, stay logged in.
const sign = u => jwt.sign({ id: u._id }, JWT_SECRET);

const auth = wrap(async (q, s, n) => {
  let u = null;
  try { u = await User.findById(jwt.verify((q.headers.authorization || '').slice(7), JWT_SECRET).id); } catch (e) {}
  if (!u) return s.status(401).json({ error: 'Please log in' });
  q.user = u; n();
});
const admin = (q, s, n) => q.user.role === 'admin' ? n() : s.status(403).json({ error: 'Admin only' });

app.post('/api/register', wrap(async (q, s) => {
  const { name, username, password } = q.body || {};
  if (!name?.trim() || !username?.trim() || (password || '').length < 6)
    return s.status(400).json({ error: 'Name, username and a 6+ character password are required' });
  const first = !(await User.exists({}));
  const u = await User.create({ name: name.trim(), username, hash: await bcrypt.hash(password, 10), role: first ? 'admin' : 'user' });
  s.json({ token: sign(u), me: me(u) });
}));

app.post('/api/login', wrap(async (q, s) => {
  const { username, password } = q.body || {};
  const u = await User.findOne({ username: (username || '').toLowerCase().trim() });
  if (!u || !(await bcrypt.compare(password || '', u.hash))) return s.status(401).json({ error: 'Wrong username or password' });
  s.json({ token: sign(u), me: me(u) });
}));

app.get('/api/state', auth, wrap(async (q, s) => {
  const [people, expenses] = await Promise.all([Person.find().sort('_id'), Expense.find().sort('date')]);
  const isAdmin = q.user.role === 'admin';
  s.json({
    me: me(q.user),
    people: people.map(p => ({ _id: p._id, name: p.name, phone: isAdmin ? p.phone : '' })), // phones are admin-only
    expenses
  });
}));

app.post('/api/people', auth, admin, wrap(async (q, s) => {
  const have = new Set((await Person.find()).map(p => p.name.toLowerCase()));
  let added = 0;
  for (const raw of q.body.names || []) {
    const name = String(raw).trim();
    if (name && !have.has(name.toLowerCase())) { await Person.create({ name }); have.add(name.toLowerCase()); added++; }
  }
  if (!added) return s.status(400).json({ error: 'Nothing new to add' });
  s.json({ added });
}));
app.patch('/api/people/:id', auth, admin, wrap(async (q, s) => {
  await Person.findByIdAndUpdate(q.params.id, { phone: String(q.body.phone || '').trim() }); s.json({ ok: true });
}));
app.delete('/api/people/:id', auth, admin, wrap(async (q, s) => {
  const p = await Person.findById(q.params.id);
  if (!p) return s.status(404).json({ error: 'Not found' });
  if (await Expense.exists({ $or: [{ payer: p.name }, { parts: p.name }] }))
    return s.status(409).json({ error: 'Used in an expense — delete it first' });
  await p.deleteOne(); s.json({ ok: true });
}));

app.post('/api/expenses', auth, wrap(async (q, s) => {
  const { title, amount, payer, parts } = q.body || {};
  const names = new Set((await Person.find()).map(p => p.name));
  if (!title?.trim() || !Number.isInteger(amount) || amount <= 0 || !names.has(payer) ||
      !Array.isArray(parts) || !parts.length || !parts.every(p => names.has(p)))
    return s.status(400).json({ error: 'Invalid expense' });
  await Expense.create({ title: title.trim(), amount, payer, parts: [...new Set(parts)], addedBy: q.user._id });
  s.json({ ok: true });
}));
app.delete('/api/expenses/:id', auth, wrap(async (q, s) => {
  const e = await Expense.findById(q.params.id);
  if (!e) return s.status(404).json({ error: 'Not found' });
  if (q.user.role !== 'admin' && String(e.addedBy) !== String(q.user._id)) return s.status(403).json({ error: 'Not allowed' });
  await e.deleteOne(); s.json({ ok: true });
}));

if (require.main === module) app.listen(PORT, () => console.log('Running on http://localhost:' + PORT));
module.exports = app; // Vercel imports this via api/index.js
