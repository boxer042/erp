-- 운영 DB 마이그레이션 — Order.repair_ticket_id (1:1) → RepairTicket.order_id (N:1).
-- 단일 트랜잭션. 실패 시 자동 롤백.
--
-- 사용:
--   psql "$DIRECT_URL" -f scripts/flip-repair-order.sql
--
-- DIRECT_URL 은 .env.prod 의 직접 접속 url (pooler 가 아닌 5432 포트).

BEGIN;

-- 1) 신규 컬럼 + 인덱스 추가
ALTER TABLE repair_tickets ADD COLUMN IF NOT EXISTS order_id TEXT;
CREATE INDEX IF NOT EXISTS repair_tickets_order_id_idx ON repair_tickets (order_id);

-- 2) 기존 데이터 이전 (orders.repair_ticket_id → repair_tickets.order_id)
UPDATE repair_tickets rt
SET order_id = o.id
FROM orders o
WHERE o.repair_ticket_id = rt.id
  AND rt.order_id IS NULL;

-- 3) FK 제약 추가 (orders 삭제 시 ticket 의 orderId 만 null 로 끊김)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'repair_tickets_order_id_fkey'
      AND table_name = 'repair_tickets'
  ) THEN
    ALTER TABLE repair_tickets
      ADD CONSTRAINT repair_tickets_order_id_fkey
      FOREIGN KEY (order_id) REFERENCES orders(id)
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END$$;

-- 4) 구 컬럼 드롭 (자동 unique 인덱스도 함께 사라짐)
ALTER TABLE orders DROP COLUMN IF EXISTS repair_ticket_id;

-- 5) 마이그레이션 결과 검증 — 이전된 link 수 출력
SELECT
  (SELECT COUNT(*) FROM repair_tickets WHERE order_id IS NOT NULL) AS migrated_tickets,
  (SELECT COUNT(*) FROM repair_tickets) AS total_tickets,
  (SELECT COUNT(*) FROM orders) AS total_orders;

COMMIT;
