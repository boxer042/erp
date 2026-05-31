/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * 전체 데이터 초기화 + 풍부한 시나리오 시드 + 자동 검증.
 * 실행: npx tsx prisma/seed.ts (또는 npm run db:seed)
 *
 * 산출물:
 *  - DB 전체 truncate (.env.local 만)
 *  - 마스터/거래처/고객/상품/매핑/입고/재고/시나리오 데이터 생성
 *  - docs/SEED_TEST_GUIDE.md 자동 생성 — 생성된 모든 엔티티 + UI 테스트 가이드
 *
 * 1회성 스크립트이므로 헬퍼 분리 없이 단일 파일.
 */
import { PrismaClient, Prisma } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import dotenv from "dotenv";
import { writeFileSync, mkdirSync } from "fs";
import path from "path";
import { randomBytes } from "crypto";

dotenv.config({ path: ".env.local" });

const url = process.env.DATABASE_URL!;
if (!url) {
  console.error("DATABASE_URL 이 비어있음. .env.local 확인");
  process.exit(1);
}
// 안전장치: prod 호스트면 즉시 abort
if (url.includes("eflvrygympn") || url.includes("ap-northeast-2")) {
  console.error("⛔ prod DB 호스트 감지 — 시드 중단");
  console.error(`   URL: ${url.replace(/:[^:@]+@/, ":***@")}`);
  process.exit(1);
}

const adapter = new PrismaPg({ connectionString: url });
const prisma = new PrismaClient({
  adapter,
  transactionOptions: { maxWait: 10_000, timeout: 120_000 },
});

// ============================================================
// 유틸
// ============================================================

const log = (msg: string) => console.log(msg);
const day = (offset: number) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  d.setHours(10, 0, 0, 0);
  return d;
};
const D = (n: number | string) => new Prisma.Decimal(n);
const round = (n: number) => Math.round(n);

// 시리얼 발번 가능 상품 판정
// - PARTS/SET 은 발번 안 함 (조립 결과물 ASSEMBLED 는 발번)
// - 소모품·사무용품 카테고리는 제외
// - 그 외: 판매가 ≥ 300,000원 OR 보증 ≥ 12개월
function isTrackable(p: {
  sellingPrice: number;
  warrantyMonths?: number;
  productType?: "FINISHED" | "PARTS" | "SET" | "ASSEMBLED";
  cat?: string;
}): boolean {
  if (p.productType === "PARTS" || p.productType === "SET") return false;
  if (["소모품", "사무용품", "필기·문구"].includes(p.cat ?? "")) return false;
  return p.sellingPrice >= 300_000 || (p.warrantyMonths ?? 0) >= 12;
}

const docCounter: Record<string, number> = {};
function genDocNo(prefix: string, date: Date): string {
  const yy = String(date.getFullYear() % 100).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const k = `${prefix}${yy}${mm}${dd}`;
  docCounter[k] = (docCounter[k] || 0) + 1;
  return `${k}-${String(docCounter[k]).padStart(4, "0")}`;
}

// 시드 결과 메모리
type GuideRow = Record<string, string>;
const guide: {
  customers: GuideRow[];
  suppliers: GuideRow[];
  products: GuideRow[];
  incomings: GuideRow[];
  purchaseOrders: GuideRow[];
  quotations: GuideRow[];
  statements: GuideRow[];
  orders: GuideRow[];
  repairs: GuideRow[];
  rentals: GuideRow[];
  serials: GuideRow[];
} = {
  customers: [],
  suppliers: [],
  products: [],
  incomings: [],
  purchaseOrders: [],
  quotations: [],
  statements: [],
  orders: [],
  repairs: [],
  rentals: [],
  serials: [],
};

const M: any = {}; // masters/created entity caches

// 고객 잔액 ledger 변경 후 재계산
async function rebalCust(tx: Prisma.TransactionClient, customerId: string) {
  const ls = await tx.customerLedger.findMany({
    where: { customerId },
    orderBy: [{ date: "asc" }, { createdAt: "asc" }],
    select: { id: true, debitAmount: true, creditAmount: true },
  });
  let balance = 0;
  for (const l of ls) {
    balance += Number(l.debitAmount) - Number(l.creditAmount);
    await tx.customerLedger.update({ where: { id: l.id }, data: { balance } });
  }
}
async function rebalSup(tx: Prisma.TransactionClient, supplierId: string) {
  const ls = await tx.supplierLedger.findMany({
    where: { supplierId },
    orderBy: [{ date: "asc" }, { createdAt: "asc" }],
    select: { id: true, debitAmount: true, creditAmount: true },
  });
  let balance = 0;
  for (const l of ls) {
    balance += Number(l.debitAmount) - Number(l.creditAmount);
    await tx.supplierLedger.update({ where: { id: l.id }, data: { balance } });
  }
}

// ============================================================
// STEP 1 — TRUNCATE
// ============================================================

async function truncateAll() {
  log("\n[1/9] DB 전체 truncate...");
  const tables = [
    "lot_consumptions",
    "inventory_lots",
    "inventory_movements",
    "inventories",
    "assembly_component_consumptions",
    "assemblies",
    "assembly_preset_items",
    "assembly_presets",
    "assembly_template_slots",
    "assembly_templates",
    "assembly_slot_labels",
    "set_components",
    "channel_pricings",
    "incoming_costs",
    "selling_costs",
    "supplier_product_price_history",
    "product_mappings",
    "supplier_return_items",
    "supplier_returns",
    "incoming_items",
    "incomings",
    "purchase_order_access_tokens",
    "purchase_order_items",
    "purchase_orders",
    "quotation_items",
    "quotations",
    "statement_items",
    "statements",
    "card_company_fees",
    "card_merchant_info",
    "card_fee_rates",
    "channel_fees",
    "channel_category_mappings",
    "product_spec_values",
    "product_spec_slots",
    "product_media",
    "expenses",
    "repair_package_parts",
    "repair_package_labors",
    "repair_packages",
    "repair_labor_presets",
    "repair_labors",
    "repair_parts",
    "repair_tickets",
    "rentals",
    "rental_assets",
    "serial_items",
    "customer_machines",
    "customer_notes",
    "customer_payments",
    "customer_ledgers",
    "supplier_payments",
    "supplier_ledgers",
    "supplier_contacts",
    "order_items",
    "orders",
    "pos_sessions",
    "products",
    "supplier_products",
    "suppliers",
    "customers",
    "brands",
    "product_categories",
    "sales_channels",
    "audit_logs",
    "company_bank_accounts",
    "company_info",
    "landing_settings",
    "users",
  ];
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE ${tables.map((t) => `"${t}"`).join(", ")} RESTART IDENTITY CASCADE`,
  );
  log(`   ✓ ${tables.length}개 테이블 비움`);
}

// ============================================================
// STEP 2 — User + 마스터
// ============================================================

async function seedUserAndMasters() {
  log("\n[2/9] User + 마스터...");

  // Supabase auth.users 첫 번째 행 매칭
  let supabaseId: string | null = null;
  let email = "admin@seed.local";
  try {
    const rows = await prisma.$queryRawUnsafe<{ id: string; email: string | null }[]>(
      `SELECT id::text AS id, email FROM auth.users ORDER BY created_at ASC LIMIT 1`,
    );
    if (rows.length > 0) {
      supabaseId = rows[0].id;
      email = rows[0].email ?? "admin@seed.local";
    }
  } catch {
    log("   ⚠ auth.users 조회 실패 — placeholder admin 으로 진행");
  }
  if (!supabaseId) {
    supabaseId = `seed-placeholder-${Date.now()}`;
    log("   ⚠ auth.users 비어있음 — 본인 계정으로 로그인하면 자동 부트스트랩됨");
  }
  M.admin = await prisma.user.create({
    data: { supabaseId, email, name: email.split("@")[0] || "관리자", role: "ADMIN" },
  });
  log(`   ✓ User: ${M.admin.email} (ADMIN)`);

  await prisma.companyInfo.create({
    data: {
      id: "singleton",
      name: "재우공구",
      businessNumber: "123-45-67890",
      ceo: "재우",
      phone: "02-1234-5678",
      email: "info@jaewoogonggu.com",
      address: "서울특별시 마포구 양화로 123, 4층",
      businessType: "도소매",
      businessItem: "공구·전자기기",
    },
  });
  await prisma.companyBankAccount.createMany({
    data: [
      {
        bankName: "국민은행",
        holder: "재우공구(주)",
        account: "123-45-678901",
        isPrimary: true,
        sortOrder: 0,
      },
      { bankName: "신한은행", holder: "재우공구(주)", account: "987-65-432109", sortOrder: 1 },
    ],
  });

  M.channels = {} as Record<string, any>;
  for (const c of [
    { name: "쿠팡", code: "COUPANG", commissionRate: D("0.108") },
    { name: "네이버", code: "NAVER", commissionRate: D("0.055") },
    { name: "자사몰", code: "OWN", commissionRate: D("0") },
    { name: "오프라인", code: "OFFLINE", commissionRate: D("0") },
  ]) {
    const ch = await prisma.salesChannel.create({ data: c });
    M.channels[c.code] = ch;
  }

  await prisma.cardFeeRate.create({
    data: { rate: D("0.022"), memo: "기본 카드수수료 2.2%", appliedFrom: day(-365) },
  });
  await prisma.cardCompanyFee.createMany({
    data: [
      { companyName: "삼성카드", creditRate: D("0.0205") },
      { companyName: "신한카드", creditRate: D("0.0210") },
      { companyName: "현대카드", creditRate: D("0.0215") },
      { companyName: "KB국민카드", creditRate: D("0.0208") },
    ],
  });

  // 카테고리 (트리)
  const root: Record<string, any> = {};
  for (const [name, order] of [
    ["공구", 1],
    ["전자기기", 2],
    ["사무용품", 3],
    ["소모품", 4],
  ] as const) {
    root[name] = await prisma.productCategory.create({ data: { name, order } });
  }
  const subs: Record<string, any> = {};
  for (const [name, parent, order] of [
    ["전동공구", "공구", 1],
    ["수공구", "공구", 2],
    ["측정공구", "공구", 3],
    ["노트북·PC", "전자기기", 1],
    ["주변기기", "전자기기", 2],
    ["스마트홈", "전자기기", 3],
    ["프린터·사무기", "사무용품", 1],
    ["필기·문구", "사무용품", 2],
  ] as const) {
    subs[name] = await prisma.productCategory.create({
      data: { name, parent: { connect: { id: root[parent].id } }, order },
    });
  }
  M.cats = { ...root, ...subs };

  M.brands = {} as Record<string, any>;
  for (const name of ["보쉬", "마끼다", "디월트", "삼성", "LG", "애플", "스탠리", "3M"]) {
    const b = await prisma.brand.create({ data: { name } });
    M.brands[name] = b;
  }

  await prisma.repairLaborPreset.createMany({
    data: [
      { name: "기본 점검", unitRate: D(30000) },
      { name: "분해 점검", unitRate: D(50000) },
      { name: "조립 작업", unitRate: D(40000) },
      { name: "회로 보드 교체", unitRate: D(80000) },
      { name: "기본 청소", unitRate: D(20000) },
    ],
  });

  log(`   ✓ 채널 4 / 카테고리 ${Object.keys(M.cats).length} / 브랜드 ${Object.keys(M.brands).length} / 카드사·공임 프리셋`);
}

// ============================================================
// STEP 3 — Customer
// ============================================================

async function seedCustomers() {
  log("\n[3/9] Customer 25명 (개인 18 + 기업 7)...");

  const individuals = [
    { name: "김민준", phone: "010-1111-0001", email: "minjun@example.com", address: "서울 강남구 테헤란로 100" },
    { name: "이서연", phone: "010-1111-0002", email: "seoyeon@example.com", address: "서울 송파구 잠실로 50" },
    { name: "박지호", phone: "010-1111-0003", email: "jiho@example.com", address: "서울 마포구 합정동 200" },
    { name: "최예진", phone: "010-1111-0004", address: "서울 종로구 인사동 33" },
    { name: "정도현", phone: "010-1111-0005", email: "dohyun@example.com" },
    { name: "강수아", phone: "010-1111-0006", address: "경기 성남시 분당구 정자동 11" },
    { name: "조하늘", phone: "010-1111-0007" },
    { name: "윤재민", phone: "010-1111-0008", email: "jaemin@example.com" },
    { name: "임채원", phone: "010-1111-0009", address: "인천 연수구 송도동 88" },
    { name: "한수빈", phone: "010-1111-0010" },
    { name: "오민서", phone: "010-1111-0011", address: "부산 해운대구 우동 45" },
    { name: "신유나", phone: "010-1111-0012", email: "yuna@example.com" },
    { name: "황지안", phone: "010-1111-0013" },
    { name: "안준호", phone: "010-1111-0014", address: "대구 수성구 범어동 21" },
    { name: "송하준", phone: "010-1111-0015" },
    { name: "유서윤", phone: "010-1111-0016", email: "seoyoon@example.com" },
    { name: "장태경", phone: "010-1111-0017" },
    { name: "권다은", phone: "010-1111-0018", address: "광주 북구 운암동 17" },
  ];
  const businesses = [
    {
      name: "(주)테크월드",
      phone: "02-3000-1001",
      businessNumber: "111-22-33333",
      ceo: "김대표",
      businessType: "정보통신",
      businessItem: "전자제품도매",
      address: "서울 영등포구 여의도동 100",
      contactName: "박과장",
      contactPhone: "010-9000-1001",
      contactPosition: "구매팀장",
      email: "buy@techworld.kr",
    },
    {
      name: "동방건설(주)",
      phone: "031-700-2002",
      businessNumber: "222-33-44444",
      ceo: "이건설",
      businessType: "건설업",
      businessItem: "종합건설",
      address: "경기 안양시 동안구 평촌대로 200",
      contactName: "최대리",
      contactPhone: "010-9000-2002",
      contactPosition: "현장지원팀",
    },
    {
      name: "스마트팩토리(주)",
      phone: "032-500-3003",
      businessNumber: "333-44-55555",
      ceo: "정공장",
      businessType: "제조업",
      businessItem: "기계부품",
      address: "인천 남동구 논현동 555",
      contactName: "강대리",
      contactPhone: "010-9000-3003",
    },
    {
      name: "한빛정비",
      phone: "02-2200-4004",
      businessNumber: "444-55-66666",
      ceo: "정비사",
      businessType: "서비스업",
      businessItem: "기계정비",
      address: "서울 구로구 디지털로 100",
    },
    {
      name: "(주)디자인스튜디오",
      phone: "02-6000-5005",
      businessNumber: "555-66-77777",
      ceo: "조디자인",
      businessType: "전문서비스",
      businessItem: "디자인",
      address: "서울 강남구 청담동 50",
      contactName: "윤실장",
      contactPhone: "010-9000-5005",
    },
    {
      name: "오피스마트",
      phone: "02-7000-6006",
      businessNumber: "666-77-88888",
      ceo: "오대표",
      businessType: "도소매",
      businessItem: "사무용품",
      address: "서울 종로구 종로 88",
    },
    {
      name: "메이커스랩",
      phone: "031-900-7007",
      businessNumber: "777-88-99999",
      ceo: "임메이커",
      businessType: "제조업",
      businessItem: "교육용품",
      address: "경기 수원시 영통구 광교 50",
      contactName: "남팀장",
      contactPhone: "010-9000-7007",
    },
  ];

  M.customers = {} as Record<string, any>;
  for (const c of individuals) {
    const created = await prisma.customer.create({ data: { ...c, type: "INDIVIDUAL" } });
    M.customers[c.name] = created;
    guide.customers.push({
      구분: "개인",
      이름: c.name,
      전화: c.phone,
      이메일: c.email ?? "-",
      주소: c.address ?? "-",
    });
  }
  for (const c of businesses) {
    const created = await prisma.customer.create({ data: { ...c, type: "BUSINESS" } });
    M.customers[c.name] = created;
    guide.customers.push({
      구분: "기업",
      이름: c.name,
      전화: c.phone,
      사업자번호: c.businessNumber,
      대표: c.ceo,
      담당자: c.contactName ?? "-",
    });
  }
  log(`   ✓ 고객 ${individuals.length + businesses.length}명`);
}

// ============================================================
// STEP 4 — Supplier + SupplierProduct
// ============================================================

async function seedSuppliers() {
  log("\n[4/9] Supplier 8개 + SupplierProduct 60개...");

  const suppliers = [
    { name: "보쉬코리아", paymentMethod: "CREDIT" as const, paymentTermDays: 30, businessNumber: "100-81-00001", representative: "김보쉬", phone: "02-3700-0001", bankName: "국민은행", bankAccount: "100-100-100100", bankHolder: "보쉬코리아" },
    { name: "마끼다코리아", paymentMethod: "CREDIT" as const, paymentTermDays: 45, businessNumber: "100-81-00002", representative: "이마끼다", phone: "02-3700-0002" },
    { name: "디월트유통", paymentMethod: "CREDIT" as const, paymentTermDays: 30, businessNumber: "100-81-00003", representative: "박디월트", phone: "032-500-0003" },
    { name: "삼성공식대리점", paymentMethod: "CREDIT" as const, paymentTermDays: 60, businessNumber: "100-81-00004", representative: "정삼성", phone: "02-2000-0004" },
    { name: "LG파트너스", paymentMethod: "CREDIT" as const, paymentTermDays: 30, businessNumber: "100-81-00005", representative: "최엘지", phone: "02-2000-0005" },
    { name: "글로벌툴(미국)", paymentMethod: "PREPAID" as const, paymentTermDays: 0, representative: "John Smith", phone: "+1-555-0001", memo: "USD 결제 거래처" },
    { name: "JapanTech상사", paymentMethod: "PREPAID" as const, paymentTermDays: 0, representative: "Tanaka", phone: "+81-3-0001-0001", memo: "JPY 결제 거래처" },
    { name: "동방소모품", paymentMethod: "PREPAID" as const, paymentTermDays: 0, businessNumber: "100-81-00008", representative: "강동방", phone: "031-300-0008", memo: "선결제, 빠른 배송" },
  ];

  M.suppliers = {} as Record<string, any>;
  for (const s of suppliers) {
    const created = await prisma.supplier.create({ data: s });
    M.suppliers[s.name] = created;
    guide.suppliers.push({
      이름: s.name,
      결제방식: s.paymentMethod,
      "결제기한": String(s.paymentTermDays) + "일",
      대표자: s.representative ?? "-",
      메모: s.memo ?? "-",
    });

    if (s.paymentMethod === "CREDIT") {
      await prisma.supplierContact.create({
        data: { supplier: { connect: { id: created.id } }, name: "영업담당", phone: s.phone, position: "팀장" },
      });
      await prisma.supplierContact.create({
        data: { supplier: { connect: { id: created.id } }, name: "정산담당", position: "차장" },
      });
    }
  }

  // SupplierProduct — 거래처별로 분배. 60개.
  const sps: { supplierName: string; products: { name: string; spec?: string; supplierCode: string; unitPrice: number; listPrice?: number; unitOfMeasure?: string; isTaxable?: boolean; currency?: string }[] }[] = [
    {
      supplierName: "보쉬코리아",
      products: [
        { name: "보쉬 충전 드릴 GSR12V", spec: "12V/2.0Ah 2배터리", supplierCode: "BSH-DRL-12V", unitPrice: 95000, listPrice: 110000 },
        { name: "보쉬 임팩트 드라이버 GDR18V", spec: "18V/4.0Ah", supplierCode: "BSH-IMP-18V", unitPrice: 185000, listPrice: 210000 },
        { name: "보쉬 그라인더 GWS750", spec: "100mm 750W", supplierCode: "BSH-GRD-750", unitPrice: 65000 },
        { name: "보쉬 직쏘 PST650", spec: "500W", supplierCode: "BSH-JIG-650", unitPrice: 95000 },
        { name: "보쉬 레이저 거리측정기 GLM50", spec: "50m", supplierCode: "BSH-LZR-50", unitPrice: 145000 },
        { name: "보쉬 비트세트 32P", spec: "32 piece", supplierCode: "BSH-BIT-32P", unitPrice: 18000 },
        { name: "보쉬 드릴비트 10mm", spec: "콘크리트용", supplierCode: "BSH-DRB-10", unitPrice: 4500 },
        { name: "보쉬 충전 배터리 18V/4Ah", supplierCode: "BSH-BAT-18V4", unitPrice: 95000 },
      ],
    },
    {
      supplierName: "마끼다코리아",
      products: [
        { name: "마끼다 임팩트 렌치 TW001G", spec: "40Vmax XGT", supplierCode: "MKT-TW-001", unitPrice: 380000, listPrice: 450000 },
        { name: "마끼다 충전드릴 DF333D", spec: "12V CXT", supplierCode: "MKT-DF-333", unitPrice: 145000 },
        { name: "마끼다 원형톱 5604R", spec: "165mm", supplierCode: "MKT-CRC-5604", unitPrice: 165000 },
        { name: "마끼다 진공청소기 DCL180", spec: "18V", supplierCode: "MKT-VAC-180", unitPrice: 185000 },
        { name: "마끼다 배터리 BL1860B", spec: "18V/6Ah", supplierCode: "MKT-BAT-1860", unitPrice: 125000 },
        { name: "마끼다 충전기 DC18RC", supplierCode: "MKT-CHG-18RC", unitPrice: 75000 },
      ],
    },
    {
      supplierName: "디월트유통",
      products: [
        { name: "디월트 콤보세트 DCK283", spec: "20V Max 2종", supplierCode: "DEW-COMBO-283", unitPrice: 425000, listPrice: 500000 },
        { name: "디월트 임팩트 드라이버 DCF887", spec: "20V XR", supplierCode: "DEW-IMP-887", unitPrice: 235000 },
        { name: "디월트 그라인더 DCG405", spec: "125mm 20V", supplierCode: "DEW-GRD-405", unitPrice: 185000 },
        { name: "디월트 토크렌치 5세트", spec: "1/4\" 1/2\"", supplierCode: "DEW-TRQ-SET5", unitPrice: 285000 },
        { name: "디월트 디지털 토크 측정기", supplierCode: "DEW-DTQ-DIG", unitPrice: 425000 },
        { name: "디월트 6각 비트세트 100P", supplierCode: "DEW-HEX-100P", unitPrice: 55000 },
      ],
    },
    {
      supplierName: "삼성공식대리점",
      products: [
        { name: "삼성 노트북 갤럭시북 Pro16", spec: "i7/16GB/512GB", supplierCode: "SS-NB-PRO16", unitPrice: 1450000, listPrice: 1850000 },
        { name: "삼성 모니터 27\" 4K", spec: "S27A800", supplierCode: "SS-MON-27-4K", unitPrice: 385000 },
        { name: "삼성 SSD 1TB 980Pro", supplierCode: "SS-SSD-1TB-980P", unitPrice: 95000 },
        { name: "삼성 외장하드 4TB T7", supplierCode: "SS-EXT-4TB-T7", unitPrice: 145000 },
        { name: "삼성 USB-C 허브 7in1", supplierCode: "SS-HUB-7", unitPrice: 38000 },
        { name: "삼성 무선 키보드 Trio500", supplierCode: "SS-KB-TRIO500", unitPrice: 55000 },
        { name: "삼성 무선 마우스", supplierCode: "SS-MS-WL", unitPrice: 18000 },
      ],
    },
    {
      supplierName: "LG파트너스",
      products: [
        { name: "LG 그램 17 노트북", spec: "i7/16GB/1TB", supplierCode: "LG-GRAM-17", unitPrice: 1850000, listPrice: 2350000 },
        { name: "LG 울트라기어 32\" 게이밍", supplierCode: "LG-MON-32-UG", unitPrice: 485000 },
        { name: "LG 톤프리 무선이어폰", supplierCode: "LG-TONE-FP", unitPrice: 125000 },
        { name: "LG 휴대용 빔프로젝터 PF50KS", supplierCode: "LG-BEAM-PF50", unitPrice: 685000 },
        { name: "LG 멀티탭 6구", supplierCode: "LG-PWR-6", unitPrice: 12000 },
      ],
    },
    {
      supplierName: "글로벌툴(미국)",
      products: [
        { name: "Klein 정밀 드라이버 11종", spec: "Tools 32500", supplierCode: "KLN-DRV-32500", unitPrice: 38, currency: "USD" },
        { name: "Fluke 멀티미터 87V", supplierCode: "FLK-MM-87V", unitPrice: 425, currency: "USD" },
        { name: "Wera 비트세트 8755", supplierCode: "WRA-BIT-8755", unitPrice: 65, currency: "USD" },
        { name: "Knipex 콤비플라이어 8\"", supplierCode: "KNX-CB-8", unitPrice: 48, currency: "USD" },
        { name: "Channellock 워터펌프 12\"", supplierCode: "CHN-WP-12", unitPrice: 32, currency: "USD" },
      ],
    },
    {
      supplierName: "JapanTech상사",
      products: [
        { name: "TONE 토크렌치 T4MN", spec: "1/2\" 100Nm", supplierCode: "TON-TRQ-T4MN", unitPrice: 18500, currency: "JPY" },
        { name: "KTC 표준공구세트 9.5", supplierCode: "KTC-STD-95", unitPrice: 42000, currency: "JPY" },
        { name: "MITUTOYO 디지털 캘리퍼 150mm", supplierCode: "MTY-CAL-150D", unitPrice: 12500, currency: "JPY" },
        { name: "SHINWA 곡척 직각자", supplierCode: "SNW-SQR-30", unitPrice: 1800, currency: "JPY" },
      ],
    },
    {
      supplierName: "동방소모품",
      products: [
        { name: "공업용 장갑 (12켤레)", spec: "L 사이즈 묶음", supplierCode: "DB-GLV-L12", unitPrice: 18000 },
        { name: "안전모 헬멧 화이트", supplierCode: "DB-HMT-W", unitPrice: 12000 },
        { name: "안전화 270mm", supplierCode: "DB-SHO-270", unitPrice: 65000 },
        { name: "용접면 자동차광", supplierCode: "DB-WLD-AUTO", unitPrice: 145000 },
        { name: "WD-40 윤활제 360ml", supplierCode: "DB-WD40-360", unitPrice: 8500 },
        { name: "전기테이프 검정", supplierCode: "DB-TPE-BLK", unitPrice: 1500 },
        { name: "케이블타이 200mm 100P", supplierCode: "DB-CTY-200", unitPrice: 3500 },
        { name: "절연테이프 노랑", supplierCode: "DB-TPE-YLW", unitPrice: 1500 },
        { name: "면장갑 (10켤레)", supplierCode: "DB-CGL-10", unitPrice: 6000 },
        { name: "방진마스크 (5개입)", supplierCode: "DB-MSK-5", unitPrice: 7500 },
      ],
    },
  ];

  M.sps = {} as Record<string, any>;
  let count = 0;
  for (const group of sps) {
    const supplier = M.suppliers[group.supplierName];
    for (const p of group.products) {
      const sp = await prisma.supplierProduct.create({
        data: {
          supplier: { connect: { id: supplier.id } },
          name: p.name,
          spec: p.spec,
          supplierCode: p.supplierCode,
          unitOfMeasure: p.unitOfMeasure ?? "EA",
          listPrice: D(p.listPrice ?? p.unitPrice),
          unitPrice: D(p.unitPrice),
          isTaxable: p.isTaxable ?? true,
          currency: p.currency ?? "KRW",
          source: "MANUAL",
        },
      });
      M.sps[p.supplierCode] = sp;
      count++;
    }
  }
  log(`   ✓ 거래처 ${suppliers.length} / 공급상품 ${count}개`);
}

// ============================================================
// STEP 5 — Product + ProductMapping + SetComponent
// ============================================================

async function seedProductsAndMappings() {
  log("\n[5/9] Product + Mapping + Set...");

  // 단품 (60+개)
  const products: {
    name: string;
    sku: string;
    spec?: string;
    brand?: string;
    cat?: string;
    listPrice: number;
    sellingPrice: number;
    productType?: "FINISHED" | "PARTS" | "SET" | "ASSEMBLED";
    taxType?: "TAXABLE" | "TAX_FREE";
    warrantyMonths?: number;
    trackable?: boolean;
    mapping?: { supplierCode: string; conv?: number }; // 1:1 매핑
  }[] = [
    // 보쉬
    { name: "보쉬 충전 드릴 GSR12V", sku: "PRD-DRL-12V", spec: "12V/2.0Ah 2배터리", brand: "보쉬", cat: "전동공구", listPrice: 145000, sellingPrice: 135000, warrantyMonths: 12, trackable: true, mapping: { supplierCode: "BSH-DRL-12V" } },
    { name: "보쉬 임팩트 드라이버 GDR18V", sku: "PRD-IMP-18V", spec: "18V/4.0Ah", brand: "보쉬", cat: "전동공구", listPrice: 265000, sellingPrice: 245000, warrantyMonths: 12, trackable: true, mapping: { supplierCode: "BSH-IMP-18V" } },
    { name: "보쉬 그라인더 GWS750", sku: "PRD-GRD-750", brand: "보쉬", cat: "전동공구", listPrice: 95000, sellingPrice: 85000, mapping: { supplierCode: "BSH-GRD-750" } },
    { name: "보쉬 직쏘 PST650", sku: "PRD-JIG-650", brand: "보쉬", cat: "전동공구", listPrice: 135000, sellingPrice: 125000, mapping: { supplierCode: "BSH-JIG-650" } },
    { name: "보쉬 레이저 거리측정기 GLM50", sku: "PRD-LZR-50", brand: "보쉬", cat: "측정공구", listPrice: 195000, sellingPrice: 178000, warrantyMonths: 24, mapping: { supplierCode: "BSH-LZR-50" } },
    { name: "보쉬 비트세트 32P", sku: "PRD-BIT-32P", brand: "보쉬", cat: "수공구", listPrice: 28000, sellingPrice: 24000, mapping: { supplierCode: "BSH-BIT-32P" } },
    { name: "보쉬 드릴비트 10mm", sku: "PRD-DRB-10", brand: "보쉬", cat: "수공구", listPrice: 7000, sellingPrice: 6000, mapping: { supplierCode: "BSH-DRB-10" } },
    { name: "보쉬 충전 배터리 18V/4Ah", sku: "PRD-BAT-18V4", brand: "보쉬", cat: "전동공구", listPrice: 145000, sellingPrice: 128000, mapping: { supplierCode: "BSH-BAT-18V4" } },
    // 마끼다
    { name: "마끼다 임팩트 렌치 TW001G", sku: "PRD-TW-001", brand: "마끼다", cat: "전동공구", listPrice: 580000, sellingPrice: 520000, warrantyMonths: 24, trackable: true, mapping: { supplierCode: "MKT-TW-001" } },
    { name: "마끼다 충전드릴 DF333D", sku: "PRD-DF-333", brand: "마끼다", cat: "전동공구", listPrice: 215000, sellingPrice: 195000, mapping: { supplierCode: "MKT-DF-333" } },
    { name: "마끼다 원형톱 5604R", sku: "PRD-CRC-5604", brand: "마끼다", cat: "전동공구", listPrice: 235000, sellingPrice: 215000, mapping: { supplierCode: "MKT-CRC-5604" } },
    { name: "마끼다 진공청소기 DCL180", sku: "PRD-VAC-180", brand: "마끼다", cat: "전동공구", listPrice: 245000, sellingPrice: 225000, mapping: { supplierCode: "MKT-VAC-180" } },
    { name: "마끼다 배터리 BL1860B", sku: "PRD-BAT-1860", brand: "마끼다", cat: "전동공구", listPrice: 175000, sellingPrice: 158000, mapping: { supplierCode: "MKT-BAT-1860" } },
    { name: "마끼다 충전기 DC18RC", sku: "PRD-CHG-18RC", brand: "마끼다", cat: "전동공구", listPrice: 105000, sellingPrice: 95000, mapping: { supplierCode: "MKT-CHG-18RC" } },
    // 디월트
    { name: "디월트 콤보세트 DCK283", sku: "PRD-COMBO-283", brand: "디월트", cat: "전동공구", listPrice: 650000, sellingPrice: 585000, warrantyMonths: 36, trackable: true, mapping: { supplierCode: "DEW-COMBO-283" } },
    { name: "디월트 임팩트 드라이버 DCF887", sku: "PRD-IMP-887", brand: "디월트", cat: "전동공구", listPrice: 325000, sellingPrice: 295000, mapping: { supplierCode: "DEW-IMP-887" } },
    { name: "디월트 그라인더 DCG405", sku: "PRD-GRD-405", brand: "디월트", cat: "전동공구", listPrice: 265000, sellingPrice: 245000, mapping: { supplierCode: "DEW-GRD-405" } },
    { name: "디월트 토크렌치 5세트", sku: "PRD-TRQ-SET5", brand: "디월트", cat: "수공구", listPrice: 365000, sellingPrice: 335000, mapping: { supplierCode: "DEW-TRQ-SET5" } },
    { name: "디월트 디지털 토크 측정기", sku: "PRD-DTQ-DIG", brand: "디월트", cat: "측정공구", listPrice: 580000, sellingPrice: 525000, warrantyMonths: 24, mapping: { supplierCode: "DEW-DTQ-DIG" } },
    { name: "디월트 6각 비트세트 100P", sku: "PRD-HEX-100P", brand: "디월트", cat: "수공구", listPrice: 75000, sellingPrice: 68000, mapping: { supplierCode: "DEW-HEX-100P" } },
    // 삼성
    { name: "삼성 노트북 갤럭시북 Pro16", sku: "PRD-NB-PRO16", brand: "삼성", cat: "노트북·PC", listPrice: 2100000, sellingPrice: 1890000, warrantyMonths: 24, trackable: true, mapping: { supplierCode: "SS-NB-PRO16" } },
    { name: "삼성 모니터 27\" 4K", sku: "PRD-MON-27-4K", brand: "삼성", cat: "주변기기", listPrice: 485000, sellingPrice: 445000, mapping: { supplierCode: "SS-MON-27-4K" } },
    { name: "삼성 SSD 1TB 980Pro", sku: "PRD-SSD-1TB-980P", brand: "삼성", cat: "주변기기", listPrice: 135000, sellingPrice: 125000, mapping: { supplierCode: "SS-SSD-1TB-980P" } },
    { name: "삼성 외장하드 4TB T7", sku: "PRD-EXT-4TB-T7", brand: "삼성", cat: "주변기기", listPrice: 195000, sellingPrice: 175000, mapping: { supplierCode: "SS-EXT-4TB-T7" } },
    { name: "삼성 USB-C 허브 7in1", sku: "PRD-HUB-7", brand: "삼성", cat: "주변기기", listPrice: 55000, sellingPrice: 48000, mapping: { supplierCode: "SS-HUB-7" } },
    { name: "삼성 무선 키보드 Trio500", sku: "PRD-KB-TRIO500", brand: "삼성", cat: "주변기기", listPrice: 75000, sellingPrice: 68000, mapping: { supplierCode: "SS-KB-TRIO500" } },
    { name: "삼성 무선 마우스", sku: "PRD-MS-WL", brand: "삼성", cat: "주변기기", listPrice: 25000, sellingPrice: 22000, mapping: { supplierCode: "SS-MS-WL" } },
    // LG
    { name: "LG 그램 17 노트북", sku: "PRD-GRAM-17", brand: "LG", cat: "노트북·PC", listPrice: 2650000, sellingPrice: 2380000, warrantyMonths: 24, trackable: true, mapping: { supplierCode: "LG-GRAM-17" } },
    { name: "LG 울트라기어 32\" 게이밍", sku: "PRD-MON-32-UG", brand: "LG", cat: "주변기기", listPrice: 645000, sellingPrice: 595000, mapping: { supplierCode: "LG-MON-32-UG" } },
    { name: "LG 톤프리 무선이어폰", sku: "PRD-TONE-FP", brand: "LG", cat: "주변기기", listPrice: 178000, sellingPrice: 158000, mapping: { supplierCode: "LG-TONE-FP" } },
    { name: "LG 휴대용 빔프로젝터 PF50KS", sku: "PRD-BEAM-PF50", brand: "LG", cat: "스마트홈", listPrice: 895000, sellingPrice: 815000, warrantyMonths: 12, mapping: { supplierCode: "LG-BEAM-PF50" } },
    { name: "LG 멀티탭 6구", sku: "PRD-PWR-6", brand: "LG", cat: "사무용품", listPrice: 18000, sellingPrice: 15000, mapping: { supplierCode: "LG-PWR-6" } },
    // 글로벌툴
    { name: "Klein 정밀 드라이버 11종", sku: "PRD-KLN-DRV-32500", brand: "스탠리", cat: "수공구", listPrice: 75000, sellingPrice: 68000, mapping: { supplierCode: "KLN-DRV-32500" } },
    { name: "Fluke 멀티미터 87V", sku: "PRD-FLK-MM-87V", cat: "측정공구", listPrice: 685000, sellingPrice: 625000, warrantyMonths: 36, mapping: { supplierCode: "FLK-MM-87V" } },
    { name: "Wera 비트세트 8755", sku: "PRD-WRA-BIT-8755", cat: "수공구", listPrice: 105000, sellingPrice: 95000, mapping: { supplierCode: "WRA-BIT-8755" } },
    { name: "Knipex 콤비플라이어 8\"", sku: "PRD-KNX-CB-8", cat: "수공구", listPrice: 78000, sellingPrice: 68000, mapping: { supplierCode: "KNX-CB-8" } },
    { name: "Channellock 워터펌프 12\"", sku: "PRD-CHN-WP-12", cat: "수공구", listPrice: 55000, sellingPrice: 48000, mapping: { supplierCode: "CHN-WP-12" } },
    // JapanTech
    { name: "TONE 토크렌치 T4MN", sku: "PRD-TON-TRQ", spec: "1/2\" 100Nm", cat: "측정공구", listPrice: 245000, sellingPrice: 225000, mapping: { supplierCode: "TON-TRQ-T4MN" } },
    { name: "KTC 표준공구세트 9.5", sku: "PRD-KTC-STD", cat: "수공구", listPrice: 545000, sellingPrice: 495000, mapping: { supplierCode: "KTC-STD-95" } },
    { name: "MITUTOYO 디지털 캘리퍼 150mm", sku: "PRD-MTY-CAL", cat: "측정공구", listPrice: 165000, sellingPrice: 148000, mapping: { supplierCode: "MTY-CAL-150D" } },
    { name: "SHINWA 곡척 직각자", sku: "PRD-SNW-SQR", cat: "측정공구", listPrice: 28000, sellingPrice: 24000, mapping: { supplierCode: "SNW-SQR-30" } },
    // 동방소모품
    { name: "공업용 장갑 (12켤레)", sku: "PRD-GLV-L12", cat: "소모품", listPrice: 25000, sellingPrice: 22000, mapping: { supplierCode: "DB-GLV-L12" } },
    { name: "안전모 헬멧 화이트", sku: "PRD-HMT-W", cat: "소모품", listPrice: 18000, sellingPrice: 15000, mapping: { supplierCode: "DB-HMT-W" } },
    { name: "안전화 270mm", sku: "PRD-SHO-270", cat: "소모품", listPrice: 89000, sellingPrice: 78000, mapping: { supplierCode: "DB-SHO-270" } },
    { name: "용접면 자동차광", sku: "PRD-WLD-AUTO", cat: "소모품", listPrice: 195000, sellingPrice: 175000, mapping: { supplierCode: "DB-WLD-AUTO" } },
    { name: "WD-40 윤활제 360ml", sku: "PRD-WD40-360", cat: "소모품", listPrice: 12000, sellingPrice: 10000, mapping: { supplierCode: "DB-WD40-360" } },
    { name: "전기테이프 검정", sku: "PRD-TPE-BLK", cat: "소모품", listPrice: 2500, sellingPrice: 2000, mapping: { supplierCode: "DB-TPE-BLK" } },
    { name: "케이블타이 200mm 100P", sku: "PRD-CTY-200", cat: "소모품", listPrice: 5000, sellingPrice: 4500, mapping: { supplierCode: "DB-CTY-200" } },
    { name: "절연테이프 노랑", sku: "PRD-TPE-YLW", cat: "소모품", listPrice: 2500, sellingPrice: 2000, mapping: { supplierCode: "DB-TPE-YLW" } },
    { name: "면장갑 (10켤레)", sku: "PRD-CGL-10", cat: "소모품", listPrice: 9000, sellingPrice: 7500, mapping: { supplierCode: "DB-CGL-10" } },
    { name: "방진마스크 (5개입)", sku: "PRD-MSK-5", cat: "소모품", listPrice: 12000, sellingPrice: 10000, mapping: { supplierCode: "DB-MSK-5" } },
    // 면세 품목 1종
    { name: "수입 도서: 공구 매뉴얼", sku: "PRD-BOOK-MNL", cat: "사무용품", listPrice: 28000, sellingPrice: 25000, taxType: "TAX_FREE" },
    // 자체 부속 (수리용 — 매핑 없음, 입고로 적재)
    { name: "수리용 - 드릴 척 어셈블리", sku: "PRD-PARTS-CHK", cat: "전동공구", listPrice: 35000, sellingPrice: 30000, productType: "PARTS" },
    { name: "수리용 - 모터 브러시 (한쌍)", sku: "PRD-PARTS-BRS", cat: "전동공구", listPrice: 12000, sellingPrice: 10000, productType: "PARTS" },
    { name: "수리용 - 회로기판 18V", sku: "PRD-PARTS-PCB", cat: "전동공구", listPrice: 85000, sellingPrice: 78000, productType: "PARTS" },
    { name: "수리용 - 토크 클러치 키트", sku: "PRD-PARTS-CLT", cat: "전동공구", listPrice: 28000, sellingPrice: 25000, productType: "PARTS" },
  ];

  M.products = {} as Record<string, any>;
  for (const p of products) {
    const trackableAuto = p.trackable ?? isTrackable({
      sellingPrice: p.sellingPrice,
      warrantyMonths: p.warrantyMonths,
      productType: p.productType,
      cat: p.cat,
    });
    const created = await prisma.product.create({
      data: {
        name: p.name,
        sku: p.sku,
        spec: p.spec,
        brand: p.brand,
        ...(p.brand && M.brands[p.brand] ? { brandRef: { connect: { id: M.brands[p.brand].id } } } : {}),
        ...(p.cat && M.cats[p.cat] ? { category: { connect: { id: M.cats[p.cat].id } } } : {}),
        listPrice: D(p.listPrice),
        sellingPrice: D(p.sellingPrice),
        productType: p.productType ?? "FINISHED",
        taxType: p.taxType ?? "TAXABLE",
        warrantyMonths: p.warrantyMonths,
        trackable: trackableAuto,
      },
    });
    M.products[p.sku] = created;

    await prisma.inventory.create({
      data: { product: { connect: { id: created.id } }, quantity: D(0), safetyStock: D(p.productType === "PARTS" ? 5 : 1) },
    });

    if (p.mapping) {
      const sp = M.sps[p.mapping.supplierCode];
      if (sp) {
        await prisma.productMapping.create({
          data: {
            supplierProduct: { connect: { id: sp.id } },
            product: { connect: { id: created.id } },
            conversionRate: D(p.mapping.conv ?? 1),
          },
        });
      }
    }
  }

  // 세트 상품 — 콤보 키트 (드릴 + 임팩트)
  const comboSet = await prisma.product.create({
    data: {
      name: "보쉬 콤보 키트 (드릴 + 임팩트)",
      sku: "PRD-SET-BSH-COMBO",
      brandRef: { connect: { id: M.brands["보쉬"].id } },
      category: { connect: { id: M.cats["전동공구"].id } },
      listPrice: D(380000),
      sellingPrice: D(345000),
      productType: "SET",
      isSet: true,
    },
  });
  M.products["PRD-SET-BSH-COMBO"] = comboSet;
  await prisma.inventory.create({ data: { product: { connect: { id: comboSet.id } }, quantity: D(0), safetyStock: D(1) } });
  await prisma.setComponent.create({
    data: { setProduct: { connect: { id: comboSet.id } }, component: { connect: { id: M.products["PRD-DRL-12V"].id } }, quantity: D(1) },
  });
  await prisma.setComponent.create({
    data: { setProduct: { connect: { id: comboSet.id } }, component: { connect: { id: M.products["PRD-IMP-18V"].id } }, quantity: D(1) },
  });

  // 세트 상품 — 사무용품 패키지
  const officeSet = await prisma.product.create({
    data: {
      name: "사무용품 시작 패키지",
      sku: "PRD-SET-OFFICE",
      category: { connect: { id: M.cats["사무용품"].id } },
      listPrice: D(95000),
      sellingPrice: D(85000),
      productType: "SET",
      isSet: true,
    },
  });
  M.products["PRD-SET-OFFICE"] = officeSet;
  await prisma.inventory.create({ data: { product: { connect: { id: officeSet.id } }, quantity: D(0), safetyStock: D(1) } });
  for (const [sku, qty] of [["PRD-PWR-6", 1], ["PRD-HUB-7", 1], ["PRD-CTY-200", 2]] as const) {
    await prisma.setComponent.create({
      data: { setProduct: { connect: { id: officeSet.id } }, component: { connect: { id: M.products[sku].id } }, quantity: D(qty) },
    });
  }

  log(`   ✓ 상품 ${Object.keys(M.products).length}개 (단품 ${products.length} + 세트 2)`);

  // ========== 안전화 사이즈별 — 별개 상품 (variant 아님) ==========
  // ⚠ 안전화 250/290 은 단순 사이즈 차이라 canonical/variant 의미가 아님 (별개 단품).
  // canonical/variant 는 조립상품에서 부속 일부가 다른 변형을 표현하는 용도 (아래 PC 섹션 참조).
  for (const size of [250, 290]) {
    const sp = await prisma.supplierProduct.create({
      data: {
        supplier: { connect: { id: M.suppliers["동방소모품"].id } },
        name: `안전화 ${size}mm`,
        supplierCode: `DB-SHO-${size}`,
        unitPrice: D(65000),
        listPrice: D(65000),
      },
    });
    M.sps[`DB-SHO-${size}`] = sp;
    const variant = await prisma.product.create({
      data: {
        name: `안전화 ${size}mm`,
        sku: `PRD-SHO-${size}`,
        category: { connect: { id: M.cats["소모품"].id } },
        productType: "FINISHED",
        listPrice: D(89000),
        sellingPrice: D(78000),
      },
    });
    M.products[`PRD-SHO-${size}`] = variant;
    await prisma.inventory.create({ data: { product: { connect: { id: variant.id } }, quantity: D(0), safetyStock: D(2) } });
    await prisma.productMapping.create({
      data: { supplierProduct: { connect: { id: sp.id } }, product: { connect: { id: variant.id } }, conversionRate: D(1) },
    });
  }

  // ========== 오일류 (벌크/병) — 4L 병 → 1L 단위 분할 판매 ==========
  // 1) 판매 SKU: 엔진오일 4L 병 (containerSize=4000ml = 4L 분할 가능)
  // 2) 벌크 SKU: 엔진오일 1L (1000ml). bulkProductId=판매SKU 의 vice-versa.
  // 실제 schema: 판매 SKU 는 isBulk=false + bulkProductId=벌크SKU. 벌크 SKU 는 isBulk=true.
  const oilBulkSp = await prisma.supplierProduct.create({
    data: {
      supplier: { connect: { id: M.suppliers["동방소모품"].id } },
      name: "엔진오일 5W30 4L (병)",
      supplierCode: "DB-OIL-4L",
      unitPrice: D(28000),
      listPrice: D(35000),
    },
  });
  M.sps["DB-OIL-4L"] = oilBulkSp;

  // 벌크 SKU (1L 단위)
  const oilBulk = await prisma.product.create({
    data: {
      name: "엔진오일 5W30 (1L 단위 / 벌크)",
      sku: "PRD-OIL-BULK-1L",
      category: { connect: { id: M.cats["소모품"].id } },
      productType: "FINISHED",
      isBulk: true,
      unitOfMeasure: "L",
      listPrice: D(12000),
      sellingPrice: D(11000),
    },
  });
  M.products["PRD-OIL-BULK-1L"] = oilBulk;
  await prisma.inventory.create({ data: { product: { connect: { id: oilBulk.id } }, quantity: D(0), safetyStock: D(0) } });

  // 판매 SKU (4L 병)
  const oilBottle = await prisma.product.create({
    data: {
      name: "엔진오일 5W30 4L 병",
      sku: "PRD-OIL-4L",
      category: { connect: { id: M.cats["소모품"].id } },
      productType: "FINISHED",
      isBulk: false,
      containerSize: D(4),  // 4L
      bulkProduct: { connect: { id: oilBulk.id } },
      unitOfMeasure: "EA",
      listPrice: D(45000),
      sellingPrice: D(42000),
    },
  });
  M.products["PRD-OIL-4L"] = oilBottle;
  await prisma.inventory.create({ data: { product: { connect: { id: oilBottle.id } }, quantity: D(0), safetyStock: D(2) } });
  await prisma.productMapping.create({
    data: { supplierProduct: { connect: { id: oilBulkSp.id } }, product: { connect: { id: oilBottle.id } }, conversionRate: D(1) },
  });

  // ========== 호스 (미터 단위) ==========
  const hoseSp = await prisma.supplierProduct.create({
    data: {
      supplier: { connect: { id: M.suppliers["동방소모품"].id } },
      name: "공압 호스 8mm (1m)",
      supplierCode: "DB-HOSE-8MM",
      unitPrice: D(2500),
      listPrice: D(2500),
      unitOfMeasure: "M",
    },
  });
  M.sps["DB-HOSE-8MM"] = hoseSp;
  const hose = await prisma.product.create({
    data: {
      name: "공압 호스 8mm",
      sku: "PRD-HOSE-8MM",
      spec: "내경 8mm 폴리우레탄",
      category: { connect: { id: M.cats["소모품"].id } },
      productType: "FINISHED",
      unitOfMeasure: "M",
      listPrice: D(4000),
      sellingPrice: D(3500),
    },
  });
  M.products["PRD-HOSE-8MM"] = hose;
  await prisma.inventory.create({ data: { product: { connect: { id: hose.id } }, quantity: D(0), safetyStock: D(10) } });
  await prisma.productMapping.create({
    data: { supplierProduct: { connect: { id: hoseSp.id } }, product: { connect: { id: hose.id } }, conversionRate: D(1) },
  });

  // ========== 조립상품 (AssemblyTemplate + 결과 SET 상품) ==========
  // PC 조립 템플릿: CPU + RAM + SSD + 케이스
  // 부속을 미리 등록 (조립용 부품)
  const assemblyParts = [
    { sku: "PRD-CPU-I7", name: "Intel Core i7-13700K", price: 580000, cost: 480000 },
    { sku: "PRD-RAM-DDR5-32G", name: "DDR5 32GB 메모리", price: 280000, cost: 220000 },
    { sku: "PRD-SSD-2TB-NVME", name: "NVMe SSD 2TB", price: 320000, cost: 250000 },
    { sku: "PRD-CASE-MID", name: "미들타워 PC 케이스", price: 150000, cost: 110000 },
  ];
  for (const ap of assemblyParts) {
    const product = await prisma.product.create({
      data: {
        name: ap.name,
        sku: ap.sku,
        category: { connect: { id: M.cats["노트북·PC"].id } },
        productType: "PARTS",
        listPrice: D(ap.price),
        sellingPrice: D(ap.price),
      },
    });
    M.products[ap.sku] = product;
    await prisma.inventory.create({ data: { product: { connect: { id: product.id } }, quantity: D(0), safetyStock: D(2) } });
    // 직접 lot (입고 우회) — 부품 초기 재고
    await prisma.inventoryLot.create({
      data: {
        product: { connect: { id: product.id } },
        receivedQty: D(10),
        remainingQty: D(10),
        unitCost: D(ap.cost),
        receivedAt: day(-30),
        source: "INITIAL",
      },
    });
    const inv = await prisma.inventory.update({
      where: { productId: product.id },
      data: { quantity: { increment: D(10) } },
      select: { id: true, quantity: true },
    });
    await prisma.inventoryMovement.create({
      data: { inventory: { connect: { id: inv.id } }, type: "INITIAL", quantity: D(10), balanceAfter: inv.quantity, memo: "조립용 부품 초기 재고" },
    });
  }

  // AssemblyTemplate
  const pcTemplate = await prisma.assemblyTemplate.create({
    data: { name: "기본 PC 조립", description: "CPU + RAM + SSD + 케이스", defaultLaborCost: D(50000) },
  });
  M.pcTemplate = pcTemplate;

  // SlotLabel
  const slotCpu = await prisma.assemblySlotLabel.create({ data: { name: "CPU" } });
  const slotRam = await prisma.assemblySlotLabel.create({ data: { name: "RAM" } });
  const slotStorage = await prisma.assemblySlotLabel.create({ data: { name: "Storage" } });
  const slotCase = await prisma.assemblySlotLabel.create({ data: { name: "Case" } });

  for (const [idx, [labelName, sku, slotLabel]] of [
    ["CPU", "PRD-CPU-I7", slotCpu],
    ["RAM", "PRD-RAM-DDR5-32G", slotRam],
    ["Storage", "PRD-SSD-2TB-NVME", slotStorage],
    ["Case", "PRD-CASE-MID", slotCase],
  ].entries() as IterableIterator<[number, [string, string, any]]>) {
    await prisma.assemblyTemplateSlot.create({
      data: {
        template: { connect: { id: pcTemplate.id } },
        label: labelName as string,
        slotLabel: { connect: { id: (slotLabel as any).id } },
        order: idx,
        defaultProduct: { connect: { id: M.products[sku as string].id } },
        defaultQuantity: D(1),
      },
    });
  }

  // ========== 조립 PC — canonical/variant 정확한 사용 ==========
  // 그룹: "조립 PC i7 32G 2TB" 가 기본형 (canonical)
  // 하위 변형: 부속 일부만 다른 것 (RAM 업그레이드 / SSD 업그레이드 등)
  // → 손님이 "어떤 옵션 택할까?" 분기를 1 그룹 안에서 처리

  // 추가 부속 (variant 용 — 64GB RAM, 4TB SSD)
  const upgradeParts = [
    { sku: "PRD-RAM-DDR5-64G", name: "DDR5 64GB 메모리", price: 520000, cost: 420000 },
    { sku: "PRD-SSD-4TB-NVME", name: "NVMe SSD 4TB", price: 580000, cost: 460000 },
  ];
  for (const ap of upgradeParts) {
    const product = await prisma.product.create({
      data: {
        name: ap.name,
        sku: ap.sku,
        category: { connect: { id: M.cats["노트북·PC"].id } },
        productType: "PARTS",
        listPrice: D(ap.price),
        sellingPrice: D(ap.price),
      },
    });
    M.products[ap.sku] = product;
    await prisma.inventory.create({ data: { product: { connect: { id: product.id } }, quantity: D(0), safetyStock: D(1) } });
    await prisma.inventoryLot.create({
      data: {
        product: { connect: { id: product.id } },
        receivedQty: D(5),
        remainingQty: D(5),
        unitCost: D(ap.cost),
        receivedAt: day(-30),
        source: "INITIAL",
      },
    });
    const inv = await prisma.inventory.update({
      where: { productId: product.id },
      data: { quantity: { increment: D(5) } },
      select: { id: true, quantity: true },
    });
    await prisma.inventoryMovement.create({
      data: { inventory: { connect: { id: inv.id } }, type: "INITIAL", quantity: D(5), balanceAfter: inv.quantity, memo: "조립 variant 부속 초기 재고" },
    });
  }

  // canonical: 조립 PC 기본형
  const assembledPC = await prisma.product.create({
    data: {
      name: "조립 PC i7 32G 2TB (기본)",
      sku: "PRD-PC-ASSEMBLED",
      category: { connect: { id: M.cats["노트북·PC"].id } },
      productType: "ASSEMBLED",
      isSet: true,
      isCanonical: true, // ★ canonical — variant 들의 그룹 대표
      assemblyTemplate: { connect: { id: pcTemplate.id } },
      listPrice: D(1500000),
      sellingPrice: D(1380000),
      trackable: true,
      warrantyMonths: 12,
    },
  });
  M.products["PRD-PC-ASSEMBLED"] = assembledPC;
  await prisma.inventory.create({ data: { product: { connect: { id: assembledPC.id } }, quantity: D(0), safetyStock: D(1) } });
  for (const sku of ["PRD-CPU-I7", "PRD-RAM-DDR5-32G", "PRD-SSD-2TB-NVME", "PRD-CASE-MID"]) {
    await prisma.setComponent.create({
      data: {
        setProduct: { connect: { id: assembledPC.id } },
        component: { connect: { id: M.products[sku].id } },
        quantity: D(1),
      },
    });
  }

  // variant 1: RAM 64GB 업그레이드 (RAM 만 다름)
  const pcRam64 = await prisma.product.create({
    data: {
      name: "조립 PC i7 64G 2TB (RAM 업그레이드)",
      sku: "PRD-PC-ASSEMBLED-RAM64",
      category: { connect: { id: M.cats["노트북·PC"].id } },
      productType: "ASSEMBLED",
      isSet: true,
      canonicalProduct: { connect: { id: assembledPC.id } }, // ★ canonical 의 variant
      assemblyTemplate: { connect: { id: pcTemplate.id } },
      listPrice: D(1780000),
      sellingPrice: D(1650000),
      trackable: true,
      warrantyMonths: 12,
    },
  });
  M.products["PRD-PC-ASSEMBLED-RAM64"] = pcRam64;
  await prisma.inventory.create({ data: { product: { connect: { id: pcRam64.id } }, quantity: D(0), safetyStock: D(1) } });
  for (const [sku, slotLabel] of [
    ["PRD-CPU-I7", "CPU"],
    ["PRD-RAM-DDR5-64G", "RAM"],   // ← 64GB 으로 변경
    ["PRD-SSD-2TB-NVME", "Storage"],
    ["PRD-CASE-MID", "Case"],
  ] as const) {
    await prisma.setComponent.create({
      data: {
        setProduct: { connect: { id: pcRam64.id } },
        component: { connect: { id: M.products[sku].id } },
        quantity: D(1),
        label: slotLabel,
      },
    });
  }

  // variant 2: SSD 4TB 업그레이드 (SSD 만 다름)
  const pcSsd4t = await prisma.product.create({
    data: {
      name: "조립 PC i7 32G 4TB (SSD 업그레이드)",
      sku: "PRD-PC-ASSEMBLED-SSD4T",
      category: { connect: { id: M.cats["노트북·PC"].id } },
      productType: "ASSEMBLED",
      isSet: true,
      canonicalProduct: { connect: { id: assembledPC.id } }, // ★ canonical 의 variant
      assemblyTemplate: { connect: { id: pcTemplate.id } },
      listPrice: D(1820000),
      sellingPrice: D(1700000),
      trackable: true,
      warrantyMonths: 12,
    },
  });
  M.products["PRD-PC-ASSEMBLED-SSD4T"] = pcSsd4t;
  await prisma.inventory.create({ data: { product: { connect: { id: pcSsd4t.id } }, quantity: D(0), safetyStock: D(1) } });
  for (const [sku, slotLabel] of [
    ["PRD-CPU-I7", "CPU"],
    ["PRD-RAM-DDR5-32G", "RAM"],
    ["PRD-SSD-4TB-NVME", "Storage"],   // ← 4TB 으로 변경
    ["PRD-CASE-MID", "Case"],
  ] as const) {
    await prisma.setComponent.create({
      data: {
        setProduct: { connect: { id: pcSsd4t.id } },
        component: { connect: { id: M.products[sku].id } },
        quantity: D(1),
        label: slotLabel,
      },
    });
  }

  // 실제 조립 1건 (Assembly 레코드 + 부품 lot 차감)
  await prisma.$transaction(async (tx) => {
    const assemblyNo = genDocNo("ASM", day(-3));
    const assembly = await tx.assembly.create({
      data: {
        assemblyNo,
        product: { connect: { id: assembledPC.id } },
        quantity: D(1),
        type: "PRODUCE",
        laborCost: D(50000),
        assembledAt: day(-3),
      },
    });
    let totalCost = 50000;
    for (const sku of ["PRD-CPU-I7", "PRD-RAM-DDR5-32G", "PRD-SSD-2TB-NVME", "PRD-CASE-MID"]) {
      const lot = await tx.inventoryLot.findFirst({
        where: { productId: M.products[sku].id, remainingQty: { gt: 0 } },
        orderBy: { receivedAt: "asc" },
      });
      if (!lot) continue;
      await tx.inventoryLot.update({ where: { id: lot.id }, data: { remainingQty: { decrement: 1 } } });
      await tx.assemblyComponentConsumption.create({
        data: {
          assembly: { connect: { id: assembly.id } },
          component: { connect: { id: M.products[sku].id } },
          lotId: lot.id,
          quantity: D(1),
          unitCost: lot.unitCost,
        },
      });
      const inv = await tx.inventory.update({
        where: { productId: M.products[sku].id },
        data: { quantity: { decrement: D(1) } },
        select: { id: true, quantity: true },
      });
      await tx.inventoryMovement.create({
        data: { inventory: { connect: { id: inv.id } }, type: "SET_CONSUME", quantity: D(-1), balanceAfter: inv.quantity, referenceId: assembly.id, referenceType: "ASSEMBLY" },
      });
      totalCost += Number(lot.unitCost);
    }
    // 조립 결과물 lot 생성 + Inventory 증가
    const producedLot = await tx.inventoryLot.create({
      data: {
        product: { connect: { id: assembledPC.id } },
        receivedQty: D(1),
        remainingQty: D(1),
        unitCost: D(totalCost),
        receivedAt: day(-3),
        source: "ADJUSTMENT",
        memo: `조립 ${assemblyNo}`,
      },
    });
    await tx.assembly.update({ where: { id: assembly.id }, data: { producedLotId: producedLot.id } });
    const inv = await tx.inventory.update({
      where: { productId: assembledPC.id },
      data: { quantity: { increment: D(1) } },
      select: { id: true, quantity: true },
    });
    await tx.inventoryMovement.create({
      data: { inventory: { connect: { id: inv.id } }, type: "SET_PRODUCE", quantity: D(1), balanceAfter: inv.quantity, referenceId: assembly.id, referenceType: "ASSEMBLY" },
    });
  });

  log(`   ✓ 안전화 사이즈 3 / 오일 벌크 1세트 / 호스 1 / 조립 PC canonical+variant 3 (기본·RAM64·SSD4T) — 1대 실제 조립됨`);

  // ========== 상품 이미지 (ProductMedia) ==========
  // 모든 상품에 thumbnail 1장 (picsum 의 sku-seed 기반 동일 이미지)
  log("   상품 이미지 등록 중...");
  let imgCount = 0;
  for (const sku of Object.keys(M.products)) {
    const product = M.products[sku];
    const thumbUrl = `https://picsum.photos/seed/${encodeURIComponent(sku)}/600/600`;
    const detailUrl = `https://picsum.photos/seed/${encodeURIComponent(sku)}-d/1200/800`;
    await prisma.product.update({ where: { id: product.id }, data: { imageUrl: thumbUrl } });
    await prisma.productMedia.create({
      data: { product: { connect: { id: product.id } }, type: "IMAGE", kind: "THUMBNAIL", url: thumbUrl, sortOrder: 0 },
    });
    await prisma.productMedia.create({
      data: { product: { connect: { id: product.id } }, type: "IMAGE", kind: "DETAIL", url: detailUrl, sortOrder: 1 },
    });
    imgCount += 2;
  }
  log(`   ✓ 상품 이미지 ${imgCount}장 등록 (picsum.photos 기반)`);
}

// ============================================================
// STEP 6 — Incoming + Lots + Inventory + SupplierLedger
// ============================================================

type IncomingSpec = {
  no?: string;
  supplier: string;
  date: Date;
  status: "CONFIRMED" | "PENDING" | "CANCELLED";
  shippingCost?: number;
  shippingIsTaxable?: boolean;
  memo?: string;
  items: { sku: string; qty: number; unitPrice?: number; originalPrice?: number; discountAmount?: number }[];
};

async function createIncoming(spec: IncomingSpec) {
  const supplier = M.suppliers[spec.supplier];
  const incomingNo = genDocNo("IN", spec.date);

  return prisma.$transaction(async (tx) => {
    let totalAmount = 0;
    let taxAmount = 0;
    const itemsForLot: { incomingItemId: string; sp: any; qty: number; unitPrice: number }[] = [];

    const incoming = await tx.incoming.create({
      data: {
        incomingNo,
        supplier: { connect: { id: supplier.id } },
        createdBy: { connect: { id: M.admin.id } },
        status: spec.status,
        incomingDate: spec.date,
        shippingCost: D(spec.shippingCost ?? 0),
        shippingIsTaxable: spec.shippingIsTaxable ?? true,
        shippingDeducted: false,
        memo: spec.memo,
        totalAmount: D(0),
        taxAmount: D(0),
      },
    });

    for (const it of spec.items) {
      const product = M.products[it.sku];
      if (!product) throw new Error(`Product not found: ${it.sku}`);
      const mapping = await tx.productMapping.findFirst({ where: { productId: product.id } });
      if (!mapping) throw new Error(`No mapping for ${it.sku} — incoming requires mapping`);
      const sp = await tx.supplierProduct.findUnique({ where: { id: mapping.supplierProductId } });
      if (!sp) throw new Error("SupplierProduct not found");

      const unitPrice = it.unitPrice ?? Number(sp.unitPrice);
      const totalPrice = unitPrice * it.qty;
      totalAmount += totalPrice;
      if (sp.isTaxable) taxAmount += round(totalPrice * 0.1);

      const ii = await tx.incomingItem.create({
        data: {
          incoming: { connect: { id: incoming.id } },
          supplierProduct: { connect: { id: sp.id } },
          quantity: D(it.qty),
          originalPrice: it.originalPrice ? D(it.originalPrice) : null,
          discountAmount: it.discountAmount ? D(it.discountAmount) : null,
          unitPrice: D(unitPrice),
          totalPrice: D(totalPrice),
          unitCostSnapshot: D(unitPrice),
        },
      });
      itemsForLot.push({ incomingItemId: ii.id, sp, qty: it.qty, unitPrice });
    }

    await tx.incoming.update({
      where: { id: incoming.id },
      data: { totalAmount: D(totalAmount), taxAmount: D(taxAmount) },
    });

    if (spec.status === "CONFIRMED") {
      // Lot 생성 + Inventory 증가 + Movement + SupplierLedger
      for (const li of itemsForLot) {
        const mapping = await tx.productMapping.findFirst({
          where: { supplierProductId: li.sp.id },
        });
        const productId = mapping?.productId ?? null;
        const conv = mapping ? Number(mapping.conversionRate) : 1;
        const productQty = li.qty * conv;
        const unitCostPerProduct = li.unitPrice / conv;

        await tx.inventoryLot.create({
          data: {
            ...(productId ? { product: { connect: { id: productId } } } : {}),
            supplierProduct: { connect: { id: li.sp.id } },
            receivedQty: D(productQty),
            remainingQty: D(productQty),
            unitCost: D(unitCostPerProduct),
            receivedAt: spec.date,
            source: "INCOMING",
            incomingItem: { connect: { id: li.incomingItemId } },
          },
        });

        if (productId) {
          const inv = await tx.inventory.update({
            where: { productId },
            data: { quantity: { increment: D(productQty) } },
            select: { id: true, quantity: true },
          });
          await tx.inventoryMovement.create({
            data: {
              inventory: { connect: { id: inv.id } },
              type: "INCOMING",
              quantity: D(productQty),
              balanceAfter: inv.quantity,
              referenceId: incoming.id,
              referenceType: "INCOMING",
              memo: incomingNo,
            },
          });
        }
      }

      if (supplier.paymentMethod === "CREDIT") {
        await tx.supplierLedger.create({
          data: {
            supplier: { connect: { id: supplier.id } },
            date: spec.date,
            type: "PURCHASE",
            description: `매입 ${incomingNo}`,
            debitAmount: D(0),
            creditAmount: D(totalAmount + taxAmount),
            balance: D(0),
            referenceId: incoming.id,
            referenceType: "INCOMING",
          },
        });
        await rebalSup(tx, supplier.id);
      }
    }

    return { incoming, totalAmount, taxAmount };
  });
}

async function seedIncomings() {
  log("\n[6/9] Incoming 15건 (CONFIRMED 12 + PENDING 2 + CANCELLED 1)...");

  M.incomings = [] as any[];

  // 입고 시나리오 — 다양한 거래처, 일자, 품목 조합
  const specs: IncomingSpec[] = [
    {
      supplier: "보쉬코리아",
      date: day(-30),
      status: "CONFIRMED",
      shippingCost: 22000,
      memo: "초기 입고",
      items: [
        { sku: "PRD-DRL-12V", qty: 10 },
        { sku: "PRD-IMP-18V", qty: 8 },
        { sku: "PRD-GRD-750", qty: 12 },
        { sku: "PRD-BIT-32P", qty: 30 },
        { sku: "PRD-DRB-10", qty: 100 },
      ],
    },
    {
      supplier: "보쉬코리아",
      date: day(-22),
      status: "CONFIRMED",
      shippingCost: 15000,
      items: [
        { sku: "PRD-LZR-50", qty: 5 },
        { sku: "PRD-JIG-650", qty: 8 },
        { sku: "PRD-BAT-18V4", qty: 15 },
      ],
    },
    {
      supplier: "마끼다코리아",
      date: day(-28),
      status: "CONFIRMED",
      shippingCost: 30000,
      items: [
        { sku: "PRD-TW-001", qty: 5 },
        { sku: "PRD-DF-333", qty: 12 },
        { sku: "PRD-CRC-5604", qty: 8 },
        { sku: "PRD-VAC-180", qty: 6 },
        { sku: "PRD-BAT-1860", qty: 20 },
        { sku: "PRD-CHG-18RC", qty: 15 },
      ],
    },
    {
      supplier: "디월트유통",
      date: day(-25),
      status: "CONFIRMED",
      shippingCost: 35000,
      items: [
        { sku: "PRD-COMBO-283", qty: 4 },
        { sku: "PRD-IMP-887", qty: 8 },
        { sku: "PRD-GRD-405", qty: 6 },
        { sku: "PRD-TRQ-SET5", qty: 5 },
        { sku: "PRD-DTQ-DIG", qty: 3 },
        { sku: "PRD-HEX-100P", qty: 25 },
      ],
    },
    {
      supplier: "삼성공식대리점",
      date: day(-20),
      status: "CONFIRMED",
      shippingCost: 40000,
      items: [
        { sku: "PRD-NB-PRO16", qty: 3 },
        { sku: "PRD-MON-27-4K", qty: 6 },
        { sku: "PRD-SSD-1TB-980P", qty: 20 },
        { sku: "PRD-EXT-4TB-T7", qty: 10 },
        { sku: "PRD-HUB-7", qty: 30 },
        { sku: "PRD-KB-TRIO500", qty: 15 },
        { sku: "PRD-MS-WL", qty: 40 },
      ],
    },
    {
      supplier: "LG파트너스",
      date: day(-18),
      status: "CONFIRMED",
      shippingCost: 25000,
      items: [
        { sku: "PRD-GRAM-17", qty: 4 },
        { sku: "PRD-MON-32-UG", qty: 5 },
        { sku: "PRD-TONE-FP", qty: 12 },
        { sku: "PRD-BEAM-PF50", qty: 3 },
        { sku: "PRD-PWR-6", qty: 50 },
      ],
    },
    {
      supplier: "글로벌툴(미국)",
      date: day(-15),
      status: "CONFIRMED",
      shippingCost: 55000,
      memo: "USD 매입 — 환율 적용",
      items: [
        // currency=USD 인 SP 라 unitPrice 는 환율 적용된 KRW 로 입력
        { sku: "PRD-KLN-DRV-32500", qty: 8, unitPrice: 50000 },
        { sku: "PRD-FLK-MM-87V", qty: 3, unitPrice: 580000 },
        { sku: "PRD-WRA-BIT-8755", qty: 6, unitPrice: 88000 },
        { sku: "PRD-KNX-CB-8", qty: 8, unitPrice: 65000 },
        { sku: "PRD-CHN-WP-12", qty: 10, unitPrice: 42000 },
      ],
    },
    {
      supplier: "JapanTech상사",
      date: day(-12),
      status: "CONFIRMED",
      shippingCost: 35000,
      memo: "JPY 매입",
      items: [
        { sku: "PRD-TON-TRQ", qty: 5, unitPrice: 178000 },
        { sku: "PRD-KTC-STD", qty: 3, unitPrice: 405000 },
        { sku: "PRD-MTY-CAL", qty: 8, unitPrice: 121000 },
        { sku: "PRD-SNW-SQR", qty: 15, unitPrice: 17000 },
      ],
    },
    {
      supplier: "동방소모품",
      date: day(-10),
      status: "CONFIRMED",
      items: [
        { sku: "PRD-GLV-L12", qty: 30 },
        { sku: "PRD-HMT-W", qty: 25 },
        { sku: "PRD-SHO-270", qty: 12 },
        { sku: "PRD-WLD-AUTO", qty: 4 },
        { sku: "PRD-WD40-360", qty: 50 },
        { sku: "PRD-TPE-BLK", qty: 100 },
        { sku: "PRD-CTY-200", qty: 80 },
        { sku: "PRD-TPE-YLW", qty: 60 },
        { sku: "PRD-CGL-10", qty: 50 },
        { sku: "PRD-MSK-5", qty: 40 },
      ],
    },
    // 변형상품·오일·호스 입고
    {
      supplier: "동방소모품",
      date: day(-9),
      status: "CONFIRMED",
      shippingCost: 8000,
      memo: "안전화 변형 + 오일 + 호스",
      items: [
        { sku: "PRD-SHO-250", qty: 8 },
        { sku: "PRD-SHO-290", qty: 6 },
        { sku: "PRD-OIL-4L", qty: 20 },
        { sku: "PRD-HOSE-8MM", qty: 100 },
      ],
    },
    // 두 번째 보쉬 입고 — 단가 변경 (할인 적용된 케이스)
    {
      supplier: "보쉬코리아",
      date: day(-7),
      status: "CONFIRMED",
      shippingCost: 18000,
      memo: "할인 입고 — 정가 대비 할인",
      items: [
        { sku: "PRD-DRL-12V", qty: 8, unitPrice: 90000, originalPrice: 95000, discountAmount: 5000 },
        { sku: "PRD-BAT-18V4", qty: 10, unitPrice: 88000, originalPrice: 95000, discountAmount: 7000 },
      ],
    },
    {
      supplier: "마끼다코리아",
      date: day(-5),
      status: "CONFIRMED",
      shippingCost: 12000,
      items: [
        { sku: "PRD-DF-333", qty: 6 },
        { sku: "PRD-BAT-1860", qty: 15 },
      ],
    },
    // 수리용 부속 — 거래처 매핑 없는 PARTS 는 별도 거래처/SP 가 필요. 동방에서 별도로 추가하지 않고 직접 lot 박기로 단순화.
    {
      supplier: "동방소모품",
      date: day(-3),
      status: "CONFIRMED",
      items: [
        { sku: "PRD-WD40-360", qty: 30 },
        { sku: "PRD-CGL-10", qty: 30 },
      ],
    },
    // PENDING 2건
    {
      supplier: "디월트유통",
      date: day(-2),
      status: "PENDING",
      shippingCost: 25000,
      memo: "도착했지만 검수 전 — PENDING",
      items: [
        { sku: "PRD-IMP-887", qty: 4 },
        { sku: "PRD-GRD-405", qty: 3 },
      ],
    },
    {
      supplier: "삼성공식대리점",
      date: day(-1),
      status: "PENDING",
      shippingCost: 15000,
      memo: "검수 대기",
      items: [
        { sku: "PRD-SSD-1TB-980P", qty: 10 },
        { sku: "PRD-MS-WL", qty: 20 },
      ],
    },
    // CANCELLED 1건
    {
      supplier: "LG파트너스",
      date: day(-4),
      status: "CANCELLED",
      memo: "수량 오류로 취소",
      items: [
        { sku: "PRD-PWR-6", qty: 30 },
      ],
    },
  ];

  for (const s of specs) {
    const r = await createIncoming(s);
    M.incomings.push({ spec: s, incoming: r.incoming });
    guide.incomings.push({
      입고번호: r.incoming.incomingNo,
      거래처: s.supplier,
      날짜: s.date.toISOString().slice(0, 10),
      상태: s.status,
      품목수: String(s.items.length),
      금액: round(r.totalAmount).toLocaleString("ko-KR") + "원",
      배송비: (s.shippingCost ?? 0).toLocaleString("ko-KR") + "원",
      메모: s.memo ?? "-",
    });
  }

  // 부속 PARTS 직접 입고 — supplierProduct 없이 ADJUSTMENT 로트로 박는 방식 (실사보정 류). 시드 단순화 위해 직접 lot 박기.
  // 하지만 PARTS 도 매핑이 있으면 좋으니 동방에 SP 추가 + 매핑 후 입고.
  // 단순화: 직접 InventoryLot + Inventory 증가
  for (const sku of ["PRD-PARTS-CHK", "PRD-PARTS-BRS", "PRD-PARTS-PCB", "PRD-PARTS-CLT"]) {
    const product = M.products[sku];
    const cost = Number(product.sellingPrice) * 0.6;
    const qty = 20;
    await prisma.$transaction(async (tx) => {
      await tx.inventoryLot.create({
        data: {
          product: { connect: { id: product.id } },
          receivedQty: D(qty),
          remainingQty: D(qty),
          unitCost: D(cost),
          receivedAt: day(-30),
          source: "INITIAL",
          memo: "시드: 수리용 부속 초기 재고",
        },
      });
      const inv = await tx.inventory.update({
        where: { productId: product.id },
        data: { quantity: { increment: D(qty) } },
        select: { id: true, quantity: true },
      });
      await tx.inventoryMovement.create({
        data: {
          inventory: { connect: { id: inv.id } },
          type: "INITIAL",
          quantity: D(qty),
          balanceAfter: inv.quantity,
          memo: "수리용 부속 초기등록",
        },
      });
    });
  }

  log(`   ✓ Incoming ${M.incomings.length}건 + 수리부속 4종 직접 적재`);
}

// ============================================================
// STEP 7 — Stocktake / 실사보정 (1건)
// ============================================================

async function seedStocktakes() {
  log("\n[7/9] Stocktake 보정 1건 (양수 보정) ...");

  // 보쉬 비트세트가 5개 더 있다고 발견된 시나리오
  const product = M.products["PRD-BIT-32P"];
  const adjQty = 5;
  await prisma.$transaction(async (tx) => {
    const inv = await tx.inventory.findUnique({ where: { productId: product.id } });
    if (!inv) return;
    await tx.inventoryLot.create({
      data: {
        product: { connect: { id: product.id } },
        receivedQty: D(adjQty),
        remainingQty: D(adjQty),
        unitCost: D(15000),
        receivedAt: day(-1),
        source: "ADJUSTMENT",
        memo: "실사 보정 +5",
      },
    });
    const updated = await tx.inventory.update({
      where: { productId: product.id },
      data: { quantity: { increment: D(adjQty) } },
      select: { id: true, quantity: true },
    });
    await tx.inventoryMovement.create({
      data: {
        inventory: { connect: { id: updated.id } },
        type: "STOCKTAKE_PLUS",
        quantity: D(adjQty),
        balanceAfter: updated.quantity,
        reason: "FOUND",
        memo: "월말 실사 — 비트세트 5개 추가 발견",
      },
    });
  });
  log("   ✓ 보쉬 비트세트 +5 보정");
}

// ============================================================
// 시드 메인 + 가이드 출력은 다음 단계에서 추가
// ============================================================

// ============================================================
// STEP 8 — PurchaseOrder 시나리오 (10건, 모든 status 커버)
// ============================================================

type POSpec = {
  scenario: string;
  supplier: string;
  date: Date;
  status:
    | "DRAFT"
    | "SENT"
    | "CONFIRMED"
    | "PARTIAL"
    | "PARTIAL_RESENT"
    | "PARTIAL_REACCEPTED"
    | "PARTIAL_COMPLETED"
    | "RECEIVED"
    | "CLOSED"
    | "CANCELLED";
  items: { sku: string; qty: number; unitPrice?: number; receivedQty?: number }[];
  partialReceiveQty?: { sku: string; qty: number; date: Date }[]; // PARTIAL/CLOSED/PARTIAL_COMPLETED 용
  expectedDate?: Date;
  memo?: string;
};

async function createPO(spec: POSpec) {
  const supplier = M.suppliers[spec.supplier];
  const poNo = genDocNo("PO", spec.date);
  return prisma.$transaction(async (tx) => {
    let total = 0;
    const itemRecords: { id: string; sku: string; qty: number; unitPrice: number }[] = [];
    const po = await tx.purchaseOrder.create({
      data: {
        poNo,
        supplier: { connect: { id: supplier.id } },
        status: spec.status,
        orderDate: spec.date,
        expectedDate: spec.expectedDate,
        memo: spec.memo,
        createdBy: { connect: { id: M.admin.id } },
        totalAmount: D(0),
      },
    });
    for (const [idx, it] of spec.items.entries()) {
      const product = M.products[it.sku];
      const mapping = await tx.productMapping.findFirst({ where: { productId: product.id } });
      if (!mapping) throw new Error(`No mapping ${it.sku}`);
      const sp = await tx.supplierProduct.findUnique({ where: { id: mapping.supplierProductId } });
      const unitPrice = it.unitPrice ?? Number(sp!.unitPrice);
      const totalPrice = unitPrice * it.qty;
      total += totalPrice;
      const poi = await tx.purchaseOrderItem.create({
        data: {
          purchaseOrder: { connect: { id: po.id } },
          supplierProduct: { connect: { id: sp!.id } },
          quantity: D(it.qty),
          receivedQty: D(it.receivedQty ?? 0),
          unitPrice: D(unitPrice),
          totalPrice: D(totalPrice),
          sortOrder: idx,
        },
      });
      itemRecords.push({ id: poi.id, sku: it.sku, qty: it.qty, unitPrice });
    }
    await tx.purchaseOrder.update({
      where: { id: po.id },
      data: { totalAmount: D(total) },
    });
    return { po, total, itemRecords };
  });
}

async function seedPurchaseOrders() {
  log("\n[8/9] PurchaseOrder 10건 (모든 status)...");
  M.purchaseOrders = [] as any[];

  const specs: POSpec[] = [
    {
      scenario: "DRAFT — 작성 중, 아직 거래처 미발송",
      supplier: "보쉬코리아",
      date: day(-2),
      status: "DRAFT",
      items: [
        { sku: "PRD-DRL-12V", qty: 10 },
        { sku: "PRD-IMP-18V", qty: 5 },
      ],
      memo: "다음주 거래처 미팅 후 확정 예정",
    },
    {
      scenario: "SENT — 거래처 발송, 응답 대기",
      supplier: "마끼다코리아",
      date: day(-3),
      status: "SENT",
      items: [
        { sku: "PRD-TW-001", qty: 3 },
        { sku: "PRD-DF-333", qty: 8 },
      ],
      expectedDate: day(7),
      memo: "거래처 확인 대기",
    },
    {
      scenario: "CONFIRMED — 거래처 확정, 입고 대기",
      supplier: "디월트유통",
      date: day(-5),
      status: "CONFIRMED",
      items: [
        { sku: "PRD-COMBO-283", qty: 5 },
        { sku: "PRD-TRQ-SET5", qty: 10 },
      ],
      expectedDate: day(5),
      memo: "거래처 확정 — 출하 준비",
    },
    {
      scenario: "RECEIVED — 정상 입고완료 (한 번에 모두)",
      supplier: "삼성공식대리점",
      date: day(-15),
      status: "RECEIVED",
      items: [
        { sku: "PRD-MON-27-4K", qty: 6 },
        { sku: "PRD-SSD-1TB-980P", qty: 20 },
      ],
      expectedDate: day(-14),
      memo: "정상 입고 종결",
    },
  ];

  for (const s of specs) {
    const r = await createPO(s);
    M.purchaseOrders.push({ spec: s, po: r.po });
    guide.purchaseOrders.push({
      발주번호: r.po.poNo,
      거래처: s.supplier,
      날짜: s.date.toISOString().slice(0, 10),
      상태: s.status,
      품목수: String(s.items.length),
      금액: round(r.total).toLocaleString("ko-KR") + "원",
      시나리오: s.scenario,
    });
  }

  // PARTIAL / PARTIAL_RESENT / PARTIAL_REACCEPTED / PARTIAL_COMPLETED — 한 PO 에 입고 묶기
  // 전체 발주 50개 중 30개 부분입고 → PARTIAL → 잔여 20 재요청 → RESENT → 거래처 수락 → REACCEPTED → 잔량 입고 → COMPLETED
  {
    const spec: POSpec = {
      scenario: "PARTIAL_COMPLETED — 부분입고 후 잔량까지 모두 받음",
      supplier: "마끼다코리아",
      date: day(-20),
      status: "PARTIAL_COMPLETED",
      items: [
        { sku: "PRD-DF-333", qty: 50, receivedQty: 50 },
        { sku: "PRD-BAT-1860", qty: 30, receivedQty: 30 },
      ],
      memo: "1차 부분입고(40+20) → 2차 입고(10+10) — 부분입고 이력 보존",
    };
    const r = await createPO(spec);
    M.purchaseOrders.push({ spec, po: r.po });
    guide.purchaseOrders.push({
      발주번호: r.po.poNo,
      거래처: spec.supplier,
      날짜: spec.date.toISOString().slice(0, 10),
      상태: spec.status,
      품목수: String(spec.items.length),
      금액: round(r.total).toLocaleString("ko-KR") + "원",
      시나리오: spec.scenario,
    });
  }

  // PARTIAL — 진행 중 (40개 받고 10개 잔여)
  {
    const spec: POSpec = {
      scenario: "PARTIAL — 부분입고 진행 중 (재발송 결정 대기)",
      supplier: "보쉬코리아",
      date: day(-12),
      status: "PARTIAL",
      items: [
        { sku: "PRD-GRD-750", qty: 20, receivedQty: 12 },
        { sku: "PRD-BIT-32P", qty: 50, receivedQty: 30 },
      ],
      memo: "거래처 부분배송 — 잔량 결정 필요",
    };
    const r = await createPO(spec);
    M.purchaseOrders.push({ spec, po: r.po });
    guide.purchaseOrders.push({
      발주번호: r.po.poNo,
      거래처: spec.supplier,
      날짜: spec.date.toISOString().slice(0, 10),
      상태: spec.status,
      품목수: String(spec.items.length),
      금액: round(r.total).toLocaleString("ko-KR") + "원",
      시나리오: spec.scenario,
    });
  }

  // PARTIAL_RESENT — 재발송 (잔량 재요청)
  {
    const spec: POSpec = {
      scenario: "PARTIAL_RESENT — 잔량 재요청 발송, 거래처 응답 대기",
      supplier: "디월트유통",
      date: day(-18),
      status: "PARTIAL_RESENT",
      items: [
        { sku: "PRD-IMP-887", qty: 15, receivedQty: 10 },
      ],
      memo: "잔량 5개 재요청",
    };
    const r = await createPO(spec);
    M.purchaseOrders.push({ spec, po: r.po });
    guide.purchaseOrders.push({
      발주번호: r.po.poNo,
      거래처: spec.supplier,
      날짜: spec.date.toISOString().slice(0, 10),
      상태: spec.status,
      품목수: String(spec.items.length),
      금액: round(r.total).toLocaleString("ko-KR") + "원",
      시나리오: spec.scenario,
    });
  }

  // PARTIAL_REACCEPTED — 거래처가 잔량 재발송 수락
  {
    const spec: POSpec = {
      scenario: "PARTIAL_REACCEPTED — 거래처가 잔량 재요청 수락, 출하 대기",
      supplier: "보쉬코리아",
      date: day(-22),
      status: "PARTIAL_REACCEPTED",
      items: [
        { sku: "PRD-LZR-50", qty: 8, receivedQty: 5 },
      ],
      memo: "잔량 3개 거래처 수락",
    };
    const r = await createPO(spec);
    M.purchaseOrders.push({ spec, po: r.po });
    guide.purchaseOrders.push({
      발주번호: r.po.poNo,
      거래처: spec.supplier,
      날짜: spec.date.toISOString().slice(0, 10),
      상태: spec.status,
      품목수: String(spec.items.length),
      금액: round(r.total).toLocaleString("ko-KR") + "원",
      시나리오: spec.scenario,
    });
  }

  // CLOSED — 잔량 포기로 종결
  {
    const spec: POSpec = {
      scenario: "CLOSED — 부분입고 후 잔량 포기로 종결",
      supplier: "삼성공식대리점",
      date: day(-25),
      status: "CLOSED",
      items: [
        { sku: "PRD-NB-PRO16", qty: 5, receivedQty: 3 },
      ],
      memo: "잔량 2대 거래처 미공급 — 종결",
    };
    const r = await createPO(spec);
    M.purchaseOrders.push({ spec, po: r.po });
    guide.purchaseOrders.push({
      발주번호: r.po.poNo,
      거래처: spec.supplier,
      날짜: spec.date.toISOString().slice(0, 10),
      상태: spec.status,
      품목수: String(spec.items.length),
      금액: round(r.total).toLocaleString("ko-KR") + "원",
      시나리오: spec.scenario,
    });
  }

  // CANCELLED — 단가 협상 결렬
  {
    const spec: POSpec = {
      scenario: "CANCELLED — 단가 협상 결렬로 취소",
      supplier: "LG파트너스",
      date: day(-10),
      status: "CANCELLED",
      items: [
        { sku: "PRD-MON-32-UG", qty: 8 },
      ],
      memo: "거래처 요청 단가 합의 실패",
    };
    const r = await createPO(spec);
    M.purchaseOrders.push({ spec, po: r.po });
    guide.purchaseOrders.push({
      발주번호: r.po.poNo,
      거래처: spec.supplier,
      날짜: spec.date.toISOString().slice(0, 10),
      상태: spec.status,
      품목수: String(spec.items.length),
      금액: round(r.total).toLocaleString("ko-KR") + "원",
      시나리오: spec.scenario,
    });
  }

  log(`   ✓ PO ${M.purchaseOrders.length}건`);
}

// ============================================================
// STEP 9 — Quotation + Statement (12 + 6)
// ============================================================

type QtSpec = {
  scenario: string;
  type: "SALES" | "PURCHASE";
  status: "DRAFT" | "SENT" | "ACCEPTED" | "REJECTED" | "EXPIRED" | "CONVERTED";
  customer?: string;
  supplier?: string;
  date: Date;
  validUntil?: Date;
  title?: string;
  items: { sku?: string; supplierCode?: string; name: string; qty: number; unitPrice: number; listPrice?: number; discount?: number; spec?: string; isTaxable?: boolean }[];
};

async function createQuotation(spec: QtSpec) {
  const no = genDocNo("QUO", spec.date);
  let subtotal = 0;
  let tax = 0;
  // 견적 본체를 먼저 만든 뒤 items 를 별도로 생성 (nested create 도 connect 패턴 강제 회피)
  const customerId = spec.customer ? M.customers[spec.customer]?.id : null;
  const supplierId = spec.supplier ? M.suppliers[spec.supplier]?.id : null;

  const quotation = await prisma.quotation.create({
    data: {
      quotationNo: no,
      type: spec.type,
      status: spec.status,
      issueDate: spec.date,
      validUntil: spec.validUntil,
      ...(customerId ? { customer: { connect: { id: customerId } } } : {}),
      ...(supplierId ? { supplier: { connect: { id: supplierId } } } : {}),
      title: spec.title,
      subtotalAmount: D(0),
      taxAmount: D(0),
      totalAmount: D(0),
      createdBy: { connect: { id: M.admin.id } },
    },
  });

  for (const [idx, it] of spec.items.entries()) {
    const total = it.unitPrice * it.qty;
    subtotal += total;
    if (it.isTaxable !== false) tax += round(total * 0.1);
    const product = it.sku ? M.products[it.sku] : null;
    const sp = it.supplierCode ? M.sps[it.supplierCode] : null;
    await prisma.quotationItem.create({
      data: {
        quotation: { connect: { id: quotation.id } },
        ...(product ? { product: { connect: { id: product.id } } } : {}),
        ...(sp ? { supplierProduct: { connect: { id: sp.id } } } : {}),
        name: it.name,
        spec: it.spec ?? product?.spec ?? null,
        unitOfMeasure: "EA",
        quantity: D(it.qty),
        listPrice: D(it.listPrice ?? it.unitPrice),
        discountAmount: D(it.discount ?? 0),
        unitPrice: D(it.unitPrice),
        totalPrice: D(total),
        isTaxable: it.isTaxable ?? true,
        sortOrder: idx,
      },
    });
  }
  return prisma.quotation.update({
    where: { id: quotation.id },
    data: { subtotalAmount: D(subtotal), taxAmount: D(tax), totalAmount: D(subtotal + tax) },
  });
}

async function seedQuotationsStatements() {
  log("\n[9a/9] Quotation 12건 + Statement 6건...");
  M.quotations = [] as any[];
  M.statements = [] as any[];

  const qts: QtSpec[] = [
    // 판매 6건
    {
      scenario: "판매 DRAFT — 작성 중",
      type: "SALES",
      status: "DRAFT",
      customer: "(주)테크월드",
      date: day(-1),
      validUntil: day(14),
      title: "전자기기 일괄 견적",
      items: [
        { sku: "PRD-NB-PRO16", name: "삼성 노트북 갤럭시북 Pro16", qty: 3, unitPrice: 1890000, listPrice: 2100000, discount: 210000 },
        { sku: "PRD-MON-27-4K", name: "삼성 모니터 27\" 4K", qty: 6, unitPrice: 445000 },
      ],
    },
    {
      scenario: "판매 SENT — 발송, 손님 응답 대기",
      type: "SALES",
      status: "SENT",
      customer: "동방건설(주)",
      date: day(-3),
      validUntil: day(11),
      title: "현장용 공구 일괄",
      items: [
        { sku: "PRD-COMBO-283", name: "디월트 콤보세트", qty: 4, unitPrice: 585000 },
        { sku: "PRD-LZR-50", name: "보쉬 레이저 거리측정기", qty: 4, unitPrice: 178000 },
      ],
    },
    {
      scenario: "판매 ACCEPTED — 손님 수락 (주문 전환 예정)",
      type: "SALES",
      status: "ACCEPTED",
      customer: "스마트팩토리(주)",
      date: day(-5),
      validUntil: day(9),
      items: [
        { sku: "PRD-DTQ-DIG", name: "디월트 디지털 토크 측정기", qty: 2, unitPrice: 525000 },
        { sku: "PRD-FLK-MM-87V", name: "Fluke 멀티미터 87V", qty: 1, unitPrice: 625000 },
      ],
    },
    {
      scenario: "판매 REJECTED — 손님 거절",
      type: "SALES",
      status: "REJECTED",
      customer: "한빛정비",
      date: day(-7),
      items: [
        { sku: "PRD-MON-32-UG", name: "LG 울트라기어 32\"", qty: 3, unitPrice: 595000 },
      ],
    },
    {
      scenario: "판매 EXPIRED — 만료",
      type: "SALES",
      status: "EXPIRED",
      customer: "(주)디자인스튜디오",
      date: day(-30),
      validUntil: day(-15),
      items: [
        { sku: "PRD-GRAM-17", name: "LG 그램 17", qty: 2, unitPrice: 2380000 },
      ],
    },
    // 매입 6건
    {
      scenario: "매입 DRAFT — 작성 중",
      type: "PURCHASE",
      status: "DRAFT",
      supplier: "보쉬코리아",
      date: day(-2),
      items: [
        { supplierCode: "BSH-DRL-12V", name: "보쉬 충전 드릴 GSR12V", qty: 15, unitPrice: 95000 },
        { supplierCode: "BSH-IMP-18V", name: "보쉬 임팩트 드라이버", qty: 10, unitPrice: 185000 },
      ],
    },
    {
      scenario: "매입 SENT — 거래처에 단가 견적 요청",
      type: "PURCHASE",
      status: "SENT",
      supplier: "마끼다코리아",
      date: day(-4),
      items: [
        { supplierCode: "MKT-TW-001", name: "마끼다 임팩트 렌치 TW001G", qty: 5, unitPrice: 380000 },
      ],
    },
    {
      scenario: "매입 ACCEPTED — 단가 합의 (입고 전환 대기)",
      type: "PURCHASE",
      status: "ACCEPTED",
      supplier: "디월트유통",
      date: day(-6),
      items: [
        { supplierCode: "DEW-COMBO-283", name: "디월트 콤보세트", qty: 8, unitPrice: 425000 },
      ],
    },
    {
      scenario: "매입 REJECTED — 단가 미합의",
      type: "PURCHASE",
      status: "REJECTED",
      supplier: "LG파트너스",
      date: day(-8),
      items: [
        { supplierCode: "LG-MON-32-UG", name: "LG 울트라기어 32\"", qty: 8, unitPrice: 480000 },
      ],
    },
    {
      scenario: "매입 EXPIRED — 만료",
      type: "PURCHASE",
      status: "EXPIRED",
      supplier: "글로벌툴(미국)",
      date: day(-45),
      validUntil: day(-25),
      items: [
        { supplierCode: "FLK-MM-87V", name: "Fluke 멀티미터", qty: 5, unitPrice: 425, isTaxable: false },
      ],
    },
    // CONVERTED 1건씩 (판매·매입) — 견적 → 주문/PO 전환된 후 락
    {
      scenario: "판매 CONVERTED — 주문으로 전환 완료 (락)",
      type: "SALES",
      status: "CONVERTED",
      customer: "메이커스랩",
      date: day(-10),
      items: [
        { sku: "PRD-WD40-360", name: "WD-40 윤활제", qty: 20, unitPrice: 10000 },
        { sku: "PRD-CGL-10", name: "면장갑 (10켤레)", qty: 30, unitPrice: 7500 },
      ],
    },
    {
      scenario: "매입 CONVERTED — PO로 전환 완료 (락)",
      type: "PURCHASE",
      status: "CONVERTED",
      supplier: "동방소모품",
      date: day(-12),
      items: [
        { supplierCode: "DB-WD40-360", name: "WD-40 윤활제", qty: 100, unitPrice: 8500 },
        { supplierCode: "DB-CGL-10", name: "면장갑", qty: 50, unitPrice: 6000 },
      ],
    },
  ];

  for (const q of qts) {
    const created = await createQuotation(q);
    M.quotations.push({ spec: q, quotation: created });
    guide.quotations.push({
      견적번호: created.quotationNo,
      종류: q.type,
      상태: q.status,
      "고객·거래처": q.customer ?? q.supplier ?? "-",
      날짜: q.date.toISOString().slice(0, 10),
      품목수: String(q.items.length),
      금액: round(q.items.reduce((s, i) => s + i.unitPrice * i.qty, 0)).toLocaleString("ko-KR") + "원",
      시나리오: q.scenario,
    });
  }

  // Statement 6건 — 직접 발행 3건 + 견적서 매핑 표시 3건
  const stmtSpecs: {
    scenario: string;
    customer: string;
    date: Date;
    items: { sku: string; name: string; qty: number; unitPrice: number; listPrice?: number; discount?: number }[];
  }[] = [
    {
      scenario: "ISSUED — 메이커스랩 정기 거래명세표",
      customer: "메이커스랩",
      date: day(-8),
      items: [
        { sku: "PRD-WD40-360", name: "WD-40 윤활제", qty: 20, unitPrice: 10000 },
        { sku: "PRD-CGL-10", name: "면장갑", qty: 30, unitPrice: 7500 },
      ],
    },
    {
      scenario: "ISSUED — 동방건설 자재 명세",
      customer: "동방건설(주)",
      date: day(-6),
      items: [
        { sku: "PRD-HMT-W", name: "안전모 헬멧", qty: 10, unitPrice: 15000 },
        { sku: "PRD-SHO-270", name: "안전화 270mm", qty: 5, unitPrice: 78000 },
        { sku: "PRD-GLV-L12", name: "공업용 장갑", qty: 8, unitPrice: 22000 },
      ],
    },
    {
      scenario: "ISSUED — 한빛정비 매월 정기 명세",
      customer: "한빛정비",
      date: day(-4),
      items: [
        { sku: "PRD-WD40-360", name: "WD-40 윤활제", qty: 30, unitPrice: 10000 },
        { sku: "PRD-CTY-200", name: "케이블타이", qty: 50, unitPrice: 4500 },
      ],
    },
    {
      scenario: "ISSUED — (주)디자인스튜디오 명세",
      customer: "(주)디자인스튜디오",
      date: day(-3),
      items: [
        { sku: "PRD-MON-27-4K", name: "삼성 모니터 27\" 4K", qty: 4, unitPrice: 445000 },
        { sku: "PRD-KB-TRIO500", name: "삼성 무선 키보드", qty: 4, unitPrice: 68000 },
      ],
    },
    {
      scenario: "ISSUED — 오피스마트 사무용품 명세",
      customer: "오피스마트",
      date: day(-2),
      items: [
        { sku: "PRD-PWR-6", name: "LG 멀티탭 6구", qty: 30, unitPrice: 15000 },
        { sku: "PRD-HUB-7", name: "USB-C 허브", qty: 15, unitPrice: 48000 },
      ],
    },
    {
      scenario: "VOIDED — 발행 후 무효 처리된 명세",
      customer: "스마트팩토리(주)",
      date: day(-15),
      items: [
        { sku: "PRD-DRL-12V", name: "보쉬 충전 드릴", qty: 5, unitPrice: 135000 },
      ],
    },
  ];

  for (const s of stmtSpecs) {
    const customer = M.customers[s.customer];
    let subtotal = 0;
    let tax = 0;
    const stmt = await prisma.statement.create({
      data: {
        statementNo: genDocNo("STM", s.date),
        status: s.scenario.startsWith("VOIDED") ? "CANCELLED" : "ISSUED",
        issueDate: s.date,
        customer: { connect: { id: customer.id } },
        customerNameSnapshot: customer.name,
        customerPhoneSnapshot: customer.phone,
        customerAddressSnapshot: customer.address,
        customerBusinessNumberSnapshot: customer.businessNumber,
        subtotalAmount: D(0),
        taxAmount: D(0),
        totalAmount: D(0),
        createdBy: { connect: { id: M.admin.id } },
      },
    });
    for (const [idx, it] of s.items.entries()) {
      const product = M.products[it.sku];
      const total = it.unitPrice * it.qty;
      subtotal += total;
      tax += round(total * 0.1);
      await prisma.statementItem.create({
        data: {
          statement: { connect: { id: stmt.id } },
          product: { connect: { id: product.id } },
          name: it.name,
          spec: product.spec,
          unitOfMeasure: "EA",
          quantity: D(it.qty),
          listPrice: D(it.listPrice ?? it.unitPrice),
          discountAmount: D(it.discount ?? 0),
          unitPrice: D(it.unitPrice),
          totalPrice: D(total),
          isTaxable: true,
          sortOrder: idx,
        },
      });
    }
    await prisma.statement.update({
      where: { id: stmt.id },
      data: { subtotalAmount: D(subtotal), taxAmount: D(tax), totalAmount: D(subtotal + tax) },
    });
    M.statements.push(stmt);
    guide.statements.push({
      명세번호: stmt.statementNo,
      고객: s.customer,
      날짜: s.date.toISOString().slice(0, 10),
      상태: stmt.status,
      품목수: String(s.items.length),
      금액: (subtotal + tax).toLocaleString("ko-KR") + "원",
      시나리오: s.scenario,
    });
  }

  log(`   ✓ Quotation ${M.quotations.length}건 + Statement ${M.statements.length}건`);
}

// ============================================================
// Order 헬퍼들 — FIFO 차감, 재고 복원, 고객원장
// ============================================================

type OrderLine = {
  sku: string;
  qty: number;
  unitPrice?: number;     // 미지정 시 product.sellingPrice
  listPrice?: number;
  discount?: number;
};

type OrderSpec = {
  scenario: string;
  customer?: string;
  channel?: "COUPANG" | "NAVER" | "OWN" | "OFFLINE";
  channelOrderNo?: string;
  fulfillment: "PICKUP" | "DELIVERY" | "SHIPPING";
  orderDate: Date;
  expectedShipDate?: Date;
  finalStatus:
    | "PENDING"
    | "PREPARING"
    | "SHIPPED"
    | "COMPLETED"
    | "CANCELLED"
    | "RETURN_REQUESTED"
    | "RETURN_ACCEPTED"
    | "RETURNED"
    | "EXCHANGED";
  paymentMethod?: "CASH" | "CARD" | "TRANSFER" | "MIXED" | "UNPAID";
  paymentStatus: "UNPAID" | "PAID" | "PARTIAL_REFUND" | "REFUNDED";
  shippingFee?: number;
  discount?: number;
  recipientName?: string;
  recipientPhone?: string;
  shippingAddress?: string;
  trackingCarrier?: string;
  trackingNumber?: string;
  claimType?: "REFUND" | "EXCHANGE_SAME" | "EXCHANGE_DIFFERENT";
  claimReason?: "DEFECTIVE" | "DAMAGED_IN_TRANSIT" | "WRONG_ITEM" | "CHANGE_MIND" | "SIZE_COLOR" | "OTHER";
  returnReason?: string;
  memo?: string;
  items: OrderLine[];
  taxInvoiceRequested?: boolean;
};

// 출고/재고차감 — PREPARING 이상 진행한 상태에서 호출
async function consumeStockForOrder(
  tx: Prisma.TransactionClient,
  orderId: string,
  items: { id: string; productId: string; qty: number; isSet: boolean }[],
) {
  for (const it of items) {
    if (it.isSet) {
      // 세트: 구성품 각각 FIFO 차감 + 세트 자체는 차감 안 함 (구성품으로 표현)
      const components = await tx.setComponent.findMany({ where: { setProductId: it.productId } });
      let totalCost = 0;
      let totalQty = 0;
      for (const comp of components) {
        const need = Number(comp.quantity) * it.qty;
        const lots = await tx.inventoryLot.findMany({
          where: { productId: comp.componentId, remainingQty: { gt: 0 } },
          orderBy: { receivedAt: "asc" },
        });
        const avail = lots.reduce((s, l) => s + Number(l.remainingQty), 0);
        if (avail < need) throw new Error(`세트 구성품 부족 (${comp.componentId}): 필요 ${need} 가용 ${avail}`);
        let remain = need;
        let costSum = 0;
        for (const lot of lots) {
          if (remain <= 0) break;
          const take = Math.min(remain, Number(lot.remainingQty));
          await tx.inventoryLot.update({ where: { id: lot.id }, data: { remainingQty: { decrement: take } } });
          await tx.lotConsumption.create({ data: { orderItem: { connect: { id: it.id } }, lot: { connect: { id: lot.id } }, quantity: D(take), unitCost: D(Number(lot.unitCost)) } });
          costSum += take * Number(lot.unitCost);
          remain -= take;
        }
        const inv = await tx.inventory.update({
          where: { productId: comp.componentId },
          data: { quantity: { decrement: D(need) } },
          select: { id: true, quantity: true },
        });
        await tx.inventoryMovement.create({
          data: {
            inventory: { connect: { id: inv.id } },
            type: "SET_CONSUME",
            quantity: D(-need),
            balanceAfter: inv.quantity,
            referenceId: orderId,
            referenceType: "ORDER",
          },
        });
        totalCost += costSum;
        totalQty += need;
      }
      // 세트 자체에는 unitCostSnapshot 저장 (구성품 평균)
      const avgCost = totalQty > 0 ? totalCost / totalQty : 0;
      await tx.orderItem.update({
        where: { id: it.id },
        data: { unitCostSnapshot: D(avgCost) },
      });
    } else {
      const lots = await tx.inventoryLot.findMany({
        where: { productId: it.productId, remainingQty: { gt: 0 } },
        orderBy: { receivedAt: "asc" },
      });
      const avail = lots.reduce((s, l) => s + Number(l.remainingQty), 0);
      if (avail < it.qty) throw new Error(`재고 부족 ${it.productId}: 필요 ${it.qty} / 가용 ${avail}`);
      let remain = it.qty;
      let costSum = 0;
      for (const lot of lots) {
        if (remain <= 0) break;
        const take = Math.min(remain, Number(lot.remainingQty));
        await tx.inventoryLot.update({ where: { id: lot.id }, data: { remainingQty: { decrement: take } } });
        await tx.lotConsumption.create({ data: { orderItem: { connect: { id: it.id } }, lot: { connect: { id: lot.id } }, quantity: D(take), unitCost: D(Number(lot.unitCost)) } });
        costSum += take * Number(lot.unitCost);
        remain -= take;
      }
      const inv = await tx.inventory.update({
        where: { productId: it.productId },
        data: { quantity: { decrement: D(it.qty) } },
        select: { id: true, quantity: true },
      });
      await tx.inventoryMovement.create({
        data: {
          inventory: { connect: { id: inv.id } },
          type: "OUTGOING",
          quantity: D(-it.qty),
          balanceAfter: inv.quantity,
          referenceId: orderId,
          referenceType: "ORDER",
        },
      });
      await tx.orderItem.update({
        where: { id: it.id },
        data: { unitCostSnapshot: D(costSum / it.qty) },
      });
    }
  }
}

// 재고 복원 — CANCELLED/RETURNED/EXCHANGED 시 호출
async function restoreStockForOrder(
  tx: Prisma.TransactionClient,
  orderId: string,
) {
  const items = await tx.orderItem.findMany({
    where: { orderId },
    include: { product: { select: { id: true, isSet: true } } },
  });
  for (const it of items) {
    if (!it.product) continue;
    const consumptions = await tx.lotConsumption.findMany({ where: { orderItemId: it.id } });
    if (consumptions.length === 0) continue;

    // 세트 vs 단품 — 차감 시 세트는 구성품 lot 차감했으므로 복원도 그대로
    const totalRestoredByProduct = new Map<string, number>();

    for (const c of consumptions) {
      await tx.inventoryLot.update({ where: { id: c.lotId }, data: { remainingQty: { increment: c.quantity } } });
      const lot = await tx.inventoryLot.findUnique({ where: { id: c.lotId }, select: { productId: true } });
      if (lot?.productId) {
        const cur = totalRestoredByProduct.get(lot.productId) ?? 0;
        totalRestoredByProduct.set(lot.productId, cur + Number(c.quantity));
      }
    }
    for (const [productId, qty] of totalRestoredByProduct) {
      const inv = await tx.inventory.update({
        where: { productId },
        data: { quantity: { increment: D(qty) } },
        select: { id: true, quantity: true },
      });
      await tx.inventoryMovement.create({
        data: {
          inventory: { connect: { id: inv.id } },
          type: it.product.isSet ? "SET_PRODUCE" : "RETURN",
          quantity: D(qty),
          balanceAfter: inv.quantity,
          referenceId: orderId,
          referenceType: "ORDER",
        },
      });
    }
    await tx.lotConsumption.deleteMany({ where: { orderItemId: it.id } });
  }
}

async function createOrder(spec: OrderSpec): Promise<{ orderId: string; orderNo: string }> {
  const orderNo = genDocNo("ORD", spec.orderDate);
  const customer = spec.customer ? M.customers[spec.customer] : null;

  return prisma.$transaction(async (tx) => {
    let subtotal = 0;
    const itemsForLot: { id: string; productId: string; qty: number; isSet: boolean }[] = [];

    const order = await tx.order.create({
      data: {
        orderNo,
        ...(spec.channel ? { channel: { connect: { id: M.channels[spec.channel].id } } } : {}),
        channelOrderNo: spec.channelOrderNo,
        status: "PENDING",
        fulfillmentType: spec.fulfillment,
        expectedShipDate: spec.expectedShipDate,
        ...(customer ? { customer: { connect: { id: customer.id } } } : {}),
        customerName: customer?.name,
        customerPhone: customer?.phone,
        recipientName: spec.recipientName ?? customer?.name,
        recipientPhone: spec.recipientPhone ?? customer?.phone,
        shippingAddress: spec.shippingAddress ?? customer?.address,
        orderDate: spec.orderDate,
        paymentMethod: spec.paymentMethod ?? null,
        paymentStatus: "UNPAID",
        shippingFee: D(spec.shippingFee ?? 0),
        discountAmount: D(spec.discount ?? 0),
        memo: spec.memo,
        taxInvoiceRequested: spec.taxInvoiceRequested ?? false,
        subtotalAmount: D(0),
        totalAmount: D(0),
        taxAmount: D(0),
        createdBy: { connect: { id: M.admin.id } },
      },
    });

    for (const [idx, it] of spec.items.entries()) {
      const product = M.products[it.sku];
      const unitPrice = it.unitPrice ?? Number(product.sellingPrice);
      const total = unitPrice * it.qty;
      subtotal += total;
      const oi = await tx.orderItem.create({
        data: {
          order: { connect: { id: order.id } },
          product: { connect: { id: product.id } },
          quantity: D(it.qty),
          listPrice: D(it.listPrice ?? unitPrice),
          discountAmount: D(it.discount ?? 0),
          unitPrice: D(unitPrice),
          totalPrice: D(total),
          channelCommissionRateSnapshot: spec.channel ? Number(M.channels[spec.channel].commissionRate) : null,
        } as any,
      });
      itemsForLot.push({ id: oi.id, productId: product.id, qty: it.qty, isSet: product.isSet });
    }

    const tax = round(subtotal * 0.1);
    await tx.order.update({
      where: { id: order.id },
      data: {
        subtotalAmount: D(subtotal),
        taxAmount: D(tax),
        totalAmount: D(subtotal + tax + (spec.shippingFee ?? 0) - (spec.discount ?? 0)),
      },
    });

    // 상태 전환
    let cur: typeof spec.finalStatus = "PENDING";
    const advance = async (next: typeof spec.finalStatus) => {
      cur = next;
      await tx.order.update({ where: { id: order.id }, data: { status: next } });
    };

    if (spec.finalStatus === "PENDING") {
      await tx.order.update({ where: { id: order.id }, data: { paymentStatus: spec.paymentStatus } });
      if (spec.paymentStatus === "UNPAID" && customer) {
        const finalTotal = subtotal + tax + (spec.shippingFee ?? 0) - (spec.discount ?? 0);
        await tx.customerLedger.create({
          data: {
            customer: { connect: { id: customer.id } },
            date: spec.orderDate,
            type: "SALE",
            description: `매출 ${orderNo}`,
            debitAmount: D(finalTotal),
            creditAmount: D(0),
            balance: D(0),
            referenceId: order.id,
            referenceType: "ORDER",
          },
        });
        await rebalCust(tx, customer.id);
      }
      return { orderId: order.id, orderNo };
    }

    // PREPARING 부터는 재고 차감
    await consumeStockForOrder(tx, order.id, itemsForLot);
    await advance("PREPARING");

    if (spec.finalStatus === "PREPARING") {
      await tx.order.update({ where: { id: order.id }, data: { paymentStatus: spec.paymentStatus } });
      if (spec.paymentStatus === "PAID" && customer) {
        const finalTotal = subtotal + tax + (spec.shippingFee ?? 0) - (spec.discount ?? 0);
        // SALE + RECEIPT 같은 날
        await tx.customerLedger.create({ data: { customer: { connect: { id: customer.id } }, date: spec.orderDate, type: "SALE", description: `매출 ${orderNo}`, debitAmount: D(finalTotal), creditAmount: D(0), balance: D(0), referenceId: order.id, referenceType: "ORDER" } });
        await tx.customerLedger.create({ data: { customer: { connect: { id: customer.id } }, date: spec.orderDate, type: "RECEIPT", description: `결제 ${orderNo}`, debitAmount: D(0), creditAmount: D(finalTotal), balance: D(0), referenceId: order.id, referenceType: "ORDER" } });
        await rebalCust(tx, customer.id);
      }
      return { orderId: order.id, orderNo };
    }

    // SHIPPED
    if (
      spec.finalStatus === "SHIPPED" ||
      spec.finalStatus === "COMPLETED" ||
      spec.finalStatus === "RETURN_REQUESTED" ||
      spec.finalStatus === "RETURN_ACCEPTED" ||
      spec.finalStatus === "RETURNED" ||
      spec.finalStatus === "EXCHANGED"
    ) {
      await tx.order.update({
        where: { id: order.id },
        data: {
          status: "SHIPPED",
          trackingCarrier: spec.trackingCarrier,
          trackingNumber: spec.trackingNumber,
        },
      });
      cur = "SHIPPED";
    }

    if (spec.finalStatus === "SHIPPED") {
      await tx.order.update({ where: { id: order.id }, data: { paymentStatus: spec.paymentStatus } });
      if (spec.paymentStatus === "UNPAID" && customer) {
        const finalTotal = subtotal + tax + (spec.shippingFee ?? 0) - (spec.discount ?? 0);
        await tx.customerLedger.create({ data: { customer: { connect: { id: customer.id } }, date: spec.orderDate, type: "SALE", description: `매출 ${orderNo}`, debitAmount: D(finalTotal), creditAmount: D(0), balance: D(0), referenceId: order.id, referenceType: "ORDER" } });
        await rebalCust(tx, customer.id);
      } else if (spec.paymentStatus === "PAID" && customer) {
        const finalTotal = subtotal + tax + (spec.shippingFee ?? 0) - (spec.discount ?? 0);
        await tx.customerLedger.create({ data: { customer: { connect: { id: customer.id } }, date: spec.orderDate, type: "SALE", description: `매출 ${orderNo}`, debitAmount: D(finalTotal), creditAmount: D(0), balance: D(0), referenceId: order.id, referenceType: "ORDER" } });
        await tx.customerLedger.create({ data: { customer: { connect: { id: customer.id } }, date: spec.orderDate, type: "RECEIPT", description: `결제 ${orderNo}`, debitAmount: D(0), creditAmount: D(finalTotal), balance: D(0), referenceId: order.id, referenceType: "ORDER" } });
        await rebalCust(tx, customer.id);
      }
      return { orderId: order.id, orderNo };
    }

    // COMPLETED 이상
    await tx.order.update({ where: { id: order.id }, data: { status: "COMPLETED" } });
    cur = "COMPLETED";

    // 결제 + ledger 처리 (COMPLETED 이상은 모두 SALE 발생)
    const finalTotal = subtotal + tax + (spec.shippingFee ?? 0) - (spec.discount ?? 0);
    if (customer) {
      await tx.customerLedger.create({ data: { customer: { connect: { id: customer.id } }, date: spec.orderDate, type: "SALE", description: `매출 ${orderNo}`, debitAmount: D(finalTotal), creditAmount: D(0), balance: D(0), referenceId: order.id, referenceType: "ORDER" } });
      if (spec.paymentStatus === "PAID" || spec.paymentStatus === "REFUNDED" || spec.paymentStatus === "PARTIAL_REFUND") {
        await tx.customerLedger.create({ data: { customer: { connect: { id: customer.id } }, date: spec.orderDate, type: "RECEIPT", description: `결제 ${orderNo}`, debitAmount: D(0), creditAmount: D(finalTotal), balance: D(0), referenceId: order.id, referenceType: "ORDER" } });
      }
    }

    if (spec.finalStatus === "COMPLETED") {
      await tx.order.update({ where: { id: order.id }, data: { paymentStatus: spec.paymentStatus } });
      if (customer) await rebalCust(tx, customer.id);
      return { orderId: order.id, orderNo };
    }

    // RETURN_REQUESTED
    await tx.order.update({
      where: { id: order.id },
      data: {
        status: "RETURN_REQUESTED",
        returnRequestedAt: spec.orderDate,
        claimType: spec.claimType,
        claimReason: spec.claimReason,
        returnReason: spec.returnReason,
      },
    });
    cur = "RETURN_REQUESTED";
    if (spec.finalStatus === "RETURN_REQUESTED") {
      await tx.order.update({ where: { id: order.id }, data: { paymentStatus: spec.paymentStatus } });
      if (customer) await rebalCust(tx, customer.id);
      return { orderId: order.id, orderNo };
    }

    // RETURN_ACCEPTED
    await tx.order.update({
      where: { id: order.id },
      data: { status: "RETURN_ACCEPTED", returnAcceptedAt: spec.orderDate },
    });
    cur = "RETURN_ACCEPTED";
    if (spec.finalStatus === "RETURN_ACCEPTED") {
      await tx.order.update({ where: { id: order.id }, data: { paymentStatus: spec.paymentStatus } });
      if (customer) await rebalCust(tx, customer.id);
      return { orderId: order.id, orderNo };
    }

    // RETURNED — 재고 복원 + 환불 ledger
    await restoreStockForOrder(tx, order.id);
    await tx.order.update({
      where: { id: order.id },
      data: { status: "RETURNED" },
    });
    if (customer && (spec.paymentStatus === "REFUNDED" || spec.paymentStatus === "PARTIAL_REFUND")) {
      await tx.customerLedger.create({
        data: {
          customer: { connect: { id: customer.id } },
          date: spec.orderDate,
          type: "REFUND",
          description: `환불 ${orderNo}`,
          debitAmount: D(0),
          creditAmount: D(finalTotal),
          balance: D(0),
          referenceId: order.id,
          referenceType: "ORDER",
        },
      });
    }
    await tx.order.update({ where: { id: order.id }, data: { paymentStatus: spec.paymentStatus } });
    if (customer) await rebalCust(tx, customer.id);

    if (spec.finalStatus === "RETURNED") {
      return { orderId: order.id, orderNo };
    }

    // EXCHANGED — 새 주문 자동 생성
    if (spec.finalStatus === "EXCHANGED") {
      // 다시 재고 차감 (RETURNED 에서 복원했지만 EXCHANGED 로 가니까)
      // 더 명확한 흐름: RETURN_ACCEPTED 까지만 가고 별도 처리
      // 위 RETURNED 단계로 복원했는데, EXCHANGED 시 새 주문이 생기면 새 주문에서 차감.
      // 여기서는 EXCHANGED 표시만.
      const newDate = new Date(spec.orderDate.getTime() + 1000);
      const newOrderNo = `${orderNo}-EX`;
      const newOrder = await tx.order.create({
        data: {
          orderNo: newOrderNo,
          ...(spec.channel ? { channel: { connect: { id: M.channels[spec.channel].id } } } : {}),
          // EXCHANGE_SAME: 항목 복제 + 재고 차감 후 PREPARING
          // EXCHANGE_DIFFERENT: 빈 항목 + 사용자가 항목 추가하기 전 → PENDING
          status: spec.claimType === "EXCHANGE_SAME" ? "PREPARING" : "PENDING",
          fulfillmentType: spec.fulfillment,
          ...(customer ? { customer: { connect: { id: customer.id } } } : {}),
          createdBy: { connect: { id: M.admin.id } },
          customerName: customer?.name,
          customerPhone: customer?.phone,
          recipientName: spec.recipientName ?? customer?.name,
          recipientPhone: spec.recipientPhone ?? customer?.phone,
          shippingAddress: spec.shippingAddress ?? customer?.address,
          orderDate: newDate,
          paymentMethod: spec.paymentMethod ?? "CARD",
          paymentStatus: spec.claimType === "EXCHANGE_SAME" ? "PAID" : "UNPAID",
          subtotalAmount: spec.claimType === "EXCHANGE_SAME" ? D(subtotal) : D(0),
          taxAmount: spec.claimType === "EXCHANGE_SAME" ? D(tax) : D(0),
          totalAmount: spec.claimType === "EXCHANGE_SAME" ? D(finalTotal) : D(0),
          memo: spec.claimType === "EXCHANGE_SAME" ? "교환 — 같은 상품 재발송" : "교환 — 다른 상품 (사용자가 직접 항목 추가)",
        },
      });

      if (spec.claimType === "EXCHANGE_SAME") {
        // 항목 복제 + 재고 차감
        const newItemsForLot: { id: string; productId: string; qty: number; isSet: boolean }[] = [];
        for (const it of spec.items) {
          const product = M.products[it.sku];
          const unitPrice = it.unitPrice ?? Number(product.sellingPrice);
          const tp = unitPrice * it.qty;
          const noi = await tx.orderItem.create({
            data: {
              order: { connect: { id: newOrder.id } },
              product: { connect: { id: product.id } },
              quantity: D(it.qty),
              listPrice: D(it.listPrice ?? unitPrice),
              discountAmount: D(it.discount ?? 0),
              unitPrice: D(unitPrice),
              totalPrice: D(tp),
            },
          });
          newItemsForLot.push({ id: noi.id, productId: product.id, qty: it.qty, isSet: product.isSet });
        }
        await consumeStockForOrder(tx, newOrder.id, newItemsForLot);
      }

      await tx.order.update({
        where: { id: order.id },
        data: { status: "EXCHANGED", exchangedAt: newDate, exchangeOrder: { connect: { id: newOrder.id } } },
      });
    }

    if (customer) await rebalCust(tx, customer.id);
    return { orderId: order.id, orderNo };
  });
}

// CANCELLED 별도 처리 (취소는 결제 상태에 따라 PAID→REFUNDED 자동 전이)
async function createCancelledOrder(spec: OrderSpec): Promise<{ orderId: string; orderNo: string }> {
  // 일단 PREPARING 까지 진행한 뒤 취소 → 재고 복원
  // 또는 PENDING 단계에서 취소 (재고 미차감)
  if (spec.memo?.includes("PENDING") || spec.memo?.includes("미차감")) {
    return prisma.$transaction(async (tx) => {
      const orderNo = genDocNo("ORD", spec.orderDate);
      const customer = spec.customer ? M.customers[spec.customer] : null;
      let subtotal = 0;
      const order = await tx.order.create({
        data: {
          orderNo,
          ...(spec.channel ? { channel: { connect: { id: M.channels[spec.channel].id } } } : {}),
          status: "CANCELLED",
          fulfillmentType: spec.fulfillment,
          ...(customer ? { customer: { connect: { id: customer.id } } } : {}),
          customerName: customer?.name,
          customerPhone: customer?.phone,
          orderDate: spec.orderDate,
          paymentMethod: spec.paymentMethod,
          paymentStatus: "UNPAID",
          subtotalAmount: D(0),
          totalAmount: D(0),
          memo: spec.memo,
          createdBy: { connect: { id: M.admin.id } },
        },
      });
      for (const it of spec.items) {
        const product = M.products[it.sku];
        const unitPrice = it.unitPrice ?? Number(product.sellingPrice);
        subtotal += unitPrice * it.qty;
        await tx.orderItem.create({
          data: {
            order: { connect: { id: order.id } },
            product: { connect: { id: product.id } },
            quantity: D(it.qty),
            unitPrice: D(unitPrice),
            totalPrice: D(unitPrice * it.qty),
          },
        });
      }
      await tx.order.update({
        where: { id: order.id },
        data: { subtotalAmount: D(subtotal), totalAmount: D(subtotal + round(subtotal * 0.1)), taxAmount: D(round(subtotal * 0.1)) },
      });
      return { orderId: order.id, orderNo };
    });
  }
  // PREPARING 후 cancel — 재고 복원 + (PAID 였다면 REFUNDED)
  const r = await createOrder({ ...spec, finalStatus: "PREPARING", paymentStatus: spec.paymentStatus === "REFUNDED" ? "PAID" : spec.paymentStatus });
  await prisma.$transaction(async (tx) => {
    await restoreStockForOrder(tx, r.orderId);
    await tx.order.update({
      where: { id: r.orderId },
      data: { status: "CANCELLED", paymentStatus: spec.paymentStatus },
    });
    const customer = spec.customer ? M.customers[spec.customer] : null;
    if (customer && spec.paymentStatus === "REFUNDED") {
      const order = await tx.order.findUnique({ where: { id: r.orderId } });
      if (order) {
        await tx.customerLedger.create({
          data: {
            customer: { connect: { id: customer.id } },
            date: spec.orderDate,
            type: "REFUND",
            description: `취소 환불 ${order.orderNo}`,
            debitAmount: D(0),
            creditAmount: order.totalAmount,
            balance: D(0),
            referenceId: r.orderId,
            referenceType: "ORDER",
          },
        });
        await rebalCust(tx, customer.id);
      }
    }
  });
  return r;
}

async function seedOrders() {
  log("\n[10/9] Order 시나리오 — 모든 경우의 수...");

  M.orders = [] as { spec: OrderSpec; orderId: string; orderNo: string }[];
  const specs: OrderSpec[] = [
    // === POS PICKUP — 즉시 종결 (5건, 다양한 결제) ===
    {
      scenario: "POS PICKUP / CARD / 개인 / 단품",
      customer: "김민준",
      channel: "OFFLINE",
      fulfillment: "PICKUP",
      orderDate: day(-9),
      finalStatus: "COMPLETED",
      paymentMethod: "CARD",
      paymentStatus: "PAID",
      items: [{ sku: "PRD-DRL-12V", qty: 1 }],
    },
    {
      scenario: "POS PICKUP / CASH / 다품목",
      customer: "이서연",
      channel: "OFFLINE",
      fulfillment: "PICKUP",
      orderDate: day(-8),
      finalStatus: "COMPLETED",
      paymentMethod: "CASH",
      paymentStatus: "PAID",
      items: [
        { sku: "PRD-BIT-32P", qty: 2 },
        { sku: "PRD-DRB-10", qty: 5 },
        { sku: "PRD-WD40-360", qty: 3 },
      ],
    },
    {
      scenario: "POS PICKUP / TRANSFER / 기업 다품목",
      customer: "메이커스랩",
      channel: "OFFLINE",
      fulfillment: "PICKUP",
      orderDate: day(-7),
      finalStatus: "COMPLETED",
      paymentMethod: "TRANSFER",
      paymentStatus: "PAID",
      items: [
        { sku: "PRD-CTY-200", qty: 10 },
        { sku: "PRD-WD40-360", qty: 5 },
        { sku: "PRD-CGL-10", qty: 8 },
        { sku: "PRD-MSK-5", qty: 4 },
      ],
      taxInvoiceRequested: true,
    },
    {
      scenario: "POS PICKUP / MIXED 결제",
      customer: "박지호",
      channel: "OFFLINE",
      fulfillment: "PICKUP",
      orderDate: day(-6),
      finalStatus: "COMPLETED",
      paymentMethod: "MIXED",
      paymentStatus: "PAID",
      items: [
        { sku: "PRD-MON-27-4K", qty: 1 },
        { sku: "PRD-KB-TRIO500", qty: 1 },
        { sku: "PRD-MS-WL", qty: 1 },
      ],
    },
    {
      scenario: "POS PICKUP / 세트상품",
      customer: "최예진",
      channel: "OFFLINE",
      fulfillment: "PICKUP",
      orderDate: day(-5),
      finalStatus: "COMPLETED",
      paymentMethod: "CARD",
      paymentStatus: "PAID",
      items: [{ sku: "PRD-SET-OFFICE", qty: 1 }],
    },

    // === POS DELIVERY — 자체배달 ===
    {
      scenario: "POS DELIVERY / 즉시결제 PAID — 워크보드 PREPARING",
      customer: "정도현",
      channel: "OFFLINE",
      fulfillment: "DELIVERY",
      orderDate: day(-4),
      expectedShipDate: day(0),
      finalStatus: "PREPARING",
      paymentMethod: "CARD",
      paymentStatus: "PAID",
      shippingFee: 5000,
      shippingAddress: "서울 강남구 강남대로 100",
      items: [{ sku: "PRD-VAC-180", qty: 1 }],
    },
    {
      scenario: "POS DELIVERY / 외상 UNPAID",
      customer: "한빛정비",
      fulfillment: "DELIVERY",
      orderDate: day(-3),
      expectedShipDate: day(-1),
      finalStatus: "PREPARING",
      paymentMethod: "UNPAID",
      paymentStatus: "UNPAID",
      shippingFee: 5000,
      items: [
        { sku: "PRD-WD40-360", qty: 10 },
        { sku: "PRD-CGL-10", qty: 15 },
      ],
    },

    // === POS SHIPPING — 택배 ===
    {
      scenario: "쿠팡 SHIPPING / 즉시결제 PAID / SHIPPED 상태",
      customer: "강수아",
      channel: "COUPANG",
      channelOrderNo: "CP-2025-0001",
      fulfillment: "SHIPPING",
      orderDate: day(-12),
      expectedShipDate: day(-10),
      finalStatus: "SHIPPED",
      paymentMethod: "CARD",
      paymentStatus: "PAID",
      shippingFee: 3000,
      trackingCarrier: "CJ대한통운",
      trackingNumber: "1234567890",
      shippingAddress: "경기 성남시 분당구 정자동 11",
      items: [{ sku: "PRD-IMP-18V", qty: 1 }],
    },
    {
      scenario: "네이버 SHIPPING / 외상 UNPAID / SHIPPED",
      customer: "조하늘",
      channel: "NAVER",
      channelOrderNo: "NV-2025-0042",
      fulfillment: "SHIPPING",
      orderDate: day(-10),
      finalStatus: "SHIPPED",
      paymentMethod: "UNPAID",
      paymentStatus: "UNPAID",
      shippingFee: 3000,
      trackingCarrier: "한진택배",
      trackingNumber: "9876543210",
      shippingAddress: "서울 송파구 잠실로 50",
      items: [{ sku: "PRD-DRL-12V", qty: 1 }, { sku: "PRD-BIT-32P", qty: 1 }],
    },
    {
      scenario: "자사몰 SHIPPING / COMPLETED / 다품목",
      customer: "윤재민",
      channel: "OWN",
      fulfillment: "SHIPPING",
      orderDate: day(-15),
      finalStatus: "COMPLETED",
      paymentMethod: "CARD",
      paymentStatus: "PAID",
      shippingFee: 3000,
      trackingCarrier: "롯데택배",
      trackingNumber: "1111222233",
      items: [
        { sku: "PRD-NB-PRO16", qty: 1 },
        { sku: "PRD-MS-WL", qty: 1 },
      ],
    },

    // === B2B 수동 PENDING — 외상 ===
    {
      scenario: "B2B PENDING / 외상 / DELIVERY",
      customer: "동방건설(주)",
      fulfillment: "DELIVERY",
      orderDate: day(-2),
      expectedShipDate: day(2),
      finalStatus: "PENDING",
      paymentMethod: "UNPAID",
      paymentStatus: "UNPAID",
      shippingFee: 10000,
      items: [
        { sku: "PRD-COMBO-283", qty: 2 },
        { sku: "PRD-LZR-50", qty: 2 },
      ],
      taxInvoiceRequested: true,
    },
    {
      scenario: "B2B PENDING / 외상 / SHIPPING (지연 D-2)",
      customer: "스마트팩토리(주)",
      fulfillment: "SHIPPING",
      orderDate: day(-3),
      expectedShipDate: day(-2),
      finalStatus: "PENDING",
      paymentMethod: "UNPAID",
      paymentStatus: "UNPAID",
      shippingFee: 10000,
      items: [
        { sku: "PRD-DTQ-DIG", qty: 1 },
        { sku: "PRD-FLK-MM-87V", qty: 1 },
      ],
      memo: "출고 예정일 지났음 — 워크보드 지연 카드 검증",
    },
    {
      scenario: "B2B PENDING / SHIPPING / 오늘 출고",
      customer: "(주)테크월드",
      fulfillment: "SHIPPING",
      orderDate: day(-1),
      expectedShipDate: day(0),
      finalStatus: "PENDING",
      paymentMethod: "UNPAID",
      paymentStatus: "UNPAID",
      shippingFee: 5000,
      items: [
        { sku: "PRD-SSD-1TB-980P", qty: 5 },
        { sku: "PRD-EXT-4TB-T7", qty: 3 },
      ],
    },

    // === PREPARING 추가 케이스 ===
    {
      scenario: "쿠팡 PREPARING / 오늘 출고 예정",
      customer: "임채원",
      channel: "COUPANG",
      channelOrderNo: "CP-2025-0055",
      fulfillment: "SHIPPING",
      orderDate: day(-1),
      expectedShipDate: day(0),
      finalStatus: "PREPARING",
      paymentMethod: "CARD",
      paymentStatus: "PAID",
      shippingFee: 3000,
      items: [{ sku: "PRD-MON-27-4K", qty: 1 }],
    },
    {
      scenario: "네이버 PREPARING / 이번주 출고 예정",
      customer: "한수빈",
      channel: "NAVER",
      channelOrderNo: "NV-2025-0066",
      fulfillment: "SHIPPING",
      orderDate: day(-1),
      expectedShipDate: day(3),
      finalStatus: "PREPARING",
      paymentMethod: "TRANSFER",
      paymentStatus: "PAID",
      shippingFee: 3000,
      items: [{ sku: "PRD-CRC-5604", qty: 1 }, { sku: "PRD-HEX-100P", qty: 1 }],
    },

    // === COMPLETED 추가 (마진 리포트용) ===
    {
      scenario: "오프라인 COMPLETED / 다일자 / 다품목 (마진 리포트)",
      customer: "오민서",
      channel: "OFFLINE",
      fulfillment: "PICKUP",
      orderDate: day(-20),
      finalStatus: "COMPLETED",
      paymentMethod: "CARD",
      paymentStatus: "PAID",
      items: [
        { sku: "PRD-TW-001", qty: 1 },
        { sku: "PRD-DF-333", qty: 2 },
      ],
    },
    {
      scenario: "쿠팡 COMPLETED — 채널 수수료 검증용",
      customer: "신유나",
      channel: "COUPANG",
      channelOrderNo: "CP-2025-0070",
      fulfillment: "SHIPPING",
      orderDate: day(-22),
      finalStatus: "COMPLETED",
      paymentMethod: "CARD",
      paymentStatus: "PAID",
      shippingFee: 3000,
      trackingCarrier: "CJ대한통운",
      trackingNumber: "5555666677",
      items: [{ sku: "PRD-GRD-405", qty: 1 }],
    },
    {
      scenario: "네이버 COMPLETED — 채널 수수료 검증용",
      customer: "황지안",
      channel: "NAVER",
      channelOrderNo: "NV-2025-0080",
      fulfillment: "SHIPPING",
      orderDate: day(-23),
      finalStatus: "COMPLETED",
      paymentMethod: "TRANSFER",
      paymentStatus: "PAID",
      items: [{ sku: "PRD-IMP-887", qty: 1 }],
    },

    // === CANCELLED ===
    {
      scenario: "PENDING 단계 취소 — 재고 미차감",
      customer: "안준호",
      fulfillment: "SHIPPING",
      orderDate: day(-7),
      finalStatus: "CANCELLED",
      paymentMethod: "UNPAID",
      paymentStatus: "UNPAID",
      memo: "PENDING 단계 — 재고 미차감",
      items: [{ sku: "PRD-BEAM-PF50", qty: 1 }],
    },
    {
      scenario: "PREPARING 후 취소 — 재고 복원 + REFUNDED",
      customer: "송하준",
      fulfillment: "SHIPPING",
      orderDate: day(-6),
      finalStatus: "CANCELLED",
      paymentMethod: "CARD",
      paymentStatus: "REFUNDED",
      items: [{ sku: "PRD-MON-32-UG", qty: 1 }],
    },
    {
      scenario: "PREPARING 후 취소 / DELIVERY",
      customer: "유서윤",
      fulfillment: "DELIVERY",
      orderDate: day(-5),
      finalStatus: "CANCELLED",
      paymentMethod: "CARD",
      paymentStatus: "REFUNDED",
      shippingFee: 5000,
      items: [{ sku: "PRD-TONE-FP", qty: 1 }],
    },

    // === RETURN_REQUESTED ===
    {
      scenario: "RETURN_REQUESTED / 불량 / 회수 대기 결정",
      customer: "장태경",
      channel: "OFFLINE",
      fulfillment: "PICKUP",
      orderDate: day(-14),
      finalStatus: "RETURN_REQUESTED",
      paymentMethod: "CARD",
      paymentStatus: "PAID",
      claimType: "REFUND",
      claimReason: "DEFECTIVE",
      returnReason: "전원이 들어오지 않습니다",
      items: [{ sku: "PRD-DRL-12V", qty: 1 }],
    },
    {
      scenario: "RETURN_REQUESTED / 단순변심 / 결정 대기",
      customer: "권다은",
      channel: "OWN",
      fulfillment: "SHIPPING",
      orderDate: day(-16),
      finalStatus: "RETURN_REQUESTED",
      paymentMethod: "CARD",
      paymentStatus: "PAID",
      claimType: "REFUND",
      claimReason: "CHANGE_MIND",
      returnReason: "사용해보니 마음에 들지 않아요",
      items: [{ sku: "PRD-TONE-FP", qty: 1 }],
    },

    // === RETURN_ACCEPTED (회수 대기) ===
    {
      scenario: "RETURN_ACCEPTED / 회수 진행 중 / 손님이 어떤 처리(환불/교환) 결정 대기",
      customer: "김민준",
      channel: "OFFLINE",
      fulfillment: "DELIVERY",
      orderDate: day(-13),
      finalStatus: "RETURN_ACCEPTED",
      paymentMethod: "CARD",
      paymentStatus: "PAID",
      claimType: "EXCHANGE_DIFFERENT",
      claimReason: "SIZE_COLOR",
      returnReason: "다른 모델로 교환 희망",
      items: [{ sku: "PRD-VAC-180", qty: 1 }],
    },

    // === RETURNED (3단계 환불) ===
    {
      scenario: "3단계 RETURNED / 택배 회수 / 불량 환불 종결",
      customer: "이서연",
      channel: "OWN",
      fulfillment: "SHIPPING",
      orderDate: day(-21),
      finalStatus: "RETURNED",
      paymentMethod: "CARD",
      paymentStatus: "REFUNDED",
      claimType: "REFUND",
      claimReason: "DEFECTIVE",
      returnReason: "초기 불량",
      shippingFee: 3000,
      items: [{ sku: "PRD-GRD-750", qty: 1 }],
    },
    {
      scenario: "3단계 RETURNED / 단순 변심",
      customer: "박지호",
      channel: "COUPANG",
      channelOrderNo: "CP-2025-0090",
      fulfillment: "SHIPPING",
      orderDate: day(-25),
      finalStatus: "RETURNED",
      paymentMethod: "CARD",
      paymentStatus: "REFUNDED",
      claimType: "REFUND",
      claimReason: "CHANGE_MIND",
      shippingFee: 3000,
      items: [{ sku: "PRD-MON-27-4K", qty: 1 }],
    },

    // === RETURNED 1단계 (매장 즉시) ===
    {
      scenario: "1단계 매장 즉시 RETURNED — 손님이 바로 가져옴",
      customer: "최예진",
      channel: "OFFLINE",
      fulfillment: "PICKUP",
      orderDate: day(-11),
      finalStatus: "RETURNED",
      paymentMethod: "CASH",
      paymentStatus: "REFUNDED",
      claimType: "REFUND",
      claimReason: "WRONG_ITEM",
      returnReason: "잘못된 품목 받음",
      items: [{ sku: "PRD-BIT-32P", qty: 1 }],
    },

    // === EXCHANGED SAME ===
    {
      scenario: "EXCHANGED SAME / 같은 상품 재발송 (새 주문 -EX 자동 생성)",
      customer: "정도현",
      channel: "OWN",
      fulfillment: "SHIPPING",
      orderDate: day(-19),
      finalStatus: "EXCHANGED",
      paymentMethod: "CARD",
      paymentStatus: "PAID",
      claimType: "EXCHANGE_SAME",
      claimReason: "DAMAGED_IN_TRANSIT",
      returnReason: "배송 중 파손",
      shippingFee: 3000,
      items: [{ sku: "PRD-IMP-18V", qty: 1 }],
    },
    {
      scenario: "EXCHANGED SAME / DELIVERY",
      customer: "강수아",
      channel: "OFFLINE",
      fulfillment: "DELIVERY",
      orderDate: day(-17),
      finalStatus: "EXCHANGED",
      paymentMethod: "CARD",
      paymentStatus: "PAID",
      claimType: "EXCHANGE_SAME",
      claimReason: "DEFECTIVE",
      returnReason: "초기 불량 — 같은 모델로",
      items: [{ sku: "PRD-LZR-50", qty: 1 }],
    },

    // === EXCHANGED DIFFERENT ===
    {
      scenario: "EXCHANGED DIFFERENT / 빈 새 주문 (사용자가 다른 상품 추가) / 차액 정산",
      customer: "(주)디자인스튜디오",
      channel: "OWN",
      fulfillment: "SHIPPING",
      orderDate: day(-18),
      finalStatus: "EXCHANGED",
      paymentMethod: "CARD",
      paymentStatus: "PAID",
      claimType: "EXCHANGE_DIFFERENT",
      claimReason: "SIZE_COLOR",
      returnReason: "다른 모델로 교환",
      shippingFee: 3000,
      items: [{ sku: "PRD-MON-27-4K", qty: 1 }],
    },

    // === 신규 상품 판매 케이스 (변형/오일/호스/조립 PC) ===
    {
      scenario: "변형상품 — 안전화 250mm 판매",
      customer: "안준호",
      channel: "OFFLINE",
      fulfillment: "PICKUP",
      orderDate: day(-2),
      finalStatus: "COMPLETED",
      paymentMethod: "CARD",
      paymentStatus: "PAID",
      items: [{ sku: "PRD-SHO-250", qty: 1 }],
    },
    {
      scenario: "변형상품 — 안전화 290mm 판매",
      customer: "동방건설(주)",
      channel: "OFFLINE",
      fulfillment: "DELIVERY",
      orderDate: day(-3),
      expectedShipDate: day(-1),
      finalStatus: "PREPARING",
      paymentMethod: "TRANSFER",
      paymentStatus: "PAID",
      shippingFee: 5000,
      items: [{ sku: "PRD-SHO-290", qty: 3 }],
      taxInvoiceRequested: true,
    },
    {
      scenario: "오일 4L 병 판매 (벌크 분할 가능 SKU)",
      customer: "한빛정비",
      fulfillment: "PICKUP",
      orderDate: day(-1),
      finalStatus: "COMPLETED",
      paymentMethod: "CARD",
      paymentStatus: "PAID",
      items: [{ sku: "PRD-OIL-4L", qty: 2 }],
    },
    {
      scenario: "호스 8mm 미터 단위 판매",
      customer: "스마트팩토리(주)",
      channel: "OFFLINE",
      fulfillment: "DELIVERY",
      orderDate: day(-1),
      expectedShipDate: day(0),
      finalStatus: "PREPARING",
      paymentMethod: "TRANSFER",
      paymentStatus: "PAID",
      shippingFee: 8000,
      items: [{ sku: "PRD-HOSE-8MM", qty: 25 }],
    },
    {
      scenario: "조립 PC 판매 (조립 후 출고)",
      customer: "(주)테크월드",
      channel: "OFFLINE",
      fulfillment: "DELIVERY",
      orderDate: day(-2),
      expectedShipDate: day(0),
      finalStatus: "COMPLETED",
      paymentMethod: "CARD",
      paymentStatus: "PAID",
      shippingFee: 30000,
      items: [{ sku: "PRD-PC-ASSEMBLED", qty: 1 }],
      taxInvoiceRequested: true,
    },
  ];

  for (const [idx, s] of specs.entries()) {
    process.stdout.write(`     [${idx + 1}/${specs.length}] ${s.scenario.slice(0, 40)}... `);
    const t0 = Date.now();
    let r;
    if (s.finalStatus === "CANCELLED") {
      r = await createCancelledOrder(s);
    } else {
      r = await createOrder(s);
    }
    process.stdout.write(`${r.orderNo} (${Date.now() - t0}ms)\n`);
    M.orders.push({ spec: s, orderId: r.orderId, orderNo: r.orderNo });
    guide.orders.push({
      주문번호: r.orderNo,
      "고객·채널": `${s.customer ?? "-"} / ${s.channel ?? "직접"}`,
      "fulfillment": s.fulfillment,
      "출고상태": s.finalStatus,
      "결제상태": s.paymentStatus,
      "결제수단": s.paymentMethod ?? "-",
      "claim": s.claimType ?? "-",
      "사유": s.claimReason ?? "-",
      "품목": s.items.map((i) => `${i.sku}×${i.qty}`).join(", "),
      "시나리오": s.scenario,
    });
  }

  log(`   ✓ Order ${M.orders.length}건`);
}

// ============================================================
// Repair 시나리오 (10건, 모든 status 단계)
// ============================================================

type RepairSpec = {
  scenario: string;
  type: "ON_SITE" | "DROP_OFF";
  customer?: string;
  status: "RECEIVED" | "DIAGNOSING" | "QUOTED" | "APPROVED" | "REPAIRING" | "READY" | "PICKED_UP" | "CANCELLED";
  receivedAt: Date;
  symptom: string;
  diagnosis?: string;
  diagnosisFee?: number;
  parts?: { sku: string; qty: number; unitPrice: number }[];
  labors?: { name: string; hours?: number; unitRate: number }[];
  cancelReason?: "CUSTOMER_DECLINED" | "CUSTOMER_NO_SHOW" | "SHOP_GAVE_UP" | "PARTS_UNAVAILABLE" | "SOLD_AS_PRODUCT" | "MISTAKE" | "OTHER";
  warrantyMonths?: number;
  paymentMethod?: "CASH" | "CARD" | "TRANSFER" | "MIXED";
  isRevisit?: boolean;
  approvalMethod?: "ON_SITE" | "REMOTE";
};

async function createRepair(spec: RepairSpec, parentTicketId?: string): Promise<any> {
  const ticketNo = genDocNo("R", spec.receivedAt);
  return prisma.$transaction(async (tx) => {
    const customer = spec.customer ? M.customers[spec.customer] : null;
    const ticket = await tx.repairTicket.create({
      data: {
        ticketNo,
        type: spec.type,
        ...(customer ? { customer: { connect: { id: customer.id } } } : {}),
        status: spec.status,
        receivedAt: spec.receivedAt,
        symptom: spec.symptom,
        diagnosis: spec.diagnosis,
        diagnosisFee: D(spec.diagnosisFee ?? 0),
        approvalMethod: spec.approvalMethod,
        approvedAt: ["APPROVED", "REPAIRING", "READY", "PICKED_UP"].includes(spec.status) ? spec.receivedAt : null,
        startedAt: ["REPAIRING", "READY", "PICKED_UP"].includes(spec.status) ? spec.receivedAt : null,
        readyAt: ["READY", "PICKED_UP"].includes(spec.status) ? spec.receivedAt : null,
        pickedUpAt: spec.status === "PICKED_UP" ? spec.receivedAt : null,
        repairWarrantyMonths: spec.warrantyMonths,
        repairWarrantyEnds: spec.warrantyMonths
          ? new Date(spec.receivedAt.getTime() + spec.warrantyMonths * 30 * 24 * 60 * 60 * 1000)
          : null,
        cancelReason: spec.cancelReason,
        cancelledAt: spec.status === "CANCELLED" ? spec.receivedAt : null,
        ...(parentTicketId ? { parentRepairTicket: { connect: { id: parentTicketId } } } : {}),
        createdBy: { connect: { id: M.admin.id } },
        paymentMethod: spec.paymentMethod,
        finalAmount: D(0),
        quotedLaborAmount: D(0),
        quotedPartsAmount: D(0),
        quotedTotalAmount: D(0),
      },
    });

    let partsTotal = 0;
    let laborTotal = 0;

    // 부속 — 재고 차감 (REPAIRING/READY/PICKED_UP 단계만)
    const consumeStock = ["REPAIRING", "READY", "PICKED_UP"].includes(spec.status);
    for (const p of spec.parts ?? []) {
      const product = M.products[p.sku];
      const total = p.unitPrice * p.qty;
      partsTotal += total;
      const part = await tx.repairPart.create({
        data: {
          repairTicket: { connect: { id: ticket.id } },
          product: { connect: { id: product.id } },
          quantity: D(p.qty),
          unitPrice: D(p.unitPrice),
          totalPrice: D(total),
          consumedAt: consumeStock ? spec.receivedAt : null,
        },
      });
      if (consumeStock) {
        const lots = await tx.inventoryLot.findMany({
          where: { productId: product.id, remainingQty: { gt: 0 } },
          orderBy: { receivedAt: "asc" },
        });
        let need = p.qty;
        let cost = 0;
        for (const lot of lots) {
          if (need <= 0) break;
          const take = Math.min(need, Number(lot.remainingQty));
          await tx.inventoryLot.update({ where: { id: lot.id }, data: { remainingQty: { decrement: take } } });
          await tx.lotConsumption.create({ data: { repairPart: { connect: { id: part.id } }, lot: { connect: { id: lot.id } }, quantity: D(take), unitCost: D(Number(lot.unitCost)) } });
          cost += take * Number(lot.unitCost);
          need -= take;
        }
        const inv = await tx.inventory.update({
          where: { productId: product.id },
          data: { quantity: { decrement: D(p.qty) } },
          select: { id: true, quantity: true },
        });
        await tx.inventoryMovement.create({
          data: {
            inventory: { connect: { id: inv.id } },
            type: "INTERNAL_USE",
            usageReason: "SELF_USE",
            quantity: D(-p.qty),
            balanceAfter: inv.quantity,
            referenceId: ticket.id,
            referenceType: "REPAIR",
            memo: "수리 부속 사용",
          },
        });
        await tx.repairPart.update({
          where: { id: part.id },
          data: { unitCostSnapshot: D(cost / p.qty) },
        });
      }
    }

    for (const l of spec.labors ?? []) {
      const total = (l.hours ?? 1) * l.unitRate;
      laborTotal += total;
      await tx.repairLabor.create({
        data: {
          repairTicket: { connect: { id: ticket.id } },
          name: l.name,
          hours: D(l.hours ?? 1),
          unitRate: D(l.unitRate),
          totalPrice: D(total),
        },
      });
    }

    const finalAmount = partsTotal + laborTotal + (spec.diagnosisFee ?? 0);
    const updated = await tx.repairTicket.update({
      where: { id: ticket.id },
      data: {
        quotedPartsAmount: D(partsTotal),
        quotedLaborAmount: D(laborTotal),
        quotedTotalAmount: D(finalAmount),
        finalAmount: D(finalAmount),
      },
    });

    // PICKED_UP — 결제 Order 생성 (1:1)
    if (spec.status === "PICKED_UP" && customer) {
      const orderNo = genDocNo("ORD", spec.receivedAt);
      await tx.order.create({
        data: {
          orderNo,
          channel: { connect: { id: M.channels["OFFLINE"].id } },
          status: "COMPLETED",
          fulfillmentType: "PICKUP",
          customer: { connect: { id: customer.id } },
          customerName: customer.name,
          customerPhone: customer.phone,
          orderDate: spec.receivedAt,
          paymentMethod: spec.paymentMethod ?? "CARD",
          paymentStatus: "PAID",
          subtotalAmount: D(finalAmount),
          taxAmount: D(0),
          totalAmount: D(finalAmount),
          repairTicket: { connect: { id: ticket.id } },
          memo: `수리 ${ticketNo} 결제`,
          createdBy: { connect: { id: M.admin.id } },
        },
      });
      await tx.customerLedger.create({ data: { customer: { connect: { id: customer.id } }, date: spec.receivedAt, type: "SALE", description: `수리 매출 ${ticketNo}`, debitAmount: D(finalAmount), creditAmount: D(0), balance: D(0), referenceId: ticket.id, referenceType: "REPAIR" } });
      await tx.customerLedger.create({ data: { customer: { connect: { id: customer.id } }, date: spec.receivedAt, type: "RECEIPT", description: `수리 결제 ${ticketNo}`, debitAmount: D(0), creditAmount: D(finalAmount), balance: D(0), referenceId: ticket.id, referenceType: "REPAIR" } });
      await rebalCust(tx, customer.id);
    }

    return updated;
  });
}

async function seedRepairs() {
  log("\n[11/9] Repair 10건...");
  M.repairs = [] as any[];

  const specs: RepairSpec[] = [
    {
      scenario: "ON_SITE / 즉시수리 PICKED_UP — 보증 6개월",
      type: "ON_SITE",
      customer: "김민준",
      status: "PICKED_UP",
      receivedAt: day(-2),
      symptom: "드릴 베어링 마모",
      diagnosis: "베어링 교체 필요",
      diagnosisFee: 0,
      parts: [{ sku: "PRD-PARTS-CHK", qty: 1, unitPrice: 30000 }],
      labors: [{ name: "분해 점검", unitRate: 50000 }],
      warrantyMonths: 6,
      paymentMethod: "CARD",
      approvalMethod: "ON_SITE",
    },
    {
      scenario: "DROP_OFF / RECEIVED — 막 받은 상태",
      type: "DROP_OFF",
      customer: "이서연",
      status: "RECEIVED",
      receivedAt: day(-1),
      symptom: "전원이 들어오지 않음, 충전도 안됨",
    },
    {
      scenario: "DROP_OFF / DIAGNOSING — 진단 중",
      type: "DROP_OFF",
      customer: "박지호",
      status: "DIAGNOSING",
      receivedAt: day(-2),
      symptom: "사용 중 갑자기 멈춤, 발열 심함",
    },
    {
      scenario: "DROP_OFF / QUOTED — 견적 안내, 손님 응답 대기",
      type: "DROP_OFF",
      customer: "최예진",
      status: "QUOTED",
      receivedAt: day(-3),
      symptom: "그라인더 모터 소음",
      diagnosis: "모터 브러시 마모 + 회로보드 일부 손상",
      diagnosisFee: 30000,
      parts: [
        { sku: "PRD-PARTS-BRS", qty: 1, unitPrice: 10000 },
        { sku: "PRD-PARTS-PCB", qty: 1, unitPrice: 78000 },
      ],
      labors: [{ name: "회로 보드 교체", unitRate: 80000 }],
      approvalMethod: "REMOTE",
    },
    {
      scenario: "DROP_OFF / APPROVED — 손님 승인, 작업 대기",
      type: "DROP_OFF",
      customer: "정도현",
      status: "APPROVED",
      receivedAt: day(-2),
      symptom: "토크 측정기 영점 안 잡힘",
      diagnosis: "센서 보정 필요",
      diagnosisFee: 30000,
      labors: [{ name: "기본 점검", unitRate: 30000 }],
      approvalMethod: "REMOTE",
    },
    {
      scenario: "DROP_OFF / REPAIRING — 작업 중 (재고 차감 진행)",
      type: "DROP_OFF",
      customer: "강수아",
      status: "REPAIRING",
      receivedAt: day(-1),
      symptom: "임팩트 토크 약함",
      diagnosis: "토크 클러치 교체",
      parts: [{ sku: "PRD-PARTS-CLT", qty: 1, unitPrice: 25000 }],
      labors: [{ name: "분해 점검", unitRate: 50000 }],
      diagnosisFee: 30000,
    },
    {
      scenario: "DROP_OFF / READY — 픽업 대기 중",
      type: "DROP_OFF",
      customer: "조하늘",
      status: "READY",
      receivedAt: day(-1),
      symptom: "충전 안됨",
      diagnosis: "회로보드 고장",
      parts: [{ sku: "PRD-PARTS-PCB", qty: 1, unitPrice: 78000 }],
      labors: [{ name: "회로 보드 교체", unitRate: 80000 }],
      diagnosisFee: 30000,
    },
    {
      scenario: "ON_SITE / PICKED_UP — 즉시수리 + 결제 완료",
      type: "ON_SITE",
      customer: "윤재민",
      status: "PICKED_UP",
      receivedAt: day(-4),
      symptom: "비트 분실 — 표준비트로 교체",
      parts: [{ sku: "PRD-BIT-32P", qty: 1, unitPrice: 24000 }],
      labors: [{ name: "기본 청소", unitRate: 20000 }],
      paymentMethod: "CASH",
      approvalMethod: "ON_SITE",
    },
    {
      scenario: "DROP_OFF / CANCELLED — 손님 거절",
      type: "DROP_OFF",
      customer: "임채원",
      status: "CANCELLED",
      receivedAt: day(-5),
      symptom: "회로보드 고장",
      diagnosis: "수리비가 신품가의 70% 초과",
      diagnosisFee: 30000,
      cancelReason: "CUSTOMER_DECLINED",
    },
    // 재수리 (보증 내) — 위 첫 번째 ticket 의 자식
    {
      scenario: "재수리 / 보증 내 같은 증상 재입고",
      type: "DROP_OFF",
      customer: "김민준",
      status: "READY",
      receivedAt: day(0),
      symptom: "베어링 다시 마모됨 — 보증 재수리",
      diagnosis: "베어링 재교체",
      parts: [{ sku: "PRD-PARTS-CHK", qty: 1, unitPrice: 0 }],
      labors: [{ name: "분해 점검", unitRate: 0 }],
      isRevisit: true,
    },
  ];

  let firstTicket: any = null;
  for (const s of specs) {
    const t = await createRepair(s, s.isRevisit ? firstTicket?.id : undefined);
    if (!firstTicket) firstTicket = t;
    M.repairs.push(t);
    guide.repairs.push({
      티켓번호: t.ticketNo,
      type: s.type,
      상태: s.status,
      고객: s.customer ?? "-",
      증상: s.symptom,
      "총금액": Number(t.finalAmount).toLocaleString("ko-KR") + "원",
      시나리오: s.scenario,
    });
  }
  log(`   ✓ Repair ${M.repairs.length}건`);
}

// ============================================================
// Rental
// ============================================================

async function seedRentals() {
  log("\n[12/9] Rental 자산 8 + 계약 6...");
  M.assets = [] as any[];
  M.rentals = [] as any[];

  const assetSpecs = [
    { assetNo: "ASSET-001", name: "마끼다 발전기 EG2500", brand: "마끼다", dailyRate: 35000, monthlyRate: 600000, depositAmount: 100000 },
    { assetNo: "ASSET-002", name: "보쉬 콘크리트 진동기", brand: "보쉬", dailyRate: 25000, monthlyRate: 450000, depositAmount: 80000 },
    { assetNo: "ASSET-003", name: "디월트 회전식 절단기", brand: "디월트", dailyRate: 30000, monthlyRate: 520000, depositAmount: 100000 },
    { assetNo: "ASSET-004", name: "히로 콤프레서 30L", dailyRate: 22000, monthlyRate: 380000, depositAmount: 70000 },
    { assetNo: "ASSET-005", name: "휴대용 용접기 200A", dailyRate: 28000, monthlyRate: 480000, depositAmount: 90000 },
    { assetNo: "ASSET-006", name: "고압 세척기 1500W", dailyRate: 18000, monthlyRate: 320000, depositAmount: 60000 },
    { assetNo: "ASSET-007", name: "전동 호이스트 1톤", dailyRate: 45000, monthlyRate: 780000, depositAmount: 150000 },
    { assetNo: "ASSET-008", name: "이동식 작업등 LED", dailyRate: 8000, monthlyRate: 140000, depositAmount: 30000 },
  ];

  for (const a of assetSpecs) {
    const created = await prisma.rentalAsset.create({
      data: {
        assetNo: a.assetNo,
        name: a.name,
        brand: a.brand,
        dailyRate: D(a.dailyRate),
        monthlyRate: D(a.monthlyRate),
        depositAmount: D(a.depositAmount),
        status: "AVAILABLE",
        acquiredAt: day(-90),
      },
    });
    M.assets.push(created);
  }

  // Rental 시나리오 — RESERVED / ACTIVE / RETURNED / OVERDUE / CANCELLED
  const rentSpecs = [
    {
      assetIdx: 0,
      customer: "동방건설(주)",
      status: "RESERVED" as const,
      startDate: day(2),
      endDate: day(9),
      rateType: "DAILY" as const,
      scenario: "예약 — 다음주부터 7일 임대 예약",
    },
    {
      assetIdx: 1,
      customer: "스마트팩토리(주)",
      status: "ACTIVE" as const,
      startDate: day(-3),
      endDate: day(4),
      rateType: "DAILY" as const,
      scenario: "임대 중 — 진행 중",
    },
    {
      assetIdx: 2,
      customer: "한빛정비",
      status: "ACTIVE" as const,
      startDate: day(-15),
      endDate: day(15),
      rateType: "MONTHLY" as const,
      scenario: "월 단위 임대 진행 중",
    },
    {
      assetIdx: 3,
      customer: "메이커스랩",
      status: "RETURNED" as const,
      startDate: day(-20),
      endDate: day(-13),
      rateType: "DAILY" as const,
      scenario: "정상 반납 종결",
    },
    {
      assetIdx: 4,
      customer: "(주)테크월드",
      status: "OVERDUE" as const,
      startDate: day(-10),
      endDate: day(-3),
      rateType: "DAILY" as const,
      scenario: "연체 — 반환일 3일 지남",
    },
    {
      assetIdx: 5,
      customer: "한빛정비",
      status: "CANCELLED" as const,
      startDate: day(-5),
      endDate: day(2),
      rateType: "DAILY" as const,
      scenario: "예약 취소",
    },
  ];

  for (const r of rentSpecs) {
    const asset = M.assets[r.assetIdx];
    const customer = M.customers[r.customer];
    const totalUnits = Math.ceil((r.endDate.getTime() - r.startDate.getTime()) / (1000 * 60 * 60 * 24));
    const unitRate = r.rateType === "DAILY" ? Number(asset.dailyRate) : Number(asset.monthlyRate);
    const months = r.rateType === "MONTHLY" ? Math.max(1, Math.ceil(totalUnits / 30)) : 1;
    const units = r.rateType === "DAILY" ? totalUnits : months;
    const rentalAmount = unitRate * units;
    const depositAmount = Number(asset.depositAmount);

    const overdue = r.status === "OVERDUE" ? unitRate * 3 : 0;
    const finalAmount = rentalAmount + overdue;

    const rentalNo = genDocNo("RNT", r.startDate);
    const rental = await prisma.rental.create({
      data: {
        rentalNo,
        asset: { connect: { id: asset.id } },
        customer: { connect: { id: customer.id } },
        status: r.status,
        startDate: r.startDate,
        endDate: r.endDate,
        actualReturnedAt: r.status === "RETURNED" ? r.endDate : null,
        rateType: r.rateType,
        unitRate: D(unitRate),
        totalUnits: units,
        rentalAmount: D(rentalAmount),
        depositAmount: D(depositAmount),
        depositReturned: r.status === "RETURNED",
        overdueAmount: D(overdue),
        finalAmount: D(finalAmount),
        paymentMethod: r.status === "ACTIVE" || r.status === "RETURNED" ? "CARD" : null,
        checkoutAt: r.status === "ACTIVE" || r.status === "RETURNED" ? r.startDate : null,
        createdBy: { connect: { id: M.admin.id } },
      },
    });
    if (r.status === "ACTIVE" || r.status === "OVERDUE") {
      await prisma.rentalAsset.update({ where: { id: asset.id }, data: { status: "RENTED" } });
    }
    M.rentals.push(rental);
    guide.rentals.push({
      임대번호: rental.rentalNo,
      자산: asset.name,
      고객: r.customer,
      상태: r.status,
      "기간": `${r.startDate.toISOString().slice(0, 10)} ~ ${r.endDate.toISOString().slice(0, 10)}`,
      금액: finalAmount.toLocaleString("ko-KR") + "원",
      시나리오: r.scenario,
    });
  }
  log(`   ✓ RentalAsset ${M.assets.length} / Rental ${M.rentals.length}`);
}

// ============================================================
// SerialItem 일부 + Customer Payments + Supplier Payments + Expenses
// ============================================================

async function seedExpensesAndPayments() {
  log("\n[13/9] SerialItem + Payments + Expenses...");

  // SerialItem — 모든 trackable 상품 판매분 (COMPLETED/SHIPPED/PREPARING)
  // 라인 1개당 시리얼 1개 (수량 1만 발번해도 검증용으로 충분)
  const eligibleStatuses = ["COMPLETED", "SHIPPED", "PREPARING"];
  for (const o of M.orders) {
    if (!eligibleStatuses.includes(o.spec.finalStatus)) continue;
    const orderItems = await prisma.orderItem.findMany({ where: { orderId: o.orderId } });
    for (const oi of orderItems) {
      if (!oi.productId) continue;
      const product = await prisma.product.findUnique({ where: { id: oi.productId } });
      if (!product?.trackable) continue;
      const yy = String(o.spec.orderDate.getFullYear() % 100).padStart(2, "0");
      const mm = String(o.spec.orderDate.getMonth() + 1).padStart(2, "0");
      const dd = String(o.spec.orderDate.getDate()).padStart(2, "0");
      const prefix = `${yy}${mm}${dd}`;
      const cnt = await prisma.serialItem.count({ where: { code: { startsWith: `${prefix}-` } } });
      const code = `${prefix}-${String(cnt + 1).padStart(4, "0")}`;
      const customer = o.spec.customer ? M.customers[o.spec.customer] : null;
      const created = await prisma.serialItem.create({
        data: {
          code,
          product: { connect: { id: product.id } },
          source: "SALE",
          orderItem: { connect: { id: oi.id } },
          ...(customer ? { customer: { connect: { id: customer.id } } } : {}),
          soldAt: o.spec.orderDate,
          warrantyEnds: product.warrantyMonths
            ? new Date(o.spec.orderDate.getTime() + product.warrantyMonths * 30 * 24 * 60 * 60 * 1000)
            : null,
          status: "ACTIVE",
        },
      });
      guide.serials.push({
        코드: code,
        상품: product.name,
        고객: o.spec.customer ?? "-",
        주문: o.orderNo,
        보증종료: created.warrantyEnds?.toISOString().slice(0, 10) ?? "-",
      });
    }
  }
  // 외부 수리 라벨 1건 (productId 없음)
  await prisma.serialItem.create({
    data: {
      code: "240101-9999",
      displayName: "Sony A7M4 Black (외부 기기)",
      source: "REPAIR",
      customer: { connect: { id: M.customers["박지호"].id } },
      soldAt: day(-180),
      status: "ACTIVE",
      memo: "수리 받으러 온 외부 기기 라벨",
    },
  });
  guide.serials.push({
    코드: "240101-9999",
    상품: "Sony A7M4 Black (외부 기기)",
    고객: "박지호",
    주문: "-",
    보증종료: "-",
  });

  // CustomerPayment — 외상 거래처 일부 결제
  const partialPayCustomers = ["동방건설(주)", "한빛정비"];
  for (const name of partialPayCustomers) {
    const customer = M.customers[name];
    if (!customer) continue;
    const pendingTotal = await prisma.customerLedger.aggregate({
      where: { customerId: customer.id, type: "SALE" },
      _sum: { debitAmount: true },
    });
    const total = Number(pendingTotal._sum.debitAmount ?? 0);
    if (total > 0) {
      const partial = Math.round(total * 0.5);
      await prisma.$transaction(async (tx) => {
        await tx.customerPayment.create({
          data: {
            customer: { connect: { id: customer.id } },
            amount: D(partial),
            paymentDate: day(-1),
            method: "TRANSFER",
            memo: "부분 입금",
            createdBy: { connect: { id: M.admin.id } },
          },
        });
        await tx.customerLedger.create({
          data: {
            customer: { connect: { id: customer.id } },
            date: day(-1),
            type: "RECEIPT",
            description: "부분 입금",
            debitAmount: D(0),
            creditAmount: D(partial),
            balance: D(0),
          },
        });
        await rebalCust(tx, customer.id);
      });
    }
  }

  // SupplierPayment — 보쉬코리아에 일부 결제
  const supplier = M.suppliers["보쉬코리아"];
  await prisma.$transaction(async (tx) => {
    const pending = await tx.supplierLedger.aggregate({
      where: { supplierId: supplier.id, type: "PURCHASE" },
      _sum: { creditAmount: true },
    });
    const total = Number(pending._sum.creditAmount ?? 0);
    if (total > 0) {
      const partial = Math.round(total * 0.6);
      await tx.supplierPayment.create({
        data: {
          supplier: { connect: { id: supplier.id } },
          amount: D(partial),
          paymentDate: day(-2),
          method: "TRANSFER",
          memo: "월 정산 일부",
          createdBy: { connect: { id: M.admin.id } },
        },
      });
      await tx.supplierLedger.create({
        data: {
          supplier: { connect: { id: supplier.id } },
          date: day(-2),
          type: "PAYMENT",
          description: "월 정산 일부 지급",
          debitAmount: D(partial),
          creditAmount: D(0),
          balance: D(0),
        },
      });
      await rebalSup(tx, supplier.id);
    }
  });

  // Expense
  await prisma.expense.createMany({
    data: [
      { date: day(-15), amount: D(80000), category: "SHIPPING", description: "9월 택배비 정산", isTaxable: true, paymentMethod: "TRANSFER", createdById: M.admin.id },
      { date: day(-30), amount: D(1500000), category: "RENT", description: "10월 매장 월세", isTaxable: true, paymentMethod: "TRANSFER", createdById: M.admin.id },
      { date: day(-25), amount: D(285000), category: "UTILITIES", description: "전기·수도·통신비", isTaxable: true, paymentMethod: "TRANSFER", createdById: M.admin.id },
      { date: day(-10), amount: D(85000), category: "PACKAGING", description: "박스·완충재 구매", isTaxable: true, paymentMethod: "CARD", createdById: M.admin.id },
      { date: day(-5), amount: D(45000), category: "OFFICE_SUPPLIES", description: "프린터 토너", isTaxable: true, paymentMethod: "CARD", createdById: M.admin.id },
      { date: day(-20), amount: D(220000), category: "MARKETING", description: "네이버 검색광고", isTaxable: true, paymentMethod: "CARD", createdById: M.admin.id },
      { date: day(-7), amount: D(120000), category: "MAINTENANCE", description: "POS 단말기 점검", isTaxable: true, paymentMethod: "TRANSFER", createdById: M.admin.id },
      { date: day(-12), amount: D(35000), category: "OTHER", description: "잡비 (간식·음료)", isTaxable: false, paymentMethod: "CASH", createdById: M.admin.id },
    ],
  });

  log(`   ✓ Serial ${guide.serials.length} / 외상 결제 ${partialPayCustomers.length} / 거래처 결제 1 / Expense 8`);
}

// ============================================================
// 자동 검증
// ============================================================

async function verify() {
  log("\n[검증] 도메인 정합성 자동 검증...");
  const failures: string[] = [];

  // 1. Inventory.quantity == Σ InventoryLot.remainingQty
  const products = await prisma.product.findMany({ select: { id: true, name: true, sku: true } });
  let invFail = 0;
  for (const p of products) {
    const inv = await prisma.inventory.findUnique({ where: { productId: p.id } });
    const lots = await prisma.inventoryLot.aggregate({
      where: { productId: p.id },
      _sum: { remainingQty: true },
    });
    const invQty = Number(inv?.quantity ?? 0);
    const lotQty = Number(lots._sum.remainingQty ?? 0);
    if (Math.abs(invQty - lotQty) > 0.0001) {
      invFail++;
      if (invFail <= 5)
        failures.push(`Inventory ≠ ΣLot — ${p.sku} (${p.name}): inv=${invQty} / lot=${lotQty}`);
    }
  }
  if (invFail === 0) log(`   ✓ Inventory == ΣLot.remainingQty 모든 상품 통과`);
  else log(`   ✗ Inventory ≠ ΣLot ${invFail}건 (위 5건만 표시)`);

  // 2. CustomerLedger 잔액 단조성 검증 (rebalance 결과가 마지막 행과 일치)
  const customers = await prisma.customer.findMany({ select: { id: true, name: true } });
  let custFail = 0;
  for (const c of customers) {
    const ls = await prisma.customerLedger.findMany({
      where: { customerId: c.id },
      orderBy: [{ date: "asc" }, { createdAt: "asc" }],
      select: { debitAmount: true, creditAmount: true, balance: true },
    });
    let bal = 0;
    let ok = true;
    for (const l of ls) {
      bal += Number(l.debitAmount) - Number(l.creditAmount);
      if (Math.abs(bal - Number(l.balance)) > 0.01) {
        ok = false;
        break;
      }
    }
    if (!ok) {
      custFail++;
      if (custFail <= 3) failures.push(`CustomerLedger 잔액 불일치 — ${c.name}`);
    }
  }
  if (custFail === 0) log(`   ✓ CustomerLedger 잔액 정합 모든 고객 통과`);
  else log(`   ✗ CustomerLedger 잔액 불일치 ${custFail}건`);

  // 3. SupplierLedger 잔액 정합
  const suppliers = await prisma.supplier.findMany({ select: { id: true, name: true } });
  let supFail = 0;
  for (const s of suppliers) {
    const ls = await prisma.supplierLedger.findMany({
      where: { supplierId: s.id },
      orderBy: [{ date: "asc" }, { createdAt: "asc" }],
      select: { debitAmount: true, creditAmount: true, balance: true },
    });
    let bal = 0;
    let ok = true;
    for (const l of ls) {
      bal += Number(l.debitAmount) - Number(l.creditAmount);
      if (Math.abs(bal - Number(l.balance)) > 0.01) {
        ok = false;
        break;
      }
    }
    if (!ok) {
      supFail++;
      if (supFail <= 3) failures.push(`SupplierLedger 잔액 불일치 — ${s.name}`);
    }
  }
  if (supFail === 0) log(`   ✓ SupplierLedger 잔액 정합 모든 거래처 통과`);
  else log(`   ✗ SupplierLedger 잔액 불일치 ${supFail}건`);

  // 4. EXCHANGE 양방향 link
  const exchanged = await prisma.order.findMany({
    where: { status: "EXCHANGED" },
    select: { id: true, orderNo: true, exchangeOrderId: true },
  });
  let xFail = 0;
  for (const e of exchanged) {
    if (!e.exchangeOrderId) {
      xFail++;
      failures.push(`EXCHANGED 주문 ${e.orderNo} — exchangeOrderId 없음`);
    } else {
      const newOrder = await prisma.order.findUnique({ where: { id: e.exchangeOrderId } });
      if (!newOrder?.orderNo.endsWith("-EX")) {
        xFail++;
        failures.push(`EXCHANGED 새 주문 번호 형식 오류 ${newOrder?.orderNo}`);
      }
    }
  }
  if (xFail === 0) log(`   ✓ EXCHANGED ${exchanged.length}건 모두 양방향 link 정상`);
  else log(`   ✗ EXCHANGED link 오류 ${xFail}건`);

  // 5. RentalAsset.status 와 Rental.status 정합
  const rentedAssets = await prisma.rentalAsset.findMany({
    where: { status: "RENTED" },
    select: { id: true, assetNo: true },
  });
  let rentFail = 0;
  for (const ra of rentedAssets) {
    const active = await prisma.rental.count({
      where: { assetId: ra.id, status: { in: ["ACTIVE", "OVERDUE"] } },
    });
    if (active === 0) {
      rentFail++;
      failures.push(`자산 ${ra.assetNo} status=RENTED 인데 활성 임대 없음`);
    }
  }
  if (rentFail === 0) log(`   ✓ RentalAsset / Rental 상태 정합`);
  else log(`   ✗ Rental 상태 불일치 ${rentFail}건`);

  if (failures.length > 0) {
    log("\n   상세 실패 목록:");
    for (const f of failures.slice(0, 20)) log(`     - ${f}`);
  }

  M.verifyResult = {
    invFail,
    custFail,
    supFail,
    xFail,
    rentFail,
    failures,
    totalProducts: products.length,
    totalCustomers: customers.length,
    totalSuppliers: suppliers.length,
    totalExchanged: exchanged.length,
  };
}

// ============================================================
// docs/SEED_TEST_GUIDE.md 생성
// ============================================================

function tableMd(rows: GuideRow[]): string {
  if (rows.length === 0) return "_(없음)_\n";
  const cols = Object.keys(rows[0]);
  const head = `| ${cols.join(" | ")} |`;
  const sep = `| ${cols.map(() => "---").join(" | ")} |`;
  const body = rows.map((r) => `| ${cols.map((c) => (r[c] ?? "-").toString().replace(/\|/g, "\\|")).join(" | ")} |`).join("\n");
  return [head, sep, body].join("\n") + "\n";
}

async function generateGuide() {
  log("\n[가이드] docs/SEED_TEST_GUIDE.md 생성...");

  const dir = path.join(process.cwd(), "docs");
  mkdirSync(dir, { recursive: true });

  const v = M.verifyResult;
  const today = new Date().toISOString().slice(0, 10);
  const md = `# 시드 데이터 테스트 가이드

생성일자: **${today}**
DB: \`${url.replace(/:[^:@]+@/, ":***@")}\`
관리자 계정: **${M.admin.email}**

> 이 문서는 \`prisma/seed.ts\` 가 자동 생성한 가이드입니다. 인쇄해서 옆에 두고 시나리오별로 UI 에서 확인해보세요.

---

## ⚠ 로그인

\`${M.admin.email}\` 계정으로 Supabase 에 가입한 그 비밀번호로 ERP 에 로그인 (User 테이블에 ADMIN 행이 박혀있으니 자동 매칭됨).

---

## 자동 검증 결과

| 검증 항목 | 결과 |
| --- | --- |
| Inventory.quantity == Σ InventoryLot.remainingQty | ${v.invFail === 0 ? `✅ ${v.totalProducts}개 상품 통과` : `❌ ${v.invFail}건 실패`} |
| CustomerLedger 잔액 누적 정합 | ${v.custFail === 0 ? `✅ ${v.totalCustomers}명 통과` : `❌ ${v.custFail}건 실패`} |
| SupplierLedger 잔액 누적 정합 | ${v.supFail === 0 ? `✅ ${v.totalSuppliers}개 통과` : `❌ ${v.supFail}건 실패`} |
| EXCHANGED 주문 양방향 link | ${v.xFail === 0 ? `✅ ${v.totalExchanged}건 통과` : `❌ ${v.xFail}건 실패`} |
| RentalAsset / Rental 상태 정합 | ${v.rentFail === 0 ? "✅ 통과" : `❌ ${v.rentFail}건 실패`} |

${v.failures.length > 0 ? "### 실패 상세\n\n" + v.failures.slice(0, 20).map((f: string) => `- ${f}`).join("\n") + "\n" : ""}

---

## 1. 고객 (${guide.customers.length}명)

${tableMd(guide.customers)}

---

## 2. 거래처 (${guide.suppliers.length}개)

${tableMd(guide.suppliers)}

---

## 3. 입고 (${guide.incomings.length}건)

${tableMd(guide.incomings)}

**검증 시나리오** (\`/inventory/incoming\` 페이지):
- CONFIRMED 입고를 클릭하면 InventoryLot 이 정상 생성되어 있어야 함
- PENDING 입고는 "확정" 버튼이 노출되어야 하고 클릭 시 재고 + 로트 + 거래처원장(CREDIT)이 생성됨
- CANCELLED 입고는 재고 영향 없음

---

## 4. 발주 (${guide.purchaseOrders.length}건) — 모든 status 케이스

${tableMd(guide.purchaseOrders)}

**검증 시나리오** (\`/purchase-orders\` 페이지):
- DRAFT → "발송" 버튼 클릭으로 SENT 전이
- SENT → "거래처 확정" 클릭으로 CONFIRMED
- PARTIAL 상태 발주는 잔량 입고하면 PARTIAL_COMPLETED → 추가 입고 시 RECEIVED 자동 전이
- CLOSED 상태는 "잔량 포기" 결과 — 재오픈 불가
- CANCELLED 상태는 삭제만 가능 (편집 불가)

---

## 5. 견적서 (${guide.quotations.length}건) — 판매·매입 모든 status

${tableMd(guide.quotations)}

**검증 시나리오** (\`/quotations\` 페이지):
- 판매 ACCEPTED 상태 견적은 "주문 전환" 버튼으로 Order 생성 가능 → 원본은 CONVERTED 락
- 매입 ACCEPTED 상태 견적은 "PO 전환" / "직접 입고" 두 옵션
- CONVERTED 견적은 편집·전환 모두 불가
- EXPIRED 는 만료일이 지난 SENT 자동 전이 표시

---

## 6. 거래명세표 (${guide.statements.length}건)

${tableMd(guide.statements)}

---

## 7. 주문 (${guide.orders.length}건) — 3축 모든 조합

${tableMd(guide.orders)}

### 주문 시나리오별 UI 검증 가이드

#### A. POS PICKUP / 즉시 종결 (5건)
- 모두 \`COMPLETED\` 상태로 시작. \`/sales\` 페이지에서 매출 합계 확인
- 채널 OFFLINE / 결제수단 다양 / 세트상품 1건 포함

#### B. POS DELIVERY / SHIPPING — 워크보드 진입
- \`/orders\` 워크보드에서:
  - **PREPARING** 그룹: 결제완료 발송대기
  - **PENDING** 그룹: B2B 외상 (재고 미차감)
  - **SHIPPED** 그룹: 트래킹번호 보유
- "지연" 카드: \`expectedShipDate\` 가 오늘보다 이전인 PENDING/PREPARING 주문

#### C. CANCELLED (3건)
- PENDING 단계 취소: 재고 미차감 → 복원 없음, ledger 영향 없음
- PREPARING 후 취소: 재고 복원 + paymentStatus REFUNDED + customer ledger REFUND 행 자동 추가

#### D. RETURN_REQUESTED (2건)
- COMPLETED 주문 → "반품 요청" 클릭 → claimType + claimReason 입력 → RETURN_REQUESTED
- 매장 결정 대기. "수락" / "반려" / "요청 취소" 3가지 액션 노출

#### E. RETURN_ACCEPTED (1건)
- 회수 진행 중 단계. 회수 완료 후 "환불 종결" / "교환 종결" 클릭 분기

#### F. RETURNED (3건)
- 1단계 매장 즉석 환불 (PICKUP) — claimType=REFUND 자동
- 3단계 택배 회수 후 환불 (SHIPPING) — paymentStatus=REFUNDED + ledger REFUND 행

#### G. EXCHANGED SAME (2건)
- 교환 종결 시 새 주문 자동 생성 (\`-EX\` 접미사) — 항목 동일 + paymentStatus=PAID + 재고 차감
- 양방향 link via \`exchangeOrderId\` — 새 주문 상세에서 원본 표시
- 마진 리포트에서 새 주문은 자동 제외 (매출 중복 방지)

#### H. EXCHANGED DIFFERENT (1건)
- 새 주문은 빈 항목 + paymentStatus=UNPAID + totalAmount=0
- 사용자가 직접 항목 추가 + 차액 결제 또는 환불 안내

#### 주문 매트릭스 검증 체크리스트
- [ ] 워크보드 그룹 분류 (오늘/지연/이번주/PENDING/PREPARING/SHIPPED) 정확
- [ ] 채널 수수료 스냅샷이 OrderItem 에 저장됨 (마진 리포트)
- [ ] PAID 결제 후 customer.balance == 0 (외상 아닌 케이스)
- [ ] UNPAID 주문 후 customer.balance > 0 (외상 누적)
- [ ] CANCELLED PREPARING 후 재고 복원 (Inventory.quantity 회복)
- [ ] EXCHANGED 새 주문이 마진 리포트 매출에서 빠짐
- [ ] RETURN_REQUESTED → 수락 후 회수 → 환불 또는 교환 분기

---

## 8. 수리 (${guide.repairs.length}건)

${tableMd(guide.repairs)}

**검증 시나리오** (\`/repairs\`, POS \`/pos/repairs\`):
- RECEIVED → DIAGNOSING → QUOTED → APPROVED → REPAIRING → READY → PICKED_UP 단계별 카드 분류
- 부속(RepairPart) 추가 시 재고 자동 차감 + LotConsumption 생성 (REPAIRING 이상)
- PICKED_UP 시 Order 자동 생성 (\`repairTicketId\` 1:1) + customer ledger 반영
- CANCELLED 는 cancelReason enum 필수
- 재수리(보증 내) 는 \`parentRepairTicketId\` 로 추적 + 부속·공임 무료 처리

---

## 9. 임대 (${guide.rentals.length}건)

${tableMd(guide.rentals)}

**검증 시나리오** (\`/rentals\`, \`/rental-assets\`):
- RentalAsset.status == "RENTED" 인 자산은 ACTIVE/OVERDUE 임대 1건 보유
- OVERDUE 는 endDate 가 지났는데 actualReturnedAt 없는 임대
- RETURNED 시 자산 상태 AVAILABLE 복원
- CANCELLED 은 임대 자산 점유 안 함

---

## 10. 시리얼 라벨 (${guide.serials.length}건)

${tableMd(guide.serials)}

---

## 마지막 — 자동 검증을 다시 돌리고 싶으면

\`\`\`bash
npm run db:seed
\`\`\`

→ 항상 truncate + 처음부터 시드. 같은 결과 재현됨.
`;

  const out = path.join(dir, "SEED_TEST_GUIDE.md");
  writeFileSync(out, md, "utf-8");
  log(`   ✓ ${out} 생성됨 (${md.length.toLocaleString()} 자)`);
}

// ============================================================
// MAIN
// ============================================================

async function main() {
  log("=".repeat(70));
  log("ERP 시드 스크립트");
  log("=".repeat(70));
  log(`DB: ${url.replace(/:[^:@]+@/, ":***@")}`);

  await truncateAll();
  await seedUserAndMasters();
  await seedCustomers();
  await seedSuppliers();
  await seedProductsAndMappings();
  await seedIncomings();
  await seedStocktakes();
  await seedPurchaseOrders();
  await seedQuotationsStatements();
  await seedOrders();
  await seedRepairs();
  await seedRentals();
  await seedExpensesAndPayments();
  await verify();
  await generateGuide();

  log("\n" + "=".repeat(70));
  log("✅ 시드 완료");
  log("=".repeat(70));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
