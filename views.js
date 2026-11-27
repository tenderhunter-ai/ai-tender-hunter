// views.js — قوالب HTML (عربي RTL)
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const SECTORS = ['مستلزمات طبية', 'معدات ومستلزمات معملية', 'أدوات مكتبية وقرطاسية', 'أجهزة حاسب وتكنولوجيا', 'أثاث وتجهيزات', 'أغذية وتموين', 'مقاولات وإنشاءات', 'صيانة وتشغيل', 'نقل ولوجستيات', 'طباعة ودعاية', 'أمن وحراسة', 'نظافة'];
const GOVS = ['القاهرة', 'الجيزة', 'الإسكندرية', 'الشرقية', 'الدقهلية', 'الغربية', 'المنوفية', 'القليوبية', 'البحيرة', 'كفر الشيخ', 'دمياط', 'بورسعيد', 'الإسماعيلية', 'السويس', 'الفيوم', 'بني سويف', 'المنيا', 'أسيوط', 'سوهاج', 'قنا', 'الأقصر', 'أسوان', 'البحر الأحمر', 'مطروح', 'شمال سيناء', 'جنوب سيناء', 'الوادي الجديد', 'كل المحافظات'];

function layout(title, body, user) {
  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)} | AI Tender Hunter</title>
<style>
:root{--navy:#0f2743;--gold:#c9a24b;--bg:#f6f7f9;--card:#fff;--ink:#1c2733;--mut:#5b6b7c;--ok:#157347;--warn:#9a6a00;--bad:#b02a37}
*{box-sizing:border-box}body{margin:0;font-family:'Segoe UI',Tahoma,Arial,sans-serif;background:var(--bg);color:var(--ink);line-height:1.7}
a{color:var(--navy)}header{background:var(--navy);color:#fff;padding:12px 20px;display:flex;flex-wrap:wrap;gap:14px;align-items:center}
header .brand{font-weight:700;font-size:19px;color:#fff;text-decoration:none}.brand span{color:var(--gold)}
header nav{display:flex;gap:14px;flex-wrap:wrap;margin-inline-start:auto}
header nav a{color:#dbe6f2;text-decoration:none;font-size:14px}header nav a:hover{color:var(--gold)}
main{max-width:1080px;margin:22px auto;padding:0 16px}
.card{background:var(--card);border:1px solid #e3e8ee;border-radius:12px;padding:20px;margin-bottom:16px;box-shadow:0 1px 3px rgba(15,39,67,.05)}
h1{font-size:26px;margin:0 0 8px}h2{font-size:20px;margin:0 0 10px;color:var(--navy)}h3{font-size:16px;margin:14px 0 6px;color:var(--navy)}
.btn{display:inline-block;background:var(--navy);color:#fff;border:0;border-radius:8px;padding:10px 20px;font-size:15px;cursor:pointer;text-decoration:none;font-family:inherit}
.btn:hover{opacity:.92}.btn.gold{background:var(--gold);color:#132a18}.btn.ghost{background:#e9eef4;color:var(--navy)}
.btn.sm{padding:5px 12px;font-size:13px}
input,select,textarea{width:100%;padding:9px 11px;border:1px solid #c8d2dd;border-radius:8px;font-size:14px;font-family:inherit;background:#fff}
label{display:block;font-size:13px;color:var(--mut);margin:10px 0 4px}
.grid{display:grid;gap:14px}.g2{grid-template-columns:1fr 1fr}.g3{grid-template-columns:repeat(3,1fr)}.g4{grid-template-columns:repeat(4,1fr)}
@media(max-width:760px){.g2,.g3,.g4{grid-template-columns:1fr}}
table{width:100%;border-collapse:collapse;font-size:14px}th,td{padding:8px 10px;border-bottom:1px solid #e8edf2;text-align:right;vertical-align:top}
th{color:var(--mut);font-weight:600;font-size:12px}
.tag{display:inline-block;background:#eef3f8;border-radius:20px;padding:2px 10px;font-size:12px;margin:2px}
.tag.gold{background:#f7ecd4}.tag.ok{background:#dff3e8;color:var(--ok)}.tag.bad{background:#fbe3e6;color:var(--bad)}.tag.warn{background:#fff3d6;color:var(--warn)}
.note{background:#fff8e6;border:1px solid #f0dfa8;border-radius:10px;padding:10px 14px;font-size:13px;color:#6b5410;margin:10px 0}
.note.info{background:#eaf2fb;border-color:#bcd7f0;color:#1c4f82}
.hero{background:linear-gradient(135deg,#0f2743,#1c456e);color:#fff;border-radius:16px;padding:44px 30px;text-align:center}
.hero h1{font-size:34px}.hero p{font-size:17px;color:#d7e3f0;max-width:640px;margin:10px auto}
.score{font-size:34px;font-weight:800}.score.ok{color:var(--ok)}.score.warn{color:var(--warn)}.score.bad{color:var(--bad)}
.mut{color:var(--mut);font-size:13px}.checks{list-style:none;padding:0}.checks li{padding:6px 0;border-bottom:1px dashed #e3e8ee}
footer{text-align:center;color:var(--mut);font-size:12px;padding:26px}
.flash{padding:10px 16px;border-radius:8px;margin-bottom:14px;font-size:14px}.flash.ok{background:#dff3e8;color:var(--ok)}.flash.err{background:#fbe3e6;color:var(--bad)}
ul.reasons{padding-inline-start:18px}.pill{font-size:11px;border-radius:20px;padding:2px 9px;background:#e9eef4;color:var(--mut)}
</style></head><body>
<header>
<a class="brand" href="/">AI <span>Tender</span> Hunter</a>
<nav>
<a href="/tenders">المناقصات</a>
${user ? `<a href="/dashboard">لوحة التحكم</a><a href="/profile">ملف الشركة</a><a href="/alerts">التنبيهات</a><a href="/pricing">الباقات</a>${user.role === 'admin' ? '<a href="/admin">الإدارة</a>' : ''}<a href="/logout">خروج</a>`
    : `<a href="/pricing">الباقات</a><a href="/login">دخول</a><a href="/register">سجّل شركتك</a>`}
</nav></header>
<main>${body}</main>
<footer>AI Tender Hunter — نسخة تجريبية للعرض. النتائج الآلية مساعدة وليست بديلاً عن مراجعة كراسة الشروط الأصلية، ولا نضمن الفوز بأي مناقصة.</footer>
</body></html>`;
}

function daysLeft(deadline) {
  if (!deadline) return null;
  return Math.ceil((new Date(deadline) - Date.now()) / 86400000);
}
function deadlineBadge(deadline) {
  const d = daysLeft(deadline);
  if (d === null) return '<span class="pill">بدون موعد</span>';
  if (d < 0) return '<span class="tag bad">منتهية</span>';
  if (d <= 3) return `<span class="tag bad">متبقٍ ${d} يوم</span>`;
  if (d <= 10) return `<span class="tag warn">متبقٍ ${d} يوم</span>`;
  return `<span class="tag ok">متبقٍ ${d} يوم</span>`;
}
function originTag(t) {
  return t.origin === 'real'
    ? `<span class="tag ok">مصدر موثق: ${esc(t.source_name)}</span>`
    : '<span class="tag warn">مناقصة تجريبية توضيحية</span>';
}

function tenderRow(t, fit) {
  return `<tr>
<td><a href="/tenders/${t.id}"><b>${esc(t.title)}</b></a><br><span class="mut">${esc(t.entity)}</span></td>
<td>${esc(t.sector)}</td><td>${esc(t.governorate || '—')}</td>
<td>${t.deadline_at ? esc(String(t.deadline_at).slice(0, 10)) + '<br>' + deadlineBadge(t.deadline_at) : '—'}</td>
<td>${t.booklet_price != null ? t.booklet_price + ' ج' : '—'}</td>
<td>${originTag(t)}</td>
${fit ? `<td>${fit.score != null ? `<b>${fit.score}</b>/100` : '—'}</td>` : ''}
</tr>`;
}

module.exports = { layout, esc, SECTORS, GOVS, daysLeft, deadlineBadge, originTag, tenderRow };
