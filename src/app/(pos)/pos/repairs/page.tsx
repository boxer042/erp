"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * /pos/repairs 보드는 더 이상 사용하지 않음. 고객 세션의 수리 모드(/pos/cart/[sid]?mode=repair)에서
 * 그 고객의 진행중 수리 탭들을 보고 작업한다. 어드민 전체 보기는 대시보드 /repairs.
 */
export default function PosRepairsRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/pos");
  }, [router]);
  return null;
}
