"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { DataTableToolbar } from "@/components/data-table/data-table-toolbar";
import { ScrollArea } from "@/components/ui/scroll-area";

interface SalesChannel {
  id: string;
  name: string;
  code: string;
  commissionRate: string;
  isActive: boolean;
  memo: string | null;
}

export default function ChannelsPage() {
  const [channels, setChannels] = useState<SalesChannel[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingChannel, setEditingChannel] = useState<SalesChannel | null>(
    null
  );
  const [form, setForm] = useState({
    name: "",
    code: "",
    commissionRate: "0",
    memo: "",
  });

  const fetchChannels = async () => {
    const res = await fetch("/api/channels");
    const data = await res.json();
    setChannels(data);
    setLoading(false);
  };

  useEffect(() => {
    fetchChannels();
  }, []);

  const resetForm = () => {
    setForm({ name: "", code: "", commissionRate: "0", memo: "" });
    setEditingChannel(null);
  };

  const openEditDialog = (channel: SalesChannel) => {
    setEditingChannel(channel);
    setForm({
      name: channel.name,
      code: channel.code,
      commissionRate: (parseFloat(channel.commissionRate) * 100).toString(),
      memo: channel.memo || "",
    });
    setDialogOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const url = editingChannel
      ? `/api/channels/${editingChannel.id}`
      : "/api/channels";
    const method = editingChannel ? "PUT" : "POST";

    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });

    if (!res.ok) {
      toast.error("저장에 실패했습니다");
      return;
    }

    toast.success(editingChannel ? "채널이 수정되었습니다" : "채널이 추가되었습니다");
    setDialogOpen(false);
    resetForm();
    fetchChannels();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("정말 삭제하시겠습니까?")) return;

    const res = await fetch(`/api/channels/${id}`, { method: "DELETE" });
    if (!res.ok) {
      toast.error("삭제에 실패했습니다");
      return;
    }

    toast.success("채널이 삭제되었습니다");
    fetchChannels();
  };

  return (
    <>
      <div className="flex h-full flex-col">
        <DataTableToolbar
          onRefresh={fetchChannels}
          onAdd={() => setDialogOpen(true)}
          addLabel="채널 추가"
          loading={loading}
        />
        <ScrollArea className="flex-1 min-h-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>채널명</TableHead>
                <TableHead>코드</TableHead>
                <TableHead>수수료율</TableHead>
                <TableHead>상태</TableHead>
                <TableHead>메모</TableHead>
                <TableHead className="w-[100px]">관리</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8">
                    로딩 중...
                  </TableCell>
                </TableRow>
              ) : channels.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8">
                    등록된 채널이 없습니다
                  </TableCell>
                </TableRow>
              ) : (
                channels.map((channel) => (
                  <TableRow key={channel.id}>
                    <TableCell className="font-medium">{channel.name}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{channel.code}</Badge>
                    </TableCell>
                    <TableCell>
                      {(parseFloat(channel.commissionRate) * 100).toFixed(2)}%
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={channel.isActive ? "default" : "secondary"}
                      >
                        {channel.isActive ? "활성" : "비활성"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {channel.memo || "-"}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openEditDialog(channel)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDelete(channel.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </ScrollArea>
      </div>

      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) resetForm();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingChannel ? "채널 수정" : "새 채널 추가"}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">채널명</Label>
              <Input
                id="name"
                value={form.name}
                onChange={(e) =>
                  setForm({ ...form, name: e.target.value })
                }
                placeholder="예: 쿠팡"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="code">채널 코드</Label>
              <Input
                id="code"
                value={form.code}
                onChange={(e) =>
                  setForm({ ...form, code: e.target.value.toUpperCase() })
                }
                placeholder="예: COUPANG"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="commissionRate">수수료율 (%)</Label>
              <Input
                id="commissionRate"
                type="number"
                step="0.01"
                value={form.commissionRate}
                onChange={(e) =>
                  setForm({ ...form, commissionRate: e.target.value })
                }
                placeholder="예: 10.8"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="memo">메모</Label>
              <Textarea
                id="memo"
                value={form.memo}
                onChange={(e) =>
                  setForm({ ...form, memo: e.target.value })
                }
              />
            </div>
            <DialogFooter>
              <Button type="submit">
                {editingChannel ? "수정" : "추가"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
