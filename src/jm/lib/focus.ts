/**
 * 클릭/포커스 시 select-all 대신 캐럿을 끝으로 이동.
 * JmNumberInput 와 동일한 동작 — 기존 값 보존 + 끝부터 편집.
 *
 * 사용:
 *   <Input onFocus={focusCaretEnd} ... />
 *
 * 사용자가 드래그로 부분 범위를 선택 중이면 그 선택은 보존한다.
 */
export function focusCaretEnd(
  e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>,
) {
  const el = e.currentTarget;
  // 사용자가 부분 선택 중이면 보존
  if (
    el.selectionStart !== null &&
    el.selectionEnd !== null &&
    el.selectionStart !== el.selectionEnd
  ) {
    return;
  }
  const len = el.value.length;
  // 다음 frame 에 적용 (브라우저 기본 동작 이후 덮어쓰기)
  requestAnimationFrame(() => {
    try {
      el.setSelectionRange(len, len);
    } catch {
      // type 이 text/textarea 가 아니면 무시
    }
  });
}
