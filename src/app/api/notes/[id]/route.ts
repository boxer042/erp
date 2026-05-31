import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { noteUpdateSchema } from "@/lib/validators/note";
import { guardUser } from "@/lib/api-auth";
import { recordAudit } from "@/lib/audit";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const [, deny] = await guardUser();
  if (deny) return deny;
  const { id } = await params;

  const note = await prisma.note.findUnique({
    where: { id },
    include: { createdBy: { select: { id: true, name: true } } },
  });
  if (!note || !note.isActive) {
    return NextResponse.json({ error: "찾을 수 없습니다" }, { status: 404 });
  }
  return NextResponse.json(note);
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const [user, deny] = await guardUser();
  if (deny) return deny;
  const { id } = await params;

  const body = await request.json();
  const parsed = noteUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const d = parsed.data;

  const before = await prisma.note.findUnique({
    where: { id },
    select: { id: true, done: true, isActive: true },
  });
  if (!before || !before.isActive) {
    return NextResponse.json({ error: "찾을 수 없습니다" }, { status: 404 });
  }

  const update: Prisma.NoteUpdateInput = {
    ...(d.kind !== undefined ? { kind: d.kind } : {}),
    ...(d.content !== undefined ? { content: d.content } : {}),
    ...(d.title !== undefined ? { title: d.title ?? null } : {}),
    ...(d.priority !== undefined ? { priority: d.priority } : {}),
    ...(d.dueDate !== undefined ? { dueDate: d.dueDate ?? null } : {}),
    ...(d.notify !== undefined ? { notify: d.notify } : {}),
    ...(d.notifyAt !== undefined ? { notifyAt: d.notifyAt ?? null } : {}),
    ...(d.sourceType !== undefined ? { sourceType: d.sourceType ?? null } : {}),
    ...(d.sourceId !== undefined ? { sourceId: d.sourceId ?? null } : {}),
    ...(d.sourceLabel !== undefined ? { sourceLabel: d.sourceLabel ?? null } : {}),
    ...(d.pinned !== undefined ? { pinned: d.pinned } : {}),
    // done 토글 시 doneAt 동기화 — 이미 완료 상태면 doneAt 유지(undefined)
    ...(d.done !== undefined
      ? { done: d.done, doneAt: d.done ? (before.done ? undefined : new Date()) : null }
      : {}),
  };

  const note = await prisma.note.update({
    where: { id },
    data: update,
    include: { createdBy: { select: { id: true, name: true } } },
  });

  await recordAudit(prisma, {
    userId: user.id,
    entity: "Note",
    entityId: id,
    action: "UPDATE",
    meta: { done: note.done },
  });

  return NextResponse.json(note);
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const [user, deny] = await guardUser();
  if (deny) return deny;
  const { id } = await params;

  const before = await prisma.note.findUnique({
    where: { id },
    select: { id: true, isActive: true },
  });
  if (!before || !before.isActive) {
    return NextResponse.json({ error: "찾을 수 없습니다" }, { status: 404 });
  }

  await prisma.note.update({ where: { id }, data: { isActive: false } });

  await recordAudit(prisma, {
    userId: user.id,
    entity: "Note",
    entityId: id,
    action: "DELETE",
    meta: { softDelete: true },
  });

  return NextResponse.json({ success: true });
}
