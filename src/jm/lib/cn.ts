import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/**
 * jm 전용 tailwind-merge.
 * 기본 config 에 jm 사이즈 토큰(text-jm-*)을 font-size 그룹으로 등록.
 *
 * 안 그러면 tailwind-merge 가 `text-jm-base` 를 color 로 잘못 분류해
 * variant 의 `text-[var(--jm-action-fg)]` 를 덮어써 글자색이 사라짐.
 */
const jmTwMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [
        {
          text: [
            "jm-3xs",
            "jm-2xs",
            "jm-xs",
            "jm-sm",
            "jm-base",
            "jm-md",
            "jm-lg",
            "jm-xl",
            "jm-2xl",
            "jm-3xl",
            "jm-4xl",
            "jm-5xl",
          ],
        },
      ],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return jmTwMerge(clsx(inputs));
}
