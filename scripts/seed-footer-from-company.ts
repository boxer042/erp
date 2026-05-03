/**
 * 회사 정보(CompanyInfo) + 통장(CompanyBankAccount) 를 읽어서
 * 공통 footer 블록 (LandingSettings.footerBlocks) 을 자동 생성합니다.
 *
 * 사용법:
 *   npx tsx scripts/seed-footer-from-company.ts          # JSON 만 출력 (확인용)
 *   npx tsx scripts/seed-footer-from-company.ts --apply  # DB 의 LandingSettings 에 바로 적용
 *
 * 카피는 농기계 도소매 (대동기계상사) 기준으로 작성됨. 다른 업종이면 직접 수정 권장.
 */

import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

const connectionString = process.env.DIRECT_URL || process.env.DATABASE_URL;
if (!connectionString) {
  console.error("❌ DIRECT_URL / DATABASE_URL 환경변수 필요");
  process.exit(1);
}
const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

async function run() {
  const apply = process.argv.includes("--apply");

  const company = await prisma.companyInfo.findUnique({
    where: { id: "singleton" },
    include: { bankAccounts: { orderBy: [{ isPrimary: "desc" }, { sortOrder: "asc" }] } },
  });
  if (!company) {
    console.error("❌ CompanyInfo 가 없습니다. /settings 에서 먼저 사업자 정보를 입력하세요.");
    process.exit(1);
  }

  const primaryBank = company.bankAccounts.find((b) => b.isPrimary) ?? company.bankAccounts[0];

  // 사업자 정보 한 줄 정리
  const businessLines: string[] = [
    `${company.name}${company.ceo ? ` · 대표 ${company.ceo}` : ""}`,
  ];
  if (company.businessNumber) {
    businessLines.push(`사업자등록번호 ${company.businessNumber}`);
  }
  if (company.address) businessLines.push(`주소 ${company.address}`);
  if (company.phone || company.email) {
    const parts = [
      company.phone ? `전화 ${company.phone}` : null,
      company.email ? `이메일 ${company.email}` : null,
    ].filter(Boolean);
    businessLines.push(parts.join(" · "));
  }
  if (primaryBank) {
    businessLines.push(
      `입금계좌 ${primaryBank.bankName} ${primaryBank.account}${primaryBank.holder ? ` (예금주 ${primaryBank.holder})` : ""}`,
    );
  }

  const asContact = [company.phone, company.email].filter(Boolean).join(" · ");

  const footer = [
    // 1. 브랜드 인트로 (강조 — dark 배경)
    {
      id: "fo-brand",
      type: "text",
      eyebrow: "SINCE 1965",
      heading: "한 자리에서, 한 가게로.",
      body: `${company.address ? `${company.address}에서 ` : ""}오랫동안 농기계와 공구를 다뤄왔습니다.\n정품만 취급하며 구매 이후에도 직접 책임집니다.`,
      align: "center",
      background: "dark",
      headingSize: "lg",
      headingWeight: "bold",
      bodySize: "md",
      color: "default",
      paddingY: "xl",
    },

    // 2. 배송 안내
    {
      id: "fo-shipping",
      type: "text",
      eyebrow: "DELIVERY",
      heading: "배송 안내",
      body: "오후 2시 이전 결제 시 당일 발송됩니다 (주말·공휴일 제외).\n도서산간은 추가 1~2일 소요될 수 있으며, 대형 농기계는 화물 직배송 — 수령 시 동승 확인을 부탁드립니다.",
      align: "left",
      background: "none",
      headingSize: "md",
      headingWeight: "semibold",
      bodySize: "md",
      color: "default",
      paddingY: "lg",
    },

    // 3. 교환·환불
    {
      id: "fo-refund",
      type: "text",
      eyebrow: "RETURNS",
      heading: "교환·환불 안내",
      body: "단순 변심에 의한 교환·환불은 **제품 수령 후 7일 이내**, 미사용·재판매 가능 상태에서 가능합니다.\n불량/오배송은 **14일 이내** 교환·환불을 받으실 수 있으며 왕복 배송비는 부담하지 않습니다.\n사용감 있는 제품, 개봉 후 위생상 재판매 불가 제품, 부착·설치된 부품은 교환·환불이 제한됩니다.",
      align: "left",
      background: "muted",
      headingSize: "md",
      headingWeight: "semibold",
      bodySize: "md",
      color: "default",
      paddingY: "lg",
    },

    // 4. A/S
    {
      id: "fo-as",
      type: "text",
      eyebrow: "A/S",
      heading: "무상 A/S 1년 보장",
      body: `구매일로부터 1년간 무상 A/S 를 제공합니다. (소모품 / 외관 손상 제외)\n무상 기간 이후에는 부품·공임을 별도 청구하며, 사전 견적 안내 후 진행합니다.${
        asContact ? `\n\n**A/S 접수**: ${asContact}` : ""
      }`,
      align: "left",
      background: "none",
      headingSize: "md",
      headingWeight: "semibold",
      bodySize: "md",
      color: "default",
      paddingY: "lg",
    },

    // 5. 사업자 정보 (작은 글씨, dark 배경)
    {
      id: "fo-business-info",
      type: "text",
      eyebrow: "",
      heading: "",
      body: businessLines.join("\n"),
      align: "center",
      background: "dark",
      headingSize: "md",
      headingWeight: "semibold",
      bodySize: "sm",
      color: "default",
      paddingY: "md",
    },
  ];

  if (!apply) {
    console.log("📋 생성된 footer JSON (복사해서 /settings/landing → JSON 버튼에 붙여넣기):\n");
    console.log(JSON.stringify(footer, null, 2));
    console.log("\n💡 바로 적용하려면: npx tsx scripts/seed-footer-from-company.ts --apply");
    return;
  }

  await prisma.landingSettings.upsert({
    where: { id: "singleton" },
    update: { footerBlocks: footer as unknown as object },
    create: { id: "singleton", footerBlocks: footer as unknown as object },
  });

  console.log("✅ Footer 가 적용되었습니다.");
  console.log("\n🌐 확인:");
  console.log("   /settings/landing  (편집)");
  console.log("   /products/<id>/landing/preview  (실제 표시 확인)");
  console.log("\n📝 사용된 정보:");
  console.log(`   상호: ${company.name}`);
  console.log(`   대표: ${company.ceo ?? "—"}`);
  console.log(`   사업자번호: ${company.businessNumber ?? "—"}`);
  console.log(`   주소: ${company.address ?? "—"}`);
  console.log(`   연락: ${[company.phone, company.email].filter(Boolean).join(" · ") || "—"}`);
  if (primaryBank) {
    console.log(`   통장: ${primaryBank.bankName} ${primaryBank.account} (${primaryBank.holder})`);
  }
}

run()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
