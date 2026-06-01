"use client";

import * as React from "react";
import { useRef, useState } from "react";
import {
  Activity,
  BarChart3,
  Bell,
  Check,
  Columns2,
  Copy,
  Crop,
  Edit,
  FileText,
  Grid3x3,
  Heart,
  Home,
  ImagePlus,
  Images,
  Inbox,
  List,
  LogOut,
  MoreHorizontal,
  Package,
  PanelLeftOpen,
  Plus,
  RectangleHorizontal,
  Search,
  Settings,
  ShoppingBag,
  ShoppingCart,
  Square,
  Star,
  Trash2,
  Users,
  Wrench,
  X,
} from "lucide-react";
import {
  JmBadge,
  JmBrandMark,
  type JmBrandMarkTone,
  type JmBrandMarkVariant,
  type JmBrandMarkShape,
  JmButton,
  JmCard,
  JmCardContent,
  JmCardDescription,
  JmCardFooter,
  JmCardHeader,
  JmCardTitle,
  JmAccordion,
  JmAccordionHeader,
  JmAccordionItem,
  JmAccordionPanel,
  JmAccordionTrigger,
  JmAvatar,
  JmCheckbox,
  JmCombobox,
  JmComboboxDrawer,
  JmComboboxModal,
  JmDateRangePicker,
  JmDatePicker,
  JmCalendar,
  JmTimePicker,
  type DateRange,
  JmDialog,
  JmDialogBody,
  JmDialogContent,
  JmDialogDescription,
  JmDialogFooter,
  JmDialogHeader,
  JmDialogTitle,
  JmDrawer,
  JmDrawerBody,
  JmDrawerClose,
  JmDrawerContent,
  JmDrawerDescription,
  JmDrawerFooter,
  JmDrawerHeader,
  JmDrawerTitle,
  JmDrawerTrigger,
  JmDropdownMenu,
  JmDropdownMenuContent,
  JmDropdownMenuGroup,
  JmDropdownMenuItem,
  JmDropdownMenuLabel,
  JmDropdownMenuSeparator,
  JmDropdownMenuTrigger,
  JmEmpty,
  JmFilterDropdown,
  JmIconButton,
  JmImageEditor,
  JmSourceDrawer,
  JmInput,
  JmNumberInput,
  JmQuantityStepper,
  JmPill,
  JmRadio,
  JmRadioGroup,
  JmSearchInput,
  JmSectionLabel,
  JmSelect,
  JmSwitch,
  JmTable,
  JmTableBody,
  JmTableCell,
  JmTableHead,
  JmTableHeader,
  JmTableRow,
  JmTableToolbar,
  JmTableToolbarActions,
  JmTableToolbarFilters,
  JmTableToolbarMore,
  JmTableToolbarSearch,
  JmSidebar,
  JmSidebarBody,
  JmSidebarFooter,
  JmSidebarGroup,
  JmSidebarHeader,
  JmSidebarItem,
  JmSidebarProvider,
  JmSidebarSeparator,
  JmSidebarTrigger,
  useJmSidebar,
  JmTabs,
  JmTabsIndicator,
  JmTabsList,
  JmTabsPanel,
  JmTabsTrigger,
  JmTextarea,
  JmToaster,
  JmTooltip,
  JmTooltipProvider,
  JmAlert,
  JmFormField,
  JmKbd,
  JmProgress,
  JmScope,
  JmScrollArea,
  JmSegmentedControl,
  JmSeparator,
  JmSkeleton,
  JmSlider,
  JmSpinner,
  JmStat,
  JmThemeToggle,
  jmToast,
  type JmComboboxItem,
  type JmTheme,
} from "@/jm";

const colorTokens = [
  {
    group: "Surfaces",
    items: [
      { name: "--jm-bg", desc: "페이지 배경" },
      { name: "--jm-surface", desc: "카드/시트 표면" },
      { name: "--jm-surface-muted", desc: "테이블 헤더, 보조 배경" },
      { name: "--jm-surface-subtle", desc: "더 미세한 보조" },
    ],
  },
  {
    group: "Borders",
    items: [
      { name: "--jm-border", desc: "기본 보더" },
      { name: "--jm-border-strong", desc: "포커스, 호버 강조" },
    ],
  },
  {
    group: "Text",
    items: [
      { name: "--jm-text", desc: "기본 텍스트" },
      { name: "--jm-text-muted", desc: "보조 텍스트" },
      { name: "--jm-text-subtle", desc: "플레이스홀더, 비활성" },
      { name: "--jm-text-disabled", desc: "비활성 텍스트" },
    ],
  },
  {
    group: "Action (CTA)",
    items: [
      { name: "--jm-action", desc: "주요 버튼 배경" },
      { name: "--jm-action-fg", desc: "주요 버튼 텍스트" },
      { name: "--jm-action-hover", desc: "주요 버튼 호버" },
      { name: "--jm-action-active", desc: "주요 버튼 액티브" },
    ],
  },
  {
    group: "Semantic",
    items: [
      { name: "--jm-success-bg", desc: "성공 배지 배경" },
      { name: "--jm-success-fg", desc: "성공 배지 텍스트" },
      { name: "--jm-success-solid", desc: "성공 솔리드" },
      { name: "--jm-warning-bg", desc: "경고 배지 배경" },
      { name: "--jm-warning-fg", desc: "경고 배지 텍스트" },
      { name: "--jm-warning-solid", desc: "경고 솔리드" },
      { name: "--jm-danger-bg", desc: "위험 배지 배경" },
      { name: "--jm-danger-fg", desc: "위험 배지 텍스트" },
      { name: "--jm-danger-solid", desc: "위험 솔리드" },
      { name: "--jm-info-bg", desc: "정보 배지 배경" },
      { name: "--jm-info-fg", desc: "정보 배지 텍스트" },
      { name: "--jm-info-solid", desc: "정보 솔리드" },
    ],
  },
];

const SUPPLIERS: JmComboboxItem[] = [
  { id: "1", label: "삼성전자", description: "사업자번호 124-81-00998" },
  { id: "2", label: "LG전자", description: "사업자번호 107-86-14075" },
  { id: "3", label: "SK하이닉스", description: "사업자번호 130-81-25586" },
  { id: "4", label: "현대자동차", description: "사업자번호 101-81-09147" },
  { id: "5", label: "네이버", description: "사업자번호 220-81-62517" },
  { id: "6", label: "카카오", description: "사업자번호 120-81-47521" },
];

const SAMPLE_ROWS = [
  { sku: "PRD-001", name: "맥북 프로 14", price: 2790000, stock: 3, status: "active" },
  { sku: "PRD-002", name: "에어팟 프로", price: 359000, stock: 12, status: "active" },
  { sku: "PRD-003", name: "스마트워치", price: 0, stock: 0, status: "inactive" },
  { sku: "PRD-004", name: "충전 케이블 1m", price: 12000, stock: 158, status: "active" },
];

export default function JmShowcasePage() {
  const [pillFilter, setPillFilter] = useState<"all" | "active" | "draft">("all");
  const [selectValue, setSelectValue] = useState<"" | "card" | "cash" | "transfer">("");
  const [comboboxValue, setComboboxValue] = useState("");

  // Drawer 상태
  const [drawerRightOpen, setDrawerRightOpen] = useState(false);
  const [drawerBottomOpen, setDrawerBottomOpen] = useState(false);
  const [drawerLeftOpen, setDrawerLeftOpen] = useState(false);
  const [drawerFormName, setDrawerFormName] = useState("홍길동");
  const [drawerFormSupplier, setDrawerFormSupplier] = useState("");

  // Dialog 상태
  const [dialogOpen, setDialogOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  // ComboboxModal 상태
  const [comboboxModalOpen, setComboboxModalOpen] = useState(false);
  const [comboboxModalSelected, setComboboxModalSelected] = useState<
    JmComboboxItem | null
  >(null);
  const [comboboxModalInputOpen, setComboboxModalInputOpen] = useState(false);
  const [comboboxModalInputSelected, setComboboxModalInputSelected] =
    useState<JmComboboxItem | null>(null);
  const [comboboxDrawerOpen, setComboboxDrawerOpen] = useState(false);
  const [comboboxDrawerSelected, setComboboxDrawerSelected] =
    useState<JmComboboxItem | null>(null);

  // 이미지 — SourceDrawer / ImageEditor
  const [sourceDrawerOpen, setSourceDrawerOpen] = useState(false);
  const editorInputRef = useRef<HTMLInputElement>(null);
  const [editorFile, setEditorFile] = useState<File | null>(null);
  const [editorResult, setEditorResult] = useState<string | null>(null);

  // NumberInput 상태
  const [price, setPrice] = useState("125000");
  const [qty, setQty] = useState("");
  const [discount, setDiscount] = useState("10");
  const [taxAmount, setTaxAmount] = useState("12500");

  // QuantityStepper 상태
  const [stepperQty, setStepperQty] = useState(1);
  const [stepperBulkQty, setStepperBulkQty] = useState(1.5);

  // Radio / DateRange 상태
  const [paymentMethod, setPaymentMethod] = useState("card");
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
  const [singleDate, setSingleDate] = useState<Date | undefined>(undefined);
  const [inlineDate, setInlineDate] = useState<Date | undefined>(undefined);
  const [timeValue, setTimeValue] = useState<string>("14:30");

  // Slider / Segmented / Alert 상태
  const [singleVal, setSingleVal] = useState(40);
  const [rangeVal, setRangeVal] = useState<[number, number]>([20, 80]);
  const [viewMode, setViewMode] = useState<"list" | "grid">("list");
  const [period, setPeriod] = useState<"day" | "week" | "month">("week");
  const [alertVisible, setAlertVisible] = useState(true);

  // 테마 상태
  const [theme, setTheme] = useState<JmTheme>("light");

  // Checkbox / Switch 상태
  const [agree, setAgree] = useState(false);
  const [partial, setPartial] = useState<boolean | "indeterminate">(
    "indeterminate",
  );
  const [notify, setNotify] = useState(true);
  const [darkMode, setDarkMode] = useState(false);

  // Filter dropdown 상태
  const [tagFilter, setTagFilter] = useState<string[]>(["new"]);
  const [categoryFilter, setCategoryFilter] = useState<string[]>([]);

  // Table 필터링 상태
  const [tableSearch, setTableSearch] = useState("");
  const [tableStatus, setTableStatus] = useState<"all" | "active" | "inactive">("all");
  const [tableStock, setTableStock] = useState<"all" | "in" | "out">("all");
  const [tableCategory, setTableCategory] = useState<string>("all");

  const filteredRows = SAMPLE_ROWS.filter((r) => {
    if (tableStatus !== "all" && r.status !== tableStatus) return false;
    if (tableStock === "in" && r.stock <= 0) return false;
    if (tableStock === "out" && r.stock > 0) return false;
    if (tableSearch.trim()) {
      const q = tableSearch.trim().toLowerCase();
      if (
        !r.name.toLowerCase().includes(q) &&
        !r.sku.toLowerCase().includes(q)
      ) {
        return false;
      }
    }
    return true;
  });

  const activeFilterCount =
    (tableStatus !== "all" ? 1 : 0) +
    (tableStock !== "all" ? 1 : 0) +
    (tableCategory !== "all" ? 1 : 0) +
    (tableSearch.trim() ? 1 : 0);

  const moreFilterCount =
    (tableCategory !== "all" ? 1 : 0);

  const resetFilters = () => {
    setTableSearch("");
    setTableStatus("all");
    setTableStock("all");
    setTableCategory("all");
  };

  return (
    <JmScope theme={theme} className="min-h-dvh">
    <JmTooltipProvider delay={150}>
    <div className="mx-auto max-w-5xl px-6 py-10">
      {/* Page header */}
      <header className="mb-10 flex flex-col gap-3">
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-2">
            <span className="text-jm-xs font-semibold uppercase tracking-wider text-[var(--jm-text-muted)]">
              jaewoomade design system
            </span>
            <h1 className="text-jm-5xl font-bold tracking-tight text-[var(--jm-text)]">
              컴포넌트 showcase
            </h1>
          </div>
          <div className="shrink-0">
            <JmThemeToggle value={theme} onChange={setTheme} />
          </div>
        </div>
        <p className="text-jm-base text-[var(--jm-text-muted)]">
          프로젝트 전반에서 재사용되는 디자인 primitive 모음. 토큰을 바꾸면 모든 사용처가
          한 번에 바뀝니다. 우상단 토글로 라이트/다크/자동 모드 전환.
        </p>
      </header>

      <div className="flex flex-col gap-12">
        {/* COLORS */}
        <Section title="색상 토큰" subtitle="--jm-* CSS 변수. 다른 프로젝트로 이식 시 토큰 값만 교체하면 됩니다.">
          <div className="flex flex-col gap-6">
            {colorTokens.map((g) => (
              <div key={g.group} className="flex flex-col gap-2">
                <JmSectionLabel>{g.group}</JmSectionLabel>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                  {g.items.map((t) => (
                    <ColorSwatch key={t.name} token={t.name} desc={t.desc} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Section>

        {/* FONT */}
        <Section
          title="폰트"
          subtitle="--jm-font-sans / --jm-font-mono. JmScope wrapper에 자동 적용. 한글은 Pretendard, 영문/숫자는 Geist."
        >
          <JmCard>
            <JmCardContent className="flex flex-col gap-4">
              <div className="flex flex-col gap-1">
                <span className="text-jm-2xs font-semibold uppercase tracking-wider text-[var(--jm-text-muted)]">
                  --jm-font-sans
                </span>
                <code className="font-[family-name:var(--jm-font-mono)] text-jm-2xs text-[var(--jm-text-muted)]">
                  Geist Sans → Pretendard Variable → system-ui → Apple SD Gothic Neo → Malgun Gothic
                </code>
              </div>
              <div className="flex flex-col gap-2 border-t border-[var(--jm-border)] pt-4">
                <span className="text-jm-base text-[var(--jm-text-muted)]">
                  영문 weight 비교 (Geist)
                </span>
                <p className="text-jm-2xl font-light">
                  The quick brown fox 0123456789 — Light 300
                </p>
                <p className="text-jm-2xl">
                  The quick brown fox 0123456789 — Regular 400
                </p>
                <p className="text-jm-2xl font-medium">
                  The quick brown fox 0123456789 — Medium 500
                </p>
                <p className="text-jm-2xl font-semibold">
                  The quick brown fox 0123456789 — Semibold 600
                </p>
                <p className="text-jm-2xl font-bold">
                  The quick brown fox 0123456789 — Bold 700
                </p>
              </div>
              <div className="flex flex-col gap-2 border-t border-[var(--jm-border)] pt-4">
                <span className="text-jm-base text-[var(--jm-text-muted)]">
                  한글 weight 비교 (Pretendard)
                </span>
                <p className="text-jm-2xl font-light">
                  다람쥐 헌 쳇바퀴에 타고파 — Light 300
                </p>
                <p className="text-jm-2xl">
                  다람쥐 헌 쳇바퀴에 타고파 — Regular 400
                </p>
                <p className="text-jm-2xl font-medium">
                  다람쥐 헌 쳇바퀴에 타고파 — Medium 500
                </p>
                <p className="text-jm-2xl font-semibold">
                  다람쥐 헌 쳇바퀴에 타고파 — Semibold 600
                </p>
                <p className="text-jm-2xl font-bold">
                  다람쥐 헌 쳇바퀴에 타고파 — Bold 700
                </p>
              </div>
              <div className="flex flex-col gap-2 border-t border-[var(--jm-border)] pt-4">
                <span className="text-jm-base text-[var(--jm-text-muted)]">
                  Mono — --jm-font-mono (Geist Mono)
                </span>
                <p className="font-[family-name:var(--jm-font-mono)] text-jm-base text-[var(--jm-text)]">
                  const total = 1234567.toLocaleString(&quot;ko-KR&quot;);
                </p>
                <p className="font-[family-name:var(--jm-font-mono)] text-jm-base tabular-nums text-[var(--jm-text)]">
                  ₩1,234,567 · 010-1234-5678 · SKU-AB-2026-0042
                </p>
              </div>
            </JmCardContent>
          </JmCard>
        </Section>

        {/* TYPOGRAPHY */}
        <Section title="타이포그래피" subtitle="POS 스타일 — 픽셀 단위 size로 명시. 본문은 14~15px, 헤더는 18~22px, 라벨은 11~12px.">
          <JmCard>
            <JmCardContent className="flex flex-col gap-3">
              <p className="text-jm-5xl font-bold text-[var(--jm-text)]">
                Heading 32 / Bold
              </p>
              <p className="text-jm-3xl font-bold text-[var(--jm-text)]">
                Heading 22 / Bold
              </p>
              <p className="text-jm-xl font-bold text-[var(--jm-text)]">
                Heading 18 / Bold
              </p>
              <p className="text-jm-md text-[var(--jm-text)]">
                Body 15 — 본문 큰 사이즈
              </p>
              <p className="text-jm-base text-[var(--jm-text)]">
                Body 14 — 본문 기본
              </p>
              <p className="text-jm-sm text-[var(--jm-text-muted)]">
                Body 13 muted — 보조 텍스트
              </p>
              <p className="text-jm-xs text-[var(--jm-text-muted)]">
                Caption 12 — 캡션, 메타 정보
              </p>
              <JmSectionLabel>SECTION LABEL 11</JmSectionLabel>
            </JmCardContent>
          </JmCard>
        </Section>

        {/* BUTTONS */}
        <Section title="버튼" subtitle="JmButton — variant × size 조합">
          <div className="flex flex-col gap-4">
            <Row label="variant">
              <JmButton variant="cta">CTA 버튼</JmButton>
              <JmButton variant="secondary">Secondary</JmButton>
              <JmButton variant="outline">Outline</JmButton>
              <JmButton variant="ghost">Ghost</JmButton>
              <JmButton variant="danger">Danger</JmButton>
              <JmButton variant="link">Link</JmButton>
            </Row>
            <Row label="size">
              <JmButton size="lg">Large h-14</JmButton>
              <JmButton size="md">Medium h-12</JmButton>
              <JmButton size="sm">Small h-10</JmButton>
              <JmButton size="xs">XS h-8</JmButton>
            </Row>
            <Row label="아이콘 + 텍스트">
              <JmButton>
                <Plus />
                새로 만들기
              </JmButton>
              <JmButton variant="secondary">
                <Search />
                검색
              </JmButton>
              <JmButton variant="outline">
                <Settings />
                설정
              </JmButton>
              <JmButton variant="danger">
                <Trash2 />
                삭제
              </JmButton>
            </Row>
            <Row label="비활성">
              <JmButton disabled>비활성 CTA</JmButton>
              <JmButton variant="secondary" disabled>
                비활성 Secondary
              </JmButton>
            </Row>
          </div>
        </Section>

        {/* ICON BUTTON */}
        <Section title="아이콘 버튼" subtitle="JmIconButton — 헤더 햄버거/뒤로가기/닫기 같은 단독 아이콘 버튼">
          <div className="flex flex-col gap-4">
            <Row label="variant">
              <JmIconButton aria-label="설정">
                <Settings />
              </JmIconButton>
              <JmIconButton variant="solid" aria-label="알림">
                <Bell />
              </JmIconButton>
              <JmIconButton variant="outline" aria-label="별표">
                <Star />
              </JmIconButton>
            </Row>
            <Row label="size">
              <JmIconButton size="sm" aria-label="삭제">
                <Trash2 />
              </JmIconButton>
              <JmIconButton size="md" aria-label="삭제">
                <Trash2 />
              </JmIconButton>
              <JmIconButton size="lg" aria-label="삭제">
                <Trash2 />
              </JmIconButton>
            </Row>
          </div>
        </Section>

        {/* BADGE */}
        <Section title="배지" subtitle="JmBadge — 상태 라벨, SKU, 태그">
          <div className="flex flex-col gap-4">
            <Row label="variant">
              <JmBadge>기본</JmBadge>
              <JmBadge variant="outline">아웃라인</JmBadge>
              <JmBadge variant="solid">솔리드</JmBadge>
              <JmBadge variant="success">
                <Check />
                성공
              </JmBadge>
              <JmBadge variant="warning">경고</JmBadge>
              <JmBadge variant="danger">위험</JmBadge>
              <JmBadge variant="info">정보</JmBadge>
            </Row>
            <Row label="size">
              <JmBadge size="sm">SM</JmBadge>
              <JmBadge size="md">MD</JmBadge>
              <JmBadge size="lg">LG</JmBadge>
            </Row>
            <Row label="shape">
              <JmBadge shape="pill">Pill</JmBadge>
              <JmBadge shape="square">Square</JmBadge>
              <JmBadge shape="square" variant="outline">
                SKU-12345
              </JmBadge>
            </Row>
          </div>
        </Section>

        {/* CARD */}
        <Section title="카드" subtitle="JmCard + Header/Title/Content/Footer 조합">
          <div className="grid gap-4 md:grid-cols-2">
            <JmCard>
              <JmCardHeader>
                <JmCardTitle>기본 카드</JmCardTitle>
                <JmCardDescription>
                  헤더, 본문, 푸터의 기본 구조
                </JmCardDescription>
              </JmCardHeader>
              <JmCardContent>
                <p className="text-jm-base text-[var(--jm-text)]">
                  본문 내용이 들어가는 영역. 자유롭게 구성 가능.
                </p>
              </JmCardContent>
              <JmCardFooter>
                <JmButton variant="ghost" size="sm">
                  취소
                </JmButton>
                <JmButton size="sm">확인</JmButton>
              </JmCardFooter>
            </JmCard>

            <JmCard className="p-5">
              <div className="flex items-start gap-3">
                <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-[var(--jm-surface-muted)]">
                  <ShoppingCart className="size-5 text-[var(--jm-text-muted)]" />
                </div>
                <div className="flex flex-1 flex-col gap-1">
                  <div className="flex items-center justify-between">
                    <span className="text-jm-md font-semibold text-[var(--jm-text)]">
                      간단 카드
                    </span>
                    <JmBadge variant="success" size="sm">
                      활성
                    </JmBadge>
                  </div>
                  <p className="text-jm-sm text-[var(--jm-text-muted)]">
                    헤더/푸터 없이 자유 레이아웃
                  </p>
                </div>
              </div>
            </JmCard>
          </div>
        </Section>

        {/* INPUTS */}
        <Section title="인풋" subtitle="JmInput, JmTextarea — 텍스트 입력">
          <div className="flex flex-col gap-4">
            <Row label="size">
              <JmInput size="lg" placeholder="Large h-12" />
              <JmInput size="md" placeholder="Medium h-11" />
              <JmInput size="sm" placeholder="Small h-9" />
            </Row>
            <Row label="state">
              <JmInput placeholder="기본" />
              <JmInput placeholder="비활성" disabled />
              <JmInput placeholder="에러 상태" tone="invalid" defaultValue="잘못된 값" />
            </Row>
            <div className="flex flex-col gap-2">
              <span className="text-jm-xs text-[var(--jm-text-muted)]">textarea</span>
              <JmTextarea
                rows={3}
                placeholder="여러 줄 텍스트 입력..."
              />
            </div>
          </div>
        </Section>

        {/* PILLS */}
        <Section title="필터/세그먼트 Pill" subtitle="JmPill — 카테고리·필터·세그먼트 컨트롤">
          <div className="flex flex-col gap-4">
            <Row label="필터 (단일 선택)">
              {(["all", "active", "draft"] as const).map((v) => (
                <JmPill
                  key={v}
                  active={pillFilter === v}
                  onClick={() => setPillFilter(v)}
                >
                  {v === "all" ? "전체" : v === "active" ? "활성" : "초안"}
                </JmPill>
              ))}
            </Row>
            <Row label="size">
              <JmPill size="sm">Small</JmPill>
              <JmPill size="md" active>
                Medium 활성
              </JmPill>
              <JmPill size="lg">Large</JmPill>
            </Row>
          </div>
        </Section>

        {/* SELECT */}
        <Section
          title="Select"
          subtitle="JmSelect — 검색 없는 드롭다운. default 는 form control, pill 은 chip 형태 트리거 (테이블 toolbar filter strip 용)."
        >
          <div className="grid gap-4 sm:max-w-md">
            <div className="text-jm-xs font-semibold uppercase tracking-wider text-[var(--jm-text-subtle)]">
              default variant — 폼 control
            </div>
            <JmSelect
              options={[
                { value: "card", label: "카드" },
                { value: "cash", label: "현금" },
                { value: "transfer", label: "계좌이체", description: "수수료 0%" },
              ]}
              value={selectValue}
              onChange={setSelectValue}
              placeholder="결제 수단 선택"
            />
            <div className="mt-4 text-jm-xs font-semibold uppercase tracking-wider text-[var(--jm-text-subtle)]">
              pill variant — chip 형태 (filter strip 용)
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <JmSelect
                variant="pill"
                size="sm"
                label="결제수단"
                value={selectValue}
                onChange={setSelectValue}
                options={[
                  { value: "card", label: "카드" },
                  { value: "cash", label: "현금" },
                  { value: "transfer", label: "계좌이체" },
                ]}
                pillActive={!!selectValue}
              />
              <JmSelect
                variant="pill"
                size="sm"
                label="채널"
                value=""
                onChange={() => {}}
                options={[
                  { value: "coupang", label: "쿠팡" },
                  { value: "naver", label: "네이버" },
                  { value: "offline", label: "오프라인" },
                ]}
              />
            </div>
            <p className="text-jm-sm text-[var(--jm-text-muted)]">
              선택값: <span className="font-mono">{selectValue || "(없음)"}</span>
            </p>
          </div>
        </Section>

        {/* COMBOBOX */}
        <Section title="Combobox" subtitle="JmCombobox — 검색 가능한 select. 옵션 많을 때 / 입력으로 찾을 때.">
          <div className="grid gap-4 sm:max-w-md">
            <JmCombobox
              items={SUPPLIERS}
              value={comboboxValue}
              onChange={(item) => setComboboxValue(item.id)}
              onClear={() => setComboboxValue("")}
              clearable
              placeholder="거래처 선택..."
              searchPlaceholder="이름·사업자번호 검색"
              onCreateNew={(query) => alert(`'${query}' 새로 등록`)}
            />
            <p className="text-jm-sm text-[var(--jm-text-muted)]">
              선택값:{" "}
              <span className="font-mono">{comboboxValue || "(없음)"}</span>
            </p>
          </div>
        </Section>

        {/* SEARCH INPUT */}
        <Section
          title="검색 인풋"
          subtitle="JmSearchInput — 좌측 search 아이콘 + 우측 X 버튼 (값 있을 때 자동 노출)"
        >
          <div className="grid gap-3 sm:max-w-md">
            <JmSearchInput
              size="lg"
              placeholder="Large 검색"
              value={tableSearch}
              onChange={(e) => setTableSearch(e.target.value)}
              onClear={() => setTableSearch("")}
            />
            <JmSearchInput
              placeholder="Medium 검색"
              value={tableSearch}
              onChange={(e) => setTableSearch(e.target.value)}
              onClear={() => setTableSearch("")}
            />
            <JmSearchInput
              size="sm"
              placeholder="Small 검색"
              value={tableSearch}
              onChange={(e) => setTableSearch(e.target.value)}
              onClear={() => setTableSearch("")}
            />
          </div>
        </Section>

        {/* TABLE + TOOLBAR + FILTERING */}
        <Section
          title="테이블 + 필터 툴바"
          subtitle="JmTableToolbar — 항상 2-row Grid (모바일·데스크톱 통일). row1: 검색 + 액션, row2: 필터 strip (가로 스크롤 + 드래그 + 휠→가로). 인라인 select 는 JmSelect variant='pill', 깊은 필터는 JmTableToolbarMore (데스크톱 popover · 모바일 drawer)."
        >
          <JmCard className="overflow-hidden p-0">
            <JmTableToolbar>
              <JmTableToolbarSearch>
                <JmSearchInput
                  size="sm"
                  placeholder="상품명·SKU 검색"
                  value={tableSearch}
                  onChange={(e) => setTableSearch(e.target.value)}
                  onClear={() => setTableSearch("")}
                />
              </JmTableToolbarSearch>
              <JmTableToolbarFilters>
                {(["all", "active", "inactive"] as const).map((v) => (
                  <JmPill
                    key={`status-${v}`}
                    size="sm"
                    active={tableStatus === v}
                    onClick={() => setTableStatus(v)}
                  >
                    {v === "all" ? "전체" : v === "active" ? "활성" : "비활성"}
                  </JmPill>
                ))}
                <span
                  aria-hidden
                  className="mx-1 h-4 w-px bg-[var(--jm-border)]"
                />
                {(["all", "in", "out"] as const).map((v) => (
                  <JmPill
                    key={`stock-${v}`}
                    size="sm"
                    active={tableStock === v}
                    onClick={() => setTableStock(v)}
                  >
                    {v === "all" ? "재고 전체" : v === "in" ? "재고 있음" : "품절"}
                  </JmPill>
                ))}
                {/* 인라인 pill select — 자주 쓰는 필터는 strip 안에 직접 노출 */}
                <JmSelect
                  variant="pill"
                  size="sm"
                  label="카테고리"
                  value={tableCategory}
                  onChange={setTableCategory}
                  options={[
                    { value: "all", label: "전체" },
                    { value: "lens", label: "렌즈" },
                    { value: "frame", label: "프레임" },
                    { value: "accessory", label: "부속" },
                  ]}
                  pillActive={tableCategory !== "all"}
                />
                {/* 깊은 필터 — 데스크톱 popover / 모바일 drawer */}
                <JmTableToolbarMore
                  count={moreFilterCount}
                  onReset={() => setTableCategory("all")}
                >
                  <div className="flex flex-col gap-2">
                    <span className="text-jm-xs font-semibold text-[var(--jm-text)]">
                      카테고리 (드로어/팝오버 안 select)
                    </span>
                    <JmSelect
                      size="sm"
                      value={tableCategory}
                      onChange={setTableCategory}
                      options={[
                        { value: "all", label: "전체 카테고리" },
                        { value: "lens", label: "렌즈" },
                        { value: "frame", label: "프레임" },
                        { value: "accessory", label: "부속" },
                      ]}
                    />
                  </div>
                </JmTableToolbarMore>
                {activeFilterCount > 0 && (
                  <button
                    type="button"
                    onClick={resetFilters}
                    className="ml-1 text-jm-xs text-[var(--jm-text-muted)] hover:text-[var(--jm-text)] hover:underline"
                  >
                    초기화 ({activeFilterCount})
                  </button>
                )}
              </JmTableToolbarFilters>
              <JmTableToolbarActions>
                <JmButton size="sm" variant="outline">
                  <Search />
                  내보내기
                </JmButton>
                <JmButton size="sm">
                  <Plus />
                  추가
                </JmButton>
              </JmTableToolbarActions>
            </JmTableToolbar>
            <JmTable>
              <JmTableHeader>
                <JmTableRow>
                  <JmTableHead>SKU</JmTableHead>
                  <JmTableHead>상품명</JmTableHead>
                  <JmTableHead className="text-right">가격</JmTableHead>
                  <JmTableHead className="text-right">재고</JmTableHead>
                  <JmTableHead>상태</JmTableHead>
                  <JmTableHead className="w-[80px]"></JmTableHead>
                </JmTableRow>
              </JmTableHeader>
              <JmTableBody>
                {filteredRows.length === 0 ? (
                  <JmTableRow className="hover:bg-transparent">
                    <JmTableCell
                      colSpan={6}
                      className="py-12 text-center text-jm-sm text-[var(--jm-text-muted)]"
                    >
                      조건에 맞는 행이 없습니다
                    </JmTableCell>
                  </JmTableRow>
                ) : (
                  filteredRows.map((r) => (
                    <JmTableRow key={r.sku}>
                      <JmTableCell>
                        <JmBadge variant="outline" shape="square">
                          {r.sku}
                        </JmBadge>
                      </JmTableCell>
                      <JmTableCell className="font-medium">{r.name}</JmTableCell>
                      <JmTableCell className="text-right tabular-nums">
                        ₩{r.price.toLocaleString("ko-KR")}
                      </JmTableCell>
                      <JmTableCell className="text-right tabular-nums">
                        {r.stock}
                      </JmTableCell>
                      <JmTableCell>
                        {r.status === "active" ? (
                          <JmBadge variant="success" size="sm">
                            활성
                          </JmBadge>
                        ) : (
                          <JmBadge variant="default" size="sm">
                            비활성
                          </JmBadge>
                        )}
                      </JmTableCell>
                      <JmTableCell className="text-right">
                        <JmIconButton size="sm" aria-label="좋아요">
                          <Heart />
                        </JmIconButton>
                      </JmTableCell>
                    </JmTableRow>
                  ))
                )}
              </JmTableBody>
            </JmTable>
            <div className="flex items-center justify-between border-t border-[var(--jm-border)] px-4 py-2.5 text-jm-xs text-[var(--jm-text-muted)]">
              <span>
                {filteredRows.length} / {SAMPLE_ROWS.length} 행 표시
              </span>
              <span className="font-[family-name:var(--jm-font-mono)] tabular-nums">
                합계 ₩
                {filteredRows
                  .reduce((sum, r) => sum + r.price * r.stock, 0)
                  .toLocaleString("ko-KR")}
              </span>
            </div>
          </JmCard>
        </Section>

        {/* DRAWER */}
        <Section
          title="드로워 (Drawer)"
          subtitle="JmDrawer — 모달성 사이드/바텀 시트. side(right/left/bottom/top) × size(sm/md/lg/xl/full). POS 카트, 결제, 등록 폼 등에 사용."
        >
          <div className="flex flex-col gap-4">
            <Row label="side">
              <JmButton
                variant="outline"
                onClick={() => setDrawerRightOpen(true)}
              >
                Right (등록 폼)
              </JmButton>
              <JmButton
                variant="outline"
                onClick={() => setDrawerBottomOpen(true)}
              >
                Bottom (거래명세표)
              </JmButton>
              <JmButton
                variant="outline"
                onClick={() => setDrawerLeftOpen(true)}
              >
                Left (메뉴)
              </JmButton>
            </Row>
            <p className="text-jm-xs text-[var(--jm-text-muted)]">
              Drawer 내부에서도 jm 토큰·폰트가 정상 적용되도록 자동으로
              <code className="mx-1 rounded bg-[var(--jm-surface-muted)] px-1.5 py-0.5 font-[family-name:var(--jm-font-mono)] text-jm-2xs">
                data-jm-scope
              </code>
              가 부착됩니다.
            </p>
          </div>

          {/* Right drawer — 등록 폼 */}
          <JmDrawer open={drawerRightOpen} onOpenChange={setDrawerRightOpen}>
            <JmDrawerContent side="right" size="md">
              <JmDrawerHeader>
                <JmDrawerTitle>고객 등록</JmDrawerTitle>
                <JmDrawerDescription>
                  필수 정보를 입력하고 저장하세요.
                </JmDrawerDescription>
              </JmDrawerHeader>
              <JmDrawerBody>
                <div className="flex flex-col gap-4">
                  <Field label="이름">
                    <JmInput
                      value={drawerFormName}
                      onChange={(e) => setDrawerFormName(e.target.value)}
                      placeholder="고객명"
                    />
                  </Field>
                  <Field label="전화">
                    <JmInput placeholder="010-0000-0000" />
                  </Field>
                  <Field label="거래처">
                    <JmCombobox
                      items={SUPPLIERS}
                      value={drawerFormSupplier}
                      onChange={(item) => setDrawerFormSupplier(item.id)}
                      onClear={() => setDrawerFormSupplier("")}
                      clearable
                      placeholder="선택..."
                      searchPlaceholder="이름 검색"
                    />
                  </Field>
                  <Field label="메모">
                    <JmTextarea rows={4} placeholder="비고" />
                  </Field>
                </div>
              </JmDrawerBody>
              <JmDrawerFooter>
                <JmDrawerClose
                  render={
                    <JmButton variant="ghost">취소</JmButton>
                  }
                />
                <JmButton onClick={() => setDrawerRightOpen(false)}>
                  저장
                </JmButton>
              </JmDrawerFooter>
            </JmDrawerContent>
          </JmDrawer>

          {/* Bottom drawer — 거래명세표 형태 */}
          <JmDrawer open={drawerBottomOpen} onOpenChange={setDrawerBottomOpen}>
            <JmDrawerContent side="bottom" size="xl">
              <JmDrawerHeader>
                <JmDrawerTitle>입고 등록</JmDrawerTitle>
                <JmDrawerDescription>
                  거래명세표 형태로 가로 폭을 넓게 활용
                </JmDrawerDescription>
              </JmDrawerHeader>
              <JmDrawerBody>
                <JmCard className="overflow-hidden p-0">
                  <JmTable>
                    <JmTableHeader>
                      <JmTableRow>
                        <JmTableHead>품명</JmTableHead>
                        <JmTableHead className="text-right">단가</JmTableHead>
                        <JmTableHead className="text-right">수량</JmTableHead>
                        <JmTableHead className="text-right">합계</JmTableHead>
                      </JmTableRow>
                    </JmTableHeader>
                    <JmTableBody>
                      {SAMPLE_ROWS.slice(0, 3).map((r) => (
                        <JmTableRow key={r.sku}>
                          <JmTableCell className="font-medium">
                            {r.name}
                          </JmTableCell>
                          <JmTableCell className="text-right tabular-nums">
                            ₩{r.price.toLocaleString("ko-KR")}
                          </JmTableCell>
                          <JmTableCell className="text-right tabular-nums">
                            10
                          </JmTableCell>
                          <JmTableCell className="text-right tabular-nums font-semibold">
                            ₩{(r.price * 10).toLocaleString("ko-KR")}
                          </JmTableCell>
                        </JmTableRow>
                      ))}
                    </JmTableBody>
                  </JmTable>
                </JmCard>
              </JmDrawerBody>
              <JmDrawerFooter>
                <JmDrawerClose
                  render={<JmButton variant="ghost">취소</JmButton>}
                />
                <JmButton onClick={() => setDrawerBottomOpen(false)}>
                  확정
                </JmButton>
              </JmDrawerFooter>
            </JmDrawerContent>
          </JmDrawer>

          {/* Left drawer — 메뉴 */}
          <JmDrawer open={drawerLeftOpen} onOpenChange={setDrawerLeftOpen}>
            <JmDrawerContent side="left" size="sm">
              <JmDrawerHeader>
                <JmDrawerTitle>메뉴</JmDrawerTitle>
              </JmDrawerHeader>
              <JmDrawerBody className="p-0">
                <nav className="flex flex-col py-2">
                  {[
                    "대시보드",
                    "거래처",
                    "상품",
                    "주문",
                    "재고",
                    "리포트",
                    "설정",
                  ].map((label) => (
                    <button
                      key={label}
                      type="button"
                      className="flex items-center justify-between px-5 py-3 text-left text-jm-base text-[var(--jm-text)] hover:bg-[var(--jm-surface-muted)]"
                      onClick={() => setDrawerLeftOpen(false)}
                    >
                      <span>{label}</span>
                      <span className="text-[var(--jm-text-subtle)]">›</span>
                    </button>
                  ))}
                </nav>
              </JmDrawerBody>
            </JmDrawerContent>
          </JmDrawer>
        </Section>

        {/* DIALOG */}
        <Section
          title="다이얼로그 (Dialog)"
          subtitle="JmDialog — 가운데 정렬 모달. 확인/입력/간단한 폼. drawer 와 별개."
        >
          <div className="flex flex-col gap-4">
            <Row label="size">
              <JmButton variant="outline" onClick={() => setDialogOpen(true)}>
                정보 다이얼로그 (md)
              </JmButton>
              <JmButton
                variant="outline"
                onClick={() => setConfirmOpen(true)}
              >
                삭제 확인 (sm)
              </JmButton>
            </Row>
          </div>

          <JmDialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <JmDialogContent size="md">
              <JmDialogHeader>
                <JmDialogTitle>주문 상세</JmDialogTitle>
                <JmDialogDescription>
                  ORD250506-0042 · 2026-05-06
                </JmDialogDescription>
              </JmDialogHeader>
              <JmDialogBody>
                <div className="flex flex-col gap-3 text-jm-base">
                  <Field label="고객명">
                    <JmInput defaultValue="홍길동" />
                  </Field>
                  <Field label="메모">
                    <JmTextarea rows={3} placeholder="배송 메모" />
                  </Field>
                </div>
              </JmDialogBody>
              <JmDialogFooter>
                <JmButton
                  variant="ghost"
                  onClick={() => setDialogOpen(false)}
                >
                  취소
                </JmButton>
                <JmButton onClick={() => setDialogOpen(false)}>저장</JmButton>
              </JmDialogFooter>
            </JmDialogContent>
          </JmDialog>

          <JmDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
            <JmDialogContent size="sm">
              <JmDialogHeader>
                <JmDialogTitle>정말 삭제할까요?</JmDialogTitle>
                <JmDialogDescription>
                  이 작업은 되돌릴 수 없습니다.
                </JmDialogDescription>
              </JmDialogHeader>
              <JmDialogFooter>
                <JmButton
                  variant="ghost"
                  onClick={() => setConfirmOpen(false)}
                >
                  취소
                </JmButton>
                <JmButton
                  variant="danger"
                  onClick={() => setConfirmOpen(false)}
                >
                  삭제
                </JmButton>
              </JmDialogFooter>
            </JmDialogContent>
          </JmDialog>
        </Section>

        {/* SOURCE DRAWER + IMAGE EDITOR */}
        <Section
          title="이미지 — 소스 드로워 + 편집기"
          subtitle="JmSourceDrawer(하단 소스 선택 시트) + JmImageEditor(크롭/회전/줌/밝기/지우개). 업로드·AI 배경제거는 호스트가 prop 으로 주입 — jm 은 순수 UI."
        >
          <div className="flex flex-col gap-5">
            <Row label="SourceDrawer">
              <JmButton
                variant="outline"
                onClick={() => setSourceDrawerOpen(true)}
              >
                <ImagePlus />
                이미지 추가
              </JmButton>
            </Row>
            <Row label="ImageEditor">
              <JmButton
                variant="outline"
                onClick={() => editorInputRef.current?.click()}
              >
                <Crop />
                파일 골라 편집
              </JmButton>
              <input
                ref={editorInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0] ?? null;
                  e.target.value = "";
                  setEditorFile(f);
                }}
              />
              {editorResult && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={editorResult}
                  alt="편집 결과"
                  className="size-16 rounded-lg border border-[var(--jm-border)] object-cover"
                />
              )}
            </Row>
          </div>

          <JmSourceDrawer
            open={sourceDrawerOpen}
            onOpenChange={setSourceDrawerOpen}
            title="이미지 추가"
            options={[
              {
                icon: <Square />,
                title: "1:1 썸네일",
                desc: "정사각형으로 잘라 업로드 (카드·리스트용)",
                onSelect: () => {
                  setSourceDrawerOpen(false);
                  jmToast("1:1 썸네일 선택");
                },
              },
              {
                icon: <RectangleHorizontal />,
                title: "자유 비율",
                desc: "원하는 비율로 잘라 업로드 (상세·배너용)",
                onSelect: () => {
                  setSourceDrawerOpen(false);
                  jmToast("자유 비율 선택");
                },
              },
              {
                icon: <Images />,
                title: "라이브러리",
                desc: "이미 올린 사진에서 선택",
                onSelect: () => {
                  setSourceDrawerOpen(false);
                  jmToast("라이브러리 선택");
                },
              },
            ]}
          />

          <JmImageEditor
            open={editorFile !== null}
            file={editorFile}
            onConfirm={(blob) => {
              setEditorResult(URL.createObjectURL(blob));
              setEditorFile(null);
              jmToast.success("편집 완료 (이 데모는 업로드 없이 결과만 표시)");
            }}
            onCancel={() => setEditorFile(null)}
            onError={(m) => jmToast.error(m)}
          />
        </Section>

        {/* COMBOBOX MODAL */}
        <Section
          title="콤보박스 모달 (풀스크린 검색)"
          subtitle="JmComboboxModal — POS 헤더 검색같은 스탠드얼론 검색 패턴. 트리거는 외부에서 별도 렌더."
        >
          <div className="flex flex-col gap-5">
            <Row label="버튼 trigger">
              <JmButton
                variant="outline"
                onClick={() => setComboboxModalOpen(true)}
              >
                <Search />
                거래처 검색
              </JmButton>
              {comboboxModalSelected && (
                <span className="text-jm-sm text-[var(--jm-text-muted)]">
                  선택:{" "}
                  <span className="font-semibold text-[var(--jm-text)]">
                    {comboboxModalSelected.label}
                  </span>
                </span>
              )}
            </Row>
            <Row label="인풋형 trigger">
              <div className="flex w-full max-w-md flex-col gap-1.5">
                <span className="text-jm-xs font-medium text-[var(--jm-text-muted)]">
                  거래처
                </span>
                <button
                  type="button"
                  onClick={() => setComboboxModalInputOpen(true)}
                  className="relative flex h-11 w-full items-center justify-between rounded-xl border border-[var(--jm-border)] bg-[var(--jm-bg)] px-4 text-left text-jm-base outline-none transition-colors hover:border-[var(--jm-border-strong)] focus-visible:ring-4 focus-visible:ring-[var(--jm-ring)]"
                >
                  <span
                    className={`truncate ${
                      comboboxModalInputSelected
                        ? "text-[var(--jm-text)]"
                        : "text-[var(--jm-text-subtle)]"
                    }`}
                  >
                    {comboboxModalInputSelected?.label ?? "거래처 선택..."}
                  </span>
                  <span className="ml-2 flex shrink-0 items-center gap-1 text-[var(--jm-text-muted)]">
                    {comboboxModalInputSelected && (
                      <span
                        role="button"
                        tabIndex={-1}
                        onClick={(e) => {
                          e.stopPropagation();
                          setComboboxModalInputSelected(null);
                        }}
                        className="flex size-6 items-center justify-center rounded-full hover:bg-[var(--jm-surface-muted)]"
                        aria-label="선택 해제"
                      >
                        <X className="size-3.5" />
                      </span>
                    )}
                    <Search className="size-4" />
                  </span>
                </button>
                <span className="text-jm-2xs text-[var(--jm-text-muted)]">
                  인풋처럼 보이지만 클릭하면 풀스크린 검색 모달이 열립니다 (POS
                  헤더 검색과 동일).
                </span>
              </div>
            </Row>
            <p className="text-jm-xs text-[var(--jm-text-muted)]">
              모바일/태블릿 화면에 최적화. 큰 입력 필드, 큰 행, 결과 0건일 때 새로
              등록 버튼.
            </p>
          </div>

          <JmComboboxModal<JmComboboxItem>
            open={comboboxModalOpen}
            onOpenChange={setComboboxModalOpen}
            title="거래처 검색"
            placeholder="이름·사업자번호 검색"
            items={SUPPLIERS}
            getKey={(s) => s.id}
            filterFn={(s, q) => {
              const lo = q.toLowerCase();
              return (
                s.label.toLowerCase().includes(lo) ||
                (s.description?.toLowerCase().includes(lo) ?? false)
              );
            }}
            renderItem={(s) => (
              <>
                <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-[var(--jm-surface-muted)] text-[var(--jm-text-muted)]">
                  <ShoppingCart className="size-5" />
                </div>
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="line-clamp-1 text-jm-md font-semibold text-[var(--jm-text)]">
                    {s.label}
                  </span>
                  {s.description && (
                    <span className="text-jm-xs text-[var(--jm-text-muted)]">
                      {s.description}
                    </span>
                  )}
                </div>
              </>
            )}
            onSelect={(s) => setComboboxModalSelected(s)}
            onCreate={(query) => alert(`'${query}' 새 거래처 등록`)}
          />

          {/* 인풋형 트리거가 여는 모달 */}
          <JmComboboxModal<JmComboboxItem>
            open={comboboxModalInputOpen}
            onOpenChange={setComboboxModalInputOpen}
            title="거래처 검색"
            placeholder="이름·사업자번호"
            items={SUPPLIERS}
            getKey={(s) => s.id}
            filterFn={(s, q) => {
              const lo = q.toLowerCase();
              return (
                s.label.toLowerCase().includes(lo) ||
                (s.description?.toLowerCase().includes(lo) ?? false)
              );
            }}
            renderItem={(s) => (
              <>
                <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-[var(--jm-surface-muted)] text-[var(--jm-text-muted)]">
                  <ShoppingCart className="size-5" />
                </div>
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="line-clamp-1 text-jm-md font-semibold text-[var(--jm-text)]">
                    {s.label}
                  </span>
                  {s.description && (
                    <span className="text-jm-xs text-[var(--jm-text-muted)]">
                      {s.description}
                    </span>
                  )}
                </div>
              </>
            )}
            onSelect={(s) => setComboboxModalInputSelected(s)}
          />
        </Section>

        {/* COMBOBOX DRAWER (바텀시트형) */}
        <Section
          title="콤보박스 드로워 (바텀시트)"
          subtitle="JmComboboxDrawer — 하단에서 올라오는 시트형 검색. 모바일 가상 키보드가 떠도 시트가 자동으로 같이 짧아짐(dvh) → 입력창·결과 안 가려짐."
        >
          <div className="flex flex-col gap-5">
            <Row label="버튼 trigger">
              <JmButton
                variant="outline"
                onClick={() => setComboboxDrawerOpen(true)}
              >
                <Search />
                상품 검색 (드로워)
              </JmButton>
              {comboboxDrawerSelected && (
                <span className="text-jm-sm text-[var(--jm-text-muted)]">
                  선택:{" "}
                  <span className="font-semibold text-[var(--jm-text)]">
                    {comboboxDrawerSelected.label}
                  </span>
                </span>
              )}
            </Row>
            <Row label="인풋형 trigger">
              <div className="flex w-full max-w-md flex-col gap-1.5">
                <span className="text-jm-xs font-medium text-[var(--jm-text-muted)]">
                  상품 (드로워 열기)
                </span>
                <button
                  type="button"
                  onClick={() => setComboboxDrawerOpen(true)}
                  className="relative flex h-11 w-full items-center justify-between rounded-xl border border-[var(--jm-border)] bg-[var(--jm-bg)] px-4 text-left text-jm-base outline-none transition-colors hover:border-[var(--jm-border-strong)] focus-visible:ring-4 focus-visible:ring-[var(--jm-ring)]"
                >
                  <span
                    className={`truncate ${
                      comboboxDrawerSelected
                        ? "text-[var(--jm-text)]"
                        : "text-[var(--jm-text-subtle)]"
                    }`}
                  >
                    {comboboxDrawerSelected?.label ?? "상품 선택..."}
                  </span>
                  <Search className="size-4 text-[var(--jm-text-muted)]" />
                </button>
              </div>
            </Row>
            <JmAlert variant="info" title="모바일 키보드 처리">
              시트의 max-height를 <code className="font-[family-name:var(--jm-font-mono)] text-jm-xs">dvh</code>(dynamic viewport height) 단위로 두면 가상 키보드가 올라올 때 viewport가 자동 축소되어 시트도 같이 짧아집니다. 입력창은 시트 상단에 고정 → 키보드 위에 항상 노출, 결과 리스트만 그 사이에서 스크롤. iOS Safari 주소창·노치 영역까지 자동 대응.
            </JmAlert>
          </div>

          <JmComboboxDrawer<JmComboboxItem>
            open={comboboxDrawerOpen}
            onOpenChange={setComboboxDrawerOpen}
            title="상품 검색"
            placeholder="상품명·SKU 검색"
            items={SUPPLIERS}
            getKey={(s) => s.id}
            filterFn={(s, q) => {
              const lo = q.toLowerCase();
              return (
                s.label.toLowerCase().includes(lo) ||
                (s.description?.toLowerCase().includes(lo) ?? false)
              );
            }}
            renderItem={(s) => (
              <>
                <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-[var(--jm-surface-muted)] text-[var(--jm-text-muted)]">
                  <ShoppingCart className="size-5" />
                </div>
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="line-clamp-1 text-jm-md font-semibold text-[var(--jm-text)]">
                    {s.label}
                  </span>
                  {s.description && (
                    <span className="text-jm-xs text-[var(--jm-text-muted)]">
                      {s.description}
                    </span>
                  )}
                </div>
              </>
            )}
            onSelect={(s) => setComboboxDrawerSelected(s)}
            onCreate={(query) => alert(`'${query}' 새 상품 등록`)}
          />
        </Section>

        {/* NUMBER / PRICE INPUT */}
        <Section
          title="숫자·가격 입력 (JmNumberInput)"
          subtitle="정수 전용. 천 단위 콤마 자동. 클릭 시 select-all 안 함 — 캐럿이 끝으로, X 버튼으로 일괄 삭제."
        >
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="가격 (₩ prefix)">
              <JmNumberInput
                value={price}
                onValueChange={setPrice}
                thousands
                prefix="₩"
                placeholder="0"
              />
            </Field>
            <Field label="수량 (suffix)">
              <JmNumberInput
                value={qty}
                onValueChange={setQty}
                suffix="개"
                placeholder="0"
              />
            </Field>
            <Field label="할인율 (%)">
              <JmNumberInput
                value={discount}
                onValueChange={setDiscount}
                suffix="%"
                placeholder="0"
              />
            </Field>
            <Field label="부가세 (자동 계산 가정)">
              <JmNumberInput
                value={taxAmount}
                onValueChange={setTaxAmount}
                thousands
                disabled
                prefix="₩"
              />
            </Field>
            <Field label="size sm">
              <JmNumberInput
                size="sm"
                value={qty}
                onValueChange={setQty}
                thousands
                prefix="₩"
              />
            </Field>
            <Field label="size lg + invalid">
              <JmNumberInput
                size="lg"
                tone="invalid"
                value={qty}
                onValueChange={setQty}
                thousands
                prefix="₩"
              />
            </Field>
          </div>
          <JmCard>
            <JmCardContent className="flex flex-col gap-2 text-jm-sm">
              <div className="flex items-center justify-between">
                <span className="text-[var(--jm-text-muted)]">가격(저장값)</span>
                <span className="font-[family-name:var(--jm-font-mono)]">
                  {price || '""'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[var(--jm-text-muted)]">가격(표시)</span>
                <span className="tabular-nums">
                  ₩{Number(price || 0).toLocaleString("ko-KR")}
                </span>
              </div>
              <div className="border-t border-[var(--jm-border)] pt-2 text-jm-xs text-[var(--jm-text-muted)]">
                onValueChange 는 콤마 없는 raw 문자열로 통보. DB 저장 형식과 동일.
              </div>
            </JmCardContent>
          </JmCard>
        </Section>

        {/* QUANTITY STEPPER */}
        <Section
          title="수량 스테퍼 (JmQuantityStepper)"
          subtitle="둥근 ± 버튼 + 직접 타이핑 가능한 중앙 인풋. POS 카트·수리 부속 공용. 정수/소수(벌크) 지원."
        >
          <div className="grid gap-4 md:grid-cols-2">
            <Field label={`정수 (현재 ${stepperQty})`}>
              <JmQuantityStepper value={stepperQty} onChange={setStepperQty} />
            </Field>
            <Field label={`소수·벌크 step 0.5 (현재 ${stepperBulkQty})`}>
              <JmQuantityStepper
                value={stepperBulkQty}
                onChange={setStepperBulkQty}
                min={0.0001}
                step={0.5}
                decimal
              />
            </Field>
            <Field label="최대 10 제한">
              <JmQuantityStepper
                value={stepperQty}
                onChange={setStepperQty}
                max={10}
              />
            </Field>
            <Field label="비활성 (readonly)">
              <JmQuantityStepper value={stepperQty} onChange={setStepperQty} disabled />
            </Field>
          </div>
        </Section>

        {/* CHECKBOX & SWITCH */}
        <Section
          title="체크박스 / 스위치"
          subtitle="JmCheckbox — 다중 선택, indeterminate 지원. JmSwitch — 즉시 적용되는 on/off 설정."
        >
          <div className="grid gap-4 md:grid-cols-2">
            <JmCard>
              <JmCardHeader>
                <JmCardTitle>JmCheckbox</JmCardTitle>
              </JmCardHeader>
              <JmCardContent className="flex flex-col gap-3">
                <label className="flex items-center gap-2.5 text-jm-base">
                  <JmCheckbox
                    checked={agree}
                    onCheckedChange={(v) => setAgree(v === true)}
                  />
                  이용 약관에 동의합니다
                </label>
                <label className="flex items-center gap-2.5 text-jm-base">
                  <JmCheckbox
                    checked={partial === true}
                    indeterminate={partial === "indeterminate"}
                    onCheckedChange={(v) => setPartial(v)}
                  />
                  부분 선택 (indeterminate)
                </label>
                <label className="flex items-center gap-2.5 text-jm-base">
                  <JmCheckbox disabled checked />
                  비활성 + 체크
                </label>
                <Row label="size">
                  <JmCheckbox size="sm" defaultChecked />
                  <JmCheckbox size="md" defaultChecked />
                  <JmCheckbox size="lg" defaultChecked />
                </Row>
              </JmCardContent>
            </JmCard>
            <JmCard>
              <JmCardHeader>
                <JmCardTitle>JmSwitch</JmCardTitle>
              </JmCardHeader>
              <JmCardContent className="flex flex-col gap-3">
                <label className="flex items-center justify-between gap-2 text-jm-base">
                  <span>알림 받기</span>
                  <JmSwitch checked={notify} onCheckedChange={setNotify} />
                </label>
                <label className="flex items-center justify-between gap-2 text-jm-base">
                  <span>다크 모드 (시스템)</span>
                  <JmSwitch
                    checked={darkMode}
                    onCheckedChange={setDarkMode}
                  />
                </label>
                <label className="flex items-center justify-between gap-2 text-jm-base opacity-60">
                  <span>비활성</span>
                  <JmSwitch disabled defaultChecked />
                </label>
                <Row label="size">
                  <JmSwitch size="sm" defaultChecked />
                  <JmSwitch size="md" defaultChecked />
                  <JmSwitch size="lg" defaultChecked />
                </Row>
              </JmCardContent>
            </JmCard>
          </div>
        </Section>

        {/* TABS */}
        <Section
          title="탭 (Tabs)"
          subtitle="JmTabs — 두 가지 변형. line(하단 인디케이터) 과 pill(알약 배경)."
        >
          <div className="grid gap-4 md:grid-cols-2">
            <div className="flex flex-col gap-2">
              <span className="text-jm-xs text-[var(--jm-text-muted)]">
                variant=&ldquo;line&rdquo;
              </span>
              <JmTabs defaultValue="overview">
                <JmTabsList variant="line" className="relative">
                  <JmTabsTrigger value="overview">개요</JmTabsTrigger>
                  <JmTabsTrigger value="orders">주문</JmTabsTrigger>
                  <JmTabsTrigger value="repairs">수리</JmTabsTrigger>
                  <JmTabsTrigger value="rentals">임대</JmTabsTrigger>
                  <JmTabsIndicator />
                </JmTabsList>
                <JmTabsPanel value="overview" className="pt-3 text-jm-sm text-[var(--jm-text-muted)]">
                  개요 패널 — 요약 정보
                </JmTabsPanel>
                <JmTabsPanel value="orders" className="pt-3 text-jm-sm text-[var(--jm-text-muted)]">
                  주문 내역 (12건)
                </JmTabsPanel>
                <JmTabsPanel value="repairs" className="pt-3 text-jm-sm text-[var(--jm-text-muted)]">
                  수리 이력
                </JmTabsPanel>
                <JmTabsPanel value="rentals" className="pt-3 text-jm-sm text-[var(--jm-text-muted)]">
                  임대 이력
                </JmTabsPanel>
              </JmTabs>
            </div>

            <div className="flex flex-col gap-2">
              <span className="text-jm-xs text-[var(--jm-text-muted)]">
                variant=&ldquo;pill&rdquo;
              </span>
              <JmTabs defaultValue="month">
                <JmTabsList variant="pill">
                  <JmTabsTrigger value="day">일간</JmTabsTrigger>
                  <JmTabsTrigger value="week">주간</JmTabsTrigger>
                  <JmTabsTrigger value="month">월간</JmTabsTrigger>
                  <JmTabsTrigger value="year">연간</JmTabsTrigger>
                </JmTabsList>
                <JmTabsPanel value="day" className="pt-3 text-jm-sm text-[var(--jm-text-muted)]">
                  일간 리포트
                </JmTabsPanel>
                <JmTabsPanel value="week" className="pt-3 text-jm-sm text-[var(--jm-text-muted)]">
                  주간 리포트
                </JmTabsPanel>
                <JmTabsPanel value="month" className="pt-3 text-jm-sm text-[var(--jm-text-muted)]">
                  월간 리포트 — 5월 합계 ₩12,340,000
                </JmTabsPanel>
                <JmTabsPanel value="year" className="pt-3 text-jm-sm text-[var(--jm-text-muted)]">
                  연간 리포트
                </JmTabsPanel>
              </JmTabs>
            </div>
          </div>
        </Section>

        {/* TOOLTIP */}
        <Section
          title="툴팁 (Tooltip)"
          subtitle="JmTooltip — 호버/포커스 시 짧은 힌트. JmTooltipProvider 가 페이지 루트에 필요 (이미 설정됨)."
        >
          <div className="flex flex-col gap-4">
            <Row label="아이콘 버튼">
              <JmTooltip content="설정">
                <JmIconButton aria-label="설정">
                  <Settings />
                </JmIconButton>
              </JmTooltip>
              <JmTooltip content="알림 (3건)" side="top">
                <JmIconButton variant="solid" aria-label="알림">
                  <Bell />
                </JmIconButton>
              </JmTooltip>
              <JmTooltip content="삭제" side="bottom">
                <JmIconButton aria-label="삭제">
                  <Trash2 />
                </JmIconButton>
              </JmTooltip>
            </Row>
            <Row label="텍스트">
              <JmTooltip content="이 값은 부가세 포함입니다 (10%)">
                <span className="cursor-help underline decoration-dotted underline-offset-4 text-jm-base text-[var(--jm-text)]">
                  ₩330,000
                </span>
              </JmTooltip>
            </Row>
          </div>
        </Section>

        {/* FILTER DROPDOWN */}
        <Section
          title="필터 dropdown (다중 선택)"
          subtitle="JmFilterDropdown — 카테고리·상태·태그 등 다중 선택 필터. 카운트 배지 자동 노출."
        >
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-2">
              <JmFilterDropdown
                label="태그"
                options={[
                  { value: "new", label: "신규" },
                  { value: "hot", label: "인기" },
                  { value: "sale", label: "할인중" },
                  { value: "premium", label: "프리미엄", description: "마진 높은 상품" },
                ]}
                value={tagFilter}
                onChange={setTagFilter}
              />
              <JmFilterDropdown
                label="카테고리"
                searchable
                options={[
                  { value: "phone", label: "스마트폰" },
                  { value: "tablet", label: "태블릿" },
                  { value: "laptop", label: "노트북" },
                  { value: "watch", label: "스마트워치" },
                  { value: "earphone", label: "이어폰" },
                  { value: "charger", label: "충전기" },
                  { value: "case", label: "케이스" },
                  { value: "etc", label: "기타" },
                ]}
                value={categoryFilter}
                onChange={setCategoryFilter}
              />
              {(tagFilter.length > 0 || categoryFilter.length > 0) && (
                <button
                  type="button"
                  onClick={() => {
                    setTagFilter([]);
                    setCategoryFilter([]);
                  }}
                  className="text-jm-xs text-[var(--jm-text-muted)] hover:text-[var(--jm-text)] hover:underline"
                >
                  전체 초기화
                </button>
              )}
            </div>
            <p className="text-jm-xs text-[var(--jm-text-muted)]">
              현재 선택 — 태그: {tagFilter.length || "없음"} · 카테고리:{" "}
              {categoryFilter.length || "없음"}
            </p>
          </div>
        </Section>

        {/* AVATAR */}
        <Section
          title="아바타 (Avatar)"
          subtitle="JmAvatar — 이미지 + 이니셜 fallback. 한글 이름은 첫 글자, 영문은 단어별 첫 글자."
        >
          <div className="flex flex-col gap-4">
            <Row label="size">
              <JmAvatar size="xs" name="홍길동" />
              <JmAvatar size="sm" name="홍길동" />
              <JmAvatar size="md" name="홍길동" />
              <JmAvatar size="lg" name="홍길동" />
              <JmAvatar size="xl" name="홍길동" />
            </Row>
            <Row label="이니셜 fallback">
              <JmAvatar name="홍길동" />
              <JmAvatar name="이재우" />
              <JmAvatar name="John Doe" />
              <JmAvatar name="Apple Inc." />
              <JmAvatar />
            </Row>
            <Row label="이미지">
              <JmAvatar
                size="lg"
                name="홍길동"
                src="https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=80&h=80&fit=crop"
              />
              <JmAvatar
                size="lg"
                name="이재우"
                src="https://invalid-url-for-fallback-test.example/x.jpg"
              />
              <span className="self-center text-jm-xs text-[var(--jm-text-muted)]">
                ← 두번째는 잘못된 URL → 자동으로 이니셜 fallback
              </span>
            </Row>
          </div>
        </Section>

        {/* RADIO */}
        <Section
          title="라디오 (Radio)"
          subtitle="JmRadioGroup + JmRadio — 단일 선택. 결제 수단 같은 1개만 고르는 옵션."
        >
          <JmCard>
            <JmCardContent>
              <JmRadioGroup
                value={paymentMethod}
                onValueChange={(v) => setPaymentMethod(v as string)}
              >
                {[
                  { v: "card", label: "신용/체크카드", desc: "VAT 포함" },
                  { v: "cash", label: "현금", desc: "할인 가능" },
                  { v: "transfer", label: "계좌이체", desc: "수수료 0%" },
                  { v: "later", label: "외상 (사후 정산)", desc: "기업 고객 한정" },
                ].map((opt) => (
                  <label
                    key={opt.v}
                    className="flex cursor-pointer items-start gap-3 rounded-xl px-2 py-2 hover:bg-[var(--jm-surface-muted)]"
                  >
                    <JmRadio value={opt.v} className="mt-0.5" />
                    <div className="flex flex-col">
                      <span className="text-jm-base font-medium text-[var(--jm-text)]">
                        {opt.label}
                      </span>
                      <span className="text-jm-xs text-[var(--jm-text-muted)]">
                        {opt.desc}
                      </span>
                    </div>
                  </label>
                ))}
              </JmRadioGroup>
            </JmCardContent>
          </JmCard>
        </Section>

        {/* DROPDOWN MENU */}
        <Section
          title="드롭다운 메뉴 (DropdownMenu)"
          subtitle="JmDropdownMenu — 점3개(︙) 액션 메뉴, 컨텍스트 메뉴."
        >
          <div className="flex flex-col gap-4">
            <Row label="아이콘 트리거">
              <JmDropdownMenu>
                <JmDropdownMenuTrigger
                  render={<JmIconButton aria-label="메뉴" />}
                >
                  <MoreHorizontal />
                </JmDropdownMenuTrigger>
                <JmDropdownMenuContent>
                  <JmDropdownMenuLabel>액션</JmDropdownMenuLabel>
                  <JmDropdownMenuItem
                    onClick={() => jmToast.success("편집 모드")}
                  >
                    <Edit className="size-4" />
                    편집
                  </JmDropdownMenuItem>
                  <JmDropdownMenuItem
                    onClick={() => jmToast("복제됨")}
                  >
                    <Copy className="size-4" />
                    복제
                  </JmDropdownMenuItem>
                  <JmDropdownMenuSeparator />
                  <JmDropdownMenuItem
                    danger
                    onClick={() => jmToast.error("삭제됨")}
                  >
                    <Trash2 className="size-4" />
                    삭제
                  </JmDropdownMenuItem>
                </JmDropdownMenuContent>
              </JmDropdownMenu>
              <span className="text-jm-xs text-[var(--jm-text-muted)]">
                ← 클릭해서 메뉴 열기
              </span>
            </Row>
            <Row label="버튼 트리거">
              <JmDropdownMenu>
                <JmDropdownMenuTrigger
                  render={<JmButton variant="outline" size="sm" />}
                >
                  옵션 선택
                </JmDropdownMenuTrigger>
                <JmDropdownMenuContent align="start">
                  <JmDropdownMenuItem>가격 낮은 순</JmDropdownMenuItem>
                  <JmDropdownMenuItem>가격 높은 순</JmDropdownMenuItem>
                  <JmDropdownMenuItem>이름순</JmDropdownMenuItem>
                  <JmDropdownMenuItem>등록일순</JmDropdownMenuItem>
                </JmDropdownMenuContent>
              </JmDropdownMenu>
            </Row>
          </div>
        </Section>

        {/* ACCORDION */}
        <Section
          title="아코디언 (Accordion)"
          subtitle="JmAccordion — 접히는 섹션. FAQ, 설정 그룹 등."
        >
          <JmCard className="px-5">
            <JmAccordion>
              {[
                {
                  v: "1",
                  title: "환불 정책이 어떻게 되나요?",
                  body: "구매 후 7일 이내 미사용 제품에 한해 전액 환불됩니다. 단, 시리얼 등록된 제품은 기술적 문제가 확인된 경우에만 가능합니다.",
                },
                {
                  v: "2",
                  title: "수리 의뢰는 어떻게 하나요?",
                  body: "POS에서 새 수리 티켓을 생성하시거나, 매장 방문 시 직원에게 시리얼 코드를 알려주세요. 수리 진행 상황은 SMS로 안내됩니다.",
                },
                {
                  v: "3",
                  title: "임대 상품은 어떤 게 있나요?",
                  body: "임대관리 메뉴에서 현재 임대 가능한 자산 목록을 확인할 수 있습니다.",
                },
              ].map((item) => (
                <JmAccordionItem key={item.v} value={item.v}>
                  <JmAccordionHeader>
                    <JmAccordionTrigger>{item.title}</JmAccordionTrigger>
                  </JmAccordionHeader>
                  <JmAccordionPanel>{item.body}</JmAccordionPanel>
                </JmAccordionItem>
              ))}
            </JmAccordion>
          </JmCard>
        </Section>

        {/* DATE RANGE PICKER */}
        <Section
          title="기간 선택 (DateRangePicker)"
          subtitle="JmDateRangePicker — react-day-picker 기반. peer dependency 필요."
        >
          <div className="grid gap-4 sm:max-w-md">
            <JmDateRangePicker value={dateRange} onChange={setDateRange} />
            {dateRange?.from && (
              <p className="text-jm-sm text-[var(--jm-text-muted)]">
                선택:{" "}
                <span className="font-[family-name:var(--jm-font-mono)] text-[var(--jm-text)]">
                  {dateRange.from.toLocaleDateString("ko-KR")}
                  {dateRange.to &&
                    dateRange.to.getTime() !== dateRange.from.getTime() &&
                    ` ~ ${dateRange.to.toLocaleDateString("ko-KR")}`}
                </span>
              </p>
            )}
          </div>
        </Section>

        {/* SINGLE DATE PICKER (popover) */}
        <Section
          title="단일 날짜 선택 (DatePicker)"
          subtitle="JmDatePicker — popover 통합. 선택 시 자동으로 닫힘. size sm/md/lg."
        >
          <div className="grid gap-4 sm:max-w-md">
            <div className="grid gap-3 sm:grid-cols-3">
              <JmDatePicker
                value={singleDate}
                onChange={setSingleDate}
                size="sm"
                placeholder="sm"
              />
              <JmDatePicker
                value={singleDate}
                onChange={setSingleDate}
                size="md"
                placeholder="md"
              />
              <JmDatePicker
                value={singleDate}
                onChange={setSingleDate}
                size="lg"
                placeholder="lg"
              />
            </div>
            {singleDate && (
              <p className="text-jm-sm text-[var(--jm-text-muted)]">
                선택:{" "}
                <span className="font-[family-name:var(--jm-font-mono)] text-[var(--jm-text)]">
                  {singleDate.toLocaleDateString("ko-KR")}
                </span>
              </p>
            )}
          </div>
        </Section>

        {/* TIME PICKER */}
        <Section
          title="시간 선택 (TimePicker)"
          subtitle="JmTimePicker — JmDatePicker 와 동일한 popover 패턴. trigger 클릭 → [시][분] 스크롤 컬럼 + [지금] 단축. 24시간제, minuteStep 조절 가능."
        >
          <div className="grid gap-4 sm:max-w-md">
            <div className="grid gap-3 sm:grid-cols-3">
              <JmTimePicker value={timeValue} onChange={setTimeValue} size="sm" />
              <JmTimePicker value={timeValue} onChange={setTimeValue} size="md" />
              <JmTimePicker value={timeValue} onChange={setTimeValue} size="lg" />
            </div>
            <p className="text-jm-sm text-[var(--jm-text-muted)]">
              선택:{" "}
              <span className="font-[family-name:var(--jm-font-mono)] text-[var(--jm-text)]">
                {timeValue}
              </span>
            </p>
          </div>
        </Section>

        {/* INLINE CALENDAR */}
        <Section
          title="인라인 캘린더 (Calendar)"
          subtitle="JmCalendar — popover 없이 위젯만 직접 노출. sheet/dialog 안에 박는 용도."
        >
          <div className="grid gap-4">
            <JmCalendar
              value={inlineDate}
              onChange={setInlineDate}
              className="w-fit"
            />
            {inlineDate && (
              <p className="text-jm-sm text-[var(--jm-text-muted)]">
                선택:{" "}
                <span className="font-[family-name:var(--jm-font-mono)] text-[var(--jm-text)]">
                  {inlineDate.toLocaleDateString("ko-KR")}
                </span>
              </p>
            )}
          </div>
        </Section>

        {/* EMPTY STATE */}
        <Section
          title="빈 상태 (Empty)"
          subtitle="JmEmpty — 검색 결과 0건, 데이터 없는 카드, 첫 사용 안내."
        >
          <div className="grid gap-4 md:grid-cols-2">
            <JmCard className="p-0">
              <JmEmpty
                icon={<Inbox className="size-7" />}
                title="아직 주문이 없습니다"
                description="첫 주문이 들어오면 여기에 표시됩니다."
                action={
                  <JmButton size="sm">
                    <Plus />
                    수동 주문 추가
                  </JmButton>
                }
              />
            </JmCard>
            <JmCard className="p-0">
              <JmEmpty
                icon={<Search className="size-7" />}
                title="검색 결과 없음"
                description='"맥북 프로 16" 와(과) 일치하는 항목이 없습니다.'
              />
            </JmCard>
          </div>
        </Section>

        {/* TOAST */}
        <Section
          title="토스트 (Toast)"
          subtitle="Sonner 기반 + jm 토큰. 페이지 루트에 <JmToaster /> 한 번 두면 됨."
        >
          <Row label="trigger">
            <JmButton variant="secondary" onClick={() => jmToast("기본 알림")}>
              기본
            </JmButton>
            <JmButton
              variant="secondary"
              onClick={() => jmToast.success("저장되었습니다")}
            >
              성공
            </JmButton>
            <JmButton
              variant="secondary"
              onClick={() =>
                jmToast.error("저장 실패", {
                  description: "네트워크 오류가 발생했습니다.",
                })
              }
            >
              에러
            </JmButton>
            <JmButton
              variant="secondary"
              onClick={() =>
                jmToast.info("정보", { description: "이번 주 매출 12% 상승" })
              }
            >
              정보
            </JmButton>
            <JmButton
              variant="secondary"
              onClick={() =>
                jmToast.warning("재고 부족", {
                  description: "맥북 프로 14 — 1개 남음",
                })
              }
            >
              경고
            </JmButton>
            <JmButton
              variant="secondary"
              onClick={() =>
                jmToast("작업 완료", {
                  action: {
                    label: "되돌리기",
                    onClick: () => jmToast.success("취소됨"),
                  },
                })
              }
            >
              액션 포함
            </JmButton>
          </Row>
        </Section>

        {/* STAT */}
        <Section
          title="KPI 카드 (Stat)"
          subtitle="JmStat — 대시보드 상단의 매출·주문·고객 등 핵심 수치. delta 부호로 색·아이콘 자동."
        >
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <JmStat
              label="이번 달 매출"
              value="₩12,340,000"
              icon={<ShoppingBag className="size-4" />}
              delta={12.5}
              compareLabel="지난 달 대비"
            />
            <JmStat
              label="신규 고객"
              value="48"
              icon={<Users className="size-4" />}
              delta={-3.2}
              compareLabel="지난 주 대비"
            />
            <JmStat
              label="결제 실패율"
              value="0.8%"
              icon={<Activity className="size-4" />}
              delta={-0.4}
              positiveIsGood={false}
              compareLabel="감소가 좋음"
            />
            <JmStat
              label="평균 객단가"
              value="₩45,200"
              hint="전체 1,234건"
            />
          </div>
        </Section>

        {/* SLIDER */}
        <Section
          title="슬라이더 (Slider)"
          subtitle="JmSlider — 단일 값 또는 범위(range). 가격 필터, 비율 조정 등."
        >
          <JmCard>
            <JmCardContent className="flex flex-col gap-6">
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between text-jm-sm">
                  <span className="text-[var(--jm-text-muted)]">단일 값</span>
                  <span className="font-[family-name:var(--jm-font-mono)] tabular-nums">
                    {singleVal}
                  </span>
                </div>
                <JmSlider
                  value={singleVal}
                  onValueChange={(v) =>
                    setSingleVal(typeof v === "number" ? v : v[0])
                  }
                  min={0}
                  max={100}
                  step={1}
                />
              </div>
              <div className="flex flex-col gap-3 pt-2">
                <div className="flex items-center justify-between text-jm-sm">
                  <span className="text-[var(--jm-text-muted)]">가격 범위</span>
                  <span className="font-[family-name:var(--jm-font-mono)] tabular-nums">
                    ₩{(rangeVal[0] * 1000).toLocaleString()} ~ ₩
                    {(rangeVal[1] * 1000).toLocaleString()}
                  </span>
                </div>
                <JmSlider
                  value={rangeVal}
                  onValueChange={(v) => {
                    if (Array.isArray(v) && v.length === 2) {
                      setRangeVal([v[0], v[1]]);
                    }
                  }}
                  min={0}
                  max={100}
                  step={5}
                />
              </div>
            </JmCardContent>
          </JmCard>
        </Section>

        {/* PROGRESS / SPINNER */}
        <Section
          title="진행 인디케이터 (Progress / Spinner)"
          subtitle="결정적 진행도(Progress) vs 회전 로딩(Spinner)."
        >
          <div className="grid gap-4 md:grid-cols-2">
            <JmCard>
              <JmCardHeader>
                <JmCardTitle>JmProgress</JmCardTitle>
              </JmCardHeader>
              <JmCardContent className="flex flex-col gap-4">
                <JmProgress value={30} showLabel />
                <JmProgress value={65} showLabel tone="success" />
                <JmProgress value={85} showLabel tone="warning" />
                <JmProgress value={92} showLabel tone="danger" />
                <JmProgress size="sm" value={singleVal} />
                <JmProgress size="lg" value={singleVal} showLabel />
              </JmCardContent>
            </JmCard>
            <JmCard>
              <JmCardHeader>
                <JmCardTitle>JmSpinner</JmCardTitle>
              </JmCardHeader>
              <JmCardContent className="flex flex-col gap-4">
                <Row label="size">
                  <JmSpinner size="xs" />
                  <JmSpinner size="sm" />
                  <JmSpinner size="md" />
                  <JmSpinner size="lg" />
                  <JmSpinner size="xl" />
                </Row>
                <Row label="tone">
                  <JmSpinner tone="default" />
                  <JmSpinner tone="action" />
                  <span className="inline-flex size-8 items-center justify-center rounded-lg bg-[var(--jm-action)]">
                    <JmSpinner tone="inverted" size="sm" />
                  </span>
                </Row>
                <Row label="버튼 안">
                  <JmButton disabled>
                    <JmSpinner size="sm" tone="inverted" />
                    저장 중...
                  </JmButton>
                  <JmButton variant="outline" disabled>
                    <JmSpinner size="sm" />
                    불러오는 중
                  </JmButton>
                </Row>
              </JmCardContent>
            </JmCard>
          </div>
        </Section>

        {/* ALERT */}
        <Section
          title="알림 박스 (Alert)"
          subtitle="JmAlert — 페이지 흐름 안에 정착하는 인라인 알림. 토스트와 다름."
        >
          <div className="flex flex-col gap-3">
            <JmAlert variant="info" title="새 기능이 추가되었습니다">
              주문 페이지에서 다중 선택으로 일괄 처리할 수 있습니다.
            </JmAlert>
            <JmAlert variant="success" title="저장되었습니다">
              변경 사항이 모든 사용자에게 즉시 반영됩니다.
            </JmAlert>
            <JmAlert
              variant="warning"
              title="재고 부족"
              action={
                <JmButton size="xs" variant="outline">
                  발주
                </JmButton>
              }
            >
              맥북 프로 14인치 — 1개 남음. 평균 주문 주기상 3일 이내 품절 예상.
            </JmAlert>
            <JmAlert variant="danger" title="결제 실패" onDismiss={() => {}}>
              카드사 응답이 없어 결제가 취소되었습니다. 다시 시도해주세요.
            </JmAlert>
            {alertVisible && (
              <JmAlert
                variant="neutral"
                title="안내"
                onDismiss={() => setAlertVisible(false)}
              >
                이 알림은 닫기 버튼으로 사라집니다 (onDismiss).
              </JmAlert>
            )}
            {!alertVisible && (
              <button
                type="button"
                onClick={() => setAlertVisible(true)}
                className="text-jm-xs text-[var(--jm-text-muted)] hover:text-[var(--jm-text)] hover:underline"
              >
                neutral 알림 다시 보기
              </button>
            )}
          </div>
        </Section>

        {/* SEGMENTED CONTROL */}
        <Section
          title="세그먼트 컨트롤 (SegmentedControl)"
          subtitle="JmSegmentedControl — JmPill 보다 컴팩트, JmTabs 보다 가벼움. 좁은 영역의 view 토글."
        >
          <div className="flex flex-col gap-4">
            <Row label="기본">
              <JmSegmentedControl
                options={[
                  { value: "list", label: "목록", icon: <List /> },
                  { value: "grid", label: "격자", icon: <Grid3x3 /> },
                ]}
                value={viewMode}
                onChange={setViewMode}
              />
              <span className="text-jm-xs text-[var(--jm-text-muted)]">
                현재: {viewMode}
              </span>
            </Row>
            <Row label="size">
              <JmSegmentedControl
                size="sm"
                options={[
                  { value: "day", label: "일" },
                  { value: "week", label: "주" },
                  { value: "month", label: "월" },
                ]}
                value={period}
                onChange={setPeriod}
              />
              <JmSegmentedControl
                size="md"
                options={[
                  { value: "day", label: "일" },
                  { value: "week", label: "주" },
                  { value: "month", label: "월" },
                ]}
                value={period}
                onChange={setPeriod}
              />
              <JmSegmentedControl
                size="lg"
                options={[
                  { value: "day", label: "일" },
                  { value: "week", label: "주" },
                  { value: "month", label: "월" },
                ]}
                value={period}
                onChange={setPeriod}
              />
            </Row>
            <Row label="fullWidth">
              <div className="w-full max-w-md">
                <JmSegmentedControl
                  fullWidth
                  options={[
                    { value: "day", label: "일간" },
                    { value: "week", label: "주간" },
                    { value: "month", label: "월간" },
                  ]}
                  value={period}
                  onChange={setPeriod}
                />
              </div>
            </Row>
          </div>
        </Section>

        {/* SKELETON */}
        <Section
          title="스켈레톤 (Skeleton)"
          subtitle="JmSkeleton — 폭/높이는 className 으로 직접. animate-pulse 로 표시."
        >
          <JmCard>
            <JmCardContent className="flex flex-col gap-4">
              <div className="flex items-center gap-3">
                <JmSkeleton className="size-10 rounded-full" />
                <div className="flex flex-1 flex-col gap-2">
                  <JmSkeleton className="h-4 w-32" />
                  <JmSkeleton className="h-3 w-24" />
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <JmSkeleton className="h-4 w-full" />
                <JmSkeleton className="h-4 w-5/6" />
                <JmSkeleton className="h-4 w-2/3" />
              </div>
            </JmCardContent>
          </JmCard>
        </Section>

        {/* FORM FIELD */}
        <Section
          title="폼 필드 (FormField)"
          subtitle="JmFormField — label + 컨트롤 + hint/error 통합. error 가 있으면 자동으로 hint 대신 노출."
        >
          <div className="grid gap-4 md:grid-cols-2">
            <JmFormField label="이름" required hint="실명을 입력해주세요">
              <JmInput placeholder="홍길동" />
            </JmFormField>
            <JmFormField label="가격" error="0보다 큰 값이어야 합니다">
              <JmNumberInput
                value="0"
                onValueChange={() => {}}
                thousands
                prefix="₩"
                tone="invalid"
              />
            </JmFormField>
            <JmFormField
              label="메모"
              labelAddon="0 / 200"
              hint="고객에게 보일 메시지"
            >
              <JmTextarea rows={3} placeholder="비고" />
            </JmFormField>
            <JmFormField label="공개 범위" hint="등록 후 변경 가능">
              <JmSelect
                options={[
                  { value: "public", label: "전체 공개" },
                  { value: "private", label: "비공개" },
                ]}
                value=""
                onChange={() => {}}
                placeholder="선택"
              />
            </JmFormField>
          </div>
        </Section>

        {/* SEPARATOR + KBD */}
        <Section
          title="구분선·키보드 (Separator / Kbd)"
          subtitle="JmSeparator — 가로/세로/라벨 포함. JmKbd — 단축키 표시."
        >
          <div className="flex flex-col gap-6">
            <Row label="가로">
              <div className="w-full max-w-md">
                <JmSeparator />
              </div>
            </Row>
            <Row label="세로 (inline)">
              <span className="text-jm-sm">왼쪽</span>
              <JmSeparator orientation="vertical" className="h-4" />
              <span className="text-jm-sm">가운데</span>
              <JmSeparator orientation="vertical" className="h-4" />
              <span className="text-jm-sm">오른쪽</span>
            </Row>
            <Row label="라벨">
              <div className="w-full max-w-md">
                <JmSeparator label="또는" />
              </div>
            </Row>
            <Row label="JmKbd">
              <span className="text-jm-sm text-[var(--jm-text-muted)]">
                저장하려면
              </span>
              <JmKbd>⌘</JmKbd>
              <span className="text-jm-xs text-[var(--jm-text-subtle)]">+</span>
              <JmKbd>S</JmKbd>
              <span className="ml-3 text-jm-sm text-[var(--jm-text-muted)]">
                새 항목
              </span>
              <JmKbd>↵</JmKbd>
            </Row>
          </div>
        </Section>

        {/* BRAND MARK */}
        <Section
          title="브랜드 마크"
          subtitle="JmBrandMark — 브랜드/제품 모노그램. 사이드바 헤더, 빈 상태, 알림 source, 카드 헤더 등에 사용. 5 size × 3 variant × 6 tone × 3 shape. 다크모드 자동."
        >
          <BrandMarkShowcase />
        </Section>

        {/* SIDEBAR */}
        <Section
          title="사이드바"
          subtitle="JmSidebar — 데스크톱 영구 노출, 모바일은 햄버거 → overlay drawer. expanded ↔ collapsed (icon-only) 토글. Active 는 user 가 직접 active prop 으로 넘김 (라우팅 모름). 아래 프레임 안에서 동작 — 창 폭을 줄이거나 토글 버튼을 눌러보세요."
        >
          <SidebarDemo />
        </Section>

        {/* COMPOSITION DEMO */}
        <Section title="조합 예시" subtitle="실제 화면에서 어떻게 쓰이는지">
          <JmCard className="p-5">
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <h3 className="text-jm-xl font-bold text-[var(--jm-text)]">
                    수리 #R241105-001
                  </h3>
                  <JmBadge variant="warning" size="sm">
                    진행중
                  </JmBadge>
                </div>
                <JmIconButton aria-label="더보기">
                  <Settings />
                </JmIconButton>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <JmInput placeholder="고객명" defaultValue="홍길동" />
                <JmInput placeholder="전화번호" defaultValue="010-1234-5678" />
              </div>
              <JmTextarea
                rows={3}
                placeholder="증상 메모"
                defaultValue="화면 깨짐, 부팅 시 로고 정상 출력"
              />
              <div className="flex gap-2 overflow-x-auto">
                <JmPill active>전체</JmPill>
                <JmPill>접수</JmPill>
                <JmPill>진단중</JmPill>
                <JmPill>수리중</JmPill>
                <JmPill>완료</JmPill>
              </div>
              <div className="flex justify-end gap-2 border-t border-[var(--jm-border)] pt-4">
                <JmButton variant="ghost">취소</JmButton>
                <JmButton variant="outline">임시저장</JmButton>
                <JmButton>저장하고 다음</JmButton>
              </div>
            </div>
          </JmCard>
        </Section>
      </div>

      <footer className="mt-16 border-t border-[var(--jm-border)] pt-6 text-center text-jm-xs text-[var(--jm-text-muted)]">
        jaewoomade design system · Tailwind 4 + base-ui · CSS variables only
      </footer>
      <JmToaster position="top-right" />
    </div>
    </JmTooltipProvider>
    </JmScope>
  );
}

function BrandMarkShowcase() {
  const tones: { value: JmBrandMarkTone; label: string }[] = [
    { value: "default", label: "default" },
    { value: "success", label: "success" },
    { value: "warning", label: "warning" },
    { value: "danger", label: "danger" },
    { value: "info", label: "info" },
    { value: "accent", label: "accent" },
  ];
  const variants: JmBrandMarkVariant[] = ["solid", "subtle", "outline"];
  const shapes: JmBrandMarkShape[] = ["square", "round", "squircle"];

  return (
    <div className="space-y-6">
      {/* Size scale */}
      <div className="rounded-2xl border border-[var(--jm-border)] bg-[var(--jm-surface)] p-5">
        <div className="mb-3 text-jm-xs font-semibold uppercase tracking-wider text-[var(--jm-text-subtle)]">
          Size scale
        </div>
        <div className="flex items-end gap-6">
          {(["xs", "sm", "md", "lg", "xl"] as const).map((s) => (
            <div key={s} className="flex flex-col items-center gap-2">
              <JmBrandMark text="jm" size={s} />
              <span className="text-jm-2xs text-[var(--jm-text-muted)]">
                {s}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Tone × Variant matrix */}
      <div className="rounded-2xl border border-[var(--jm-border)] bg-[var(--jm-surface)] p-5">
        <div className="mb-3 text-jm-xs font-semibold uppercase tracking-wider text-[var(--jm-text-subtle)]">
          Tone × Variant
        </div>
        <div className="grid grid-cols-[80px_1fr] gap-y-3">
          <div />
          <div className="grid grid-cols-3 gap-3 text-jm-xs text-[var(--jm-text-muted)]">
            {variants.map((v) => (
              <span key={v}>{v}</span>
            ))}
          </div>
          {tones.map((t) => (
            <React.Fragment key={t.value}>
              <span className="self-center text-jm-xs text-[var(--jm-text-muted)]">
                {t.label}
              </span>
              <div className="grid grid-cols-3 gap-3">
                {variants.map((v) => (
                  <JmBrandMark
                    key={v}
                    text="jm"
                    size="md"
                    tone={t.value}
                    variant={v}
                  />
                ))}
              </div>
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* Shape variants */}
      <div className="rounded-2xl border border-[var(--jm-border)] bg-[var(--jm-surface)] p-5">
        <div className="mb-3 text-jm-xs font-semibold uppercase tracking-wider text-[var(--jm-text-subtle)]">
          Shape (size lg 에서 차이가 잘 보임)
        </div>
        <div className="flex items-end gap-6">
          {shapes.map((sh) => (
            <div key={sh} className="flex flex-col items-center gap-2">
              <JmBrandMark text="jm" size="lg" shape={sh} />
              <span className="text-jm-2xs text-[var(--jm-text-muted)]">
                {sh}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Icon mode */}
      <div className="rounded-2xl border border-[var(--jm-border)] bg-[var(--jm-surface)] p-5">
        <div className="mb-3 text-jm-xs font-semibold uppercase tracking-wider text-[var(--jm-text-subtle)]">
          Icon mode (텍스트 대신 아이콘)
        </div>
        <div className="flex items-end gap-6">
          <div className="flex flex-col items-center gap-2">
            <JmBrandMark icon={<Package />} size="md" />
            <span className="text-jm-2xs text-[var(--jm-text-muted)]">
              상품
            </span>
          </div>
          <div className="flex flex-col items-center gap-2">
            <JmBrandMark icon={<Users />} size="md" tone="info" />
            <span className="text-jm-2xs text-[var(--jm-text-muted)]">
              고객
            </span>
          </div>
          <div className="flex flex-col items-center gap-2">
            <JmBrandMark
              icon={<Wrench />}
              size="md"
              tone="warning"
              variant="subtle"
            />
            <span className="text-jm-2xs text-[var(--jm-text-muted)]">
              수리
            </span>
          </div>
          <div className="flex flex-col items-center gap-2">
            <JmBrandMark
              icon={<ShoppingCart />}
              size="md"
              tone="accent"
              shape="squircle"
            />
            <span className="text-jm-2xs text-[var(--jm-text-muted)]">
              주문
            </span>
          </div>
        </div>
      </div>

      {/* Light vs Dark side-by-side */}
      <div className="grid gap-4 md:grid-cols-2">
        <JmScope theme="light">
          <div className="rounded-2xl border border-[var(--jm-border)] bg-[var(--jm-surface)] p-5">
            <div className="mb-3 text-jm-xs font-semibold uppercase tracking-wider text-[var(--jm-text-subtle)]">
              Light theme
            </div>
            <div className="flex flex-wrap items-center gap-3">
              {tones.map((t) => (
                <JmBrandMark
                  key={t.value}
                  text="jm"
                  size="md"
                  tone={t.value}
                  variant="solid"
                />
              ))}
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              {tones.map((t) => (
                <JmBrandMark
                  key={t.value}
                  text="jm"
                  size="md"
                  tone={t.value}
                  variant="subtle"
                />
              ))}
            </div>
          </div>
        </JmScope>
        <JmScope theme="dark">
          <div className="rounded-2xl border border-[var(--jm-border)] bg-[var(--jm-surface)] p-5">
            <div className="mb-3 text-jm-xs font-semibold uppercase tracking-wider text-[var(--jm-text-subtle)]">
              Dark theme
            </div>
            <div className="flex flex-wrap items-center gap-3">
              {tones.map((t) => (
                <JmBrandMark
                  key={t.value}
                  text="jm"
                  size="md"
                  tone={t.value}
                  variant="solid"
                />
              ))}
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              {tones.map((t) => (
                <JmBrandMark
                  key={t.value}
                  text="jm"
                  size="md"
                  tone={t.value}
                  variant="subtle"
                />
              ))}
            </div>
          </div>
        </JmScope>
      </div>

      {/* Real-world examples */}
      <div className="rounded-2xl border border-[var(--jm-border)] bg-[var(--jm-surface)] p-5">
        <div className="mb-3 text-jm-xs font-semibold uppercase tracking-wider text-[var(--jm-text-subtle)]">
          실제 사용 예시
        </div>
        <div className="space-y-3">
          {/* Header brand pattern */}
          <div className="flex items-center gap-2 rounded-lg border border-[var(--jm-border)] bg-[var(--jm-bg)] px-3 py-2">
            <JmBrandMark text="jm" size="sm" />
            <span className="text-jm-sm font-bold text-[var(--jm-text)]">
              jaewoomade
            </span>
            <span className="ml-auto text-jm-xs text-[var(--jm-text-muted)]">
              헤더 / 사이드바 패턴
            </span>
          </div>
          {/* Notification source */}
          <div className="flex items-center gap-3 rounded-lg border border-[var(--jm-border)] bg-[var(--jm-bg)] px-3 py-2">
            <JmBrandMark
              icon={<ShoppingCart />}
              size="md"
              tone="success"
              variant="subtle"
            />
            <div className="min-w-0 flex-1">
              <div className="text-jm-sm font-semibold text-[var(--jm-text)]">
                주문 #ORD260509-0042 결제 완료
              </div>
              <div className="text-jm-xs text-[var(--jm-text-muted)]">
                3분 전
              </div>
            </div>
            <span className="text-jm-xs text-[var(--jm-text-muted)]">
              알림 source 패턴
            </span>
          </div>
          {/* Empty state */}
          <div className="flex flex-col items-center gap-2 rounded-lg border border-[var(--jm-border)] bg-[var(--jm-bg)] py-8">
            <JmBrandMark
              icon={<Inbox />}
              size="xl"
              tone="default"
              variant="subtle"
              shape="squircle"
            />
            <div className="text-jm-base font-semibold text-[var(--jm-text)]">
              알림이 없습니다
            </div>
            <div className="text-jm-xs text-[var(--jm-text-muted)]">
              빈 상태 패턴
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** 아바타 → dropdown menu — 사이드바 모드 전환 + 로그아웃. */
function SidebarDemoAvatarMenu() {
  const { mode, setMode } = useJmSidebar();

  const modeOptions: {
    mode: "expanded" | "collapsed" | "expand-on-hover";
    icon: React.ReactNode;
    label: string;
  }[] = [
    { mode: "expanded", icon: <Columns2 className="size-4" />, label: "Expanded" },
    { mode: "collapsed", icon: <Square className="size-4" />, label: "Collapsed" },
    {
      mode: "expand-on-hover",
      icon: <PanelLeftOpen className="size-4" />,
      label: "Expand on hover",
    },
  ];

  return (
    <JmDropdownMenu>
      <JmDropdownMenuTrigger
        render={
          <button
            type="button"
            aria-label="사용자 메뉴"
            className="flex w-full items-center gap-2 rounded-lg px-1.5 py-1 outline-none transition-colors hover:bg-[var(--jm-surface-muted)] focus-visible:ring-4 focus-visible:ring-[var(--jm-ring)]"
          />
        }
      >
        <JmAvatar fallback="재" size="sm" />
        <div className="min-w-0 flex-1 overflow-hidden text-left">
          <div className="truncate text-jm-xs font-semibold text-[var(--jm-text)]">
            재우
          </div>
          <div className="truncate text-jm-3xs text-[var(--jm-text-muted)]">
            admin@jaewoo.dev
          </div>
        </div>
        <MoreHorizontal className="size-4 shrink-0 text-[var(--jm-text-muted)]" />
      </JmDropdownMenuTrigger>
      <JmDropdownMenuContent side="top" align="start" className="w-56">
        <JmDropdownMenuGroup>
          <JmDropdownMenuLabel>Sidebar control</JmDropdownMenuLabel>
          {modeOptions.map((opt) => {
            const selected = mode === opt.mode;
            return (
              <JmDropdownMenuItem
                key={opt.mode}
                onClick={() => setMode(opt.mode)}
              >
                {opt.icon}
                <span className="flex-1">{opt.label}</span>
                {selected && (
                  <span className="size-1.5 rounded-full bg-[var(--jm-action)]" />
                )}
              </JmDropdownMenuItem>
            );
          })}
        </JmDropdownMenuGroup>
        <JmDropdownMenuSeparator />
        <JmDropdownMenuItem danger onClick={() => jmToast.info("로그아웃 (데모)")}>
          <LogOut className="size-4" />
          <span>로그아웃</span>
        </JmDropdownMenuItem>
      </JmDropdownMenuContent>
    </JmDropdownMenu>
  );
}

function SidebarDemo() {
  const [active, setActive] = useState<string>("home");
  const NAV: { key: string; icon: React.ReactNode; label: string; badge?: number }[] = [
    { key: "home", icon: <Home />, label: "대시보드" },
    { key: "orders", icon: <ShoppingCart />, label: "주문", badge: 3 },
    { key: "products", icon: <Package />, label: "상품" },
    { key: "customers", icon: <Users />, label: "고객" },
    { key: "repairs", icon: <Wrench />, label: "수리" },
    { key: "reports", icon: <BarChart3 />, label: "리포트" },
    { key: "documents", icon: <FileText />, label: "문서" },
  ];
  const current = NAV.find((n) => n.key === active);

  return (
    <JmSidebarProvider defaultMode="expanded">
      {/* 시연용 프레임 — 실제 사용에선 페이지 루트가 이 flex 컨테이너 */}
      <div className="flex h-[520px] overflow-hidden rounded-2xl border border-[var(--jm-border)] bg-[var(--jm-bg)]">
        <JmSidebar>
          <JmSidebarHeader>
            <JmBrandMark text="jm" size="sm" />
            <span className="min-w-0 truncate text-jm-sm font-bold text-[var(--jm-text)]">
              jaewoomade
            </span>
          </JmSidebarHeader>

          <JmSidebarBody>
            <JmSidebarGroup label="메뉴">
              {NAV.map((n) => (
                <JmSidebarItem
                  key={n.key}
                  icon={n.icon}
                  active={active === n.key}
                  onClick={() => setActive(n.key)}
                  trailing={
                    n.badge ? (
                      <JmBadge size="sm" variant="solid">
                        {n.badge}
                      </JmBadge>
                    ) : null
                  }
                >
                  {n.label}
                </JmSidebarItem>
              ))}
            </JmSidebarGroup>

            <JmSidebarSeparator />

            <JmSidebarGroup label="설정">
              <JmSidebarItem
                icon={<Settings />}
                active={active === "settings"}
                onClick={() => setActive("settings")}
              >
                회사 정보
              </JmSidebarItem>
              <JmSidebarItem
                icon={<Bell />}
                active={active === "notifications"}
                onClick={() => setActive("notifications")}
                trailing={<JmKbd>⌘N</JmKbd>}
              >
                알림
              </JmSidebarItem>
            </JmSidebarGroup>
          </JmSidebarBody>

          <JmSidebarFooter>
            <SidebarDemoAvatarMenu />
          </JmSidebarFooter>
        </JmSidebar>

        {/* 메인 영역 */}
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex h-12 shrink-0 items-center gap-2 border-b border-[var(--jm-border)] bg-[var(--jm-surface)] px-4">
            <JmSidebarTrigger className="sm:hidden" />
            <h3 className="text-jm-base font-bold text-[var(--jm-text)]">
              {current?.label ?? "대시보드"}
            </h3>
            <JmBadge variant="outline" size="sm" className="ml-2">
              {active}
            </JmBadge>
          </div>
          <div className="flex-1 min-h-0">
            <JmScrollArea className="h-full" viewportClassName="p-6">
              {/* 일부러 길게 — 스크롤바가 콘텐츠 폭을 잠식하지 않는지 확인 */}
              <div className="space-y-3 text-jm-sm text-[var(--jm-text-muted)]">
                <div className="text-jm-base font-bold text-[var(--jm-text)]">
                  {current?.label} 콘텐츠 영역
                </div>
                {Array.from({ length: 30 }).map((_, i) => (
                  <p key={i}>
                    {i + 1}. JmScrollArea 는 콘텐츠 영역, 사이드바, 카드 본문 등
                    어디든 같은 컴포넌트 그대로 사용. props 로 두께·가시성·방향 조절.
                  </p>
                ))}
              </div>
            </JmScrollArea>
          </div>
        </div>
      </div>
    </JmSidebarProvider>
  );
}

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-jm-2xl font-bold tracking-tight text-[var(--jm-text)]">
          {title}
        </h2>
        {subtitle && (
          <p className="text-jm-sm text-[var(--jm-text-muted)]">{subtitle}</p>
        )}
      </div>
      {children}
    </section>
  );
}

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-[120px_1fr] sm:items-center">
      <span className="text-jm-xs font-medium text-[var(--jm-text-muted)]">
        {label}
      </span>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-jm-xs font-medium text-[var(--jm-text-muted)]">
        {label}
      </span>
      {children}
    </label>
  );
}

function ColorSwatch({ token, desc }: { token: string; desc: string }) {
  return (
    <div className="flex flex-col gap-2">
      <div
        className="h-16 w-full rounded-xl ring-1 ring-[var(--jm-border)]"
        style={{ background: `var(${token})` }}
      />
      <div className="flex flex-col">
        <code className="text-jm-2xs font-mono text-[var(--jm-text)]">
          {token}
        </code>
        <span className="text-jm-2xs text-[var(--jm-text-muted)]">{desc}</span>
      </div>
    </div>
  );
}
