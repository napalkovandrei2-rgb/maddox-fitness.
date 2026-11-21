require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const Database = require('better-sqlite3');
const nodemailer = require('nodemailer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const app = express();
const PORT = Number(process.env.PORT || 3000);
const DATA_DIR = path.resolve(process.env.DATA_DIR || './data');
fs.mkdirSync(DATA_DIR, { recursive: true });
const db = new Database(path.join(DATA_DIR, 'maddox.sqlite'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.exec(`CREATE TABLE IF NOT EXISTS applications (
 id TEXT PRIMARY KEY, fullname TEXT NOT NULL, phone TEXT NOT NULL, email TEXT NOT NULL,
 personal_data_consent INTEGER NOT NULL CHECK(personal_data_consent = 1),
 marketing_consent INTEGER NOT NULL DEFAULT 0,
 consent_version TEXT NOT NULL, created_at TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'new'
)`);

app.disable('x-powered-by');
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: '20kb' }));
app.use('/api/', rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: 'draft-7', legacyHeaders: false }));
app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'], dotfiles: 'deny' }));

let mailer = null;
if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS && process.env.NOTIFY_EMAIL) {
  mailer = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: String(process.env.SMTP_SECURE || 'false') === 'true',
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
  });
}

function cleanText(value, max) { return String(value || '').trim().replace(/[\u0000-\u001f\u007f]/g, '').slice(0, max); }
function validPhone(value) { return /^\+7\s?\(?\d{3}\)?\s?\d{3}[- ]?\d{2}[- ]?\d{2}$/.test(value); }
function validEmail(value) { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value) && value.length <= 254; }
function adminOnly(req, res, next) {
  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const expected = process.env.ADMIN_TOKEN || '';
  const supplied = Buffer.from(token);
  const configured = Buffer.from(expected);
  if (!expected || supplied.length !== configured.length || !crypto.timingSafeEqual(supplied, configured)) return res.status(401).json({ error: 'Нет доступа' });
  next();
}

app.get('/api/health', (req, res) => res.json({ ok: true, service: 'MADDOX registration API' }));
app.post('/api/applications', async (req, res) => {
  const fullname = cleanText(req.body.fullname, 160);
  const phone = cleanText(req.body.phone, 24);
  const email = cleanText(req.body.email, 254).toLowerCase();
  const personalConsent = req.body.personalDataConsent === true;
  const marketingConsent = req.body.marketingConsent === true;
  if (fullname.length < 5 || fullname.split(/\s+/).length < 2) return res.status(400).json({ error: 'Укажите фамилию и имя полностью.' });
  if (!validPhone(phone)) return res.status(400).json({ error: 'Проверьте номер телефона. Нужен российский номер +7.' });
  if (!validEmail(email)) return res.status(400).json({ error: 'Укажите корректный e-mail.' });
  if (!personalConsent) return res.status(400).json({ error: 'Необходимо согласие на обработку персональных данных.' });

  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  try {
    db.prepare(`INSERT INTO applications (id, fullname, phone, email, personal_data_consent, marketing_consent, consent_version, created_at)
      VALUES (?, ?, ?, ?, 1, ?, ?, ?)`).run(id, fullname, phone, email, marketingConsent ? 1 : 0, process.env.CONSENT_VERSION || '2026-11-21', createdAt);
  } catch (error) {
    console.error('DB insert failed:', error.message);
    return res.status(500).json({ error: 'Не удалось сохранить заявку. Попробуйте позже.' });
  }

  if (mailer) {
    const subject = `Новая заявка MADDOX #${id.slice(0, 8)}`;
    const body = `Новая заявка с сайта MADDOX\n\nФИО: ${fullname}\nТелефон: ${phone}\nE-mail: ${email}\nСогласие на обработку данных: да\nСогласие на рекламную рассылку: ${marketingConsent ? 'да' : 'нет'}\nДата: ${createdAt}\nID: ${id}`;
    try { await mailer.sendMail({ from: process.env.MAIL_FROM || process.env.SMTP_USER, to: process.env.NOTIFY_EMAIL, subject, text: body }); }
    catch (error) { console.error('Notification email failed:', error.message); }
  }
  return res.status(201).json({ ok: true, applicationId: id, notificationConfigured: Boolean(mailer) });
});

app.get('/api/admin/applications', adminOnly, (req, res) => {
  const limit = Math.min(Math.max(Number(req.query.limit || 100), 1), 500);
  const rows = db.prepare('SELECT id, fullname, phone, email, marketing_consent AS marketingConsent, consent_version AS consentVersion, created_at AS createdAt, status FROM applications ORDER BY created_at DESC LIMIT ?').all(limit);
  res.json({ applications: rows });
});
app.patch('/api/admin/applications/:id', adminOnly, (req, res) => {
  const allowed = new Set(['new', 'contacted', 'closed']);
  const status = String(req.body.status || '');
  if (!allowed.has(status)) return res.status(400).json({ error: 'Недопустимый статус' });
  const result = db.prepare('UPDATE applications SET status = ? WHERE id = ?').run(status, req.params.id);
  if (!result.changes) return res.status(404).json({ error: 'Заявка не найдена' });
  res.json({ ok: true });
});
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'admin.html')));
app.use((err, req, res, next) => { console.error(err); res.status(500).json({ error: 'Внутренняя ошибка сервера' }); });
app.listen(PORT, () => console.log(`MADDOX server listening on port ${PORT}`));
