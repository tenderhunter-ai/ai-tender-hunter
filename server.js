// server.js — AI Tender Hunter: منصة اكتشاف وتحليل المناقصات في مصر
const express = require('express');
const crypto = require('crypto');
const multer = require('multer');
const pdfParse = require('pdf-parse');
const { db, now, logEvent } = require('./db');
const { analyzeTenderText, fitScore, normalize } = require('./analyzer');
const V = require('./views');

const app = express();
const PORT = process.env.PORT || 3000;
const SECRET = process.env.APP_SECRET || 'dev-secret-change-me-in-production';
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// ——— المصادقة ———
const hash = (pw, salt) => crypto.scryptSync(pw, salt, 32).toString('hex');
const sign = v => crypto.createHmac('sha256', SECRET).update(v).digest('hex').slice(0, 32);

function setSession(res, uid) {
  const exp = Date.now() + 7 * 864e5;
  res.setHeader('Set-Cookie', `sess=${uid}.${exp}.${sign(uid + '.' + exp)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${7 * 86400}`);
}
function getUser(req) {
  const c = (req.headers.cookie || '').split(';').map(s => s.trim()).find(s => s.startsWith('sess='));
  if (!c) return null;
  const [uid, exp, sig] = c.slice(5).split('.');
  if (sign(uid + '.' + exp) !== sig || +exp < Date.now()) return null;
  return db.prepare('SELECT * FROM users WHERE id=?').get(+uid) || null;
}
app.use((req, res, next) => { req.user = getUser(req); next(); });
const needLogin = (req, res, next) => req.user ? next() : res.redirect('/login');
const needAdmin = (req, res, next) => (req.user && req.user.role === 'admin') ? next() : res.redirect('/');
const getCompany = uid => db.prepare('SELECT * FROM companies WHERE user_id=?').get(uid);

// تقدير تكلفة التحليل بالجنيه (افتراض موثق في خطة العمل: 0.25 ج/صفحة للكراسة الرقمية، 1 ج/صفحة للممسوحة)
function estimateCost(pages, chars) {
  const p = Math.max(1, pages || 1);
  const density = (chars || 0) / p;            // كثافة النص للصفحة: أقل من 200 حرف = ملف ممسوح يحتاج OCR
  const scanned = density < 200;
  const cost = scanned ? p * 1.0 : Math.max(15, p * 0.25);
  return { pages: p, scanned, cost_egp: Math.round(cost * 100) / 100 };
}
const flash = (req) => (req.query.ok ? `<div class="flash ok">${V.esc(req.query.ok)}</div>` : '') + (req.query.err ? `<div class="flash err">${V.esc(req.query.err)}</div>` : '');

// ——— الصفحة الرئيسية (تسويقية) ———
app.get('/', (req, res) => {
  const open = db.prepare("SELECT COUNT(*) c FROM tenders WHERE status='open'").get().c;
  const real = db.prepare("SELECT COUNT(*) c FROM tenders WHERE origin='real'").get().c;
  res.send(V.layout('الرئيسية', `
<div class="hero">
  <div class="pill" style="background:rgba(201,162,75,.2);color:#f0dfa8">منصة مصرية 🇪🇬 للمناقصات والتوريدات</div>
  <h1>AI Tender Hunter<br>صيّاد المناقصات الذكي</h1>
  <p>اكتشف المناقصات المناسبة لنشاط شركتك، حلّل كراسات الشروط بالذكاء الاصطناعي، واعرف درجة ملاءمتك لكل فرصة قبل ما تشتري الكراسة.</p>
  <a class="btn gold" href="/register">ابدأ مجاناً — سجّل شركتك</a>
  <a class="btn ghost" href="/tenders" style="background:rgba(255,255,255,.12);color:#fff">تصفح المناقصات</a>
</div>
<div class="grid g3" style="margin-top:18px">
  <div class="card"><h2>🔎 محرك بحث ومطابقة</h2><p>بحث في المناقصات بالكلمة والقطاع والمحافظة والمصدر، مع تصنيف تلقائي للفرص حسب نشاط شركتك ومنتجاتك.</p></div>
  <div class="card"><h2>🤖 فحص الأهلية قبل الشراء</h2><p>ارفع كراسة الشروط PDF قبل ما تدفع ثمنها: هل تنطبق عليك الشروط؟ يستخرج المساعد المواعيد، التأمينات، المستندات المطلوبة، الشروط المانعة، وجدول الكميات.</p></div>
  <div class="card"><h2>📊 درجة الملاءمة</h2><p>درجة من 100 لكل فرصة مقابل ملف شركتك، مع أسباب التقييم بوضوح — قرارك أنت، والأداة تساعدك فقط.</p></div>
  <div class="card"><h2>⏰ تنبيهات المواعيد</h2><p>قائمة مواعيد نهائية مرتبة لكل المناقصات المطابقة لك، حتى لا تفوتك جلسة فتح مظاريف.</p></div>
  <div class="card"><h2>📝 مسودات التقديم</h2><p>مسودة خطاب تقديم وهيكل عرض فني من بياناتك الحقيقية المسجلة — للمراجعة، ولا يُقدَّم رسمياً إلا باعتمادك.</p></div>
  <div class="card"><h2>✅ قائمة مراجعة</h2><p>Checklist جاهزة لكل مناقصة: المستندات، التأمينات، خطوات التسليم — علّم عليها وأنت تجهز.</p></div>
  <div class="card"><h2>📬 نشرة المناقصات المجانية</h2><p>ملخص دوري بأحدث المناقصات في قطاعك ومحافظتك — مجاناً وبدون اشتراك، حتى تتابع السوق قبل ما تشترك.</p><a class="btn ghost sm" href="/digest">اشترك في النشرة</a></div>
  <div class="card"><h2>🏆 أرشيف الترسيات <span class="pill">قريباً</span></h2><p>سجل تاريخي بنتائج الترسية والأسعار الفائزة كمرجع استرشادي عند التسعير — قيد الإعداد من المصادر العلنية الموثقة.</p></div>
</div>
<div class="card">
  <h2>من أين تأتي المناقصات؟</h2>
  <p>مصادر قانونية وعامة فقط. في النسخة التجريبية الحالية: <b>${open}</b> مناقصة، منها <b>${real}</b> موثقة من مصادرها الرسمية بتاريخ اللقطة ورابطها:</p>
  <ul>
    <li>بوابة التعاقدات العامة المصرية (gcs.digitalegypt.gov.eg) — قانون 182 لسنة 2018 <span class="pill">لقطات موثقة — الربط اللحظي قيد التوثيق</span></li>
    <li>المناقصات الممولة دولياً في مصر عبر dgMarket / UNGM <span class="pill">لقطات موثقة</span></li>
    <li>إدخال واستيراد يدوي من الإعلانات المنشورة (الجرائد الرسمية وغيرها)</li>
  </ul>
  <div class="note">لا نستخدم بيانات مسروقة ولا نتجاوز أي حماية أو تسجيل دخول في المواقع الحكومية. بوابة etenders.gov.eg القديمة غير متاحة حالياً (موثق في لوحة الإدارة) ويعوّضها نظام الاستيراد البديل.</div>
</div>
<div class="card" style="text-align:center">
  <h2>جاهز توفر ساعات البحث اليومي؟</h2>
  <p class="mut">الباقة الأساسية مجانية. الدفع في هذه النسخة تجريبي فقط لحين اعتماد بوابة الدفع.</p>
  <a class="btn" href="/pricing">شوف الباقات</a>
</div>`, req.user));
});

// ——— التسجيل والدخول ———
app.get('/register', (req, res) => {
  res.send(V.layout('تسجيل شركة', `<div class="card" style="max-width:520px;margin:auto">
<h1>سجّل شركتك</h1>${flash(req)}
<form method="post" action="/register">
<label>اسم الشركة</label><input name="name" required>
<label>البريد الإلكتروني</label><input type="email" name="email" required>
<label>كلمة المرور (8 أحرف فأكثر)</label><input type="password" name="password" minlength="8" required>
<label>نشاط الشركة (اختر واحداً أو أكثر)</label>
<div>${V.SECTORS.map(s => `<label style="display:inline-block;margin-inline-end:12px"><input type="checkbox" name="sectors" value="${s}" style="width:auto"> ${s}</label>`).join('')}</div>
<label>المحافظات التي تعمل بها</label>
<div>${V.GOVS.map(g => `<label style="display:inline-block;margin-inline-end:10px"><input type="checkbox" name="govs" value="${g}" style="width:auto"> ${g}</label>`).join('')}</div>
<br><button class="btn">إنشاء الحساب</button>
</form><p class="mut">عندك حساب؟ <a href="/login">ادخل</a></p></div>`, null));
});

const arr = v => Array.isArray(v) ? v : (v ? [v] : []);

app.post('/register', (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password || password.length < 8) return res.redirect('/register?err=' + encodeURIComponent('بيانات ناقصة أو كلمة مرور قصيرة'));
  if (db.prepare('SELECT id FROM users WHERE email=?').get(email.toLowerCase())) return res.redirect('/register?err=' + encodeURIComponent('البريد مسجل بالفعل — جرّب الدخول'));
  const salt = crypto.randomBytes(16).toString('hex');
  const info = db.prepare('INSERT INTO users (email,password_hash,salt,role,created_at) VALUES (?,?,?,?,?)')
    .run(email.toLowerCase(), hash(password, salt), salt, 'company', now());
  const uid = info.lastInsertRowid;
  db.prepare('INSERT INTO companies (user_id,name,sectors,governorates,created_at,updated_at) VALUES (?,?,?,?,?,?)')
    .run(uid, name, JSON.stringify(arr(req.body.sectors)), JSON.stringify(arr(req.body.govs)), now(), now());
  const basic = db.prepare("SELECT id FROM plans WHERE code='basic'").get();
  db.prepare('INSERT INTO subscriptions (user_id,plan_id,status,started_at,payment_ref,test_mode) VALUES (?,?,?,?,?,1)')
    .run(uid, basic.id, 'active', now(), 'FREE-PLAN');
  logEvent(uid, 'register', name);
  setSession(res, uid);
  res.redirect('/profile?ok=' + encodeURIComponent('أهلاً بك! أكمل ملف شركتك لتحصل على مطابقة أدق'));
});

app.get('/login', (req, res) => {
  res.send(V.layout('دخول', `<div class="card" style="max-width:440px;margin:auto">
<h1>دخول</h1>${flash(req)}
<form method="post" action="/login">
<label>البريد الإلكتروني</label><input type="email" name="email" required>
<label>كلمة المرور</label><input type="password" name="password" required>
<br><br><button class="btn">دخول</button>
</form><p class="mut">جديد هنا؟ <a href="/register">سجّل شركتك</a></p></div>`, null));
});

app.post('/login', (req, res) => {
  const u = db.prepare('SELECT * FROM users WHERE email=?').get(String(req.body.email || '').toLowerCase());
  if (!u || hash(req.body.password || '', u.salt) !== u.password_hash)
    return res.redirect('/login?err=' + encodeURIComponent('بيانات الدخول غير صحيحة'));
  db.prepare('UPDATE users SET last_login_at=? WHERE id=?').run(now(), u.id);
  logEvent(u.id, 'login');
  setSession(res, u.id);
  res.redirect(u.role === 'admin' ? '/admin' : '/dashboard');
});

app.get('/logout', (req, res) => { res.setHeader('Set-Cookie', 'sess=; Path=/; Max-Age=0'); res.redirect('/'); });

// ——— ملف الشركة ———
app.get('/profile', needLogin, (req, res) => {
  const c = getCompany(req.user.id) || {};
  const secs = JSON.parse(c.sectors || '[]'), govs = JSON.parse(c.governorates || '[]');
  res.send(V.layout('ملف الشركة', `<div class="card">
<h1>ملف الشركة التعريفي</h1>${flash(req)}
<div class="note info">هذه البيانات تُستخدم في المطابقة ودرجة الملاءمة والمسودات. أدخل بياناتك الحقيقية فقط — المنصة لا تخترع شهادات أو خبرات.</div>
<form method="post" action="/profile">
<div class="grid g2">
<div><label>اسم الشركة</label><input name="name" value="${V.esc(c.name || '')}" required></div>
<div><label>السجل التجاري</label><input name="commercial_reg" value="${V.esc(c.commercial_reg || '')}"></div>
<div><label>البطاقة الضريبية</label><input name="tax_id" value="${V.esc(c.tax_id || '')}"></div>
<div><label>سنة التأسيس</label><input type="number" name="founded_year" min="1950" max="2026" value="${c.founded_year || ''}"></div>
<div><label>حجم الشركة</label><select name="employees">${['', '1-10 موظفين', '11-50 موظفاً', '51-200 موظف', 'أكثر من 200'].map(e => `<option ${c.employees === e ? 'selected' : ''}>${e}</option>`).join('')}</select></div>
</div>
<label>النشاط</label><div>${V.SECTORS.map(s => `<label style="display:inline-block;margin-inline-end:12px"><input type="checkbox" name="sectors" value="${s}" ${secs.includes(s) ? 'checked' : ''} style="width:auto"> ${s}</label>`).join('')}</div>
<label>المحافظات</label><div>${V.GOVS.map(g => `<label style="display:inline-block;margin-inline-end:10px"><input type="checkbox" name="govs" value="${g}" ${govs.includes(g) ? 'checked' : ''} style="width:auto"> ${g}</label>`).join('')}</div>
<label>منتجاتك / خدماتك (كلمات مفتاحية مفصولة بفواصل — مثال: قفازات طبية، محاليل، أجهزة قياس)</label>
<textarea name="products" rows="2">${V.esc(c.products || '')}</textarea>
<label>شهادات وسابقة أعمال (اختياري — اكتب ما تملكه فعلاً فقط)</label>
<textarea name="certs" rows="2">${V.esc(c.certs || '')}</textarea>
<br><button class="btn">حفظ الملف</button>
</form></div>`, req.user));
});

app.post('/profile', needLogin, (req, res) => {
  const b = req.body;
  db.prepare(`INSERT INTO companies (user_id,name,tax_id,commercial_reg,sectors,products,governorates,employees,founded_year,certs,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(user_id) DO UPDATE SET name=excluded.name,tax_id=excluded.tax_id,commercial_reg=excluded.commercial_reg,
    sectors=excluded.sectors,products=excluded.products,governorates=excluded.governorates,employees=excluded.employees,
    founded_year=excluded.founded_year,certs=excluded.certs,updated_at=excluded.updated_at`)
    .run(req.user.id, b.name || '', b.tax_id || '', b.commercial_reg || '', JSON.stringify(arr(b.sectors)),
      b.products || '', JSON.stringify(arr(b.govs)), b.employees || '', +b.founded_year || null, b.certs || '', now(), now());
  logEvent(req.user.id, 'profile_update');
  res.redirect('/profile?ok=' + encodeURIComponent('تم حفظ ملف الشركة'));
});

// ——— بحث المناقصات ———
app.get('/tenders', (req, res) => {
  const { q = '', sector = '', gov = '', origin = '', status = 'open' } = req.query;
  let sql = 'SELECT * FROM tenders WHERE 1=1'; const p = [];
  if (q) { sql += ' AND (title LIKE ? OR entity LIKE ? OR description LIKE ?)'; const like = `%${q}%`; p.push(like, like, like); }
  if (sector) { sql += ' AND sector=?'; p.push(sector); }
  if (gov) { sql += ' AND governorate=?'; p.push(gov); }
  if (origin) { sql += ' AND origin=?'; p.push(origin); }
  if (status) { sql += ' AND status=?'; p.push(status); }
  sql += ' ORDER BY (deadline_at IS NULL), deadline_at ASC LIMIT 200';
  const rows = db.prepare(sql).all(...p);
  const company = req.user ? getCompany(req.user.id) : null;
  res.send(V.layout('المناقصات', `${flash(req)}
<h1>محرك بحث المناقصات</h1>
<div class="card"><form method="get" action="/tenders" class="grid g4">
<div><label>كلمة بحث</label><input name="q" value="${V.esc(q)}" placeholder="مثال: قفازات، ثلاجات، ورق"></div>
<div><label>القطاع</label><select name="sector"><option value="">الكل</option>${V.SECTORS.map(s => `<option ${sector === s ? 'selected' : ''}>${s}</option>`).join('')}</select></div>
<div><label>المحافظة</label><select name="gov"><option value="">الكل</option>${V.GOVS.map(g => `<option ${gov === g ? 'selected' : ''}>${g}</option>`).join('')}</select></div>
<div><label>المصدر</label><select name="origin"><option value="">الكل</option><option value="real" ${origin === 'real' ? 'selected' : ''}>موثق فقط</option><option value="demo" ${origin === 'demo' ? 'selected' : ''}>تجريبي فقط</option></select></div>
<div style="grid-column:1/-1"><button class="btn sm">بحث</button> <a class="btn ghost sm" href="/tenders">مسح</a></div>
</form></div>
<div class="card"><h2>${rows.length} نتيجة</h2>
<table><tr><th>المناقصة</th><th>القطاع</th><th>المحافظة</th><th>آخر موعد</th><th>ثمن الكراسة</th><th>المصدر</th>${req.user ? '<th>ملاءمة</th>' : ''}</tr>
${rows.map(t => V.tenderRow(t, company ? fitScore(t, company, null) : null)).join('') || '<tr><td colspan="7">لا نتائج — جرّب كلمات أخرى</td></tr>'}
</table></div>`, req.user));
});

// ——— صفحة مناقصة ———
app.get('/tenders/:id', (req, res) => {
  const t = db.prepare('SELECT * FROM tenders WHERE id=?').get(+req.params.id);
  if (!t) return res.redirect('/tenders');
  const company = req.user ? getCompany(req.user.id) : null;
  const fit = company ? fitScore(t, company, null) : null;
  const analyses = req.user ? db.prepare('SELECT id,filename,created_at FROM analyses WHERE user_id=? AND tender_id=? ORDER BY id DESC').all(req.user.id, t.id) : [];
  res.send(V.layout(t.title, `
<a href="/tenders">→ رجوع للبحث</a>
<div class="card">
<h1>${V.esc(t.title)}</h1>
<p>${V.originTag(t)} ${V.deadlineBadge(t.deadline_at)}</p>
<div class="grid g3">
<div><span class="mut">الجهة</span><br><b>${V.esc(t.entity)}</b></div>
<div><span class="mut">القطاع</span><br><b>${V.esc(t.sector)}</b></div>
<div><span class="mut">المحافظة</span><br><b>${V.esc(t.governorate || '—')}</b></div>
<div><span class="mut">آخر موعد للتقديم</span><br><b>${t.deadline_at ? V.esc(String(t.deadline_at).slice(0, 10)) : '—'}</b></div>
<div><span class="mut">ثمن كراسة الشروط</span><br><b>${t.booklet_price != null ? t.booklet_price + ' جنيه' : '—'}</b></div>
<div><span class="mut">تأمين ابتدائي</span><br><b>${t.insurance_initial != null ? t.insurance_initial + ' جنيه' : '—'}</b></div>
</div>
${t.source_url ? `<p class="mut">المصدر: <a href="${V.esc(t.source_url)}" target="_blank" rel="noopener">${V.esc(t.source_name)}</a>${t.snapshot_at ? ' — لقطة بتاريخ ' + V.esc(String(t.snapshot_at).slice(0, 10)) : ''}</p>` : `<p class="mut">المصدر: ${V.esc(t.source_name)}</p>`}
${t.description ? `<h3>الوصف</h3><p>${V.esc(t.description)}</p>` : ''}
<div class="note">تحقق دائماً من بيانات المناقصة من مصدرها الرسمي قبل شراء الكراسة أو التقديم.</div>
</div>
${fit && fit.score != null ? `<div class="card"><h2>درجة الملاءمة لشركتك</h2>
<div class="score ${fit.score >= 70 ? 'ok' : fit.score >= 45 ? 'warn' : 'bad'}">${fit.score}<small>/100</small></div>
<ul class="reasons">${fit.reasons.map(r => `<li>${V.esc(r)}</li>`).join('')}</ul>
<p class="mut">ارفع كراسة الشروط أدناه لتقييم أدق يشمل الشروط المانعة والمستندات.</p></div>` : ''}
<div class="card">
<h2>🤖 تحليل كراسة الشروط بالذكاء الاصطناعي</h2>
${req.user ? `
<form method="post" action="/tenders/${t.id}/analyze" enctype="multipart/form-data">
<label>ارفع كراسة الشروط (PDF نصي — حتى 25MB)</label>
<input type="file" name="booklet" accept="application/pdf" required>
<br><button class="btn gold">حلّل الكراسة</button>
</form>
<p class="mut">يستخرج: الملخص، المواعيد، الشروط الفنية والمالية، المستندات المطلوبة، الشروط المانعة المحتملة، جدول الكميات، درجة الملاءمة، قائمة مراجعة التقديم، ومسودة خطاب التقديم وهيكل العرض الفني.</p>
${analyses.length ? `<h3>تحليلات سابقة</h3>${analyses.map(a => `<div>📄 <a href="/analyses/${a.id}">${V.esc(a.filename)}</a> <span class="mut">${V.esc(String(a.created_at).slice(0, 16).replace('T', ' '))}</span></div>`).join('')}` : ''}
<p class="mut">ليس لديك كراسة للتجربة؟ <a href="/sample-booklet">حمّل كراسة الشروط التجريبية</a> (PDF عربي واقعي الصياغة) وارفعها هنا.</p>
` : `<p><a class="btn" href="/login">ادخل</a> أو <a class="btn gold" href="/register">سجّل شركتك</a> لتحليل الكراسة وحساب درجة الملاءمة.</p>`}
</div>`, req.user));
});

// ——— رفع وتحليل الكراسة ———
app.post('/tenders/:id/analyze', needLogin, upload.single('booklet'), async (req, res) => {
  const t = db.prepare('SELECT * FROM tenders WHERE id=?').get(+req.params.id);
  if (!t) return res.redirect('/tenders');
  if (!req.file) return res.redirect(`/tenders/${t.id}?err=` + encodeURIComponent('لم يصل ملف'));
  try {
    const sub = db.prepare(`SELECT s.*, p.analyses_limit, p.code FROM subscriptions s JOIN plans p ON p.id=s.plan_id
      WHERE s.user_id=? AND s.status='active' ORDER BY s.id DESC LIMIT 1`).get(req.user.id);
    const used = db.prepare(`SELECT COUNT(*) c FROM analyses WHERE user_id=? AND created_at >= date('now','start of month')`).get(req.user.id).c;
    if (sub && sub.analyses_limit >= 0 && used >= sub.analyses_limit)
      return res.redirect(`/tenders/${t.id}?err=` + encodeURIComponent(`وصلت حد التحليلات الشهري لباقتك (${sub.analyses_limit}). رقِّ باقتك من صفحة الباقات.`));
    const data = await pdfParse(req.file.buffer);
    const text = (data.text || '').trim();
    if (text.length < 50) return res.redirect(`/tenders/${t.id}?err=` + encodeURIComponent('تعذر استخراج نص من الـPDF — الملف قد يكون صوراً ممسوحة ضوئياً (خاصية OCR في خطة التطوير)'));
    const company = getCompany(req.user.id);
    const result = analyzeTenderText(text, t, company);
    const cost = estimateCost(data.numpages || 1, text.length);
    const info = db.prepare('INSERT INTO analyses (user_id,tender_id,filename,extracted,fit,created_at,pages,chars,cost_egp) VALUES (?,?,?,?,?,?,?,?,?)')
      .run(req.user.id, t.id, req.file.originalname || 'booklet.pdf', JSON.stringify(result), JSON.stringify(result.fit), now(), cost.pages, text.length, cost.cost_egp);
    logEvent(req.user.id, 'analysis', `tender ${t.id} · ${cost.pages}p · ${cost.cost_egp} EGP${cost.scanned ? ' · scanned' : ''}`);
    res.redirect('/analyses/' + info.lastInsertRowid);
  } catch (e) {
    res.redirect(`/tenders/${t.id}?err=` + encodeURIComponent('فشل التحليل: ' + e.message));
  }
});

// ——— صفحة نتيجة التحليل ———
app.get('/analyses/:id', needLogin, (req, res) => {
  const a = db.prepare('SELECT * FROM analyses WHERE id=? AND user_id=?').get(+req.params.id, req.user.id);
  if (!a) return res.redirect('/dashboard');
  const t = a.tender_id ? db.prepare('SELECT * FROM tenders WHERE id=?').get(a.tender_id) : null;
  const r = JSON.parse(a.extracted);
  const moneyRows = r.money.map(m => `<tr><td>${V.esc(m.label)}</td><td>${m.amount.toLocaleString('en-EG')} ${m.currency === 'USD' ? 'دولار' : 'جنيه'}</td><td class="mut">${V.esc(m.context)}</td></tr>`).join('');
  const dateRows = r.dates.map(d => `<tr><td>${V.esc(d.date)}</td><td>${d.is_deadline_hint ? '<span class="tag warn">موعد محتمل للإغلاق/جلسة</span>' : ''}</td><td class="mut">${V.esc(d.context)}</td></tr>`).join('');
  const boq = r.requirementsTable.map(w => `<tr><td>${w.no}</td><td>${V.esc(w.item)}</td><td>${w.qty}</td><td>${V.esc(w.unit)}</td></tr>`).join('');
  res.send(V.layout('نتيجة التحليل', `
<a href="${t ? '/tenders/' + t.id : '/dashboard'}">→ رجوع</a>
<div class="card">
<h1>📄 تحليل: ${V.esc(a.filename)}</h1>
${t ? `<p class="mut">مرتبط بمناقصة: <a href="/tenders/${t.id}">${V.esc(t.title)}</a></p>` : ''}
<div class="note">⚠️ ${V.esc(r.meta.disclaimer)} — المحرك: ${V.esc(r.meta.engine)} — كل رقم يُنسب لموضعه في نص الكراسة المستخرج للمراجعة — حجم النص المستخرج: ${r.meta.chars.toLocaleString()} حرف.</div>
</div>
${r.fit && r.fit.score != null ? `<div class="card"><h2>درجة الملاءمة</h2>
<div class="score ${r.fit.score >= 70 ? 'ok' : r.fit.score >= 45 ? 'warn' : 'bad'}">${r.fit.score}<small>/100</small></div>
<ul class="reasons">${r.fit.reasons.map(x => `<li>${V.esc(x)}</li>`).join('')}</ul></div>` : ''}
<div class="card"><h2>ملخص المناقصة</h2>${r.summary.map(s => `<p>${V.esc(s)}</p>`).join('') || '<p class="mut">لا يوجد</p>'}</div>
<div class="grid g2">
<div class="card"><h2>📅 المواعيد المستخرجة</h2><table><tr><th>التاريخ</th><th></th><th>السياق</th></tr>${dateRows || '<tr><td>لم يُعثر على تواريخ</td></tr>'}</table></div>
<div class="card"><h2>💰 البنود المالية المستخرجة</h2><table><tr><th>البند</th><th>القيمة</th><th>السياق</th></tr>${moneyRows || '<tr><td>لم يُعثر على مبالغ</td></tr>'}</table></div>
</div>
<div class="grid g2">
<div class="card"><h2>📎 المستندات المطلوبة</h2><ul class="checks">${r.docs.map(d => `<li>□ ${V.esc(d)}</li>`).join('') || '<li>لم تُستخرج مستندات صراحة — راجع الكراسة</li>'}</ul></div>
<div class="card"><h2>⛔ شروط قد تمنع التقديم</h2>${r.blockers.length ? r.blockers.map(b => `<div class="note"><b>${V.esc(b.type)}:</b> ${V.esc(b.detail)}</div>`).join('') : '<p class="mut">لم يُرصد شرط مانع واضح آلياً — لا يعني ذلك خلو الكراسة منها.</p>'}
<h3>الشروط الفنية والعامة المستخرجة (${r.conditions.length})</h3><ul class="checks">${r.conditions.slice(0, 15).map(c => `<li>${V.esc(c)}</li>`).join('')}</ul></div>
</div>
<div class="card"><h2>📦 جدول المتطلبات / الكميات</h2>
${boq ? `<table><tr><th>بند</th><th>الصنف</th><th>الكمية</th><th>الوحدة</th></tr>${boq}</table>` : '<p class="mut">لم يُتعرف على جدول كميات بصيغة قابلة للاستخراج الآلي.</p>'}</div>
<div class="card"><h2>✅ قائمة مراجعة التقديم</h2><ul class="checks">
${r.checklist.map(c => `<li>□ ${V.esc(c.item)} <span class="pill">${V.esc(c.source)}</span></li>`).join('')}</ul></div>
${r.draft ? `<div class="card"><h2>📝 مسودة خطاب التقديم</h2>
<div class="note">مسودة آلية من بياناتك المسجلة — للمراجعة فقط، ولا تُقدَّم لأي جهة إلا باعتمادك الرسمي.</div>
<pre style="white-space:pre-wrap;background:#fbfcfe;border:1px solid #e3e8ee;border-radius:8px;padding:14px;font-family:inherit">${V.esc(r.draft.letter)}</pre>
<h3>هيكل العرض الفني المقترح</h3><ul class="checks">${r.draft.technicalOutline.map(s => `<li>${V.esc(s)}</li>`).join('')}</ul></div>` : ''}
`, req.user));
});

// ——— لوحة التحكم ———
app.get('/dashboard', needLogin, (req, res) => {
  const company = getCompany(req.user.id);
  const sub = db.prepare("SELECT s.*, p.name_ar, p.price_egp, p.code FROM subscriptions s JOIN plans p ON p.id=s.plan_id WHERE s.user_id=? AND s.status='active' ORDER BY s.id DESC LIMIT 1").get(req.user.id);
  const all = db.prepare("SELECT * FROM tenders WHERE status='open' ORDER BY (deadline_at IS NULL), deadline_at ASC LIMIT 300").all();
  const matched = company ? all.map(t => ({ t, f: fitScore(t, company, null) })).filter(x => x.f.score != null && x.f.score >= 50).slice(0, 10) : [];
  const analyses = db.prepare('SELECT a.*, t.title FROM analyses a LEFT JOIN tenders t ON t.id=a.tender_id WHERE a.user_id=? ORDER BY a.id DESC LIMIT 5').all(req.user.id);
  const upcoming = all.filter(t => { const d = V.daysLeft(t.deadline_at); return d !== null && d >= 0 && d <= 14; });
  res.send(V.layout('لوحة التحكم', `${flash(req)}
<h1>لوحة تحكم ${V.esc(company?.name || '')}</h1>
<div class="grid g3">
<div class="card"><h2>الباقة الحالية</h2><p><b>${V.esc(sub?.name_ar || '—')}</b> ${sub ? `<span class="tag ${sub.test_mode ? 'warn' : 'ok'}">${sub.test_mode ? 'وضع تجريبي — لا دفع حقيقي' : 'مدفوعة'}</span>` : ''}</p><a class="btn ghost sm" href="/pricing">تغيير الباقة</a></div>
<div class="card"><h2>مناقصات مفتوحة</h2><div class="score">${all.length}</div><a href="/tenders">تصفح الكل</a></div>
<div class="card"><h2>مواعيد تقترب (14 يوم)</h2><div class="score ${upcoming.length ? 'warn' : ''}">${upcoming.length}</div><a href="/alerts">التنبيهات</a></div>
</div>
<div class="card"><h2>🎯 أنسب الفرص لشركتك</h2>
${company ? (matched.length ? `<table><tr><th>المناقصة</th><th>القطاع</th><th>المحافظة</th><th>آخر موعد</th><th>الكراسة</th><th>المصدر</th><th>ملاءمة</th></tr>${matched.map(x => V.tenderRow(x.t, x.f)).join('')}</table>`
    : '<p class="mut">لا توجد مطابقات قوية حالياً — أكمل <a href="/profile">ملف الشركة</a> بكلمات منتجاتك.</p>')
  : '<p class="mut">أكمل <a href="/profile">ملف الشركة</a> أولاً لتحصل على مطابقة.</p>'}</div>
<div class="card"><h2>آخر التحليلات</h2>
${analyses.length ? analyses.map(a => `<div>📄 <a href="/analyses/${a.id}">${V.esc(a.filename)}</a> <span class="mut">على: ${V.esc(a.title || '—')} — ${V.esc(String(a.created_at).slice(0, 10))}</span></div>`).join('') : '<p class="mut">لا تحليلات بعد — افتح مناقصة وارفع كراسة الشروط.</p>'}</div>`, req.user));
});

// ——— التنبيهات ———
app.get('/alerts', needLogin, (req, res) => {
  const company = getCompany(req.user.id);
  const all = db.prepare("SELECT * FROM tenders WHERE status='open' AND deadline_at IS NOT NULL").all();
  const rows = all.map(t => ({ t, d: V.daysLeft(t.deadline_at), f: company ? fitScore(t, company, null) : null }))
    .filter(x => x.d !== null && x.d >= 0)
    .sort((a, b) => a.d - b.d);
  res.send(V.layout('التنبيهات', `<h1>⏰ تنبيهات المواعيد النهائية</h1>
<div class="note info">مرتبة من الأقرب. التنبيه داخل المنصة حالياً؛ التنبيه بالبريد/الواتساب في خطة التطوير بعد اعتماد مزود الرسائل.</div>
<div class="card"><table><tr><th>المناقصة</th><th>الجهة</th><th>آخر موعد</th><th>المتبقي</th>${company ? '<th>ملاءمة</th>' : ''}</tr>
${rows.map(x => `<tr><td><a href="/tenders/${x.t.id}">${V.esc(x.t.title)}</a></td><td class="mut">${V.esc(x.t.entity)}</td><td>${V.esc(String(x.t.deadline_at).slice(0, 10))}</td><td>${V.deadlineBadge(x.t.deadline_at)}</td>${company ? `<td>${x.f.score ?? '—'}</td>` : ''}</tr>`).join('') || '<tr><td>لا مواعيد قادمة</td></tr>'}
</table></div>`, req.user));
});

// ——— النشرة المجانية: التقاط الأسماء بدون حساب (طبقة الاكتساب) ———
app.get('/digest', (req, res) => {
  const count = db.prepare('SELECT COUNT(*) c FROM leads').get().c;
  res.send(V.layout('النشرة المجانية', `${flash(req)}<div class="card" style="max-width:620px;margin:auto">
<h1>📬 نشرة المناقصات المجانية</h1>
<p>ملخص دوري بأحدث المناقصات في قطاعك ومحافظتك، من البوابة الحكومية الرسمية. مجاناً، وبدون حساب.</p>
<form method="post" action="/digest">
<label>وسيلة التواصل (واتساب أو بريد إلكتروني)</label><input name="contact" required placeholder="01xxxxxxxxx أو name@example.com">
<label>طريقة التواصل</label><select name="channel"><option value="whatsapp">واتساب</option><option value="email">بريد إلكتروني</option></select>
<label>القطاع</label><select name="sector">${V.SECTORS.map(s => `<option>${V.esc(s)}</option>`).join('')}</select>
<label>المحافظة</label><select name="governorate">${V.GOVS.map(g => `<option>${V.esc(g)}</option>`).join('')}</select>
<label>ملاحظة (اختياري): نوع المنتجات أو الخدمات التي توردها</label><input name="note">
<button class="btn gold" style="margin-top:14px">اشترك في النشرة</button>
</form>
<p class="mut" style="margin-top:12px">نستخدم بياناتك لإرسال المناقصات المناسبة فقط، ولا نشاركها مع أي جهة. يمكنك طلب الإلغاء في أي وقت.</p>
${count ? `<p class="mut">عدد المشتركين حتى الآن: ${count}</p>` : ''}
</div>`, req.user));
});

app.post('/digest', (req, res) => {
  const contact = String(req.body.contact || '').trim().slice(0, 120);
  if (contact.length < 5) return res.redirect('/digest?err=' + encodeURIComponent('أدخل وسيلة تواصل صحيحة'));
  const channel = req.body.channel === 'email' ? 'email' : 'whatsapp';
  const dup = db.prepare('SELECT id FROM leads WHERE contact=?').get(contact);
  if (dup) return res.redirect('/digest?ok=' + encodeURIComponent('أنت مشترك بالفعل — شكراً لك'));
  db.prepare('INSERT INTO leads (contact,channel,sector,governorate,note,source,created_at) VALUES (?,?,?,?,?,?,?)')
    .run(contact, channel, String(req.body.sector || '').slice(0, 80), String(req.body.governorate || '').slice(0, 80), String(req.body.note || '').slice(0, 300), 'digest', now());
  logEvent(null, 'lead', `${channel}:${contact.slice(0, 6)}***`);
  res.redirect('/digest?ok=' + encodeURIComponent('تم الاشتراك. أول نشرة توصلك مع أقرب دفعة.'));
});

// ——— الباقات والاشتراكات (تجريبي) ———
app.get('/pricing', (req, res) => {
  const plans = db.prepare('SELECT * FROM plans ORDER BY price_egp').all();
  const sub = req.user ? db.prepare("SELECT * FROM subscriptions WHERE user_id=? AND status='active' ORDER BY id DESC LIMIT 1").get(req.user.id) : null;
  res.send(V.layout('الباقات', `${flash(req)}<h1>الباقات والأسعار</h1>
<div class="note">💳 الدفع في هذه النسخة <b>تجريبي فقط</b> — لا يتم خصم أي مبلغ، وسيتم ربط بوابة دفع حقيقية (فوري/محافظ موبايل/بطاقات) بعد موافقة صاحب المشروع.</div>
<div class="grid g3">
${plans.map(p => `<div class="card" style="${p.code === 'pro' ? 'border:2px solid var(--gold)' : ''}">
<h2>${V.esc(p.name_ar)}</h2>
<div class="score">${p.price_egp === 0 ? 'مجاناً' : p.price_egp + ' <small>ج/' + V.esc(p.period) + '</small>'}</div>
<ul class="checks">${JSON.parse(p.features).map(f => `<li>✔ ${V.esc(f)}</li>`).join('')}</ul>
${sub && sub.plan_id === p.id ? '<span class="tag ok">باقتك الحالية</span>'
      : req.user ? `<form method="post" action="/subscribe/${p.id}"><button class="btn ${p.code === 'pro' ? 'gold' : ''}">${p.price_egp === 0 ? 'اختر' : 'اشترك (تجريبي)'}</button></form>`
        : '<a class="btn" href="/register">سجّل أولاً</a>'}
</div>`).join('')}
</div>
<div class="card"><h2>خدمات مدفوعة منفصلة (تجريبي)</h2>
<div class="grid g2">
<div><h3>تحليل كراسة مناقصة واحدة — 149 ج</h3><p class="mut">لغير المشتركين: ارفع كراسة واحدة واحصل على التحليل الكامل.</p></div>
<div><h3>تجهيز مسودة ملف تقديم — 499 ج</h3><p class="mut">مسودة خطاب + هيكل عرض فني + قائمة مراجعة، تراجعها وتعتمدها بنفسك.</p></div>
</div></div>`, req.user));
});

app.post('/subscribe/:planId', needLogin, (req, res) => {
  const p = db.prepare('SELECT * FROM plans WHERE id=?').get(+req.params.planId);
  if (!p) return res.redirect('/pricing');
  db.prepare("UPDATE subscriptions SET status='canceled' WHERE user_id=? AND status='active'").run(req.user.id);
  const ends = new Date(Date.now() + 30 * 864e5).toISOString();
  db.prepare('INSERT INTO subscriptions (user_id,plan_id,status,started_at,ends_at,payment_ref,test_mode) VALUES (?,?,?,?,?,?,1)')
    .run(req.user.id, p.id, 'active', now(), ends, 'TEST-' + crypto.randomBytes(4).toString('hex').toUpperCase());
  logEvent(req.user.id, 'subscribe_test', p.code);
  res.redirect('/dashboard?ok=' + encodeURIComponent(`تم تفعيل باقة ${p.name_ar} (وضع تجريبي — لم يُخصم أي مبلغ)`));
});

// ——— لوحة الإدارة ———
app.get('/admin', needAdmin, (req, res) => {
  const users = db.prepare('SELECT COUNT(*) c FROM users').get().c;
  const tenders = db.prepare('SELECT COUNT(*) c FROM tenders').get().c;
  const real = db.prepare("SELECT COUNT(*) c FROM tenders WHERE origin='real'").get().c;
  const analyses = db.prepare('SELECT COUNT(*) c FROM analyses').get().c;
  const subs = db.prepare(`SELECT p.name_ar, p.price_egp, COUNT(*) c FROM subscriptions s JOIN plans p ON p.id=s.plan_id WHERE s.status='active' GROUP BY p.id`).all();
  const revenue = db.prepare(`SELECT COALESCE(SUM(p.price_egp),0) r FROM subscriptions s JOIN plans p ON p.id=s.plan_id WHERE s.status='active' AND s.test_mode=0`).get().r;
  const testRevenue = db.prepare(`SELECT COALESCE(SUM(p.price_egp),0) r FROM subscriptions s JOIN plans p ON p.id=s.plan_id WHERE s.status='active' AND s.test_mode=1`).get().r;
  res.send(V.layout('الإدارة', `${flash(req)}<h1>لوحة الإدارة</h1>
<div class="grid g4">
<div class="card"><h3>المستخدمون</h3><div class="score">${users}</div><a href="/admin/users">إدارة</a></div>
<div class="card"><h3>المناقصات</h3><div class="score">${tenders}</div><span class="mut">${real} موثقة</span><br><a href="/admin/tenders">مراجعة وإضافة</a></div>
<div class="card"><h3>التحليلات</h3><div class="score">${analyses}</div></div>
<div class="card"><h3>مصادر البيانات</h3><a class="btn ghost sm" href="/admin/sources">إدارة واستيراد</a></div>
</div>
<div class="grid g2">
<div class="card"><h2>الاشتراكات النشطة</h2><table><tr><th>الباقة</th><th>العدد</th><th>السعر</th></tr>
${subs.map(s => `<tr><td>${V.esc(s.name_ar)}</td><td>${s.c}</td><td>${s.price_egp} ج</td></tr>`).join('')}</table></div>
<div class="card"><h2>الإيرادات</h2>
<p>إيراد حقيقي محصّل: <b>${revenue} ج</b></p>
<p class="mut">قيمة اشتراكات تجريبية (لم تُحصَّل): ${testRevenue} ج — الدفع الحقيقي معطّل لحين اعتماد البوابة.</p>
<a href="/admin/reports">تقرير الاستخدام الكامل</a></div>
</div>`, req.user));
});

app.get('/admin/users', needAdmin, (req, res) => {
  const rows = db.prepare(`SELECT u.*, c.name cname, p.name_ar plan FROM users u
    LEFT JOIN companies c ON c.user_id=u.id
    LEFT JOIN subscriptions s ON s.user_id=u.id AND s.status='active'
    LEFT JOIN plans p ON p.id=s.plan_id ORDER BY u.id DESC`).all();
  res.send(V.layout('المستخدمون', `<a href="/admin">→ الإدارة</a><div class="card"><h1>المستخدمون (${rows.length})</h1>
<table><tr><th>#</th><th>البريد</th><th>الشركة</th><th>الدور</th><th>الباقة</th><th>التسجيل</th><th>آخر دخول</th></tr>
${rows.map(u => `<tr><td>${u.id}</td><td>${V.esc(u.email)}</td><td>${V.esc(u.cname || '—')}</td><td>${u.role}</td><td>${V.esc(u.plan || '—')}</td><td class="mut">${V.esc(String(u.created_at).slice(0, 10))}</td><td class="mut">${u.last_login_at ? V.esc(String(u.last_login_at).slice(0, 16).replace('T', ' ')) : '—'}</td></tr>`).join('')}
</table></div>`, req.user));
});

// إدارة المناقصات
app.get('/admin/tenders', needAdmin, (req, res) => {
  const rows = db.prepare('SELECT * FROM tenders ORDER BY id DESC LIMIT 100').all();
  res.send(V.layout('إدارة المناقصات', `<a href="/admin">→ الإدارة</a>${flash(req)}
<div class="card"><h1>إضافة / مراجعة مناقصة</h1>
<form method="post" action="/admin/tenders" class="grid g3">
<div style="grid-column:1/-1"><label>العنوان</label><input name="title" required></div>
<div><label>الجهة</label><input name="entity" required></div>
<div><label>القطاع</label><select name="sector">${V.SECTORS.map(s => `<option>${s}</option>`).join('')}</select></div>
<div><label>المحافظة</label><select name="gov"><option value="">—</option>${V.GOVS.map(g => `<option>${g}</option>`).join('')}</select></div>
<div><label>آخر موعد (YYYY-MM-DD)</label><input name="deadline" placeholder="2026-12-31"></div>
<div><label>ثمن الكراسة (ج)</label><input type="number" step="0.01" name="booklet_price"></div>
<div><label>تأمين ابتدائي (ج)</label><input type="number" step="0.01" name="insurance"></div>
<div><label>المصدر</label><select name="origin"><option value="demo">تجريبي</option><option value="real">موثق</option></select></div>
<div><label>اسم المصدر</label><input name="source_name" value="إدخال يدوي"></div>
<div><label>رابط المصدر</label><input name="source_url" dir="ltr"></div>
<div style="grid-column:1/-1"><label>الوصف</label><textarea name="description" rows="3"></textarea></div>
<div style="grid-column:1/-1"><button class="btn">إضافة</button></div>
</form></div>
<div class="card"><h2>آخر المناقصات</h2><table><tr><th>#</th><th>العنوان</th><th>الجهة</th><th>الموعد</th><th>المصدر</th><th>الحالة</th></tr>
${rows.map(t => `<tr><td>${t.id}</td><td><a href="/tenders/${t.id}">${V.esc(t.title)}</a></td><td class="mut">${V.esc(t.entity)}</td><td>${t.deadline_at ? V.esc(String(t.deadline_at).slice(0, 10)) : '—'}</td><td>${V.originTag(t)}</td><td>${t.status === 'open' ? 'مفتوحة' : 'مغلقة'}</td></tr>`).join('')}
</table></div>`, req.user));
});

app.post('/admin/tenders', needAdmin, (req, res) => {
  const b = req.body;
  db.prepare(`INSERT INTO tenders (title,entity,sector,governorate,source_name,source_url,origin,snapshot_at,deadline_at,booklet_price,insurance_initial,description,status,created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,'open',?)`)
    .run(b.title, b.entity, b.sector, b.gov || '', b.source_name || 'إدخال يدوي', b.source_url || '', b.origin === 'real' ? 'real' : 'demo',
      now(), b.deadline || null, b.booklet_price ? +b.booklet_price : null, b.insurance ? +b.insurance : null, b.description || '', now());
  logEvent(req.user.id, 'admin_add_tender', b.title);
  res.redirect('/admin/tenders?ok=' + encodeURIComponent('أُضيفت المناقصة'));
});

// مصادر البيانات والاستيراد البديل
app.get('/admin/sources', needAdmin, (req, res) => {
  const rows = db.prepare('SELECT * FROM sources ORDER BY id').all();
  res.send(V.layout('مصادر البيانات', `<a href="/admin">→ الإدارة</a>${flash(req)}
<div class="card"><h1>مصادر البيانات</h1>
<table><tr><th>المصدر</th><th>الرابط</th><th>النوع</th><th>الحالة</th><th>آخر فحص</th><th>ملاحظات موثقة</th></tr>
${rows.map(s => `<tr><td><b>${V.esc(s.name)}</b></td><td dir="ltr" class="mut">${s.url ? `<a href="${V.esc(s.url)}" target="_blank" rel="noopener">${V.esc(s.url)}</a>` : '—'}</td><td>${V.esc(s.type)}</td><td>${s.status === 'active' ? '<span class="tag ok">يعمل</span>' : '<span class="tag bad">متعذر</span>'}</td><td class="mut">${s.last_checked_at ? V.esc(String(s.last_checked_at).slice(0, 16).replace('T', ' ')) : '—'}</td><td class="mut">${V.esc(s.notes)}</td></tr>`).join('')}
</table></div>
<div class="card"><h2>➕ إضافة مصدر جديد</h2>
<form method="post" action="/admin/sources" class="grid g3">
<div><label>الاسم</label><input name="name" required></div>
<div><label>الرابط</label><input name="url" dir="ltr"></div>
<div><label>النوع</label><select name="type"><option value="portal">بوابة</option><option value="funder">ممول دولي</option><option value="press">إعلانات صحف</option><option value="manual">يدوي</option></select></div>
<div><label>ملاحظات</label><input name="notes"></div>
<div style="align-self:end"><button class="btn">إضافة</button></div>
</form></div>
<div class="card"><h2>📥 نظام الاستيراد البديل</h2>
<div class="note">عند تعذر الربط المباشر بمصدر (مثل تعطل بوابة قديمة)، الصق إعلانات المناقصات هنا بصيغة سطر لكل مناقصة:<br>
<code dir="ltr">العنوان | الجهة | القطاع | المحافظة | الموعد النهائي YYYY-MM-DD | ثمن الكراسة | اسم المصدر | رابط المصدر</code><br>
وسيُوثق كل سطر بمصدره ويظهر كـ«موثق» إذا أُرفق رابط، أو «تجريبي» بدونه.</div>
<form method="post" action="/admin/import">
<label>الصق الأسطر هنا</label>
<textarea name="pasted" rows="6" dir="rtl" placeholder="توريد قفازات طبية | مديرية الصحة بالشرقية | مستلزمات طبية | الشرقية | 2026-12-20 | 500 | الأهرام إعلانات | https://..."></textarea>
<br><button class="btn gold">استيراد الأسطر</button>
</form></div>`, req.user));
});

app.post('/admin/sources', needAdmin, (req, res) => {
  db.prepare('INSERT INTO sources (name,url,type,status,notes,added_at) VALUES (?,?,?,?,?,?)')
    .run(req.body.name, req.body.url || '', req.body.type || 'portal', 'active', req.body.notes || '', now());
  res.redirect('/admin/sources?ok=' + encodeURIComponent('أُضيف المصدر'));
});

app.post('/admin/import', needAdmin, (req, res) => {
  const lines = String(req.body.pasted || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  let ok = 0, bad = 0;
  for (const line of lines) {
    const f = line.split('|').map(s => s.trim());
    if (f.length < 5 || !f[0] || !f[1]) { bad++; continue; }
    const url = f[7] || '';
    db.prepare(`INSERT INTO tenders (title,entity,sector,governorate,source_name,source_url,origin,snapshot_at,deadline_at,booklet_price,description,status,created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,'open',?)`)
      .run(f[0], f[1], f[2] || 'مستلزمات طبية', f[3] || '', f[6] || 'استيراد يدوي', url, url ? 'real' : 'demo',
        now(), /^\d{4}-\d{2}-\d{2}$/.test(f[4]) ? f[4] : null, f[5] ? +f[5] : null, '', now());
    ok++;
  }
  logEvent(req.user.id, 'admin_import', `${ok} ok / ${bad} bad`);
  res.redirect('/admin/sources?ok=' + encodeURIComponent(`تم استيراد ${ok} مناقصة${bad ? ` وتجاهل ${bad} سطر غير مكتمل` : ''}`));
});

// تقرير الاستخدام
app.get('/admin/reports', needAdmin, (req, res) => {
  const byType = db.prepare('SELECT type, COUNT(*) c FROM events GROUP BY type ORDER BY c DESC').all();
  const daily = db.prepare("SELECT substr(ts,1,10) d, COUNT(*) c FROM events GROUP BY d ORDER BY d DESC LIMIT 14").all();
  const topSectors = db.prepare("SELECT sector, COUNT(*) c FROM tenders GROUP BY sector ORDER BY c DESC").all();
  // هامش كل عميل: إيراد باقته مقابل تقدير تكلفة تحليلاته هذا الشهر
  const margin = db.prepare(`SELECT u.id, u.email, c.name cname, p.name_ar plan, p.price_egp,
      COALESCE((SELECT COUNT(*) FROM analyses a WHERE a.user_id=u.id AND a.created_at >= date('now','start of month')),0) uses,
      COALESCE((SELECT SUM(a.cost_egp) FROM analyses a WHERE a.user_id=u.id AND a.created_at >= date('now','start of month')),0) cost
    FROM users u
    LEFT JOIN companies c ON c.user_id=u.id
    LEFT JOIN subscriptions s ON s.user_id=u.id AND s.status='active'
    LEFT JOIN plans p ON p.id=s.plan_id
    WHERE p.id IS NOT NULL ORDER BY p.price_egp DESC`).all();
  const leadsCount = db.prepare('SELECT COUNT(*) c FROM leads').get().c;
  res.send(V.layout('تقارير', `<a href="/admin">→ الإدارة</a>
<div class="grid g4">
<div class="card"><h3>مشتركو النشرة</h3><div class="score">${leadsCount}</div><a href="/admin/leads">القائمة</a></div>
<div class="card"><h3>إجمالي التحليلات</h3><div class="score">${db.prepare('SELECT COUNT(*) c FROM analyses').get().c}</div></div>
<div class="card"><h3>تقدير تكلفة التحليلات (الشهر)</h3><div class="score">${Math.round(db.prepare("SELECT COALESCE(SUM(cost_egp),0) s FROM analyses WHERE created_at >= date('now','start of month')").get().s)} ج</div></div>
<div class="card"><h3>متوسط صفحات الكراسة</h3><div class="score">${Math.round(db.prepare('SELECT COALESCE(AVG(pages),0) a FROM analyses').get().a)}</div></div>
</div>
<div class="card"><h2>هامش كل عميل (الشهر الحالي)</h2>
<p class="mut">الإيراد = سعر الباقة. التكلفة = تقدير تحليلات الشهر (0.25 ج/صفحة رقمية، 1 ج/صفحة ممسوحة). الهامش = الفرق.</p>
<table><tr><th>العميل</th><th>الباقة</th><th>الإيراد</th><th>تحليلات</th><th>تكلفة تقديرية</th><th>الهامش</th><th>نسبة الهامش</th></tr>
${margin.map(m => { const net = m.price_egp - m.cost; const pct = m.price_egp ? Math.round(net / m.price_egp * 100) : 0; return `<tr><td>${V.esc(m.cname || m.email)}</td><td>${V.esc(m.plan)}</td><td>${m.price_egp} ج</td><td>${m.uses}</td><td>${Math.round(m.cost)} ج</td><td><b>${Math.round(net)} ج</b></td><td><span class="tag ${pct >= 70 ? 'ok' : pct >= 40 ? 'warn' : 'bad'}">${pct}%</span></td></tr>`; }).join('') || '<tr><td colspan="7">لا يوجد مشتركون بعد</td></tr>'}
</table></div>
<div class="grid g3">
<div class="card"><h2>الأحداث حسب النوع</h2><table><tr><th>الحدث</th><th>العدد</th></tr>${byType.map(r => `<tr><td>${V.esc(r.type)}</td><td>${r.c}</td></tr>`).join('')}</table></div>
<div class="card"><h2>النشاط اليومي (آخر 14 يوم)</h2><table><tr><th>اليوم</th><th>الأحداث</th></tr>${daily.map(r => `<tr><td>${r.d}</td><td>${r.c}</td></tr>`).join('') || '<tr><td>—</td></tr>'}</table></div>
<div class="card"><h2>المناقصات حسب القطاع</h2><table><tr><th>القطاع</th><th>العدد</th></tr>${topSectors.map(r => `<tr><td>${V.esc(r.sector)}</td><td>${r.c}</td></tr>`).join('')}</table></div>
</div>`, req.user));
});

// قائمة مشتركي النشرة (طبقة الاكتساب)
app.get('/admin/leads', needAdmin, (req, res) => {
  const rows = db.prepare('SELECT * FROM leads ORDER BY id DESC LIMIT 500').all();
  res.send(V.layout('مشتركو النشرة', `<a href="/admin">→ الإدارة</a><div class="card"><h1>مشتركو النشرة المجانية (${rows.length})</h1>
<table><tr><th>#</th><th>التواصل</th><th>القناة</th><th>القطاع</th><th>المحافظة</th><th>ملاحظة</th><th>التاريخ</th></tr>
${rows.map(l => `<tr><td>${l.id}</td><td dir="ltr" style="text-align:right">${V.esc(l.contact)}</td><td>${V.esc(l.channel)}</td><td>${V.esc(l.sector)}</td><td>${V.esc(l.governorate)}</td><td class="mut">${V.esc(l.note)}</td><td class="mut">${V.esc(String(l.created_at).slice(0, 16).replace('T', ' '))}</td></tr>`).join('') || '<tr><td colspan="7">لا مشتركين بعد</td></tr>'}
</table></div>`, req.user));
});

// تحميل كراسة الشروط التجريبية لتجربة التحليل
app.get('/sample-booklet', (req, res) => {
  res.download(require('./sample_booklet_b64').ensureSampleBooklet(), 'كراسة-شروط-تجريبية.pdf');
});

// بذر قاعدة البيانات تلقائياً عند أول تشغيل (بيئة جديدة)
if (db.prepare('SELECT COUNT(*) c FROM tenders').get().c === 0) {
  console.log('Empty DB — running seed...');
  require('./seed');
}

app.listen(PORT, () => console.log('AI Tender Hunter on :' + PORT));
