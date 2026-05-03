"use client";

import { Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
  LandingBlock,
} from "@/lib/validators/landing-block";

import { ImageUploadField } from "./_image-upload";

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
      <Field label="너비">
        <Select
          value={block.fullWidth ? "full" : "narrow"}
          onValueChange={(v) => onChange({ ...block, fullWidth: v === "full" })}
        >
          <SelectTrigger className="h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="full">전체 폭</SelectItem>
            <SelectItem value="narrow">좁게 (max-w-3xl)</SelectItem>
          </SelectContent>
        </Select>
      </Field>
    </div>
  );
}

function TextEditor({ block, onChange }: EditorProps<TextBlock>) {
  return (
    <div className="space-y-3">
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
      <div className="grid grid-cols-2 gap-2">
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
  }
}
