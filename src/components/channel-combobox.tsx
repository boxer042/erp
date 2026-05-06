"use client";

import { ResponsiveCombobox } from "@/components/ui/responsive-combobox";

interface Channel {
  id: string;
  name: string;
  code: string;
  commissionRate?: string | number;
}

interface Props {
  channels: Channel[];
  value: string;
  onChange: (id: string, channel: Channel) => void;
  placeholder?: string;
  /** clearable 켜면 X 버튼 → "" 반환. 기본 false (필수 선택 케이스) */
  clearable?: boolean;
}

const EMPTY_CHANNEL: Channel = { id: "", name: "", code: "" };

/**
 * 판매 채널 선택 콤보박스 — 견적서 → 주문 전환 등 channelId 입력이 필요한 곳에서 재사용.
 * 신규 등록 X (채널은 어드민에서만 관리).
 */
export function ChannelCombobox({
  channels,
  value,
  onChange,
  placeholder = "채널 선택...",
  clearable = false,
}: Props) {
  const selected = channels.find((c) => c.id === value);

  return (
    <ResponsiveCombobox<Channel>
      items={channels}
      value={value}
      getItemId={(c) => c.id}
      matches={(c, q) => {
        const lower = q.toLowerCase();
        return (
          c.name.toLowerCase().includes(lower) ||
          c.code.toLowerCase().includes(lower)
        );
      }}
      onSelect={(c) => onChange(c.id, c)}
      selectedLabel={selected?.name}
      placeholder={placeholder}
      searchPlaceholder="채널명·코드 검색..."
      mobileTitle="채널 선택"
      clearable={clearable}
      onClear={clearable ? () => onChange("", EMPTY_CHANNEL) : undefined}
      renderItem={(c) => (
        <>
          <span>{c.name}</span>
          <span className="ml-auto font-mono text-xs text-muted-foreground">
            {c.code}
            {c.commissionRate !== undefined &&
              Number(c.commissionRate) > 0 &&
              ` · ${(Number(c.commissionRate) * 100).toFixed(1)}%`}
          </span>
        </>
      )}
    />
  );
}
