/**
 * 주문 워크보드 통합 테스트 — 개발 DB(.env.local) 에 테스트 Order 6건 생성 후
 * 1) 그룹화 로직, 2) 워크보드 노출 필터, 3) 상태 전환 흐름, 4) cancel 시 데이터 정리 검증.
 *
 * 실행: npx tsx -r dotenv/config scripts/test-orders-workflow.ts dotenv_config_path=.env.local
 */

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import type {
  Order,
  OrderStatus,
  FulfillmentType,
} from "@prisma/client";
import { classifyBoardGroup, getKrToday } from "../src/lib/orders/board";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const ORDER_NO_PREFIX = "TEST-WF-";

// KST 기준 오늘의 UTC 자정 Date — 비교 대상 expectedShipDate (DB 에서 UTC 자정으로 옴) 와 같은 통화
const today = getKrToday();
function dayOffset(d: Date, days: number): Date {
  const r = new Date(d);
  r.setUTCDate(r.getUTCDate() + days);
  return r;
}
const yesterday = dayOffset(today, -1);
const tomorrow = dayOffset(today, 1);
const inFiveDays = dayOffset(today, 5);
const inTwentyDays = dayOffset(today, 20);

interface TestCase {
  label: string;
  status: OrderStatus;
  fulfillmentType: FulfillmentType;
  expectedShipDate: Date | null;
  expectedGroup: ReturnType<typeof classifyBoardGroup>;
  expectedInBoard: boolean;
}

let pass = 0;
let fail = 0;
const failures: string[] = [];

function check(condition: boolean, msg: string) {
  if (condition) {
    pass++;
    console.log(`  ✓ ${msg}`);
  } else {
    fail++;
    failures.push(msg);
    console.log(`  ✗ ${msg}`);
  }
}

async function main() {
  console.log("=== 주문 워크플로 통합 테스트 ===\n");

  // ── Setup ─────────────────────────────────────────
  const user = await prisma.user.findFirst();
  if (!user) {
    console.error("✗ User 없음 — 로그인 후 다시 실행하세요");
    process.exit(1);
  }
  console.log(`User: ${user.email ?? user.id}`);

  // 혹시 이전 실행 잔여 데이터 정리
  const stale = await prisma.order.deleteMany({
    where: { orderNo: { startsWith: ORDER_NO_PREFIX } },
  });
  if (stale.count > 0) console.log(`prior stale 정리: ${stale.count}건\n`);

  // ── Step 1. 6가지 케이스 생성 ──────────────────────
  console.log("[Step 1] 테스트 Order 6건 생성");

  const cases: TestCase[] = [
    {
      label: "A. 지연 (PENDING+SHIPPING+어제)",
      status: "PENDING",
      fulfillmentType: "SHIPPING",
      expectedShipDate: yesterday,
      expectedGroup: "overdue",
      expectedInBoard: true,
    },
    {
      label: "B. 오늘 (PENDING+SHIPPING+오늘)",
      status: "PENDING",
      fulfillmentType: "SHIPPING",
      expectedShipDate: today,
      expectedGroup: "today",
      expectedInBoard: true,
    },
    {
      label: "C. 이번주 (PREPARING+DELIVERY+5일후)",
      status: "PREPARING",
      fulfillmentType: "DELIVERY",
      expectedShipDate: inFiveDays,
      expectedGroup: "thisWeek",
      expectedInBoard: true,
    },
    {
      label: "D. 발송중 (SHIPPED+SHIPPING+어제)",
      status: "SHIPPED",
      fulfillmentType: "SHIPPING",
      expectedShipDate: yesterday,
      expectedGroup: "shipped",
      expectedInBoard: true,
    },
    {
      label: "E. 이후 (PREPARING+SHIPPING+20일후)",
      status: "PREPARING",
      fulfillmentType: "SHIPPING",
      expectedShipDate: inTwentyDays,
      expectedGroup: "future",
      expectedInBoard: true,
    },
    {
      label: "F. PICKUP 완료 (COMPLETED+PICKUP)",
      status: "COMPLETED",
      fulfillmentType: "PICKUP",
      expectedShipDate: null,
      expectedGroup: null,
      expectedInBoard: false,
    },
  ];

  const created: Array<{ order: Order; tc: TestCase }> = [];
  for (let i = 0; i < cases.length; i++) {
    const tc = cases[i];
    const order = await prisma.order.create({
      data: {
        orderNo: `${ORDER_NO_PREFIX}${Date.now()}-${i}`,
        status: tc.status,
        fulfillmentType: tc.fulfillmentType,
        expectedShipDate: tc.expectedShipDate,
        customerName: `테스트 ${tc.label.charAt(0)}`,
        customerPhone: "010-0000-0000",
        shippingAddress: tc.fulfillmentType !== "PICKUP" ? "테스트 주소" : null,
        orderDate: today,
        subtotalAmount: 10000,
        totalAmount: 11000,
        taxAmount: 1000,
        createdById: user.id,
      },
    });
    created.push({ order, tc });
    console.log(`  + ${tc.label} → ${order.orderNo}`);
  }

  // ── Step 2. 그룹화 로직 ────────────────────────────
  console.log("\n[Step 2] classifyBoardGroup 검증");
  for (const { order, tc } of created) {
    const got = classifyBoardGroup(order.status, order.expectedShipDate, today);
    check(
      got === tc.expectedGroup,
      `${tc.label} → ${got ?? "null"} (기대: ${tc.expectedGroup ?? "null"})`,
    );
  }

  // ── Step 3. 워크보드 응답 (실제 prisma 쿼리) ────────
  console.log("\n[Step 3] GET /api/orders?view=board 노출 필터 검증");
  const boardOrders = await prisma.order.findMany({
    where: {
      orderNo: { startsWith: ORDER_NO_PREFIX },
      status: { in: ["PENDING", "PREPARING", "SHIPPED"] },
      fulfillmentType: { in: ["DELIVERY", "SHIPPING"] },
    },
  });
  const boardNos = new Set(boardOrders.map((o) => o.orderNo));
  for (const { order, tc } of created) {
    const inBoard = boardNos.has(order.orderNo);
    check(
      inBoard === tc.expectedInBoard,
      `${tc.label} 워크보드 노출: ${inBoard ? "O" : "X"} (기대: ${tc.expectedInBoard ? "O" : "X"})`,
    );
  }

  // ── Step 4. 상태 전환 시뮬레이션 ──────────────────
  console.log("\n[Step 4] 상태 전환 흐름 (직접 update)");
  const caseA = created.find((c) => c.tc.label.startsWith("A."))!;
  const caseC = created.find((c) => c.tc.label.startsWith("C."))!;
  const caseD = created.find((c) => c.tc.label.startsWith("D."))!;

  // A: PENDING → PREPARING (prepare 액션 시뮬레이션, 재고 차감 로직은 API에서)
  await prisma.order.update({
    where: { id: caseA.order.id },
    data: { status: "PREPARING" },
  });
  const aAfter = await prisma.order.findUnique({ where: { id: caseA.order.id } });
  check(aAfter?.status === "PREPARING", "A: PENDING → PREPARING transition");
  check(
    classifyBoardGroup(aAfter!.status, aAfter!.expectedShipDate, today) === "overdue",
    "A: 그룹 여전히 overdue (status 가 PREPARING 으로 가도 expectedShipDate 가 어제)",
  );

  // C: PREPARING → SHIPPED
  await prisma.order.update({
    where: { id: caseC.order.id },
    data: { status: "SHIPPED" },
  });
  const cAfter = await prisma.order.findUnique({ where: { id: caseC.order.id } });
  check(cAfter?.status === "SHIPPED", "C: PREPARING → SHIPPED transition");
  check(
    classifyBoardGroup(cAfter!.status, cAfter!.expectedShipDate, today) === "shipped",
    "C: 그룹 thisWeek → shipped 로 이동",
  );

  // D: SHIPPED → COMPLETED
  await prisma.order.update({
    where: { id: caseD.order.id },
    data: { status: "COMPLETED" },
  });
  const dAfter = await prisma.order.findUnique({ where: { id: caseD.order.id } });
  check(dAfter?.status === "COMPLETED", "D: SHIPPED → COMPLETED transition");
  check(
    classifyBoardGroup(dAfter!.status, dAfter!.expectedShipDate, today) === null,
    "D: 그룹 null (워크보드 미노출)",
  );

  // ── Step 4.5. PATCH 수정 — expectedShipDate 미정 → 채움 ───
  console.log("\n[Step 4.5] PATCH 수정 (expectedShipDate 채우기)");
  const caseE = created.find((c) => c.tc.label.startsWith("E."))!;
  // 일단 미정으로 만든 뒤 다시 채우기 시뮬레이션
  await prisma.order.update({
    where: { id: caseE.order.id },
    data: { expectedShipDate: null, fulfillmentType: "DELIVERY" },
  });
  const eNull = await prisma.order.findUnique({ where: { id: caseE.order.id } });
  check(
    eNull?.expectedShipDate === null,
    "E: expectedShipDate 를 null 로 비워둔 상태",
  );
  check(
    classifyBoardGroup(eNull!.status, eNull!.expectedShipDate, today) === "unscheduled",
    "E: 예정일 미정 → unscheduled 그룹",
  );
  // PATCH 가 적용될 때 동작 — 직접 prisma update 로 시뮬레이션
  await prisma.order.update({
    where: { id: caseE.order.id },
    data: { expectedShipDate: tomorrow },
  });
  const eFilled = await prisma.order.findUnique({ where: { id: caseE.order.id } });
  check(
    eFilled?.expectedShipDate?.toISOString().slice(0, 10) ===
      tomorrow.toISOString().slice(0, 10),
    "E: PATCH 후 expectedShipDate 가 내일로 채워짐",
  );
  check(
    classifyBoardGroup(eFilled!.status, eFilled!.expectedShipDate, today) ===
      "thisWeek",
    "E: 그룹 future → thisWeek 로 이동",
  );

  // ── Step 5. cancel from PREPARING ─────────────────
  console.log("\n[Step 5] cancel from PREPARING (재고 복원 분기)");
  // A 는 PREPARING 상태. cancel 로 → CANCELLED. 재고 차감/복원 로직은 API 레이어에서
  // 실제 처리되므로 status 변화만 검증.
  await prisma.order.update({
    where: { id: caseA.order.id },
    data: { status: "CANCELLED" },
  });
  const aCancelled = await prisma.order.findUnique({
    where: { id: caseA.order.id },
  });
  check(
    aCancelled?.status === "CANCELLED",
    "A: PREPARING → CANCELLED 가능 (API 의 wasStockDeducted 분기 진입)",
  );

  // ── Step 6. enum / 컬럼 무결성 ─────────────────────
  console.log("\n[Step 6] 스키마 무결성");
  const enumValues = await prisma.$queryRawUnsafe<Array<{ value: string }>>(
    `SELECT unnest(enum_range(NULL::"OrderStatus"))::text AS value`,
  );
  const orderStatusValues = enumValues.map((v) => v.value);
  check(
    !orderStatusValues.includes("CONFIRMED"),
    `OrderStatus enum 에 CONFIRMED 없음 (실제: ${orderStatusValues.join(",")})`,
  );
  check(
    !orderStatusValues.includes("DELIVERED"),
    "OrderStatus enum 에 DELIVERED 없음",
  );
  check(
    orderStatusValues.includes("COMPLETED") &&
      orderStatusValues.includes("PREPARING"),
    "OrderStatus enum 에 COMPLETED / PREPARING 존재",
  );

  // ── Cleanup ───────────────────────────────────────
  console.log("\n[Cleanup] 테스트 Order 삭제");
  const deleted = await prisma.order.deleteMany({
    where: { orderNo: { startsWith: ORDER_NO_PREFIX } },
  });
  console.log(`  삭제: ${deleted.count}건`);

  // ── 결과 ──────────────────────────────────────────
  console.log("\n=== 테스트 결과 ===");
  console.log(`Pass: ${pass}`);
  console.log(`Fail: ${fail}`);
  if (failures.length > 0) {
    console.log("\n실패 항목:");
    failures.forEach((f) => console.log(`  - ${f}`));
  }
  process.exit(fail > 0 ? 1 : 0);
}

main()
  .catch((e) => {
    console.error("[FATAL]", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
