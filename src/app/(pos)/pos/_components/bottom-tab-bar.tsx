"use client";

interface Tab<T extends string> {
  value: T;
  label: string;
  icon: React.ReactNode;
  badge?: number;
}

/** 액션 슬롯 — 탭은 아니지만 탭바 안에 함께 그릴 액션 버튼 (예: 햄버거 메뉴 / 장바구니) */
export interface BottomTabAction {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  /** 우상단 작은 카운트 배지 */
  badge?: number;
}

interface Props<T extends string> {
  tabs: Tab<T>[];
  active: T;
  onChange: (v: T) => void;
  /** 탭 좌측에 추가되는 액션 슬롯 — 햄버거 메뉴 위치 */
  prefixAction?: BottomTabAction;
  /** 탭 우측에 추가되는 액션 슬롯 — 장바구니 위치 */
  suffixAction?: BottomTabAction;
}

/**
 * 하단 탭바 — iOS/Android 표준. 모바일 90% 가정.
 * - safe-area-inset-bottom 처리
 * - active 표시는 미니멀 (위 바 + 색)
 * - prefixAction: 좌측 첫 자리. 햄버거 메뉴.
 * - suffixAction: 우측 끝 자리. 장바구니.
 */
export function BottomTabBar<T extends string>({
  tabs,
  active,
  onChange,
  prefixAction,
  suffixAction,
}: Props<T>) {
  const cellCount =
    tabs.length + (prefixAction ? 1 : 0) + (suffixAction ? 1 : 0);
  return (
    <nav className="shrink-0 border-t border-zinc-200 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/85">
      <div
        className="grid"
        style={{
          gridTemplateColumns: `repeat(${cellCount}, minmax(0, 1fr))`,
          paddingBottom: "max(env(safe-area-inset-bottom), 6px)",
        }}
      >
        {prefixAction && (
          <button
            type="button"
            onClick={prefixAction.onClick}
            className="relative flex flex-col items-center gap-1 pb-2 pt-3"
          >
            <div className="relative text-zinc-700">
              {prefixAction.icon}
              {prefixAction.badge != null && prefixAction.badge > 0 && (
                <span className="absolute -right-2 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold tabular-nums text-white">
                  {prefixAction.badge}
                </span>
              )}
            </div>
            <span className="text-[11px] font-medium text-zinc-700">
              {prefixAction.label}
            </span>
          </button>
        )}
        {tabs.map((t) => {
          const isActive = active === t.value;
          return (
            <button
              key={t.value}
              type="button"
              onClick={() => onChange(t.value)}
              className="relative flex flex-col items-center gap-1 pb-2 pt-3"
            >
              {/* 상단 indicator */}
              <span
                className={`absolute left-1/2 top-0 h-1 w-10 -translate-x-1/2 rounded-b-full transition-colors ${
                  isActive ? "bg-zinc-900" : "bg-transparent"
                }`}
              />
              <div
                className={`relative ${
                  isActive ? "text-zinc-900" : "text-zinc-400"
                }`}
              >
                {t.icon}
                {t.badge != null && t.badge > 0 && (
                  <span className="absolute -right-2 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold tabular-nums text-white">
                    {t.badge}
                  </span>
                )}
              </div>
              <span
                className={`text-[11px] font-medium ${
                  isActive ? "text-zinc-900" : "text-zinc-500"
                }`}
              >
                {t.label}
              </span>
            </button>
          );
        })}
        {suffixAction && (
          <button
            type="button"
            onClick={suffixAction.onClick}
            className="relative flex flex-col items-center gap-1 pb-2 pt-3"
          >
            <div className="relative text-zinc-700">
              {suffixAction.icon}
              {suffixAction.badge != null && suffixAction.badge > 0 && (
                <span className="absolute -right-2 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold tabular-nums text-white">
                  {suffixAction.badge}
                </span>
              )}
            </div>
            <span className="text-[11px] font-medium text-zinc-700">
              {suffixAction.label}
            </span>
          </button>
        )}
      </div>
    </nav>
  );
}
