import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { noteCreateSchema, NOTE_SOURCE_TYPES } from "@/lib/validators/note";
import { guardUser } from "@/lib/api-auth";
import { recordAudit } from "@/lib/audit";

export async function GET(request: NextRequest) {
  const [, deny] = await guardUser();
  if (deny) return deny;

  const { searchParams } = new URL(request.url);
  const kind = searchParams.get("kind");
  const doneParam = searchParams.get("done");
  const search = searchParams.get("search") || "";
  const sourceTypeRaw = searchParams.get("sourceType");
  const sourceId = searchParams.get("sourceId");
  const hasSource = searchParams.get("hasSource");
  const limitParam = searchParams.get("limit");
  const limit = limitParam ? Math.min(parseInt(limitParam, 10) || 0, 200) : undefined;

  const validSource =
    sourceTypeRaw && (NOTE_SOURCE_TYPES as readonly string[]).includes(sourceTypeRaw)
      ? (sourceTypeRaw as (typeof NOTE_SOURCE_TYPES)[number])
      : undefined;

  const where: Prisma.NoteWhereInput = {
    isActive: true,
    ...(kind === "TODO" || kind === "MEMO" ? { kind } : {}),
    ...(doneParam === "1" ? { done: true } : doneParam === "0" ? { done: false } : {}),
    ...(validSource
      ? { sourceType: validSource }
      : hasSource === "1"
        ? { sourceType: { not: null } }
        : {}),
    ...(sourceId ? { sourceId } : {}),
    ...(search
      ? {
          OR: [
            { content: { contains: search, mode: "insensitive" as const } },
            { title: { contains: search, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const notes = await prisma.note.findMany({
    where,
    orderBy: [
      { pinned: "desc" },
      { done: "asc" },
      { dueDate: "asc" },
      { createdAt: "desc" },
    ],
    include: { createdBy: { select: { id: true, name: true } } },
    ...(limit ? { take: limit } : {}),
  });

  return NextResponse.json(notes);
}

export async function POST(request: NextRequest) {
  const [user, deny] = await guardUser();
  if (deny) return deny;

  const body = await request.json();
  const parsed = noteCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const data = parsed.data;

  const note = await prisma.note.create({
    data: {
      kind: data.kind,
      content: data.content,
      title: data.title ?? null,
      done: data.done,
      doneAt: data.done ? new Date() : null,
      dueDate: data.dueDate ?? null,
      priority: data.priority,
      notify: data.notify,
      notifyAt: data.notifyAt ?? null,
      sourceType: data.sourceType ?? null,
      sourceId: data.sourceId ?? null,
      sourceLabel: data.sourceLabel ?? null,
      pinned: data.pinned,
      createdById: user.id,
    },
    include: { createdBy: { select: { id: true, name: true } } },
  });

  await recordAudit(prisma, {
    userId: user.id,
    entity: "Note",
    entityId: note.id,
    action: "CREATE",
    meta: { kind: note.kind, content: note.content.slice(0, 80) },
  });

  return NextResponse.json(note, { status: 201 });
}
