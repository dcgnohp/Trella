"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, Trash2 } from "lucide-react";

import { OrganizationsService, type OrganizationPublic } from "@/lib/client";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";

const SettingsPage = () => {
  const params = useParams();
  const router = useRouter();
  const organizationId = params.organizationId as string;

  const [organization, setOrganization] = useState<OrganizationPublic | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [confirmName, setConfirmName] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  useEffect(() => {
    let active = true;
    fetch("/api/org", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : { organizations: [] }))
      .then((data: { organizations?: OrganizationPublic[] }) => {
        if (!active) return;
        const found =
          data.organizations?.find((org) => org.id === organizationId) ?? null;
        setOrganization(found);
      })
      .catch(() => {
        if (active) setOrganization(null);
      })
      .finally(() => {
        if (active) setIsLoaded(true);
      });
    return () => {
      active = false;
    };
  }, [organizationId]);

  const handleDelete = async () => {
    if (!organization) return;
    setIsDeleting(true);
    try {
      await OrganizationsService.Organizations_organizationsDeleteOrganization({
        orgId: organizationId,
      });
      toast.success("Workspace deleted successfully");
      setIsDialogOpen(false);
      
      // Force reload the list of organizations
      router.push("/select-org");
      router.refresh();
    } catch (error: any) {
      toast.error(error?.message || "Failed to delete workspace. Only the workspace owner can delete it.");
    } finally {
      setIsDeleting(false);
    }
  };

  if (!isLoaded) {
    return (
      <div className="w-full space-y-4">
        <Skeleton className="h-10 w-[200px]" />
        <Separator />
        <Skeleton className="h-[200px] w-full" />
      </div>
    );
  }

  if (!organization) {
    return (
      <div className="w-full text-center py-10 text-muted-foreground">
        Workspace not found.
      </div>
    );
  }

  const isConfirmDisabled = confirmName !== organization.name || isDeleting;

  return (
    <div className="w-full space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Workspace Settings</h1>
        <p className="text-muted-foreground">Manage your workspace settings and preferences.</p>
      </div>
      <Separator />

      <Card>
        <CardHeader>
          <CardTitle>Workspace Information</CardTitle>
          <CardDescription>Details about your current workspace.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-3 gap-1">
            <span className="font-semibold text-sm text-muted-foreground">Name</span>
            <span className="col-span-2 text-sm font-medium">{organization.name}</span>
          </div>
          <div className="grid grid-cols-3 gap-1">
            <span className="font-semibold text-sm text-muted-foreground">ID</span>
            <span className="col-span-2 text-sm font-mono text-xs">{organization.id}</span>
          </div>
          <div className="grid grid-cols-3 gap-1">
            <span className="font-semibold text-sm text-muted-foreground">Created At</span>
            <span className="col-span-2 text-sm">
              {new Date(organization.createdAt).toLocaleDateString()}
            </span>
          </div>
        </CardContent>
      </Card>

      <Card className="border-destructive/50 bg-destructive/5">
        <CardHeader>
          <CardTitle className="text-destructive flex items-center gap-x-2">
            <AlertTriangle className="h-5 w-5" /> Danger Zone
          </CardTitle>
          <CardDescription>
            Irreversible and destructive actions for this workspace.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-foreground">Delete this workspace</p>
              <p className="text-xs text-muted-foreground max-w-md">
                Once deleted, all boards, tasks, comments, and members in this workspace will be permanently removed. This action cannot be undone.
              </p>
            </div>
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="destructive" className="flex items-center gap-x-2">
                  <Trash2 className="h-4 w-4" /> Delete Workspace
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle className="text-destructive flex items-center gap-x-2">
                    Delete Workspace &quot;{organization.name}&quot;?
                  </DialogTitle>
                  <DialogDescription>
                    This will permanently delete the workspace and all its data.
                    Please type <strong className="text-foreground font-mono select-none">{organization.name}</strong> to confirm.
                  </DialogDescription>
                </DialogHeader>
                <div className="py-2">
                  <Input
                    placeholder="Enter workspace name"
                    value={confirmName}
                    onChange={(e) => setConfirmName(e.target.value)}
                    className="font-medium"
                  />
                </div>
                <DialogFooter>
                  <Button variant="ghost" onClick={() => setIsDialogOpen(false)} disabled={isDeleting}>
                    Cancel
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={handleDelete}
                    disabled={isConfirmDisabled}
                    className="flex items-center gap-x-2"
                  >
                    {isDeleting ? "Deleting..." : "Permanently Delete"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default SettingsPage;
