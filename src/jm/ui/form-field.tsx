import * as React from "react";
import { AlertCircle } from "lucide-react";
import { cn } from "@/jm/lib/cn";

export interface JmFormFieldProps extends React.HTMLAttributes<HTMLDivElement> {
  label?: React.ReactNode;
  /** 필수 표시 (*) */
  required?: boolean;
  /** 도움말 — 정상 상태 hint. error 가 있으면 error 가 우선 노출 */
  hint?: React.ReactNode;
  /** 에러 메시지 — 있으면 자동으로 invalid 스타일 + 에러 텍스트 노출 */
  error?: React.ReactNode;
  /** input·select·combobox 등 컨트롤 그대로 children */
  children: React.ReactNode;
  /** label 우측에 배치할 보조 정보 (선택, 글자수 카운터 등) */
  labelAddon?: React.ReactNode;
  /** label htmlFor — 컨트롤 id 와 매칭 */
  htmlFor?: string;
}

/**
 * 폼 필드 wrapper — label + 컨트롤 + hint/error 통합.
 *
 *   <JmFormField label="이름" required hint="실명 입력">
 *     <JmInput placeholder="홍길동" />
 *   </JmFormField>
 *
 *   <JmFormField label="가격" error="0보다 커야 합니다">
 *     <JmNumberInput value={price} onValueChange={setPrice} tone="invalid" />
 *   </JmFormField>
 */
export const JmFormField = React.forwardRef<HTMLDivElement, JmFormFieldProps>(
  (
    { className, label, required, hint, error, children, labelAddon, htmlFor, ...props },
    ref,
  ) => (
    <div ref={ref} className={cn("flex flex-col gap-1.5", className)} {...props}>
      {(label || labelAddon) && (
        <div className="flex items-baseline justify-between gap-2">
          {label && (
            <label
              htmlFor={htmlFor}
              className="text-jm-xs font-medium text-[var(--jm-text-muted)]"
            >
              {label}
              {required && (
                <span className="ml-0.5 text-[var(--jm-danger-solid)]">*</span>
              )}
            </label>
          )}
          {labelAddon && (
            <span className="text-jm-2xs text-[var(--jm-text-subtle)]">
              {labelAddon}
            </span>
          )}
        </div>
      )}
      {children}
      {error ? (
        <p className="flex items-center gap-1.5 text-jm-xs text-[var(--jm-danger-fg)]">
          <AlertCircle className="size-3.5 shrink-0" />
          <span>{error}</span>
        </p>
      ) : hint ? (
        <p className="text-jm-xs text-[var(--jm-text-muted)]">{hint}</p>
      ) : null}
    </div>
  ),
);
JmFormField.displayName = "JmFormField";
