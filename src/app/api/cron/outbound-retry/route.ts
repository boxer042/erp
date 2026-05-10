/**
 * Outbound retry 큐 drain — 실패한 채널 outbound 작업을 backoff 으로 자동 재시도.
 *
 * 흐름:
 *  - PENDING + nextAttemptAt <= now 인 ChannelOutboundJob 을 batch 로 가져와 시도
 *  - 성공: status=SUCCESS + resolvedAt 기록
 *  - 실패: attempts++ + nextAttemptAt 미루기 (exponential backoff: 2^attempts 분)
 *  - attempts >= maxAttempts: status=FAILED (영구 실패 — 운영자 수동 처리)
 *
 * 등록: 외부 스케줄러(EasyCron 등) 가 5~10분 간격으로 호출.
 * 인증: ?token=<CRON_TOKEN> 또는 Authorization: Bearer <CRON_TOKEN>.
 *
 * 파라미터 (query):
 *   limit  기본 50  — 한 번 호출에서 처리할 최대 건수
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getChannelAdapter } from "@/lib/channels/registry";
import { recordAudit } from "@/lib/audit";

function authorize(request: NextRequest): boolean {
  const expected = process.env.CRON_TOKEN;
  if (!expected) return true;
  const url = new URL(request.url);
  if (url.searchParams.get("token") === expected) return true;
  const auth = request.headers.get("authorization");
  if (auth === `Bearer ${expected}`) return true;
  return false;
}

export async function POST(request: NextRequest) {
  return run(request);
}
export async function GET(request: NextRequest) {
  return run(request);
}

interface PushTrackingPayload {
  channelOrderNo: string | null;
  carrier: string;
  trackingNumber: string;
}
interface AcceptReturnPayload {
  channelOrderNo: string | null;
}
interface RejectReturnPayload {
  channelOrderNo: string | null;
  reason: string;
}
interface PushStockPayload {
  items: Array<{ channelSku: string; availableQty: number }>;
}

async function run(request: NextRequest) {
  if (!authorize(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const url = new URL(request.url);
  const limit = Math.max(
    1,
    Math.min(200, parseInt(url.searchParams.get("limit") ?? "50", 10) || 50),
  );

  const now = new Date();
  const jobs = await prisma.channelOutboundJob.findMany({
    where: {
      status: "PENDING",
      nextAttemptAt: { lte: now },
    },
    include: { channel: { select: { id: true, code: true, isActive: true } } },
    orderBy: { nextAttemptAt: "asc" },
    take: limit,
  });

  let succeeded = 0;
  let retried = 0;
  let failed = 0;

  for (const job of jobs) {
    const attempts = job.attempts + 1;

    if (!job.channel.isActive) {
      // 채널 비활성 — 재시도 의미 없음. backoff 없이 바로 한 번 더 시도하지 않고, FAILED 처리
      await prisma.channelOutboundJob.update({
        where: { id: job.id },
        data: {
          status: "FAILED",
          attempts,
          lastError: "channel inactive",
          resolvedAt: now,
        },
      });
      failed++;
      continue;
    }

    const adapter = getChannelAdapter(job.channel.code);
    if (!adapter) {
      // 어댑터 미등록 — Phase 2 가입 전 케이스. backoff 없이 FAILED 로 종결.
      await prisma.channelOutboundJob.update({
        where: { id: job.id },
        data: {
          status: "FAILED",
          attempts,
          lastError: `adapter not registered: ${job.channel.code}`,
          resolvedAt: now,
        },
      });
      failed++;
      continue;
    }

    let success = false;
    let errMsg: string | null = null;
    try {
      const payload = job.payload as unknown;
      switch (job.kind) {
        case "PUSH_TRACKING": {
          const p = payload as PushTrackingPayload;
          if (!adapter.pushTrackingNumber) {
            throw new Error("adapter does not support pushTrackingNumber");
          }
          if (!p.channelOrderNo) {
            throw new Error("channelOrderNo missing in payload");
          }
          await adapter.pushTrackingNumber(
            p.channelOrderNo,
            p.carrier,
            p.trackingNumber,
          );
          success = true;
          break;
        }
        case "ACCEPT_RETURN": {
          const p = payload as AcceptReturnPayload;
          if (!adapter.acceptReturn) {
            throw new Error("adapter does not support acceptReturn");
          }
          if (!p.channelOrderNo) {
            throw new Error("channelOrderNo missing in payload");
          }
          await adapter.acceptReturn(p.channelOrderNo);
          success = true;
          break;
        }
        case "REJECT_RETURN": {
          const p = payload as RejectReturnPayload;
          if (!adapter.rejectReturn) {
            throw new Error("adapter does not support rejectReturn");
          }
          if (!p.channelOrderNo) {
            throw new Error("channelOrderNo missing in payload");
          }
          await adapter.rejectReturn(p.channelOrderNo, p.reason);
          success = true;
          break;
        }
        case "PUSH_STOCK": {
          const p = payload as PushStockPayload;
          if (!adapter.pushStock) {
            throw new Error("adapter does not support pushStock");
          }
          await adapter.pushStock(p.items ?? []);
          success = true;
          break;
        }
      }
    } catch (e) {
      errMsg = e instanceof Error ? e.message : String(e);
    }

    if (success) {
      await prisma.channelOutboundJob.update({
        where: { id: job.id },
        data: {
          status: "SUCCESS",
          attempts,
          resolvedAt: now,
          lastError: null,
        },
      });
      if (job.orderId) {
        await recordAudit(prisma, {
          userId: null,
          entity: "Order",
          entityId: job.orderId,
          action: "STATUS_CHANGE",
          meta: {
            outbound: job.kind,
            result: "RETRY_SUCCESS",
            channel: job.channel.code,
            attempts,
          },
        });
      }
      succeeded++;
      continue;
    }

    // 실패 — backoff. 영구 실패 vs 재시도 분기
    if (attempts >= job.maxAttempts) {
      await prisma.channelOutboundJob.update({
        where: { id: job.id },
        data: {
          status: "FAILED",
          attempts,
          lastError: errMsg,
          resolvedAt: now,
        },
      });
      failed++;
      if (job.orderId) {
        await recordAudit(prisma, {
          userId: null,
          entity: "Order",
          entityId: job.orderId,
          action: "STATUS_CHANGE",
          meta: {
            outbound: job.kind,
            result: "RETRY_EXHAUSTED",
            channel: job.channel.code,
            attempts,
            error: errMsg,
          },
        });
      }
    } else {
      // exponential backoff — 2^attempts 분 (1차 재시도 후 2분, 2차 4분, 3차 8분, ...)
      const backoffMin = Math.pow(2, attempts);
      const next = new Date(now.getTime() + backoffMin * 60 * 1000);
      await prisma.channelOutboundJob.update({
        where: { id: job.id },
        data: {
          attempts,
          lastError: errMsg,
          nextAttemptAt: next,
        },
      });
      retried++;
    }
  }

  return NextResponse.json({
    ok: true,
    picked: jobs.length,
    succeeded,
    retried,
    failed,
  });
}
