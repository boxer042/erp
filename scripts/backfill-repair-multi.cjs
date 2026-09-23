/**
 * 기존 단일 증상/원인/수리내용을 조인 테이블로 이관 (B안 도입 1회성).
 * 이미 조인 행이 있으면 건너뛴다 — 여러 번 돌려도 안전.
 * 사용: node scripts/backfill-repair-multi.cjs            (dev)
 *       PRISMA_ENV_FILE=.env.prod node scripts/...        (운영)
 */
const envFile = process.env.PRISMA_ENV_FILE || ".env.local";
require("dotenv").config({ path: envFile, override: true });
const { PrismaClient } = require("@prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");
const p = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

(async () => {
  console.log("대상 env:", envFile);
  const tickets = await p.repairTicket.findMany({
    select: {
      id: true, ticketNo: true, repairCategoryId: true,
      symptom: true, symptomTemplateId: true,
      diagnosis: true, diagnosisTemplateId: true,
      repairContent: true,
      _count: { select: { symptomLinks: true, diagnosisLinks: true, contentLinks: true } },
    },
  });

  let s = 0, d = 0, c = 0;
  for (const t of tickets) {
    // 증상 — 기존 템플릿 FK 가 있으면 그대로 연결
    if (t._count.symptomLinks === 0 && t.symptomTemplateId) {
      await p.repairTicketSymptom.create({
        data: { ticketId: t.id, symptomId: t.symptomTemplateId, position: 0 },
      }).then(() => s++).catch(() => {});
    }
    if (t._count.diagnosisLinks === 0 && t.diagnosisTemplateId) {
      await p.repairTicketDiagnosis.create({
        data: { ticketId: t.id, diagnosisId: t.diagnosisTemplateId, position: 0 },
      }).then(() => d++).catch(() => {});
    }
    // 수리내용 — 템플릿이 없으므로 텍스트로 생성/연결
    if (t._count.contentLinks === 0 && t.repairContent && t.repairContent.trim()) {
      const text = t.repairContent.trim();
      const cat = t.repairCategoryId;
      let tpl = cat
        ? await p.repairContentTemplate.findUnique({ where: { categoryId_text: { categoryId: cat, text } } })
        : await p.repairContentTemplate.findFirst({ where: { categoryId: null, text } });
      if (!tpl) tpl = await p.repairContentTemplate.create({ data: { text, categoryId: cat, usageCount: 1 } });
      await p.repairTicketContent.create({
        data: { ticketId: t.id, contentId: tpl.id, position: 0 },
      }).then(() => c++).catch(() => {});
    }
  }
  console.log(`티켓 ${tickets.length}건 — 증상 ${s} / 원인 ${d} / 수리내용 ${c} 이관`);
  await p.$disconnect();
})();
