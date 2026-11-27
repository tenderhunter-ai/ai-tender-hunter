// analyzer.js — محرك التحليل الآلي لكراسات الشروط (قواعد لغوية عربية، نسخة 1)
// صريح وصادق: تحليل آلي مساعد قائم على قواعد استخراج، وليس بديلاً عن قراءة الكراسة الأصلية.
// صُمم بحيث يمكن لاحقاً توصيل نموذج لغوي (LLM) خلف نفس الواجهة دون تغيير المنصة.

const AR_MONTHS = {
  'يناير': 1, 'فبراير': 2, 'مارس': 3, 'أبريل': 4, 'ابريل': 4, 'مايو': 5, 'يونيو': 6,
  'يوليو': 7, 'يوليه': 7, 'أغسطس': 8, 'اغسطس': 8, 'سبتمبر': 9, 'أكتوبر': 10, 'اكتوبر': 10,
  'نوفمبر': 11, 'ديسمبر': 12
};

function normalize(text) {
  return String(text || '')
    .normalize('NFKC') // يعيد الحروف العربية بصيغ العرض (Presentation Forms) إلى صيغتها القياسية
    .replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d))
    .replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d))
    .replace(/[\u0640]/g, '')           // تطويل
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/[ \t]+/g, ' ');
}

function splitLines(text) {
  return String(text || '').split(/\r?\n|(?<=[.؛]\s)/).map(l => l.trim()).filter(l => l.length > 2);
}

// ——— استخراج التواريخ ———
function extractDates(text) {
  const out = [];
  const lines = splitLines(text);
  const dateCtx = /(اخر موعد|الإغلاق|الاغلاق|جلسه|فتح المظاريف|فتح العروض|التقديم|تسليم العروض|ساري حتى|صلاحيه العرض)/;
  const numDate = /(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/g;
  const namedDate = /(\d{1,2})\s+(يناير|فبراير|مارس|أبريل|ابريل|مايو|يونيو|يوليو|يوليه|أغسطس|اغسطس|سبتمبر|أكتوبر|اكتوبر|نوفمبر|ديسمبر)\s+(\d{4})/g;
  for (const line of lines) {
    let m; const found = [];
    while ((m = numDate.exec(line)) !== null) {
      const y = m[3].length === 2 ? 2000 + +m[3] : +m[3];
      found.push({ iso: `${y}-${String(+m[2]).padStart(2, '0')}-${String(+m[1]).padStart(2, '0')}`, raw: m[0] });
    }
    while ((m = namedDate.exec(line)) !== null) {
      found.push({ iso: `${m[3]}-${String(AR_MONTHS[m[2]]).padStart(2, '0')}-${String(+m[1]).padStart(2, '0')}`, raw: m[0] });
    }
    for (const f of found) {
      out.push({ date: f.iso, raw: f.raw, context: line.slice(0, 220), is_deadline_hint: dateCtx.test(normalize(line)) });
    }
  }
  return out;
}

// ——— استخراج المبالغ المالية ———
function extractMoney(text) {
  const out = [];
  const lines = splitLines(text);
  const moneyRe = /([\d][\d,\.]*)\s*(جنيه مصري|جنيه|ج\.م|ج م|EGP|egp|دولار|\$|USD)/g;
  const labels = [
    [/تامين ابتدائي|التامين الابتدائي|تامين دخول/i, 'تأمين ابتدائي'],
    [/تامين نهائي|التامين النهائي/i, 'تأمين نهائي'],
    [/ثمن الكراسه|قيمه الكراسه|ثمن كراسه الشروط|قيمه كراسه الشروط/i, 'ثمن كراسة الشروط'],
    [/القيمه التقديريه|التكلفه التقديريه|القيمه الاجماليه/i, 'قيمة تقديرية'],
    [/غرامه|شرط جزائي/i, 'غرامة/شرط جزائي'],
  ];
  for (const line of lines) {
    let m;
    moneyRe.lastIndex = 0;
    while ((m = moneyRe.exec(line)) !== null) {
      const amount = parseFloat(m[1].replace(/,/g, ''));
      if (!isFinite(amount)) continue;
      const cur = /دولار|USD|\$/i.test(m[2]) ? 'USD' : 'EGP';
      let label = 'مبلغ';
      for (const [re, l] of labels) if (re.test(normalize(line))) { label = l; break; }
      out.push({ label, amount, currency: cur, context: line.slice(0, 220) });
    }
  }
  return out;
}

// ——— المستندات المطلوبة ———
const DOC_KEYWORDS = [
  'سجل تجاري', 'بطاقه ضريبيه', 'شهاده التسجيل', 'التامينات الاجتماعيه', 'بطاقه الرقم القومي',
  'شهاده تسجيل الموردين', 'سابقة الاعمال', 'سابقه اعمال', 'شهاده جوده', 'ايزو', 'iso',
  'شهاده صحيه', 'ترخيص مزاولة', 'تفويض', 'خطاب تقديم', 'خطاب ضمان', 'اعتماد توقيع',
  'مستخرج رسمي', 'القيد بالهيئه', 'شهاده قيد', 'مفردات مرتبات', 'المركز المالي', 'ميزانيه'
];
const deAl = s => s.replace(/(^|\s)ال/g, '$1');
function extractDocs(text) {
  const docs = new Set();
  const norm = normalize(text);
  for (const line of splitLines(norm)) {
    const plain = deAl(line);
    for (const k of DOC_KEYWORDS) {
      const kn = normalize(k);
      if (line.includes(kn) || plain.includes(kn)) { docs.add(k.replace(/ه\b/g, 'ة')); }
    }
    if (/صور(ه|ة) (من|طيبة الاصل|طابَق الاصل)/.test(line)) docs.add('صور مستندات (مذكورة في الكراسة)');
  }
  return [...docs];
}

// ——— الشروط والشروط المانعة ———
function extractConditions(text) {
  const conditions = [], blockers = [];
  const expRe = /خبره/;
  const yearsRe = /(\d{1,2})\s*سن/;
  for (const line of splitLines(normalize(text))) {
    if (/يشترط|يجب ان|لابد ان|لا يقبل|لا يجوز/.test(line)) {
      conditions.push(line.slice(0, 300));
      let m;
      if (expRe.test(line) && /لا تقل|الا تقل|لا يقل|تزيد عن|اكثر من/.test(line) && (m = yearsRe.exec(line)))
        blockers.push({ type: 'خبرة سابقة', detail: `خبرة لا تقل عن ${m[1]} سنة`, years: +m[1], context: line.slice(0, 250) });
      if (/محظور|محظورين|قائمه سوداء|يستبعد|غير مسموح|لا يجوز/.test(line)) blockers.push({ type: 'شرط قد يمنع التقديم', detail: line.slice(0, 250) });
      if (/ممول اجنبي|دولي فقط|شركات عالميه|وكيل معتمد/.test(line)) blockers.push({ type: 'اشتراط وكالة/تمويل', detail: line.slice(0, 250) });
    }
  }
  return { conditions: conditions.slice(0, 30), blockers: blockers.slice(0, 15) };
}

// ——— جدول الكميات (BOQ) ———
function extractRequirementsTable(text) {
  const rows = [];
  const unitRe = /(قطعه|قطعة|علبه|علبة|عبوه|عبوة|كرتونه|كرتونة|وحده|وحدة|متر|كجم|كيلو|لتر|طقم|جهاز|رزمه|رزمة|لفه|لفة|درجه|شكاره|شيكارة)/;
  for (const line of splitLines(text)) {
    const norm = normalize(line);
    const m = norm.match(/^(?:بند\s*)?(\d{1,3})\s+(.{3,120}?)\s+(\d[\d,\.]*)\s*(.*)$/);
    if (m && unitRe.test(m[4])) {
      rows.push({ no: m[1], item: m[2].trim(), qty: parseFloat(m[3].replace(/,/g, '')), unit: m[4].trim().slice(0, 30) });
    }
  }
  return rows.slice(0, 60);
}

// ——— تلخيص ———
function summarize(text) {
  const lines = splitLines(text).filter(l => l.length > 30);
  const head = lines.slice(0, 4).map(l => l.slice(0, 250));
  return head;
}

// ——— درجة الملاءمة ———
function fitScore(tender, company, analysis) {
  const reasons = [];
  let score = 40;
  if (!company) return { score: null, reasons: ['أكمل ملف شركتك أولاً لحساب درجة الملاءمة.'] };
  const sectors = JSON.parse(company.sectors || '[]');
  const govs = JSON.parse(company.governorates || '[]');
  const tsector = normalize(tender.sector || '');
  const ttext = normalize((tender.title || '') + ' ' + (tender.description || '') + ' ' + (analysis?.textSample || ''));

  if (sectors.some(s => tsector.includes(normalize(s)) || normalize(s).includes(tsector))) {
    score += 25; reasons.push('✅ نشاط المناقصة يطابق نشاط شركتك المسجل.');
  } else { score -= 10; reasons.push('⚠️ نشاط المناقصة غير مطابق مباشرة لنشاطك المسجل.'); }

  const kws = String(company.products || '').split(/[,،\n]/).map(s => normalize(s).trim()).filter(s => s.length > 2);
  const ttextPlain = deAl(ttext);
  const hits = kws.filter(k => ttext.includes(k) || ttextPlain.includes(deAl(k)));
  if (hits.length) { score += Math.min(20, hits.length * 5); reasons.push(`✅ كلمات من منتجاتك ظهرت في المناقصة: ${hits.slice(0, 5).join('، ')}`); }

  if (tender.governorate && govs.length) {
    if (govs.includes(tender.governorate) || govs.includes('كل المحافظات')) { score += 10; reasons.push('✅ المحافظة ضمن نطاق عملك.'); }
    else { score -= 5; reasons.push(`⚠️ المحافظة (${tender.governorate}) خارج نطاق عملك المسجل.`); }
  }

  if (tender.deadline_at) {
    const days = Math.ceil((new Date(tender.deadline_at) - Date.now()) / 86400000);
    if (days < 0) { score = 0; reasons.push('⛔ انتهى موعد التقديم.'); }
    else if (days < 4) { score -= 15; reasons.push(`⚠️ متبقٍ ${days} يوم فقط — وقت ضيق لتجهيز ملف التقديم.`); }
    else { score += 5; reasons.push(`✅ متبقٍ ${days} يوم على الإغلاق.`); }
  }

  for (const b of (analysis?.blockers || [])) {
    if (b.type === 'خبرة سابقة' && company.founded_year) {
      const years = new Date().getFullYear() - company.founded_year;
      if (years < b.years) { score -= 30; reasons.push(`⛔ شرط خبرة ${b.years} سنوات وعمر شركتك ${years} سنة — قد يمنع التقديم.`); }
      else reasons.push(`✅ شرط الخبرة (${b.years} سنوات) مستوفى بعمر شركتك (${years} سنة).`);
    } else {
      score -= 10; reasons.push(`⚠️ شرط يحتاج مراجعة: ${b.type} — ${String(b.detail).slice(0, 120)}`);
    }
  }

  score = Math.max(0, Math.min(100, score));
  if (!reasons.length) reasons.push('درجة أولية — ارفع كراسة الشروط لتقييم أدق.');
  return { score, reasons };
}

// ——— قائمة مراجعة التقديم ———
function buildChecklist(docs, money, dates) {
  const list = docs.map(d => ({ item: d, done: false, source: 'مستخرجة من الكراسة' }));
  const std = [
    'شراء كراسة الشروط وسداد قيمتها',
    'سداد التأمين الابتدائي بالطريقة المحددة',
    'خطاب تقديم العرض موقع ومختوم',
    'العرض الفني كاملاً حسب بنود الكراسة',
    'العرض المالي (جدول الكميات مسعّر)',
    'صلاحية العرض بالمدة المطلوبة',
    'مراجعة نهائية بشرية قبل التسليم'
  ];
  if (money.some(m => m.label === 'ثمن كراسة الشروط')) std.shift();
  if (money.some(m => m.label === 'تأمين ابتدائي')) std.splice(1, 1);
  for (const s of std) list.push({ item: s, done: false, source: 'قائمة قياسية' });
  if (dates.length) list.push({ item: `تسليم قبل: ${dates.find(d => d.is_deadline_hint)?.date || dates[0].date}`, done: false, source: 'موعد مستخرج' });
  return list;
}

// ——— مسودة خطاب التقديم والعرض الفني ———
function draftOffer(tender, company, analysis) {
  const cname = company?.name || '[اسم الشركة]';
  const letter = `السيد الأستاذ الدكتور/ رئيس مجلس إدارة ${tender.entity || 'الجهة المانحة'}\nتحية طيبة وبعد،،،\n\nبخصوص: ${tender.title}\n\nنتشرف نحن شركة ${cname} بأن نتقدم لسيادتكم بعرضنا الفني والمالي للمناقصة المشار إليها أعلاه، وذلك وفقاً لأحكام القانون رقم 182 لسنة 2018 ولائحته التنفيذية وكراسة الشروط والمواصفات.\n\nنؤكد التزامنا الكامل بجميع الشروط والمواصفات الواردة بالكراسة، وسريان عرضنا لمدة الصلاحية المطلوبة اعتباراً من تاريخ جلسة فتح المظاريف.\n\nوتفضلوا بقبول فائق الاحترام،،،\n\nمقدمه لسيادتكم\n${cname}\nالصفة: [ ]          التوقيع: [ ]          التاريخ: [ ]\n\n[مسودة آلية للمراجعة — لا تُقدَّم رسمياً إلا بعد اعتماد صاحب الشركة]`;
  const sections = [
    '١. مقدمة عن الشركة وسابقة الأعمال (من ملف الشركة المسجل — بدون أي اختلاق لبيانات)',
    '٢. فهم نطاق العمل: ' + (analysis?.summary?.[0] || tender.title),
    '٣. المنهجية وخطة التنفيذ والتوريد',
    '٤. الجدول الزمني للتسليم',
    '٥. الضمان وخدمة ما بعد البيع',
    '٦. الامتثال للشروط الفنية المستخرجة: ' + ((analysis?.conditions?.length) ? `${analysis.conditions.length} شرطاً — راجعها بنداً بنداً` : 'راجع بنود الكراسة'),
    '٧. المرفقات: ' + ((analysis?.docs?.length) ? analysis.docs.slice(0, 8).join('، ') : 'حسب المستندات المطلوبة في الكراسة')
  ];
  return { letter, technicalOutline: sections };
}

// ——— نقطة الدخول الرئيسية ———
function analyzeTenderText(text, tender, company) {
  const dates = extractDates(text);
  const money = extractMoney(text);
  const docs = extractDocs(text);
  const { conditions, blockers } = extractConditions(text);
  const requirementsTable = extractRequirementsTable(text);
  const summary = summarize(text);
  const partial = { textSample: text.slice(0, 4000), blockers, summary, conditions, docs };
  const fit = tender ? fitScore(tender, company, partial) : null;
  const checklist = buildChecklist(docs, money, dates);
  const draft = tender ? draftOffer(tender, company, partial) : null;
  return {
    summary, dates, money, docs, conditions, blockers, requirementsTable,
    checklist, fit, draft,
    meta: {
      engine: 'قواعد لغوية عربية v1 (بدون نموذج لغوي خارجي)',
      chars: text.length,
      disclaimer: 'نتائج آلية مساعدة قابلة للخطأ — راجع الكراسة الأصلية قبل أي قرار، ولا ضمان للفوز بأي مناقصة.'
    }
  };
}

module.exports = { analyzeTenderText, fitScore, normalize };
