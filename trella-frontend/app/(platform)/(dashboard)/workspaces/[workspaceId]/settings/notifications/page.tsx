"use client";

import { useParams } from "next/navigation";

import { SettingsContainer, SettingsCard, FieldRow, Toggle } from "../_components/settings-ui";
import { useLocalPrefs } from "../_components/use-local-prefs";

const DEFAULTS = {
  emailAssigned: true,
  emailMentions: true,
  emailComments: true,
  emailStatusChange: false,
  emailDigest: true,
  inappAssigned: true,
  inappMentions: true,
  inappComments: true,
  inappDueSoon: true,
};

export default function NotificationSettingsPage() {
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const [prefs, update, loaded] = useLocalPrefs(`trella:prefs:notifications:${workspaceId}`, DEFAULTS);

  const on = (k: keyof typeof DEFAULTS) => (loaded ? prefs[k] : DEFAULTS[k]);

  return (
    <SettingsContainer
      breadcrumb={[{ label: "Personal settings" }, { label: "Notification settings" }]}
      title="Notification settings"
      description="Choose which email and in-app notifications you receive. Changes apply to your account only."
    >
      <SettingsCard title="Email notifications" description="Sent to your account email address.">
        <FieldRow
          label="Work item assigned to me"
          hint="When someone assigns you a task or card."
          control={<Toggle checked={on("emailAssigned")} onChange={(v) => update({ emailAssigned: v })} />}
        />
        <FieldRow
          label="Mentions"
          hint="When someone @mentions you in a comment or description."
          control={<Toggle checked={on("emailMentions")} onChange={(v) => update({ emailMentions: v })} />}
        />
        <FieldRow
          label="Comments on my items"
          control={<Toggle checked={on("emailComments")} onChange={(v) => update({ emailComments: v })} />}
        />
        <FieldRow
          label="Status changes"
          hint="When a work item you follow moves to a new status."
          control={<Toggle checked={on("emailStatusChange")} onChange={(v) => update({ emailStatusChange: v })} />}
        />
        <FieldRow
          label="Weekly digest"
          hint="A summary of your open work items every Monday."
          control={<Toggle checked={on("emailDigest")} onChange={(v) => update({ emailDigest: v })} />}
          last
        />
      </SettingsCard>

      <SettingsCard title="In-app notifications" description="Shown in the notification bell inside Trella.">
        <FieldRow
          label="Work item assigned to me"
          control={<Toggle checked={on("inappAssigned")} onChange={(v) => update({ inappAssigned: v })} />}
        />
        <FieldRow
          label="Mentions"
          control={<Toggle checked={on("inappMentions")} onChange={(v) => update({ inappMentions: v })} />}
        />
        <FieldRow
          label="Comments on my items"
          control={<Toggle checked={on("inappComments")} onChange={(v) => update({ inappComments: v })} />}
        />
        <FieldRow
          label="Due soon reminders"
          hint="A heads-up when a work item is approaching its due date."
          control={<Toggle checked={on("inappDueSoon")} onChange={(v) => update({ inappDueSoon: v })} />}
          last
        />
      </SettingsCard>
    </SettingsContainer>
  );
}
