/**
 * AI-SIZ qoidalar dvigateli — har bir zakazni baholaydi.
 * Score 0-300+. Threshold:
 *   >=  50 → ogohlantirish (alert)
 *   >= 100 → kuchli shubha (driver belgilanadi)
 *   >= 150 → blok tavsiyasi (auto-block)
 */
import type Database from 'better-sqlite3';
import type { OrderRow } from '../db.js';

export interface RuleResult {
  score: number;
  reasons: string[];
  primaryType: string;
}

interface RecentStats {
  shortFinishCount: number; // bugun <500m finishlar
  sameClientCount: number; // shu mijoz shu haydovchidan qancha marta
  totalOrdersToday: number;
}

function getRecentStats(
  db: Database.Database,
  callsign: string,
  clientPhone: string,
  date: string,
): RecentStats {
  const shortRow = db
    .prepare(
      `SELECT COUNT(*) as c FROM orders
       WHERE callsign = ? AND date = ?
         AND status = 'finish' AND distance_km IS NOT NULL AND distance_km < 0.5`,
    )
    .get(callsign, date) as { c: number };

  const sameClientRow = clientPhone
    ? (db
        .prepare(
          `SELECT COUNT(*) as c FROM orders
           WHERE callsign = ? AND client_phone = ?`,
        )
        .get(callsign, clientPhone) as { c: number })
    : { c: 0 };

  const totalRow = db
    .prepare(
      `SELECT COUNT(*) as c FROM orders WHERE callsign = ? AND date = ?`,
    )
    .get(callsign, date) as { c: number };

  return {
    shortFinishCount: shortRow.c,
    sameClientCount: sameClientRow.c,
    totalOrdersToday: totalRow.c,
  };
}

/**
 * Taksometr tarifi — haydovchi qo'lda yoqadi, mijoz zakaz emas.
 * "C колес ..." bilan boshlanadi. Firibgarlik tekshiruvidan chetda qoldiriladi.
 */
function isTaximeterTariff(tariff: string): boolean {
  if (!tariff) return false;
  return /^C\s*колес/i.test(tariff) || /таксометр/i.test(tariff);
}

/**
 * Whitelisted (oq ro'yxat) haydovchini tekshirish — keng zakaz tarixi, kam alert
 */
function isWhitelisted(db: Database.Database, callsign: string): boolean {
  if (!callsign) return false;
  const row = db
    .prepare(`SELECT whitelisted FROM drivers WHERE callsign = ? LIMIT 1`)
    .get(callsign) as { whitelisted: number } | undefined;
  return row?.whitelisted === 1;
}

/**
 * Bekor qilingan zakazlar uchun maxsus baholash
 */
function scoreCancelledOrder(db: Database.Database, o: OrderRow): RuleResult {
  const reasons: string[] = [];
  let score = 0;
  let primary = '';

  if (!o.callsign) return { score: 0, reasons: [], primaryType: '' };

  // "По вине водителя" — haydovchi aybi (eng kuchli signal)
  if (o.cancel_kind === 'По вине водителя') {
    score += 80;
    reasons.push('Sayt rasmiy: "Haydovchi aybi bilan bekor"');
    primary = 'HAYDOVCHI_AYBI';
  }

  // "Клиент уже уехал" — haydovchi kechikkan
  if (o.cancel_kind === 'Клиент уже уехал') {
    score += 40;
    reasons.push('Mijoz allaqachon ketgan (haydovchi kechikkan)');
    primary = primary || 'KECHIKKAN';
  }

  // "Клиент не берет трубку" — mijoz qo'ng'iroq ko'tarmadi (haydovchi yetib bormaganligi)
  if (o.cancel_kind === 'Клиент не берет трубку') {
    score += 20;
    reasons.push('Mijoz qo\'ng\'iroq ko\'tarmadi');
  }

  // Haydovchining BUGUNGI jami bekor qilish holati
  if (o.date) {
    const dailyCancel = db
      .prepare(
        `SELECT COUNT(*) as c FROM orders
         WHERE callsign = ? AND date = ?
           AND status = 'order_cancelled'`,
      )
      .get(o.callsign, o.date) as { c: number };

    // Bugun 10+ ta bekor qilish — ko'p tanlovchi (faqat yaxshi zakazlarni oladi)
    if (dailyCancel.c >= 10) {
      score += 50;
      reasons.push(`Bugun ${dailyCancel.c} ta zakazni bekor qilgan (haddan tashqari ko'p)`);
      primary = primary || 'KO_P_BEKOR_QILUVCHI';
    } else if (dailyCancel.c >= 5) {
      score += 25;
      reasons.push(`Bugun ${dailyCancel.c} ta zakazni bekor qilgan`);
      primary = primary || 'KO_P_BEKOR_QILUVCHI';
    }
  }

  return { score, reasons, primaryType: primary };
}

export function scoreOrder(db: Database.Database, o: OrderRow): RuleResult {
  // Bekor qilingan zakaz — alohida qoidalar
  if (o.status === 'order_cancelled') {
    return scoreCancelledOrder(db, o);
  }

  const reasons: string[] = [];
  let score = 0;
  let primary = '';

  // Faqat tugagan zakazlar firibgarlik bo'lishi mumkin
  if (o.status !== 'finish') return { score: 0, reasons: [], primaryType: '' };

  // Taksometr tarifini chetlab o'tamiz — haydovchi o'zi yoqgan, mijoz zakazi emas
  // ⚠️ Diqqat: source='driver' va tariff "С колес" — bularning farqi bor:
  //   - "С колес" tarifi = haydovchi taksometr ishlatib mijozni qabul qiladi (real)
  //   - source='driver' boshqa tarifida = haydovchi soxta zakaz yaratgan (firibgarlik)
  if (isTaximeterTariff(o.tariff)) return { score: 0, reasons: [], primaryType: '' };

  // Whitelist tekshiruvi — ishonchli haydovchi past ballarni e'tiborga olmaymiz
  const whitelisted = isWhitelisted(db, o.callsign);

  const dist = o.distance_km;
  const dur = o.duration_sec;

  // 1) JUDA QISQA MASOFA — eng kuchli signal
  // 500m + dan ortiq normal hisoblanadi va alert qilinmaydi
  if (dist !== null && dist < 0.2) {
    score += 100;
    reasons.push(`Masofa juda qisqa: ${Math.round(dist * 1000)} metr (200 m dan kam)`);
    primary = primary || 'SOXTA_QISQA_MASOFA';
  } else if (dist !== null && dist < 0.35) {
    score += 70;
    reasons.push(`Masofa juda qisqa: ${Math.round(dist * 1000)} metr`);
    primary = primary || 'SOXTA_QISQA_MASOFA';
  } else if (dist !== null && dist < 0.5) {
    score += 45;
    reasons.push(`Masofa qisqa: ${Math.round(dist * 1000)} metr`);
    primary = primary || 'SOXTA_QISQA_MASOFA';
  }
  // 500 m dan ortiq masofa firibgarlik signali emas

  // 2) JUDA QISQA VAQT (mijozga yetib bormagan)
  if (dur !== null && dur < 60) {
    score += 40;
    reasons.push(`Yakunlash juda tez: ${dur} sekund (1 daqiqadan kam)`);
    primary = primary || 'JUDA_TEZ_YAKUN';
  } else if (dur !== null && dur < 180) {
    score += 20;
    reasons.push(`Yakunlash tez: ${dur} sekund (3 daqiqadan kam)`);
  }

  // 3) Sayt o'zi belgilagan (eng ishonchli signal)
  if (o.is_driver_crook === 1) {
    score += 80;
    reasons.push('Saytning o\'zi haydovchini firibgar deb belgilagan');
    primary = primary || 'SAYT_BELGISI';
  }

  // 4) Mijoz telefoni yo'q yoki bo'sh
  if (!o.client_phone) {
    score += 30;
    reasons.push('Mijozning telefon raqami yo\'q');
  }

  // 5) Manzil "Точка на карте" — GPS nuqta, aniq joy yo'q
  if (o.address && /Точка на карте|Xaritadagi nuqta/i.test(o.address)) {
    score += 15;
    reasons.push('Manzil aniq emas (faqat xaritadagi nuqta)');
  }

  // 6) Konteks: shu haydovchining bugungi xulqi — FAQAT shu zakazning o'zi ham shubhali bo'lganda
  // Aks holda normal 4-5 km zakaz ham noto'g'ri belgilanadi
  const hasDirectSignal = score > 0;
  if (hasDirectSignal && o.callsign && o.date) {
    const stats = getRecentStats(db, o.callsign, o.client_phone, o.date);
    if (stats.shortFinishCount >= 3) {
      score += 50;
      reasons.push(
        `Shu haydovchining bugun jami ${stats.shortFinishCount} ta qisqa masofali zakazi bor`,
      );
      primary = primary || 'TAKROR_QILMOQDA';
    }
    if (stats.sameClientCount >= 5) {
      score += 40;
      reasons.push(
        `Shu mijoz shu haydovchidan ${stats.sameClientCount} marta zakaz bergan (o'ziga o'zi shubhasi)`,
      );
      primary = primary || 'OZIGA_OZI_ZAKAZ';
    }
  }

  // 7) Narx + qisqa masofa — pul oldi lekin yo'l yo'q
  if (dist !== null && dist < 0.5 && o.amount !== null && o.amount >= 5000) {
    score += 20;
    reasons.push(
      `To'lov ${o.amount.toLocaleString('ru-RU')} so'm — bunday qisqa masofa uchun juda ko'p`,
    );
  }

  // 8) HAYDOVCHI O'ZI YARATGAN ZAKAZ — eng kuchli signal (taksometrdan farqli)
  // Saytda 'Свободный заказ' deb ataladi. Mijoz hech kim yo'q — pul olish uchun fiktiv zakaz.
  if (o.source === 'driver') {
    score += 80;
    reasons.push('Haydovchi o\'zi yaratgan zakaz (Свободный заказ) — mijoz emas');
    primary = primary || 'HAYDOVCHI_OZI_YARATGAN';
  }

  // 9) NARX 0 SO'M — pul olmasdan tugatilgan zakaz
  if (o.amount === 0 && o.status === 'finish') {
    score += 70;
    reasons.push('Narx 0 so\'m — pul olmadi, lekin "yakunlandi" bosgan');
    primary = primary || 'NARXSIZ_YAKUN';
  }

  // 10) JUDA QISQA VAQT (<30 sek) + masofa nomalum yoki kichik
  // Bu fizik imkonsiz — 30 sekundda mijozni olib borib bo'lmaydi
  if (dur !== null && dur < 30 && (dist === null || dist < 0.5)) {
    score += 90;
    reasons.push(`Faqat ${dur} sekundda yakunlangan — fizik imkonsiz`);
    primary = primary || 'IMKONSIZ_TEZLIK';
  }

  // 11) HAYDOVCHI AYBI BILAN BEKOR — sayt aniq belgilagan (bu zakaz status='finish' bo'lmaydi)
  // Bu rule order_cancelled uchun, lekin biz hozir finish'da. Hozir o'tkazib yuboramiz.

  // Whitelist effekti: ishonchli haydovchi past ballarni e'tiborga olmaymiz
  if (whitelisted && score < FRAUD_THRESHOLDS.STRONG) {
    reasons.push('(Whitelist haydovchisi — past ball e\'tiborga olinmaydi)');
    return { score: 0, reasons, primaryType: '' };
  }

  if (!primary && score > 0) primary = 'BOSHQA_SHUBHA';

  return { score, reasons, primaryType: primary };
}

export const FRAUD_THRESHOLDS = {
  ALERT: 50,
  STRONG: 100,
  AUTO_BLOCK: 150,
  /** 7 kunlik jami ball — bundan oshsa blok tavsiya */
  WEEKLY_TOTAL_BLOCK: 400,
  /** 7 kunlik alert soni — bundan oshsa blok tavsiya */
  WEEKLY_COUNT_BLOCK: 5,
} as const;
