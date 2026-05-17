"use client";

import { useMemo } from "react";
import { JmCombobox, type JmComboboxItem } from "@/jm";

interface Channel {
  id: string;
  name: string;
  code: string;
  commissionRate?: string | number;
}

type ChannelItem = JmComboboxItem & {
  channel: Channel;
};

interface Props {
  channels: Channel[];
  value: string;
  onChange: (id: string, channel: Channel) => void;
  placeholder?: string;
  /** clearable 켜면 X 버튼 → "" 반환. 기본 false (필수 선택 케이스) */
  clearable?: boolean;
  size?: "sm" | "md" | "lg";
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
  size = "sm",
}: Props) {
  const items = useMemo<ChannelItem[]>(
    () =>
      channels.map((c) => ({
        id: c.id,
        label: c.name,
        description:
          c.code +
          (c.commissionRate !== undefined && Number(c.commissionRate) > 0
            ? ` · ${(Number(c.commissionRate) * 100).toFixed(1)}%`
            : ""),
        channel: c,
      })),
    [channels],
  );

  return (
    <JmCombobox<ChannelItem>
      items={items}
      value={value}
      size={size}
      onChange={(item) => onChange(item.channel.id, item.channel)}
      placeholder={placeholder}
      searchPlaceholder="채널명·코드 검색..."
      emptyMessage="채널이 없습니다"
      clearable={clearable}
      onClear={clearable ? () => onChange("", EMPTY_CHANNEL) : undefined}
      matches={(item, q) => {
        const lower = q.toLowerCase();
        const c = item.channel;
        return (
          c.name.toLowerCase().includes(lower) ||
          c.code.toLowerCase().includes(lower)
        );
      }}
      renderItem={(item) => (
        <span className="flex min-w-0 flex-1 items-center gap-2">
          <span className="truncate text-[var(--jm-text)]">{item.channel.name}</span>
          <span className="ml-auto shrink-0 font-[family-name:var(--jm-font-mono)] text-jm-xs text-[var(--jm-text-muted)]">
            {item.description}
          </span>
        </span>
      )}
    />
  );
}
