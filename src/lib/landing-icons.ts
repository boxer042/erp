import {
  AlertTriangle,
  Award,
  BadgeCheck,
  Building2,
  Clock,
  CreditCard,
  FileText,
  Gift,
  Info,
  Mail,
  MapPin,
  Package,
  Phone,
  RefreshCcw,
  ShieldCheck,
  Sparkles,
  Star,
  Tag,
  Truck,
  Wrench,
  type LucideIcon,
} from "lucide-react";

/**
 * Landing 블록(callout / info-grid 등) 에서 선택 가능한 아이콘 preset.
 * 새 아이콘 추가 시 LANDING_ICON_NAMES + LANDING_ICON_MAP 둘 다 갱신.
 */
export const LANDING_ICON_NAMES = [
  "Truck",
  "Package",
  "RefreshCcw",
  "Wrench",
  "Info",
  "AlertTriangle",
  "ShieldCheck",
  "Clock",
  "Phone",
  "Mail",
  "MapPin",
  "CreditCard",
  "Tag",
  "Gift",
  "Star",
  "Sparkles",
  "Award",
  "BadgeCheck",
  "FileText",
  "Building2",
] as const;

export type LandingIconName = (typeof LANDING_ICON_NAMES)[number];

export const LANDING_ICON_MAP: Record<LandingIconName, LucideIcon> = {
  Truck,
  Package,
  RefreshCcw,
  Wrench,
  Info,
  AlertTriangle,
  ShieldCheck,
  Clock,
  Phone,
  Mail,
  MapPin,
  CreditCard,
  Tag,
  Gift,
  Star,
  Sparkles,
  Award,
  BadgeCheck,
  FileText,
  Building2,
};

export const LANDING_ICON_LABELS: Record<LandingIconName, string> = {
  Truck: "트럭 (배송)",
  Package: "패키지 (상품)",
  RefreshCcw: "새로고침 (교환·반품)",
  Wrench: "공구 (A/S)",
  Info: "정보",
  AlertTriangle: "경고 (주의)",
  ShieldCheck: "방패 (보증)",
  Clock: "시계 (시간)",
  Phone: "전화",
  Mail: "메일",
  MapPin: "위치",
  CreditCard: "카드 (결제)",
  Tag: "태그 (할인)",
  Gift: "선물",
  Star: "별",
  Sparkles: "반짝 (신상)",
  Award: "수상",
  BadgeCheck: "인증",
  FileText: "문서",
  Building2: "건물 (사업자)",
};

/** 안전한 아이콘 조회 — preset 외 이름이면 null */
export function resolveLandingIcon(name: string | null | undefined): LucideIcon | null {
  if (!name) return null;
  if ((LANDING_ICON_NAMES as readonly string[]).includes(name)) {
    return LANDING_ICON_MAP[name as LandingIconName];
  }
  return null;
}
