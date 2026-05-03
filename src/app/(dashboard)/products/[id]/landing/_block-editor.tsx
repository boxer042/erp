"use client";

import { useRef, useState } from "react";
import { ExternalLink, Loader2, Plus, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type {
  HeroBlock,
  ImageBlock,
  TextBlock,
  VideoBlock,
  GalleryBlock,
  ScrollyHeroBlock,
  StickyFeatureBlock,
  ParallaxBlock,
  SpecTableBlock,
  AmbientVideoBlock,
  TableBlock,
  ChartBlock,
  StatsGridBlock,
  CalloutBlock,
  InfoGridBlock,
  ProductInfoBlock,
  HtmlEmbedBlock,
  LandingBlock,
} from "@/lib/validators/landing-block";
import {
  LANDING_ICON_LABELS,
  LANDING_ICON_NAMES,
} from "@/lib/landing-icons";

import { ImageUploadField } from "./_image-upload";
import { uploadHtml } from "./_helpers";

interface EditorProps<T extends LandingBlock> {
  block: T;
  onChange: (next: T) => void;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}

function HeroEditor({ block, onChange }: EditorProps<HeroBlock>) {
  return (
    <div className="space-y-3">
      <Field label="배경 이미지">
        <ImageUploadField
          value={block.imageUrl}
          onChange={(url) => onChange({ ...block, imageUrl: url })}
        />
      </Field>
      <Field label="작은 라벨 (eyebrow, 선택)">
        <Input
          value={block.eyebrow}
          placeholder='예: "NEW", "한정 출시"'
          onChange={(e) => onChange({ ...block, eyebrow: e.target.value })}
        />
      </Field>
      <Field label="대제목">
        <Input
          value={block.headline}
          onChange={(e) => onChange({ ...block, headline: e.target.value })}
        />
      </Field>
      <Field label="소제목">
        <Textarea
          value={block.subheadline}
          onChange={(e) => onChange({ ...block, subheadline: e.target.value })}
          rows={2}
        />
      </Field>
      <div className="grid grid-cols-3 gap-2">
        <Field label="텍스트 정렬">
          <Select
            value={block.textAlign}
            onValueChange={(v) => onChange({ ...block, textAlign: v as HeroBlock["textAlign"] })}
          >
            <SelectTrigger className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="left">왼쪽</SelectItem>
              <SelectItem value="center">가운데</SelectItem>
              <SelectItem value="right">오른쪽</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label="텍스트 색">
          <Select
            value={block.textColor}
            onValueChange={(v) => onChange({ ...block, textColor: v as HeroBlock["textColor"] })}
          >
            <SelectTrigger className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="light">밝게 (어두운 배경용)</SelectItem>
              <SelectItem value="dark">어둡게 (밝은 배경용)</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label="높이">
          <Select
            value={block.height}
            onValueChange={(v) => onChange({ ...block, height: v as HeroBlock["height"] })}
          >
            <SelectTrigger className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="sm">작게</SelectItem>
              <SelectItem value="md">중간</SelectItem>
              <SelectItem value="lg">크게</SelectItem>
              <SelectItem value="screen">전체화면</SelectItem>
            </SelectContent>
          </Select>
        </Field>
      </div>
    </div>
  );
}

function ImageEditor({ block, onChange }: EditorProps<ImageBlock>) {
  return (
    <div className="space-y-3">
      <Field label="이미지">
        <ImageUploadField
          value={block.imageUrl}
          onChange={(url) => onChange({ ...block, imageUrl: url })}
        />
      </Field>
      <Field label="대체 텍스트 (alt)">
        <Input value={block.alt} onChange={(e) => onChange({ ...block, alt: e.target.value })} />
      </Field>
      <Field label="캡션 (선택)">
        <Input
          value={block.caption}
          onChange={(e) => onChange({ ...block, caption: e.target.value })}
        />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="폭">
          <Select
            value={block.maxWidth ?? (block.fullWidth ? "full" : "md")}
            onValueChange={(v) =>
              onChange({
                ...block,
                maxWidth: v as ImageBlock["maxWidth"],
                fullWidth: v === "full",
              })
            }
          >
            <SelectTrigger className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="full">전체 폭</SelectItem>
              <SelectItem value="lg">크게 (960)</SelectItem>
              <SelectItem value="md">좁게 (768)</SelectItem>
              <SelectItem value="sm">아주 좁게 (560)</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label="라운드 코너">
          <Select
            value={block.rounded}
            onValueChange={(v) => onChange({ ...block, rounded: v as ImageBlock["rounded"] })}
          >
            <SelectTrigger className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">없음</SelectItem>
              <SelectItem value="sm">작게</SelectItem>
              <SelectItem value="md">보통</SelectItem>
              <SelectItem value="lg">크게</SelectItem>
              <SelectItem value="xl">아주 크게</SelectItem>
              <SelectItem value="full">완전 (원형)</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label="그림자">
          <Select
            value={block.shadow}
            onValueChange={(v) => onChange({ ...block, shadow: v as ImageBlock["shadow"] })}
          >
            <SelectTrigger className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">없음</SelectItem>
              <SelectItem value="sm">은은하게</SelectItem>
              <SelectItem value="md">보통</SelectItem>
              <SelectItem value="lg">강하게</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label="상하 여백">
          <Select
            value={block.paddingY}
            onValueChange={(v) => onChange({ ...block, paddingY: v as ImageBlock["paddingY"] })}
          >
            <SelectTrigger className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">없음</SelectItem>
              <SelectItem value="sm">좁게</SelectItem>
              <SelectItem value="md">보통</SelectItem>
              <SelectItem value="lg">넓게</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label="배경 (이미지 주변)">
          <Select
            value={block.background}
            onValueChange={(v) =>
              onChange({ ...block, background: v as ImageBlock["background"] })
            }
          >
            <SelectTrigger className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">없음</SelectItem>
              <SelectItem value="muted">연한 회색</SelectItem>
              <SelectItem value="dark">진한 (반전)</SelectItem>
            </SelectContent>
          </Select>
        </Field>
      </div>
    </div>
  );
}

function TextEditor({ block, onChange }: EditorProps<TextBlock>) {
  return (
    <div className="space-y-3">
      <Field label="작은 라벨 (eyebrow, 선택)">
        <Input
          value={block.eyebrow}
          placeholder='예: "AT A GLANCE", "NEW"'
          onChange={(e) => onChange({ ...block, eyebrow: e.target.value })}
        />
      </Field>
      <Field label="제목 (선택)">
        <Input
          value={block.heading}
          onChange={(e) => onChange({ ...block, heading: e.target.value })}
        />
      </Field>
      <Field label="본문">
        <Textarea
          value={block.body}
          onChange={(e) => onChange({ ...block, body: e.target.value })}
          rows={6}
        />
      </Field>
      <p className="text-[10px] text-muted-foreground">
        본문에 마크다운 사용 가능 — <code className="rounded bg-muted px-1">{`**굵게**`}</code>{" "}
        <code className="rounded bg-muted px-1">{`*기울임*`}</code>{" "}
        <code className="rounded bg-muted px-1">{`[링크](https://...)`}</code>
      </p>
      <div className="grid grid-cols-2 gap-2">
        <Field label="제목 크기">
          <Select
            value={block.headingSize}
            onValueChange={(v) =>
              onChange({ ...block, headingSize: v as TextBlock["headingSize"] })
            }
          >
            <SelectTrigger className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="sm">작게 (소제목)</SelectItem>
              <SelectItem value="md">기본</SelectItem>
              <SelectItem value="lg">크게</SelectItem>
              <SelectItem value="xl">아주 크게 (디스플레이)</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label="제목 굵기">
          <Select
            value={block.headingWeight}
            onValueChange={(v) =>
              onChange({ ...block, headingWeight: v as TextBlock["headingWeight"] })
            }
          >
            <SelectTrigger className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="normal">보통</SelectItem>
              <SelectItem value="semibold">반굵게</SelectItem>
              <SelectItem value="bold">굵게</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label="본문 크기">
          <Select
            value={block.bodySize}
            onValueChange={(v) =>
              onChange({ ...block, bodySize: v as TextBlock["bodySize"] })
            }
          >
            <SelectTrigger className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="sm">작게</SelectItem>
              <SelectItem value="md">기본</SelectItem>
              <SelectItem value="lg">크게</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label="텍스트 색">
          <Select
            value={block.color}
            onValueChange={(v) => onChange({ ...block, color: v as TextBlock["color"] })}
          >
            <SelectTrigger className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="default">기본</SelectItem>
              <SelectItem value="muted">전체 흐리게</SelectItem>
              <SelectItem value="brand">브랜드 컬러</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label="정렬">
          <Select
            value={block.align}
            onValueChange={(v) => onChange({ ...block, align: v as TextBlock["align"] })}
          >
            <SelectTrigger className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="left">왼쪽</SelectItem>
              <SelectItem value="center">가운데</SelectItem>
              <SelectItem value="right">오른쪽</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label="배경">
          <Select
            value={block.background}
            onValueChange={(v) =>
              onChange({ ...block, background: v as TextBlock["background"] })
            }
          >
            <SelectTrigger className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">없음</SelectItem>
              <SelectItem value="muted">연한 회색</SelectItem>
              <SelectItem value="dark">진한 (반전)</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label="상하 여백">
          <Select
            value={block.paddingY}
            onValueChange={(v) =>
              onChange({ ...block, paddingY: v as TextBlock["paddingY"] })
            }
          >
            <SelectTrigger className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="sm">좁게</SelectItem>
              <SelectItem value="md">보통</SelectItem>
              <SelectItem value="lg">넓게</SelectItem>
              <SelectItem value="xl">아주 넓게</SelectItem>
            </SelectContent>
          </Select>
        </Field>
      </div>
    </div>
  );
}

function VideoEditor({ block, onChange }: EditorProps<VideoBlock>) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <Field label="소스">
          <Select
            value={block.source}
            onValueChange={(v) => onChange({ ...block, source: v as VideoBlock["source"] })}
          >
            <SelectTrigger className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="youtube">YouTube</SelectItem>
              <SelectItem value="url">URL (mp4 등)</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label="자동 재생">
          <Select
            value={block.autoplay ? "1" : "0"}
            onValueChange={(v) => onChange({ ...block, autoplay: v === "1" })}
          >
            <SelectTrigger className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="0">끄기</SelectItem>
              <SelectItem value="1">켜기 (음소거)</SelectItem>
            </SelectContent>
          </Select>
        </Field>
      </div>
      <Field label={block.source === "youtube" ? "YouTube URL 또는 ID" : "비디오 URL"}>
        <Input value={block.value} onChange={(e) => onChange({ ...block, value: e.target.value })} />
      </Field>
      <Field label="캡션 (선택)">
        <Input
          value={block.caption}
          onChange={(e) => onChange({ ...block, caption: e.target.value })}
        />
      </Field>
    </div>
  );
}

function GalleryEditor({ block, onChange }: EditorProps<GalleryBlock>) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <Field label="컬럼 수">
          <Select
            value={String(block.columns)}
            onValueChange={(v) =>
              onChange({ ...block, columns: Number(v) as GalleryBlock["columns"] })
            }
          >
            <SelectTrigger className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="2">2열</SelectItem>
              <SelectItem value="3">3열</SelectItem>
              <SelectItem value="4">4열</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label="간격">
          <Select
            value={block.gap}
            onValueChange={(v) => onChange({ ...block, gap: v as GalleryBlock["gap"] })}
          >
            <SelectTrigger className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">없음</SelectItem>
              <SelectItem value="sm">좁게</SelectItem>
              <SelectItem value="md">보통</SelectItem>
              <SelectItem value="lg">넓게</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label="라운드 코너">
          <Select
            value={block.rounded}
            onValueChange={(v) =>
              onChange({ ...block, rounded: v as GalleryBlock["rounded"] })
            }
          >
            <SelectTrigger className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">없음</SelectItem>
              <SelectItem value="sm">작게</SelectItem>
              <SelectItem value="md">보통</SelectItem>
              <SelectItem value="lg">크게</SelectItem>
              <SelectItem value="xl">아주 크게</SelectItem>
              <SelectItem value="full">완전 (원형)</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label="그림자">
          <Select
            value={block.shadow}
            onValueChange={(v) =>
              onChange({ ...block, shadow: v as GalleryBlock["shadow"] })
            }
          >
            <SelectTrigger className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">없음</SelectItem>
              <SelectItem value="sm">은은하게</SelectItem>
              <SelectItem value="md">보통</SelectItem>
              <SelectItem value="lg">강하게</SelectItem>
            </SelectContent>
          </Select>
        </Field>
      </div>
      <div className="space-y-2">
        <Label className="text-xs">이미지</Label>
        <div className="space-y-2">
          {block.images.map((img, i) => (
            <div key={i} className="flex items-start gap-2 rounded-md border border-border p-2">
              <div className="flex-1">
                <ImageUploadField
                  value={img.url}
                  size={64}
                  onChange={(url) => {
                    const next = block.images.slice();
                    next[i] = { ...next[i], url };
                    onChange({ ...block, images: next });
                  }}
                />
                <Input
                  placeholder="대체 텍스트 (선택)"
                  value={img.alt}
                  onChange={(e) => {
                    const next = block.images.slice();
                    next[i] = { ...next[i], alt: e.target.value };
                    onChange({ ...block, images: next });
                  }}
                  className="mt-2 h-8 text-xs"
                />
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => {
                  const next = block.images.slice();
                  next.splice(i, 1);
                  onChange({ ...block, images: next });
                }}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() =>
            onChange({ ...block, images: [...block.images, { url: "", alt: "" }] })
          }
        >
          <Plus className="h-4 w-4" />
          <span>이미지 추가</span>
        </Button>
      </div>
    </div>
  );
}

function ScrollyHeroEditor({ block, onChange }: EditorProps<ScrollyHeroBlock>) {
  return (
    <div className="space-y-3">
      <p className="rounded-md bg-muted px-2 py-1.5 text-[11px] text-muted-foreground">
        스크롤 진입 시 텍스트와 이미지가 부드럽게 등장하는 히어로 블록입니다.
      </p>
      <Field label="배경 이미지">
        <ImageUploadField
          value={block.imageUrl}
          onChange={(url) => onChange({ ...block, imageUrl: url })}
        />
      </Field>
      <Field label="대제목">
        <Input
          value={block.headline}
          onChange={(e) => onChange({ ...block, headline: e.target.value })}
        />
      </Field>
      <Field label="소제목">
        <Textarea
          value={block.subheadline}
          onChange={(e) => onChange({ ...block, subheadline: e.target.value })}
          rows={2}
        />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="텍스트 색">
          <Select
            value={block.textColor}
            onValueChange={(v) =>
              onChange({ ...block, textColor: v as ScrollyHeroBlock["textColor"] })
            }
          >
            <SelectTrigger className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="light">밝게</SelectItem>
              <SelectItem value="dark">어둡게</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label="높이">
          <Select
            value={block.height}
            onValueChange={(v) =>
              onChange({ ...block, height: v as ScrollyHeroBlock["height"] })
            }
          >
            <SelectTrigger className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="md">중간</SelectItem>
              <SelectItem value="lg">크게</SelectItem>
              <SelectItem value="screen">전체화면</SelectItem>
            </SelectContent>
          </Select>
        </Field>
      </div>
    </div>
  );
}

function StickyFeatureEditor({ block, onChange }: EditorProps<StickyFeatureBlock>) {
  return (
    <div className="space-y-3">
      <p className="rounded-md bg-muted px-2 py-1.5 text-[11px] text-muted-foreground">
        한쪽에 텍스트가 고정되고 반대쪽에서 이미지 패널들이 스크롤되는 레이아웃 (애플 feature 섹션 스타일).
      </p>
      <Field label="제목">
        <Input
          value={block.heading}
          onChange={(e) => onChange({ ...block, heading: e.target.value })}
        />
      </Field>
      <Field label="설명">
        <Textarea
          value={block.body}
          onChange={(e) => onChange({ ...block, body: e.target.value })}
          rows={4}
        />
      </Field>
      <Field label="텍스트 위치">
        <Select
          value={block.textPosition}
          onValueChange={(v) =>
            onChange({ ...block, textPosition: v as StickyFeatureBlock["textPosition"] })
          }
        >
          <SelectTrigger className="h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="left">왼쪽 (이미지 오른쪽)</SelectItem>
            <SelectItem value="right">오른쪽 (이미지 왼쪽)</SelectItem>
          </SelectContent>
        </Select>
      </Field>
      <div className="space-y-2">
        <Label className="text-xs">패널 이미지 (위에서 아래로)</Label>
        <div className="space-y-2">
          {block.panels.map((p, i) => (
            <div key={i} className="flex items-start gap-2 rounded-md border border-border p-2">
              <div className="flex-1">
                <ImageUploadField
                  value={p.imageUrl}
                  size={64}
                  onChange={(url) => {
                    const next = block.panels.slice();
                    next[i] = { ...next[i], imageUrl: url };
                    onChange({ ...block, panels: next });
                  }}
                />
                <Input
                  placeholder="대체 텍스트 (선택)"
                  value={p.alt}
                  onChange={(e) => {
                    const next = block.panels.slice();
                    next[i] = { ...next[i], alt: e.target.value };
                    onChange({ ...block, panels: next });
                  }}
                  className="mt-2 h-8 text-xs"
                />
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => {
                  const next = block.panels.slice();
                  next.splice(i, 1);
                  onChange({ ...block, panels: next });
                }}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() =>
            onChange({ ...block, panels: [...block.panels, { imageUrl: "", alt: "" }] })
          }
        >
          <Plus className="h-4 w-4" />
          <span>패널 추가</span>
        </Button>
      </div>
    </div>
  );
}

function ParallaxEditor({ block, onChange }: EditorProps<ParallaxBlock>) {
  return (
    <div className="space-y-3">
      <p className="rounded-md bg-muted px-2 py-1.5 text-[11px] text-muted-foreground">
        배경 이미지가 고정되고 콘텐츠가 그 위로 흐르는 패럴럭스 효과 (모바일에서는 일반 배경으로 폴백).
      </p>
      <Field label="배경 이미지">
        <ImageUploadField
          value={block.imageUrl}
          onChange={(url) => onChange({ ...block, imageUrl: url })}
        />
      </Field>
      <Field label="대제목">
        <Input
          value={block.headline}
          onChange={(e) => onChange({ ...block, headline: e.target.value })}
        />
      </Field>
      <Field label="소제목">
        <Textarea
          value={block.subheadline}
          onChange={(e) => onChange({ ...block, subheadline: e.target.value })}
          rows={2}
        />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="텍스트 색">
          <Select
            value={block.textColor}
            onValueChange={(v) =>
              onChange({ ...block, textColor: v as ParallaxBlock["textColor"] })
            }
          >
            <SelectTrigger className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="light">밝게</SelectItem>
              <SelectItem value="dark">어둡게</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label="높이">
          <Select
            value={block.height}
            onValueChange={(v) => onChange({ ...block, height: v as ParallaxBlock["height"] })}
          >
            <SelectTrigger className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="md">중간</SelectItem>
              <SelectItem value="lg">크게</SelectItem>
            </SelectContent>
          </Select>
        </Field>
      </div>
    </div>
  );
}

function SpecTableEditor({ block, onChange }: EditorProps<SpecTableBlock>) {
  return (
    <div className="space-y-3">
      <p className="rounded-md bg-muted px-2 py-1.5 text-[11px] text-muted-foreground">
        이 블록은 상품에 등록된 스펙(specValues)을 자동으로 표로 그립니다. 스펙 수정은 상품 상세 페이지에서 하세요.
      </p>
      <Field label="제목 (선택)">
        <Input
          value={block.title}
          onChange={(e) => onChange({ ...block, title: e.target.value })}
        />
      </Field>
    </div>
  );
}

function AmbientVideoEditor({ block, onChange }: EditorProps<AmbientVideoBlock>) {
  return (
    <div className="space-y-3">
      <p className="rounded-md bg-muted px-2 py-1.5 text-[11px] text-muted-foreground">
        컨트롤 없이 자동 재생되는 무한루프 영상. mp4/webm 직접 URL을 사용하세요. (YouTube 불가)
      </p>
      <Field label="영상 URL (mp4/webm)">
        <Input
          value={block.videoUrl}
          placeholder="https://... .mp4"
          onChange={(e) => onChange({ ...block, videoUrl: e.target.value })}
        />
      </Field>
      <Field label="포스터 이미지 (영상 로드 전 표시, 선택)">
        <ImageUploadField
          value={block.posterUrl}
          onChange={(url) => onChange({ ...block, posterUrl: url })}
        />
      </Field>
      <Field label="대제목 (선택)">
        <Input
          value={block.headline}
          onChange={(e) => onChange({ ...block, headline: e.target.value })}
        />
      </Field>
      <Field label="소제목 (선택)">
        <Textarea
          value={block.subheadline}
          onChange={(e) => onChange({ ...block, subheadline: e.target.value })}
          rows={2}
        />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="텍스트 색">
          <Select
            value={block.textColor}
            onValueChange={(v) =>
              onChange({ ...block, textColor: v as AmbientVideoBlock["textColor"] })
            }
          >
            <SelectTrigger className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="light">밝게</SelectItem>
              <SelectItem value="dark">어둡게</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label="높이">
          <Select
            value={block.height}
            onValueChange={(v) =>
              onChange({ ...block, height: v as AmbientVideoBlock["height"] })
            }
          >
            <SelectTrigger className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="md">중간</SelectItem>
              <SelectItem value="lg">크게</SelectItem>
              <SelectItem value="screen">전체화면</SelectItem>
            </SelectContent>
          </Select>
        </Field>
      </div>
    </div>
  );
}

function TableEditor({ block, onChange }: EditorProps<TableBlock>) {
  const colCount = block.headers.length;

  const updateHeader = (i: number, value: string) => {
    const next = block.headers.slice();
    next[i] = value;
    onChange({ ...block, headers: next });
  };

  const addColumn = () => {
    onChange({
      ...block,
      headers: [...block.headers, ""],
      rows: block.rows.map((r) => [...r, ""]),
    });
  };

  const removeColumn = (i: number) => {
    onChange({
      ...block,
      headers: block.headers.filter((_, idx) => idx !== i),
      rows: block.rows.map((r) => r.filter((_, idx) => idx !== i)),
    });
  };

  const updateCell = (r: number, c: number, value: string) => {
    const next = block.rows.map((row) => row.slice());
    while (next[r].length < colCount) next[r].push("");
    next[r][c] = value;
    onChange({ ...block, rows: next });
  };

  const addRow = () => {
    onChange({ ...block, rows: [...block.rows, Array(colCount).fill("")] });
  };

  const removeRow = (i: number) => {
    onChange({ ...block, rows: block.rows.filter((_, idx) => idx !== i) });
  };

  return (
    <div className="space-y-3">
      <Field label="캡션 (선택)">
        <Input
          value={block.caption}
          onChange={(e) => onChange({ ...block, caption: e.target.value })}
        />
      </Field>
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-xs">헤더 / 행</Label>
          <div className="flex gap-1.5">
            <Button type="button" size="sm" variant="outline" className="h-7" onClick={addColumn}>
              <Plus className="h-3.5 w-3.5" />
              <span>열 추가</span>
            </Button>
            <Button type="button" size="sm" variant="outline" className="h-7" onClick={addRow}>
              <Plus className="h-3.5 w-3.5" />
              <span>행 추가</span>
            </Button>
          </div>
        </div>
        <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="bg-muted/40">
                {block.headers.map((h, i) => (
                  <th key={i} className="border-b border-border p-1">
                    <div className="flex items-center gap-1">
                      <Input
                        value={h}
                        placeholder={`헤더 ${i + 1}`}
                        onChange={(e) => updateHeader(i, e.target.value)}
                        className="h-7 text-xs"
                      />
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="h-6 w-6 shrink-0"
                        onClick={() => removeColumn(i)}
                        aria-label="열 삭제"
                        disabled={colCount <= 1}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </th>
                ))}
                <th className="w-8" />
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, r) => (
                <tr key={r}>
                  {block.headers.map((_, c) => (
                    <td key={c} className="border-b border-border p-1">
                      <Input
                        value={row[c] ?? ""}
                        onChange={(e) => updateCell(r, c, e.target.value)}
                        className="h-7 text-xs"
                      />
                    </td>
                  ))}
                  <td className="border-b border-border p-1">
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="h-6 w-6"
                      onClick={() => removeRow(r)}
                      aria-label="행 삭제"
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function ChartEditor({ block, onChange }: EditorProps<ChartBlock>) {
  const updatePoint = (i: number, patch: Partial<ChartBlock["data"][number]>) => {
    const next = block.data.slice();
    next[i] = { ...next[i], ...patch };
    onChange({ ...block, data: next });
  };

  return (
    <div className="space-y-3">
      <p className="rounded-md bg-muted px-2 py-1.5 text-[11px] text-muted-foreground">
        막대/선/원형 그래프. 외부 채널 export 시 스크린샷으로만 변환됩니다.
      </p>
      <div className="grid grid-cols-2 gap-2">
        <Field label="차트 종류">
          <Select
            value={block.chartType}
            onValueChange={(v) => onChange({ ...block, chartType: v as ChartBlock["chartType"] })}
          >
            <SelectTrigger className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="bar">막대</SelectItem>
              <SelectItem value="line">선</SelectItem>
              <SelectItem value="pie">원형</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label="제목">
          <Input
            value={block.title}
            onChange={(e) => onChange({ ...block, title: e.target.value })}
          />
        </Field>
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">데이터</Label>
        <div className="space-y-1.5">
          {block.data.map((d, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <Input
                value={d.label}
                placeholder={`라벨 ${i + 1}`}
                onChange={(e) => updatePoint(i, { label: e.target.value })}
                className="h-8 flex-1 text-xs"
              />
              <Input
                type="number"
                value={d.value}
                placeholder="값"
                onChange={(e) => updatePoint(i, { value: Number(e.target.value) || 0 })}
                className="h-8 w-24 text-xs"
              />
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-7 w-7 shrink-0"
                onClick={() =>
                  onChange({ ...block, data: block.data.filter((_, idx) => idx !== i) })
                }
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() =>
            onChange({ ...block, data: [...block.data, { label: "", value: 0 }] })
          }
        >
          <Plus className="h-4 w-4" />
          <span>데이터 추가</span>
        </Button>
      </div>
    </div>
  );
}

function StatsGridEditor({ block, onChange }: EditorProps<StatsGridBlock>) {
  const updateItem = (i: number, patch: Partial<StatsGridBlock["items"][number]>) => {
    const next = block.items.slice();
    next[i] = { ...next[i], ...patch };
    onChange({ ...block, items: next });
  };

  return (
    <div className="space-y-3">
      <p className="rounded-md bg-muted px-2 py-1.5 text-[11px] text-muted-foreground">
        Apple 스타일의 큰 숫자 + 단위 + 라벨 그리드. 컬럼 수와 항목을 자유롭게 조정.
      </p>
      <Field label="작은 라벨 (eyebrow)">
        <Input
          value={block.eyebrow}
          placeholder='예: "AT A GLANCE"'
          onChange={(e) => onChange({ ...block, eyebrow: e.target.value })}
        />
      </Field>
      <Field label="제목 (줄바꿈은 \n 으로 그대로 입력)">
        <Textarea
          value={block.heading}
          onChange={(e) => onChange({ ...block, heading: e.target.value })}
          rows={2}
        />
      </Field>
      <Field label="설명 (선택)">
        <Textarea
          value={block.body}
          onChange={(e) => onChange({ ...block, body: e.target.value })}
          rows={2}
        />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="정렬 (헤더)">
          <Select
            value={block.align}
            onValueChange={(v) => onChange({ ...block, align: v as StatsGridBlock["align"] })}
          >
            <SelectTrigger className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="left">왼쪽</SelectItem>
              <SelectItem value="center">가운데</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label="컬럼 수">
          <Select
            value={String(block.columns)}
            onValueChange={(v) =>
              onChange({ ...block, columns: Number(v) as StatsGridBlock["columns"] })
            }
          >
            <SelectTrigger className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="2">2</SelectItem>
              <SelectItem value="3">3</SelectItem>
              <SelectItem value="4">4</SelectItem>
              <SelectItem value="5">5</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label="배경">
          <Select
            value={block.background}
            onValueChange={(v) =>
              onChange({ ...block, background: v as StatsGridBlock["background"] })
            }
          >
            <SelectTrigger className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">없음</SelectItem>
              <SelectItem value="muted">연한 회색</SelectItem>
              <SelectItem value="dark">진한 (반전)</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label="상하 여백">
          <Select
            value={block.paddingY}
            onValueChange={(v) =>
              onChange({ ...block, paddingY: v as StatsGridBlock["paddingY"] })
            }
          >
            <SelectTrigger className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="sm">좁게</SelectItem>
              <SelectItem value="md">보통</SelectItem>
              <SelectItem value="lg">넓게</SelectItem>
              <SelectItem value="xl">아주 넓게</SelectItem>
            </SelectContent>
          </Select>
        </Field>
      </div>

      <div className="flex items-start justify-between gap-3 rounded-md border border-border px-3 py-2">
        <div className="space-y-0.5">
          <div className="text-xs font-medium">컬럼 사이 구분선</div>
          <div className="text-[11px] text-muted-foreground">
            데스크톱에서 항목 사이에 세로선 표시 (Apple 스타일)
          </div>
        </div>
        <Switch
          checked={block.dividers}
          onCheckedChange={(v) => onChange({ ...block, dividers: v })}
        />
      </div>

      <div className="flex items-start justify-between gap-3 rounded-md border border-border px-3 py-2">
        <div className="space-y-0.5">
          <div className="text-xs font-medium">상품 스펙 자동 사용</div>
          <div className="text-[11px] text-muted-foreground">
            켜면 상품에 등록된 스펙(specValues)을 자동으로 항목으로 사용. 아래 수동 입력은 무시됨
          </div>
        </div>
        <Switch
          checked={block.useProductSpecs}
          onCheckedChange={(v) => onChange({ ...block, useProductSpecs: v })}
        />
      </div>

      <div className={cn("space-y-2", block.useProductSpecs && "opacity-50 pointer-events-none")}>
        <div className="flex items-center justify-between">
          <Label className="text-xs">항목 (수동 입력)</Label>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7"
            onClick={() =>
              onChange({
                ...block,
                items: [...block.items, { value: "", unit: "", label: "" }],
              })
            }
          >
            <Plus className="h-3.5 w-3.5" />
            <span>추가</span>
          </Button>
        </div>
        <div className="space-y-1.5">
          {block.items.map((it, i) => (
            <div key={i} className="flex items-center gap-1.5 rounded-md border border-border p-2">
              <div className="grid flex-1 grid-cols-3 gap-1.5">
                <Input
                  value={it.value}
                  placeholder="숫자 (35.8)"
                  onChange={(e) => updateItem(i, { value: e.target.value })}
                  className="h-8 text-xs"
                />
                <Input
                  value={it.unit}
                  placeholder="단위 (cm³)"
                  onChange={(e) => updateItem(i, { unit: e.target.value })}
                  className="h-8 text-xs"
                />
                <Input
                  value={it.label}
                  placeholder="라벨 (배기량)"
                  onChange={(e) => updateItem(i, { label: e.target.value })}
                  className="h-8 text-xs"
                />
              </div>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-7 w-7 shrink-0"
                onClick={() =>
                  onChange({
                    ...block,
                    items: block.items.filter((_, idx) => idx !== i),
                  })
                }
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** 아이콘 선택 Select — preset 20개 + "(없음)" */
function IconSelect({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (next: string | null) => void;
}) {
  return (
    <Select
      value={value ?? "__none"}
      onValueChange={(v) => onChange(v === "__none" ? null : v)}
    >
      <SelectTrigger className="h-9">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="__none">(없음)</SelectItem>
        {LANDING_ICON_NAMES.map((name) => (
          <SelectItem key={name} value={name}>
            {LANDING_ICON_LABELS[name]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function CalloutEditor({ block, onChange }: EditorProps<CalloutBlock>) {
  return (
    <div className="space-y-3">
      <p className="rounded-md bg-muted px-2 py-1.5 text-[11px] text-muted-foreground">
        좌측 컬러 바 + 라벨 + 본문 형태의 강조 박스. 본문은 마크다운 사용 가능 (**굵게**, [링크](url)).
      </p>
      <div className="grid grid-cols-2 gap-2">
        <Field label="색상 (variant)">
          <Select
            value={block.variant}
            onValueChange={(v) => onChange({ ...block, variant: v as CalloutBlock["variant"] })}
          >
            <SelectTrigger className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="warning">경고 (주황)</SelectItem>
              <SelectItem value="info">정보 (녹색)</SelectItem>
              <SelectItem value="success">성공 (녹색)</SelectItem>
              <SelectItem value="danger">위험 (빨강)</SelectItem>
              <SelectItem value="neutral">중립 (회색)</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label="아이콘 (선택)">
          <IconSelect
            value={block.icon}
            onChange={(icon) => onChange({ ...block, icon })}
          />
        </Field>
      </div>
      <Field label="라벨 (예: 주의, TIP, 안내)">
        <Input
          value={block.label}
          onChange={(e) => onChange({ ...block, label: e.target.value })}
        />
      </Field>
      <Field label="본문 (마크다운 가능)">
        <Textarea
          value={block.body}
          onChange={(e) => onChange({ ...block, body: e.target.value })}
          rows={3}
        />
      </Field>
      <Field label="상하 여백">
        <Select
          value={block.paddingY}
          onValueChange={(v) =>
            onChange({ ...block, paddingY: v as CalloutBlock["paddingY"] })
          }
        >
          <SelectTrigger className="h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="sm">좁게</SelectItem>
            <SelectItem value="md">보통</SelectItem>
            <SelectItem value="lg">넓게</SelectItem>
          </SelectContent>
        </Select>
      </Field>
    </div>
  );
}

function InfoGridEditor({ block, onChange }: EditorProps<InfoGridBlock>) {
  const updateSection = (
    idx: number,
    patch: Partial<InfoGridBlock["sections"][number]>,
  ) => {
    const next = block.sections.slice();
    next[idx] = { ...next[idx], ...patch };
    onChange({ ...block, sections: next });
  };

  const addSection = () => {
    const next = [
      ...block.sections,
      {
        number: `— ${String(block.sections.length + 1).padStart(2, "0")}`,
        title: "",
        icon: null,
        rows: [],
        bullets: [],
        notice: null,
      },
    ];
    onChange({ ...block, sections: next });
  };

  const moveSection = (idx: number, dir: -1 | 1) => {
    const target = idx + dir;
    if (target < 0 || target >= block.sections.length) return;
    const next = block.sections.slice();
    [next[idx], next[target]] = [next[target], next[idx]];
    onChange({ ...block, sections: next });
  };

  const removeSection = (idx: number) => {
    onChange({ ...block, sections: block.sections.filter((_, i) => i !== idx) });
  };

  return (
    <div className="space-y-3">
      <p className="rounded-md bg-muted px-2 py-1.5 text-[11px] text-muted-foreground">
        한국 쇼핑몰 표준 footer 디자인. 섹션마다 번호 + 제목 + 키-값 표 + 추가 불릿 + 선택적 notice 박스.
      </p>

      <div className="grid grid-cols-2 gap-2">
        <Field label="배경">
          <Select
            value={block.background}
            onValueChange={(v) =>
              onChange({ ...block, background: v as InfoGridBlock["background"] })
            }
          >
            <SelectTrigger className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="muted">연한 회색</SelectItem>
              <SelectItem value="none">없음</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label="상하 여백">
          <Select
            value={block.paddingY}
            onValueChange={(v) =>
              onChange({ ...block, paddingY: v as InfoGridBlock["paddingY"] })
            }
          >
            <SelectTrigger className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="md">보통</SelectItem>
              <SelectItem value="lg">넓게</SelectItem>
              <SelectItem value="xl">아주 넓게</SelectItem>
            </SelectContent>
          </Select>
        </Field>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-xs">섹션 ({block.sections.length}개)</Label>
          <Button type="button" size="sm" variant="outline" className="h-7" onClick={addSection}>
            <Plus className="h-3.5 w-3.5" />
            <span>섹션 추가</span>
          </Button>
        </div>
        <div className="space-y-3">
          {block.sections.map((sec, sIdx) => (
            <div key={sIdx} className="space-y-2 rounded-md border border-border bg-card p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-medium text-muted-foreground">
                  섹션 #{sIdx + 1}
                </span>
                <div className="flex gap-1">
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="h-6 w-6"
                    disabled={sIdx === 0}
                    onClick={() => moveSection(sIdx, -1)}
                    title="위로"
                  >
                    ↑
                  </Button>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="h-6 w-6"
                    disabled={sIdx === block.sections.length - 1}
                    onClick={() => moveSection(sIdx, 1)}
                    title="아래로"
                  >
                    ↓
                  </Button>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="h-6 w-6"
                    onClick={() => removeSection(sIdx)}
                    title="삭제"
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <Field label="번호">
                  <Input
                    value={sec.number}
                    placeholder="— 01"
                    onChange={(e) => updateSection(sIdx, { number: e.target.value })}
                    className="h-8 text-xs"
                  />
                </Field>
                <div className="col-span-2">
                  <Field label="제목">
                    <Input
                      value={sec.title}
                      placeholder="배송 안내"
                      onChange={(e) => updateSection(sIdx, { title: e.target.value })}
                      className="h-8 text-xs"
                    />
                  </Field>
                </div>
              </div>

              <Field label="아이콘 (선택)">
                <IconSelect
                  value={sec.icon}
                  onChange={(icon) => updateSection(sIdx, { icon })}
                />
              </Field>

              {/* rows */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label className="text-[11px]">키-값 행 ({sec.rows.length})</Label>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-6 text-[11px]"
                    onClick={() =>
                      updateSection(sIdx, {
                        rows: [...sec.rows, { key: "", value: "" }],
                      })
                    }
                  >
                    <Plus className="h-3 w-3" />
                    <span>행 추가</span>
                  </Button>
                </div>
                {sec.rows.map((row, rIdx) => (
                  <div key={rIdx} className="flex items-start gap-1.5">
                    <Input
                      value={row.key}
                      placeholder="키 (예: 배송 방법)"
                      onChange={(e) => {
                        const next = sec.rows.slice();
                        next[rIdx] = { ...next[rIdx], key: e.target.value };
                        updateSection(sIdx, { rows: next });
                      }}
                      className="h-7 w-1/3 text-xs"
                    />
                    <Input
                      value={row.value}
                      placeholder="값 (마크다운 가능)"
                      onChange={(e) => {
                        const next = sec.rows.slice();
                        next[rIdx] = { ...next[rIdx], value: e.target.value };
                        updateSection(sIdx, { rows: next });
                      }}
                      className="h-7 flex-1 text-xs"
                    />
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 shrink-0"
                      onClick={() => {
                        updateSection(sIdx, {
                          rows: sec.rows.filter((_, i) => i !== rIdx),
                        });
                      }}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
              </div>

              {/* bullets */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label className="text-[11px]">추가 불릿 ({sec.bullets.length})</Label>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-6 text-[11px]"
                    onClick={() => updateSection(sIdx, { bullets: [...sec.bullets, ""] })}
                  >
                    <Plus className="h-3 w-3" />
                    <span>불릿 추가</span>
                  </Button>
                </div>
                {sec.bullets.map((b, bIdx) => (
                  <div key={bIdx} className="flex items-start gap-1.5">
                    <Input
                      value={b}
                      onChange={(e) => {
                        const next = sec.bullets.slice();
                        next[bIdx] = e.target.value;
                        updateSection(sIdx, { bullets: next });
                      }}
                      className="h-7 flex-1 text-xs"
                    />
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 shrink-0"
                      onClick={() => {
                        updateSection(sIdx, {
                          bullets: sec.bullets.filter((_, i) => i !== bIdx),
                        });
                      }}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
              </div>

              {/* notice */}
              <div className="flex items-start justify-between gap-3 rounded-md border border-border bg-background px-3 py-2">
                <div className="space-y-0.5">
                  <div className="text-[11px] font-medium">하단 알림 박스</div>
                  <div className="text-[10px] text-muted-foreground">
                    주황 컬러바가 있는 강조 박스를 섹션 끝에 표시
                  </div>
                </div>
                <Switch
                  checked={sec.notice !== null}
                  onCheckedChange={(v) => {
                    updateSection(sIdx, {
                      notice: v
                        ? { variant: "warning", label: "주의", body: "" }
                        : null,
                    });
                  }}
                />
              </div>
              {sec.notice && (
                <div className="space-y-2 rounded-md border border-border bg-muted/40 p-2">
                  <div className="grid grid-cols-2 gap-2">
                    <Field label="색상">
                      <Select
                        value={sec.notice.variant}
                        onValueChange={(v) =>
                          updateSection(sIdx, {
                            notice: sec.notice
                              ? { ...sec.notice, variant: v as CalloutBlock["variant"] }
                              : null,
                          })
                        }
                      >
                        <SelectTrigger className="h-8">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="warning">경고 (주황)</SelectItem>
                          <SelectItem value="info">정보 (녹색)</SelectItem>
                          <SelectItem value="success">성공 (녹색)</SelectItem>
                          <SelectItem value="danger">위험 (빨강)</SelectItem>
                          <SelectItem value="neutral">중립 (회색)</SelectItem>
                        </SelectContent>
                      </Select>
                    </Field>
                    <Field label="라벨">
                      <Input
                        value={sec.notice.label}
                        onChange={(e) =>
                          updateSection(sIdx, {
                            notice: sec.notice
                              ? { ...sec.notice, label: e.target.value }
                              : null,
                          })
                        }
                        className="h-8 text-xs"
                      />
                    </Field>
                  </div>
                  <Field label="본문 (마크다운 가능)">
                    <Textarea
                      value={sec.notice.body}
                      rows={2}
                      onChange={(e) =>
                        updateSection(sIdx, {
                          notice: sec.notice
                            ? { ...sec.notice, body: e.target.value }
                            : null,
                        })
                      }
                      className="text-xs"
                    />
                  </Field>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ProductInfoEditor({ block, onChange }: EditorProps<ProductInfoBlock>) {
  return (
    <div className="space-y-3">
      <p className="rounded-md bg-muted px-2 py-1.5 text-[11px] text-muted-foreground">
        Product 의 의무 필드 (제조국·제조자·인증·품질보증기준 등) 와 ProductSpec 을 자동 매핑합니다. 누락된 필드는 상품 편집 → "기본 정보" 의 "상품정보 고시" 섹션에서 입력하세요.
      </p>
      <div className="grid grid-cols-2 gap-2">
        <Field label="번호 (예: — 04)">
          <Input
            value={block.number}
            onChange={(e) => onChange({ ...block, number: e.target.value })}
          />
        </Field>
        <Field label="제목">
          <Input
            value={block.title}
            onChange={(e) => onChange({ ...block, title: e.target.value })}
          />
        </Field>
        <Field label="배경">
          <Select
            value={block.background}
            onValueChange={(v) =>
              onChange({ ...block, background: v as ProductInfoBlock["background"] })
            }
          >
            <SelectTrigger className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="muted">연한 회색</SelectItem>
              <SelectItem value="none">없음</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label="상하 여백">
          <Select
            value={block.paddingY}
            onValueChange={(v) =>
              onChange({ ...block, paddingY: v as ProductInfoBlock["paddingY"] })
            }
          >
            <SelectTrigger className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="md">보통</SelectItem>
              <SelectItem value="lg">넓게</SelectItem>
              <SelectItem value="xl">아주 넓게</SelectItem>
            </SelectContent>
          </Select>
        </Field>
      </div>

      <div className="flex items-start justify-between gap-3 rounded-md border border-border px-3 py-2">
        <div className="space-y-0.5">
          <div className="text-xs font-medium">주요 사양 자동 사용 (ProductSpec)</div>
          <div className="text-[11px] text-muted-foreground">
            켜면 상품에 등록된 Spec 항목 (출력/배기량 등) 을 "주요 사양" 으로 자동 추가
          </div>
        </div>
        <Switch
          checked={block.useProductSpecs}
          onCheckedChange={(v) => onChange({ ...block, useProductSpecs: v })}
        />
      </div>

      <Field label="자동 행 중 제외할 키 (쉼표로 구분, 비우면 모두 표시)">
        <Input
          value={block.excludeKeys.join(", ")}
          placeholder="예: 수입자, 모델명"
          onChange={(e) => {
            const keys = e.target.value
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean);
            onChange({ ...block, excludeKeys: keys });
          }}
        />
      </Field>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label className="text-xs">추가 행 ({block.customRows.length})</Label>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7"
            onClick={() =>
              onChange({
                ...block,
                customRows: [...block.customRows, { key: "", value: "" }],
              })
            }
          >
            <Plus className="h-3.5 w-3.5" />
            <span>행 추가</span>
          </Button>
        </div>
        {block.customRows.map((row, i) => (
          <div key={i} className="flex items-start gap-1.5">
            <Input
              value={row.key}
              placeholder="키"
              onChange={(e) => {
                const next = block.customRows.slice();
                next[i] = { ...next[i], key: e.target.value };
                onChange({ ...block, customRows: next });
              }}
              className="h-8 w-1/3 text-xs"
            />
            <Input
              value={row.value}
              placeholder="값 (마크다운 가능)"
              onChange={(e) => {
                const next = block.customRows.slice();
                next[i] = { ...next[i], value: e.target.value };
                onChange({ ...block, customRows: next });
              }}
              className="h-8 flex-1 text-xs"
            />
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-8 w-8"
              onClick={() =>
                onChange({
                  ...block,
                  customRows: block.customRows.filter((_, idx) => idx !== i),
                })
              }
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}

function HtmlEmbedEditor({ block, onChange }: EditorProps<HtmlEmbedBlock>) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  // 높이 입력 — 자유 편집 가능하도록 로컬 string state 로 버퍼링, blur 시 검증/동기화
  const [heightStr, setHeightStr] = useState(String(block.heightPx));

  const onFile = async (file: File) => {
    setUploading(true);
    try {
      const url = await uploadHtml(file);
      onChange({ ...block, htmlUrl: url });
      toast.success("HTML 파일이 업로드되었습니다");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "업로드 실패");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-3">
      <p className="rounded-md bg-muted px-2 py-1.5 text-[11px] text-muted-foreground">
        직접 만든 .html 파일을 업로드해 sandboxed iframe 으로 표시합니다. 본인 작성 HTML 권장 — 외부 페이지에 있을 수 있는 트래커가 함께 들어오지 않도록.
      </p>

      <Field label="HTML 파일 (.html / .htm, 최대 5MB)">
        <div className="space-y-2">
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={uploading}
              onClick={() => fileRef.current?.click()}
            >
              {uploading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Upload className="h-4 w-4" />
              )}
              <span>{uploading ? "업로드 중..." : block.htmlUrl ? "다른 파일로 교체" : "파일 업로드"}</span>
            </Button>
            {block.htmlUrl && (
              <>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => window.open(block.htmlUrl, "_blank")}
                >
                  <ExternalLink className="h-4 w-4" />
                  <span>새 탭에서 열기</span>
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => onChange({ ...block, htmlUrl: "" })}
                >
                  <Trash2 className="h-4 w-4" />
                  <span>제거</span>
                </Button>
              </>
            )}
            <input
              ref={fileRef}
              type="file"
              accept=".html,.htm,text/html"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void onFile(f);
                e.target.value = "";
              }}
            />
          </div>
          {block.htmlUrl && (
            <Input
              value={block.htmlUrl}
              readOnly
              className="h-8 text-[11px] text-muted-foreground"
              onFocus={(e) => e.currentTarget.select()}
            />
          )}
        </div>
      </Field>

      <div className="grid grid-cols-2 gap-2">
        <Field label={block.autoHeight ? "최소 높이 (px)" : "높이 (px)"}>
          <Input
            type="number"
            min={100}
            value={heightStr}
            onChange={(e) => setHeightStr(e.target.value)}
            onBlur={() => {
              const v = parseInt(heightStr, 10);
              if (Number.isFinite(v) && v >= 100 && v <= 50000) {
                if (v !== block.heightPx) onChange({ ...block, heightPx: v });
                setHeightStr(String(v));
              } else {
                setHeightStr(String(block.heightPx));
              }
            }}
            onFocus={(e) => e.currentTarget.select()}
            disabled={block.autoHeight}
          />
        </Field>
        <Field label="표시 모드">
          <Select
            value={block.displayMode}
            onValueChange={(v) =>
              onChange({ ...block, displayMode: v as HtmlEmbedBlock["displayMode"] })
            }
          >
            <SelectTrigger className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="inline">inline (다른 블록과 같은 폭)</SelectItem>
              <SelectItem value="cover">cover (풀 viewport 폭)</SelectItem>
            </SelectContent>
          </Select>
        </Field>
      </div>

      <div className="flex items-start justify-between gap-3 rounded-md border border-border px-3 py-2">
        <div className="space-y-0.5">
          <div className="text-xs font-medium">자동 높이</div>
          <div className="text-[11px] text-muted-foreground">
            iframe 내부 콘텐츠 높이를 자동 측정해 스크롤 없이 펼침. 끄면 위 높이로 고정.
          </div>
        </div>
        <Switch
          checked={block.autoHeight}
          onCheckedChange={(v) => onChange({ ...block, autoHeight: v })}
        />
      </div>

      <div className="flex items-start justify-between gap-3 rounded-md border border-border px-3 py-2">
        <div className="space-y-0.5">
          <div className="text-xs font-medium">폼 사용 허용</div>
          <div className="text-[11px] text-muted-foreground">
            iframe 안에서 form 제출이 필요할 때만 켜세요. 보안상 기본은 꺼짐.
          </div>
        </div>
        <Switch
          checked={block.allowForms}
          onCheckedChange={(v) => onChange({ ...block, allowForms: v })}
        />
      </div>

      <p className="text-[11px] text-muted-foreground">
        ⚠️ HTML 안의 <code className="rounded bg-muted px-1">{`<img>`}</code> 는 절대 URL 또는 base64 권장.
        상대 경로는 storage 경로 기준이라 깨질 수 있습니다.
      </p>
    </div>
  );
}

export function BlockEditor({
  block,
  onChange,
}: {
  block: LandingBlock;
  onChange: (next: LandingBlock) => void;
}) {
  switch (block.type) {
    case "hero":
      return <HeroEditor block={block} onChange={onChange} />;
    case "image":
      return <ImageEditor block={block} onChange={onChange} />;
    case "text":
      return <TextEditor block={block} onChange={onChange} />;
    case "video":
      return <VideoEditor block={block} onChange={onChange} />;
    case "gallery":
      return <GalleryEditor block={block} onChange={onChange} />;
    case "scrolly-hero":
      return <ScrollyHeroEditor block={block} onChange={onChange} />;
    case "sticky-feature":
      return <StickyFeatureEditor block={block} onChange={onChange} />;
    case "parallax":
      return <ParallaxEditor block={block} onChange={onChange} />;
    case "spec-table":
      return <SpecTableEditor block={block} onChange={onChange} />;
    case "ambient-video":
      return <AmbientVideoEditor block={block} onChange={onChange} />;
    case "table":
      return <TableEditor block={block} onChange={onChange} />;
    case "chart":
      return <ChartEditor block={block} onChange={onChange} />;
    case "stats-grid":
      return <StatsGridEditor block={block} onChange={onChange} />;
    case "callout":
      return <CalloutEditor block={block} onChange={onChange} />;
    case "info-grid":
      return <InfoGridEditor block={block} onChange={onChange} />;
    case "product-info":
      return <ProductInfoEditor block={block} onChange={onChange} />;
    case "html-embed":
      return <HtmlEmbedEditor block={block} onChange={onChange} />;
  }
}
