import { describe, expect, it } from "vitest";
import fc from "fast-check";

import { queryKeys } from "@/lib/query-keys";

describe("queryKeys", () => {
  it("produces scope-prefixed keys for each resource family", () => {
    expect(queryKeys.customStatuses("w1")).toEqual(["custom-statuses", "w1"]);
    expect(queryKeys.projectMembers("p1")).toEqual(["project-members", "p1"]);
    expect(queryKeys.taskComments("t1")).toEqual(["task-comments", "t1"]);
    expect(queryKeys.taskActivity("t1")).toEqual(["task-activity", "t1"]);
    expect(queryKeys.taskAttachments("t1")).toEqual(["task-attachments", "t1"]);
    expect(queryKeys.task("t1")).toEqual(["task", "t1"]);
    expect(queryKeys.boardTasks("b1")).toEqual(["board-tasks", "b1"]);
    expect(queryKeys.notifications()).toEqual(["notifications"]);
    expect(queryKeys.notificationsUnreadCount()).toEqual([
      "notifications",
      "unread-count",
    ]);
  });

  it("the task key prefix does not collide with the task sub-resource keys", () => {
    // TanStack invalidation matches by array prefix. Invalidating ["task"] must
    // NOT reach ["task-comments", ...] / ["task-activity", ...] etc., otherwise
    // a status change would needlessly refetch every modal tab.
    const [taskHead] = queryKeys.task("t1");
    expect(taskHead).toBe("task");
    expect(queryKeys.taskComments("t1")[0]).not.toBe(taskHead);
    expect(queryKeys.taskActivity("t1")[0]).not.toBe(taskHead);
    expect(queryKeys.taskAttachments("t1")[0]).not.toBe(taskHead);
  });

  it("is deterministic and structurally equal for equal ids (property)", () => {
    fc.assert(
      fc.property(fc.string(), (id) => {
        expect(queryKeys.customStatuses(id)).toEqual(
          queryKeys.customStatuses(id),
        );
        expect(queryKeys.task(id)).toEqual(queryKeys.task(id));
        expect(queryKeys.boardTasks(id)).toEqual(queryKeys.boardTasks(id));
      }),
    );
  });

  it("encodes the id verbatim as the second element (property)", () => {
    fc.assert(
      fc.property(fc.string(), (id) => {
        expect(queryKeys.taskComments(id)[1]).toBe(id);
        expect(queryKeys.projectMembers(id)[1]).toBe(id);
      }),
    );
  });
});
