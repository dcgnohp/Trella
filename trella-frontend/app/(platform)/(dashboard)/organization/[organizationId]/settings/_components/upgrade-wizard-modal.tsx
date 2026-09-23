"use client";

import { useState } from "react";
import { toast } from "sonner";
import { ArrowRight, CheckCircle2, Kanban, Zap, AlertTriangle, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";

import { WorkspacesService, type OrganizationPublic } from "@/lib/client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface UpgradeWizardModalProps {
  isOpen: boolean;
  onClose: () => void;
  workspaceId: string;
  workspaceName: string;
  onUpgradeSuccess: (org: OrganizationPublic) => void;
}

export const UpgradeWizardModal = ({
  isOpen,
  onClose,
  workspaceId,
  workspaceName,
  onUpgradeSuccess,
}: UpgradeWizardModalProps) => {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [isUpgrading, setIsUpgrading] = useState(false);

  const handleUpgrade = async () => {
    setIsUpgrading(true);
    try {
      const updatedOrg = await WorkspacesService.Workspaces_workspacesSwitchWorkspaceMode({
        workspaceId,
        requestBody: {
          mode: "SCRUM",
        },
      });
      
      toast.success("Nâng cấp lên Jira Mode thành công!");
      onUpgradeSuccess(updatedOrg);
      setStep(4); // Success step
      router.refresh();
    } catch (error: any) {
      toast.error(error?.message || "Lỗi khi nâng cấp workspace.");
    } finally {
      setIsUpgrading(false);
    }
  };

  const handleClose = () => {
    setStep(1);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="max-w-lg">
        {step === 1 && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-x-2 text-xl font-bold">
                <Zap className="h-6 w-6 text-blue-600 animate-pulse" />
                Nâng cấp Workspace lên Jira (Scrum)
              </DialogTitle>
              <DialogDescription className="text-sm">
                Chào mừng bạn đến với quy trình nâng cấp chuẩn Agile. Chúng tôi sẽ nâng cấp không gian làm việc của bạn lên Jira.
              </DialogDescription>
            </DialogHeader>

            <div className="py-6 space-y-4">
              <div className="flex gap-x-3 items-start p-3 bg-blue-50/50 dark:bg-blue-950/20 border border-blue-100 dark:border-blue-900 rounded-lg">
                <Kanban className="h-5 w-5 text-blue-600 mt-0.5" />
                <div>
                  <h4 className="font-semibold text-sm">Chế độ Jira (Scrum Mode) là gì?</h4>
                  <p className="text-xs text-muted-foreground mt-1">
                    Cho phép chia nhỏ dự án thành các Sprints, quản lý danh sách Backlog chưa hoàn thành, quản lý Epics, ước lượng Story Points và kích hoạt Workflow Engine để kiểm soát chặt chẽ trạng thái nhiệm vụ.
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <h5 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Các thay đổi sẽ diễn ra:</h5>
                <ul className="text-xs space-y-1.5 text-foreground list-disc pl-4">
                  <li>Tự động tạo quy trình Workflow chuẩn Agile (Backlog &rarr; Dev &rarr; In Progress &rarr; Done).</li>
                  <li>Tạo một Sprint lập kế hoạch mặc định: <strong>Sprint 1</strong>.</li>
                  <li>Di chuyển toàn bộ các nhiệm vụ (Tasks) hiện có vào <strong>Backlog</strong> để sẵn sàng lên kế hoạch.</li>
                </ul>
              </div>
            </div>

            <DialogFooter>
              <Button variant="ghost" onClick={handleClose}>Hủy</Button>
              <Button onClick={() => setStep(2)} className="bg-blue-600 hover:bg-blue-700 text-white gap-x-1.5">
                Tiếp tục <ArrowRight className="h-4 w-4" />
              </Button>
            </DialogFooter>
          </>
        )}

        {step === 2 && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-x-2 text-xl font-bold">
                <Zap className="h-6 w-6 text-blue-600" />
                Bản đồ Trạng thái (Workflow Mapping)
              </DialogTitle>
              <DialogDescription className="text-sm">
                Quy trình làm việc chuẩn Scrum sẽ thay thế trạng thái tự do của Trello.
              </DialogDescription>
            </DialogHeader>

            <div className="py-6 space-y-4">
              <p className="text-xs text-muted-foreground">
                Sau khi nâng cấp, các cột trên bảng của bạn sẽ được ánh xạ tự động vào Workflow mặc định như sau:
              </p>

              <div className="grid grid-cols-5 gap-2 text-center text-xs">
                {[
                  { label: "Backlog", bg: "bg-gray-100 dark:bg-gray-800" },
                  { label: "Dev Selected", bg: "bg-blue-100 dark:bg-blue-900/40" },
                  { label: "In Progress", bg: "bg-indigo-100 dark:bg-indigo-900/40" },
                  { label: "Code Review", bg: "bg-purple-100 dark:bg-purple-900/40" },
                  { label: "Done", bg: "bg-green-100 dark:bg-green-900/40" },
                ].map((col) => (
                  <div key={col.label} className={`p-2 rounded border border-dashed border-muted ${col.bg} font-medium`}>
                    {col.label}
                  </div>
                ))}
              </div>

              <div className="p-3 bg-amber-50/50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900 rounded-lg flex gap-x-3 items-start">
                <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5 flex-shrink-0" />
                <div>
                  <h4 className="font-semibold text-xs text-amber-800 dark:text-amber-400">Ràng buộc chuyển đổi trạng thái</h4>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Hệ thống sẽ áp dụng Workflow Engine. Ví dụ: Nhiệm vụ không thể kéo thả trực tiếp từ <strong>Backlog</strong> sang <strong>Done</strong> mà phải đi qua các trạng thái trung gian, và khi chuyển sang Done bắt buộc phải viết bình luận giải trình.
                  </p>
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button variant="ghost" onClick={() => setStep(1)}>Quay lại</Button>
              <Button onClick={() => setStep(3)} className="bg-blue-600 hover:bg-blue-700 text-white gap-x-1.5">
                Tiếp tục <ArrowRight className="h-4 w-4" />
              </Button>
            </DialogFooter>
          </>
        )}

        {step === 3 && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-x-2 text-xl font-bold text-destructive">
                <AlertTriangle className="h-6 w-6 text-destructive" />
                Xác nhận nâng cấp một chiều
              </DialogTitle>
              <DialogDescription className="text-sm">
                Vui lòng xác nhận trước khi hệ thống bắt đầu di chuyển dữ liệu.
              </DialogDescription>
            </DialogHeader>

            <div className="py-6 space-y-4">
              <div className="p-4 bg-destructive/5 rounded-lg border border-destructive/20 text-xs space-y-3">
                <p className="font-semibold text-destructive">
                  CẢNH BÁO: Đây là hành động không thể hoàn tác!
                </p>
                <p className="text-muted-foreground leading-relaxed">
                  Sau khi workspace <strong>{workspaceName}</strong> chuyển sang chế độ Scrum, bạn sẽ không thể chuyển ngược lại chế độ Trello tự do.
                  Toàn bộ bảng Kanban sẽ chuyển đổi giao diện sang dạng Agile Sprint & Backlog.
                </p>
              </div>

              <div className="flex items-center gap-x-2 text-xs text-muted-foreground">
                <ShieldCheck className="h-4 w-4 text-green-600" />
                <span>Quyền quản trị viên (Owner) của bạn đã được xác minh.</span>
              </div>
            </div>

            <DialogFooter>
              <Button variant="ghost" onClick={() => setStep(2)} disabled={isUpgrading}>Quay lại</Button>
              <Button
                variant="destructive"
                onClick={handleUpgrade}
                disabled={isUpgrading}
              >
                {isUpgrading ? "Đang nâng cấp..." : "Xác nhận & Nâng cấp ngay"}
              </Button>
            </DialogFooter>
          </>
        )}

        {step === 4 && (
          <>
            <DialogHeader className="text-center py-6">
              <div className="flex justify-center mb-4">
                <CheckCircle2 className="h-16 w-16 text-green-600 animate-bounce" />
              </div>
              <DialogTitle className="text-2xl font-bold text-green-600">
                Nâng cấp thành công!
              </DialogTitle>
              <DialogDescription className="text-sm mt-2">
                Workspace <strong>{workspaceName}</strong> đã được nâng cấp lên Jira (Scrum Mode) thành công.
              </DialogDescription>
            </DialogHeader>

            <div className="py-2 text-center text-xs text-muted-foreground">
              Quy trình làm việc Agile đã được kích hoạt. Hãy chuyển sang bảng Board của bạn để lập kế hoạch cho Sprint 1.
            </div>

            <DialogFooter className="sm:justify-center">
              <Button
                onClick={() => {
                  handleClose();
                  router.push(`/workspaces/${workspaceId}/summary`);
                }}
                className="bg-green-600 hover:bg-green-700 text-white w-full sm:w-auto"
              >
                Đi tới Workspace Summary
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};
