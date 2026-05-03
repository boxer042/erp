/**
 * 회사 정보(CompanyInfo) + 통장(CompanyBankAccount) 를 읽어서
 * 공통 footer 블록 (LandingSettings.footerBlocks) 을 자동 생성합니다.
 *
 * 사용법:
 *   npx tsx scripts/seed-footer-from-company.ts          # JSON 만 출력 (확인용)
 *   npx tsx scripts/seed-footer-from-company.ts --apply  # DB 의 LandingSettings 에 바로 적용
 *
 * 디자인: ms182-product-detail2.html 의 info-sections 영역을 참고한 한국 쇼핑몰 표준 footer.
 * 단일 info-grid 블록 안에 4섹션 (배송/교환·반품/A/S/사업자정보).
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
    include: {
      bankAccounts: { orderBy: [{ isPrimary: "desc" }, { sortOrder: "asc" }] },
    },
  });
  if (!company) {
    console.error("❌ CompanyInfo 가 없습니다. /settings 에서 먼저 사업자 정보를 입력하세요.");
    process.exit(1);
  }

  const primaryBank = company.bankAccounts.find((b) => b.isPrimary) ?? company.bankAccounts[0];

  // 사업자 정보 섹션 (4번째 섹션) 의 키-값 행 동적 구성
  const businessRows: Array<{ key: string; value: string }> = [
    { key: "상호", value: company.name },
  ];
  if (company.ceo) businessRows.push({ key: "대표자", value: company.ceo });
  if (company.businessNumber)
    businessRows.push({ key: "사업자등록번호", value: company.businessNumber });
  if (company.businessType || company.businessItem) {
    businessRows.push({
      key: "업태 / 종목",
      value: [company.businessType, company.businessItem].filter(Boolean).join(" / "),
    });
  }
  if (company.address) businessRows.push({ key: "주소", value: company.address });
  if (company.phone) businessRows.push({ key: "대표전화", value: company.phone });
  if (company.email) businessRows.push({ key: "이메일", value: company.email });
  if (primaryBank) {
    businessRows.push({
      key: "입금계좌",
      value: `${primaryBank.bankName} ${primaryBank.account}${primaryBank.holder ? ` (예금주: ${primaryBank.holder})` : ""}`,
    });
  }

  const asContact = [company.phone, company.email].filter(Boolean).join(" / ");

  const footer = [
    {
      id: "fo-info-grid",
      type: "info-grid",
      background: "muted",
      paddingY: "xl",
      sections: [
        {
          number: "— 01",
          title: "배송 안내",
          icon: "Truck",
          rows: [
            { key: "배송 방법", value: "택배 (전국 직배송)" },
            { key: "배송 지역", value: "전국 (제주·도서산간 추가 배송비 발생)" },
            { key: "배송 비용", value: "3,000원 / 100,000원 이상 구매 시 무료배송" },
            {
              key: "배송 기간",
              value: "결제 완료 후 영업일 기준 2~5일 이내 (주말·공휴일 제외)",
            },
            {
              key: "배송 안내",
              value: "대형 화물(엔진톱·예초기 등)은 별도 배송업체로 발송되며, 배송 전 사전 연락드립니다.",
            },
          ],
          bullets: [],
          notice: {
            variant: "warning",
            label: "주의",
            body: "재고 상황에 따라 배송이 지연될 수 있으며, 천재지변 및 도서산간 지역의 경우 추가 배송 기간이 소요될 수 있습니다.",
          },
        },
        {
          number: "— 02",
          title: "교환 / 반품 안내",
          icon: "RefreshCcw",
          rows: [
            { key: "신청 기간", value: "상품 수령일로부터 **7일 이내**" },
            {
              key: "반송 주소",
              value: company.address ?? "",
            },
            {
              key: "반품 비용",
              value: "단순 변심: 왕복 배송비 6,000원 고객 부담\n상품 하자 / 오배송: 판매자 부담",
            },
            {
              key: "처리 절차",
              value: "1:1 문의 접수 → 반품 상품 발송 → 입고 확인 → 환불 처리 (영업일 기준 3~5일)",
            },
          ],
          bullets: [
            "다음의 경우에는 교환·반품이 불가합니다.",
            "고객의 사용 또는 일부 소비로 상품의 가치가 현저히 감소한 경우",
            "상품 포장을 개봉하여 재판매가 곤란한 경우",
            "시간의 경과에 의해 재판매가 곤란할 정도로 가치가 감소한 경우",
            "제품 하자가 아닌 단순 변심으로 반품 시 본체에 연료를 주입한 경우 (농기계 한정)",
          ],
          notice: null,
        },
        {
          number: "— 03",
          title: "A/S 안내",
          icon: "Wrench",
          rows: [
            { key: "품질 보증", value: "구매일로부터 **1년** (가정용 기준) / 영업용 6개월" },
            { key: "A/S 접수", value: "본사 또는 정식 대리점" },
            ...(asContact
              ? [{ key: "대표 연락처", value: asContact }]
              : []),
            {
              key: "유상 수리",
              value: "보증 기간 이후 / 사용자 부주의로 인한 고장 / 천재지변에 의한 고장",
            },
          ],
          bullets: [],
          notice: {
            variant: "info",
            label: "안내",
            body: "정품이 아닌 부속품 또는 윤활유 사용으로 인한 고장은 무상 보증에서 제외됩니다. 정품 부속·체인 오일 사용을 권장합니다.",
          },
        },
        {
          number: "— 04",
          title: "사업자 정보 (상품정보 고시)",
          icon: "Building2",
          rows: businessRows,
          bullets: [],
          notice: null,
        },
      ],
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
  console.log(`   연락: ${asContact || "—"}`);
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
