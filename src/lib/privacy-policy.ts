import { prisma } from "@/lib/prisma";

export const DEFAULT_POLICY_ID = "v1.0";

// 시리얼 조회 서비스 기본 약관 — 최초 1회 lazy seed. 매장이 settings 에서 수정.
export const DEFAULT_POLICY_CONTENT = `시리얼번호 기반 보증·수리·구매내역 조회 서비스 개인정보 처리방침

1. 수집·이용 목적
제품 시리얼번호(라벨 QR)를 통한 보증 기간 안내, 수리 이력 제공, 구매 내역 확인 등 사후 서비스 제공.

2. 수집 항목
이름, 연락처, 구매·수리 내역, 제품 시리얼 정보.

3. 보유·이용 기간
제품 보증 기간 종료 후 3년까지 보유하며, 이후 구매자 개인정보는 익명화 처리됩니다. 본인 요청 시 즉시 파기합니다.

4. 본인 확인
시리얼 라벨의 QR 코드 및 이름·전화번호 끝 4자리 일치를 통해 본인을 확인합니다.

5. 정보 정정·삭제
본인의 정보 열람·정정·삭제는 구매하신 매장으로 요청할 수 있습니다.

6. 동의 거부 권리
본 서비스 이용 동의는 거부할 수 있으며, 미동의 시 제품 라벨에 조회용 QR 코드가 인쇄되지 않습니다.`;

export interface PrivacyPolicy {
  id: string;
  content: string;
  publishedAt: Date;
  isCurrent: boolean;
}

// 현재 약관 조회 — 없으면 기본 약관을 1회 생성(lazy seed).
export async function getCurrentPolicy(): Promise<PrivacyPolicy> {
  const existing = await prisma.privacyPolicyVersion.findFirst({
    where: { isCurrent: true },
    orderBy: { publishedAt: "desc" },
  });
  if (existing) return existing;

  return prisma.privacyPolicyVersion.create({
    data: {
      id: DEFAULT_POLICY_ID,
      content: DEFAULT_POLICY_CONTENT,
      isCurrent: true,
    },
  });
}

// "v1.0" → "v1.1" — 새 버전 게시 시 minor 증가.
export function nextVersionId(current: string): string {
  const m = current.match(/^v(\d+)\.(\d+)$/);
  if (!m) return "v1.1";
  return `v${m[1]}.${Number(m[2]) + 1}`;
}
