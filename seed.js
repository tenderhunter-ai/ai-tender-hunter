// seed.js — بيانات أولية: باقات، مصادر موثقة، مناقصات (10 موثقة من مصادر عامة بلقطة بتاريخ 2026-11-28 + 10 تجريبية موسومة)، 3 شركات تجريبية، حساب إدارة
const crypto = require('crypto');
const { db, now } = require('./db');

const hash = (pw, salt) => crypto.scryptSync(pw, salt, 32).toString('hex');
const SNAP = '2026-11-28';

// ——— الباقات ———
const plans = [
  ['basic', 'الأساسية', 0, 'شهرياً', ['بحث غير محدود في المناقصات', 'ملف شركة تعريفي', 'مطابقة ودرجة ملاءمة', 'تنبيهات مواعيد داخل المنصة', '5 تحليلات كراسة PDF شهرياً'], 5],
  ['pro', 'الاحترافية', 499, 'شهرياً', ['كل مميزات الأساسية', 'تحليلات كراسات حتى 100 شهرياً', 'مسودة خطاب التقديم والعرض الفني', 'جداول الكميات المستخرجة', 'قائمة مراجعة تفصيلية', 'أولوية في التنبيهات'], 100],
  ['enterprise', 'الشركات الكبيرة', 1499, 'شهرياً', ['كل مميزات الاحترافية', 'تحليلات غير محدودة', 'حتى 5 مستخدمين لنفس الشركة', 'تقارير شهرية للفرص', 'دعم مباشر وتجهيز ملفات'], -1],
];
const insPlan = db.prepare('INSERT OR IGNORE INTO plans (code,name_ar,price_egp,period,features,analyses_limit) VALUES (?,?,?,?,?,?)');
for (const [code, name, price, period, feats, limit] of plans) insPlan.run(code, name, price, period, JSON.stringify(feats), limit);

// ——— المصادر الموثقة ———
const insSource = db.prepare('INSERT INTO sources (name,url,type,status,notes,last_checked_at,added_at) VALUES (?,?,?,?,?,?,?)');
const sources = [
  ['بوابة التعاقدات العامة (منظومة التعاقدات الحكومية)', 'https://gcs.digitalegypt.gov.eg/', 'portal', 'active',
    'بوابة قانون 182/2018. متاحة للعامة بدون دخول وتعرض العمليات المفتوحة (19,273 عملية بتاريخ اللقطة). جُمعت منها لقطات موثقة يدوياً؛ الربط الآلي اللحظي قيد التوثيق — لا ندّعي تحديثاً لحظياً.', SNAP],
  ['بوابة التعاقدات الحكومية القديمة etenders.gov.eg', 'https://etenders.gov.eg/', 'portal', 'down',
    'تعذر الوصول إليها بتاريخ الفحص (مهلة انتهت/لا تستجيب). لم نتجاوز أي حماية. يعوّضها نظام الاستيراد البديل أدناه.', SNAP],
  ['dgMarket — المناقصات الممولة دولياً في مصر', 'https://www2.dgmarket.com/NoticeList?country=eg', 'funder', 'active',
    'قائمة علنية بمناقصات الممولين الدوليين في مصر (بنك دولي وغيره). جُمعت منها لقطات موثقة.', SNAP],
  ['إعلانات الصحف الرسمية واليومية', '', 'press', 'active',
    'تُدخل يدوياً عبر نظام الاستيراد البديل مع رقم العدد/الرابط عند توفره.', SNAP],
];
for (const [n, u, ty, st, notes, chk] of sources) insSource.run(n, u, ty, st, notes, chk, now());

// ——— مناقصات موثقة من مصادر عامة (لقطات 2026-11-28) ———
const insT = db.prepare(`INSERT INTO tenders (title,entity,sector,governorate,source_name,source_url,origin,snapshot_at,published_at,deadline_at,booklet_price,insurance_initial,estimated_value,description,status,created_at)
VALUES (?,?,?,?,?,?,'real',?,?,?,?,?,?,?,?,?)`);
const GCS = 'بوابة التعاقدات العامة gcs.digitalegypt.gov.eg';
const GCSU = 'https://gcs.digitalegypt.gov.eg/';
const DGM = 'dgMarket — مصر';
const DGMU = 'https://www2.dgmarket.com/NoticeList?country=eg';
const real = [
  ['المزايدة بالمظاريف المغلقة رقم (1) لسنة 2026 بشأن تمويل وتصميم وإنشاء ميناء دمياط الجاف', 'الهيئة العامة للخدمات الحكومية', 'مقاولات وإنشاءات', 'دمياط', GCS, GCSU, null, '2027-04-03', 50000, null, null, 'مزايدة بالمظاريف المغلقة — تمويل وتصميم وإنشاء ميناء دمياط الجاف. ثمن الكراسة 50,000 جنيه حسب البوابة.', 'open'],
  ['إحلال وتجديد وتوريد كشافات إضاءة حمام السباحة بنادي النادي 6 أكتوبر', 'نادي 6 أكتوبر', 'صيانة وتشغيل', 'الجيزة', GCS, GCSU, null, '2026-12-10', 299, null, null, 'إحلال وتجديد وتوريد كشافات إضاءة حمام السباحة. ثمن الكراسة 299 جنيه حسب البوابة.', 'open'],
  ['عملية التطهيرات السنوية ونزع الحشائش للترع بزمام هندسة التحرير الشمالي بتفتيش ري العامرية', 'وزارة الموارد المائية والري — تفتيش ري العامرية', 'صيانة وتشغيل', 'الإسكندرية', GCS, GCSU, null, '2026-11-17', 299, null, null, 'تطهيرات سنوية ونزع حشائش للترع. ظهرت بالبوابة بموعد 2026-11-17 (قد تكون منتهية عند الاطلاع).', 'closed'],
  ['عقد صيانة معدات سلسلة التبريد لعدد 50 ثلاجة VLS 304 وعدد 25 ديب فريزر MF 114 موزعة على الإدارات المختلفة', 'جهة حكومية (حسب البوابة)', 'صيانة وتشغيل', 'القاهرة', GCS, GCSU, null, '2026-11-14', null, null, null, 'صيانة معدات سلسلة تبريد (ثلاجات VLS وديب فريزر) — ذات صلة بقطاع المستلزمات الطبية والمعملية. ظهرت بالبوابة بموعد 2026-11-14.', 'closed'],
  ['توريد مستلزمات التأهيل والقياسات والإسعافات الأولية (شاش وأدوات ملعب)', 'جهة حكومية (حسب البوابة)', 'مستلزمات طبية', 'القاهرة', GCS, GCSU, null, '2026-05-04', 0, null, null, 'توريد مستلزمات تأهيل وقياسات وإسعافات أولية — ثمن الكراسة 0 جنيه حسب البوابة. الموعد المعروض 2026-05-04 (منتهية — تُعرض للتوثيق فقط).', 'closed'],
  ['رصف طريق شرشابة/ميت المخلص/ميت ميمون', 'مديرية الطرق والنقل بالغربية', 'مقاولات وإنشاءات', 'الغربية', GCS, GCSU, '2026-11-22', null, null, null, null, 'أعلنت البوابة بتاريخ 2026-11-22 تعديل البرنامج الزمني الخاص بالعملية. لم يظهر موعد إغلاق في اللقطة.', 'open'],
  ['Enterprise Resource Program (ERP) System Phase 1 at ECM — نظام تخطيط موارد المؤسسة', 'الهيئة القومية للأنفاق National Authority for Tunnels', 'أجهزة حاسب وتكنولوجيا', 'القاهرة', DGM, DGMU, '2026-11-24', '2027-01-23', null, null, null, 'Invitation for Bids — ERP System Phase 1. منشورة بتاريخ 2026-11-24، الإغلاق 2027-01-23 حسب dgMarket.', 'open'],
  ['Construction of the First Landfill Cell — إنشاء أول خلية مدفن صحي (عقد FIDIC Yellow Book)', 'جهاز شئون البيئة المصرية Egyptian Environmental Affairs Agency', 'مقاولات وإنشاءات', 'القاهرة', DGM, DGMU, '2026-11-25', '2026-12-24', null, null, null, 'Design-Build contract using FIDIC Yellow Book. منشورة 2026-11-25، الإغلاق 2026-12-24 حسب dgMarket.', 'open'],
  ['Supply of 300,000 reams of white A4 photocopy paper, 80 GSM — توريد 300 ألف رزمة ورق تصوير A4', 'جهة مشترية (حسب dgMarket)', 'أدوات مكتبية وقرطاسية', 'القاهرة', DGM, DGMU, null, null, null, null, null, 'توريد 300,000 رزمة ورق A4 مقاس 80 جم. ظهرت في قائمة dgMarket لمصر بتاريخ اللقطة.', 'open'],
  ['Upgrading of air conditioning and ventilation systems at the National Serum and Vaccine Complex — تحديث أنظمة التكييف والتهوية بمجمع الأمصال واللقاحات', 'المجمع القومي للأمصال واللقاحات — حلوان', 'معدات ومستلزمات معملية', 'القاهرة', DGM, DGMU, null, null, null, null, null, 'ترقية أنظمة تكييف وتهوية بالمجمع القومي للأمصال واللقاحات بحلوان. ظهرت في قائمة dgMarket لمصر بتاريخ اللقطة.', 'open'],
];
for (const r of real) insT.run(r[0], r[1], r[2], r[3], r[4], r[5], SNAP, r[6], r[7], r[8], r[9], r[10], r[11], r[12], now());

// ——— مناقصات تجريبية توضيحية (موسومة صراحة) ———
const insD = db.prepare(`INSERT INTO tenders (title,entity,sector,governorate,source_name,source_url,origin,snapshot_at,deadline_at,booklet_price,insurance_initial,description,status,created_at)
VALUES (?,?,?,?,?,'','demo',?,?,?,?,?,'open',?)`);
const demo = [
  ['توريد قفازات طبية (لاتكس ونيتريل) لمخازن مديرية الشؤون الصحية', 'مديرية الشؤون الصحية بالشرقية', 'مستلزمات طبية', 'الشرقية', 'مناقصة تجريبية توضيحية', '2026-12-15', 500, 10000, 'توريد قفازات فحص طبية بمقاسات متعددة حسب جدول الكميات بكراسة الشروط. مطلوب: سجل تجاري وبطاقة ضريبية وسابقة أعمال.'],
  ['توريد محاليل وريدية ومستهلكات حقن لمستشفى جامعي', 'مستشفيات الجامعة — الزقازيق', 'مستلزمات طبية', 'الشرقية', 'مناقصة تجريبية توضيحية', '2026-12-05', 1000, 25000, 'محاليل وريدية ومحاقن وأنابيب وصلات وفق المواصفات الدوائية. يشترط تسجيل الأصناف بهيئة الدواء المصرية.'],
  ['توريد أجهزة قياس ضغط الدم الرقمية وسماعات طبية', 'مستشفى التأمين الصحي — الزقازيق', 'مستلزمات طبية', 'الشرقية', 'مناقصة تجريبية توضيحية', '2026-12-22', 300, 5000, 'أجهزة قياس ضغط رقمية معتمدة مع ضمان سنتين على الأقل.'],
  ['توريد كواشف ومستلزمات معامل تحاليل طبية', 'المعامل المركزية — وزارة الصحة', 'معدات ومستلزمات معملية', 'القاهرة', 'مناقصة تجريبية توضيحية', '2026-12-18', 1500, 40000, 'كواشف معملية وأنابيب اختبار ومواد استهلاكية لأجهزة التحاليل الآلية، مع شهادات جودة ISO للأصناف.'],
  ['توريد أسرّة مرضى وترابيزات عمليات', 'مستشفى جامعة المنصورة', 'مستلزمات طبية', 'الدقهلية', 'مناقصة تجريبية توضيحية', '2027-01-10', 2000, 60000, 'أسرّة مرضى كهربائية وترابيزات عمليات ستانلس ستيل وفق كراسة المواصفات.'],
  ['توريد ورق تصوير A4 وأحبار طابعات لمصلحة حكومية', 'مصلحة حكومية — القاهرة', 'أدوات مكتبية وقرطاسية', 'القاهرة', 'مناقصة تجريبية توضيحية', '2026-12-08', 250, 8000, 'ورق A4 وزن 80 جم وأحبار طابعات ليزر أصلية حسب جدول الكميات.'],
  ['توريد كمامات جراحية ومستلزمات مكافحة عدوى', 'مديرية الشؤون الصحية بالغربية', 'مستلزمات طبية', 'الغربية', 'مناقصة تجريبية توضيحية', '2026-12-12', 400, 12000, 'كمامات جراحية 3 طبقات ومعقمات وأغطية رأس وأحذية.'],
  ['صيانة دورية لأجهزة أشعة وأجهزة تعقيم', 'مستشفيات جامعة طنطا', 'صيانة وتشغيل', 'الغربية', 'مناقصة تجريبية توضيحية', '2026-12-28', 1000, 30000, 'عقد صيانة سنوي لأجهزة الأشعة والتعقيم مع قطع غيار أصلية. يشترط خبرة لا تقل عن 5 سنوات في صيانة الأجهزة الطبية.'],
  ['توريد حليب أطفال علاجي ومكملات غذائية', 'مستشفيات أمانة المراكز الطبية المتخصصة', 'مستلزمات طبية', 'القاهرة', 'مناقصة تجريبية توضيحية', '2027-01-05', 800, 20000, 'أصناف مسجلة بهيئة الدواء المصرية مع تواريخ صلاحية لا تقل عن ثلثي المدة.'],
  ['توريد أثاث مكتبي لمبنى إداري جديد', 'جهة حكومية — العاشر من رمضان', 'أثاث وتجهيزات', 'الشرقية', 'مناقصة تجريبية توضيحية', '2026-12-20', 600, 15000, 'مكاتب وكراسي ودواليب وقاعات اجتماعات وفق الرسومات بكراسة الشروط.'],
];
for (const d of demo) insD.run(d[0], d[1], d[2], d[3], d[4], SNAP, d[5], d[6], d[7], d[8], now());

// ——— حساب الإدارة ———
const adminEmail = (process.env.ADMIN_EMAIL || 'admin@tenderhunter.local').toLowerCase();
if (!db.prepare('SELECT id FROM users WHERE email=?').get(adminEmail)) {
  const salt = crypto.randomBytes(16).toString('hex');
  const pw = process.env.ADMIN_PASSWORD || crypto.randomBytes(9).toString('base64url');
  db.prepare('INSERT INTO users (email,password_hash,salt,role,created_at) VALUES (?,?,?,?,?)')
    .run(adminEmail, hash(pw, salt), salt, 'admin', now());
  console.log('ADMIN_EMAIL=' + adminEmail);
  console.log('ADMIN_PASSWORD=' + pw);
}

// ——— 3 شركات تجريبية ———
const demoPw = 'Demo2026#pass';
const companies = [
  ['demo1@tenderhunter.local', 'الشرقية للمستلزمات الطبية', ['مستلزمات طبية'], 'قفازات طبية، محاليل وريدية، كمامات، مستهلكات حقن، شاش، إسعافات أولية', ['الشرقية', 'القاهرة', 'الدقهلية'], '11-50 موظفاً', 2015, 'ISO 13485 — قيد بهيئة الشراء الموحد (بيانات تجريبية)'],
  ['demo2@tenderhunter.local', 'النيل للأدوات المكتبية والقرطاسية', ['أدوات مكتبية وقرطاسية'], 'ورق تصوير A4، أحبار طابعات، أدوات مكتبية، ملفات، أقلام', ['القاهرة', 'الجيزة', 'القليوبية'], '1-10 موظفين', 2019, ''],
  ['demo3@tenderhunter.local', 'الدلتا للمعدات والمستلزمات المعملية', ['معدات ومستلزمات معملية', 'مستلزمات طبية'], 'كواشف معملية، أنابيب اختبار، أجهزة تحاليل، مواد استهلاكية معملية', ['الغربية', 'الدقهلية', 'كفر الشيخ', 'القاهرة'], '11-50 موظفاً', 2012, 'ISO 9001 (بيانات تجريبية)'],
];
for (const [email, name, sectors, products, govs, emp, year, certs] of companies) {
  if (db.prepare('SELECT id FROM users WHERE email=?').get(email)) continue;
  const salt = crypto.randomBytes(16).toString('hex');
  const uid = db.prepare('INSERT INTO users (email,password_hash,salt,role,created_at) VALUES (?,?,?,?,?)')
    .run(email, hash(demoPw, salt), salt, 'company', now()).lastInsertRowid;
  db.prepare('INSERT INTO companies (user_id,name,sectors,products,governorates,employees,founded_year,certs,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)')
    .run(uid, name, JSON.stringify(sectors), products, JSON.stringify(govs), emp, year, certs, now(), now());
  const basic = db.prepare("SELECT id FROM plans WHERE code='basic'").get();
  db.prepare('INSERT INTO subscriptions (user_id,plan_id,status,started_at,payment_ref,test_mode) VALUES (?,?,?,?,?,1)')
    .run(uid, basic.id, 'active', now(), 'FREE-PLAN');
}
console.log('DEMO_COMPANY_PASSWORD=' + demoPw);
console.log('Seed done: ' + db.prepare('SELECT COUNT(*) c FROM tenders').get().c + ' tenders, ' + db.prepare('SELECT COUNT(*) c FROM users').get().c + ' users.');
