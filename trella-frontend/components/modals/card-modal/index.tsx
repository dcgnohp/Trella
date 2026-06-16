"use client";

import { useEffect, useState } from "react";

import { AuditLogsService, type AuditLogPublic } from "@/lib/client";
import { useCardModal } from "@/hooks/use-card-modal";
import { Dialog, DialogContent } from "@/components/ui/dialog";

import { Header } from "./header";
import { Description } from "./description";
import { Actions } from "./actions";
import { Activity } from "./activity";

/**
 * Per-card detail dialog (Req 16.3).
 *
 * Refactored away from the deleted `/api/cards/[cardId]` and
 * `/api/cards/[cardId]/logs` route handlers: the card data now arrives via
 * the `useCardModal` zustand store (the parent board page already has every
 * card on the board through `BoardsService.Boards_boardsGetBoard`), and the
 * activity tab calls `AuditLogsService.AuditLogs_auditLogsListCardAuditLogs`
 * on the generated client directly. No `react-query`, no `fetcher` helper.
 *
 * `Header` / `Description` invoke `onUpdated()` on a successful update so we
 * can refresh the audit log list (the backend writes a new UPDATE row in the
 * same transaction).
 */
export const CardModal = () => {
  const card = useCardModal((state) => state.card);
  const isOpen = useCardModal((state) => state.isOpen);
  const onClose = useCardModal((state) => state.onClose);

  const [auditLogs, setAuditLogs] = useState<AuditLogPublic[] | undefined>(
    undefined,
  );
  const [refetchKey, setRefetchKey] = useState(0);

  const refreshAuditLogs = () => setRefetchKey((k) => k + 1);

  useEffect(() => {
    if (!card?.id) {
      setAuditLogs(undefined);
      return;
    }

    let cancelled = false;
    setAuditLogs(undefined);
    AuditLogsService.AuditLogs_auditLogsListCardAuditLogs({ cardId: card.id })
      .then((logs) => {
        if (!cancelled) setAuditLogs(logs);
      })
      .catch(() => {
        if (!cancelled) setAuditLogs([]);
      });

    return () => {
      cancelled = true;
    };
  }, [card?.id, refetchKey]);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent>
        {!card ? (
          <Header.Skeleton />
        ) : (
          <Header data={card} onUpdated={refreshAuditLogs} />
        )}
        <div className="grid grid-cols-1 md:grid-cols-4 md:gap-4">
          <div className="col-span-3">
            <div className="w-full space-y-6">
              {!card ? (
                <Description.Skeleton />
              ) : (
                <Description data={card} onUpdated={refreshAuditLogs} />
              )}
              {!auditLogs ? (
                <Activity.Skeleton />
              ) : (
                <Activity items={auditLogs} />
              )}
            </div>
          </div>
          {!card ? <Actions.Skeleton /> : <Actions data={card} />}
        </div>
      </DialogContent>
    </Dialog>
  );
};
