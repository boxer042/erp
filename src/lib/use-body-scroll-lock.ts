"use client";

import { useEffect } from "react";

/**
 * 풀스크린 모달/시트가 열려 있는 동안 document.body 의 스크롤을 막는다.
 * 마운트 시 잠금, 언마운트 시 원래 값 복원.
 */
export function useBodyScrollLock() {
  useEffect(() => {
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = original;
    };
  }, []);
}
