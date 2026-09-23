"use client";

import React from "react";
import { useParams } from "next/navigation";
import { useTheme } from "next-themes";

import { SettingsContainer, SettingsCard, FieldRow, SelectField } from "../_components/settings-ui";
import { useLocalPrefs } from "../_components/use-local-prefs";

const LANGUAGES = [
  { value: "en", label: "English (US)" },
  { value: "vi", label: "Tiếng Việt" },
  { value: "ja", label: "日本語" },
  { value: "fr", label: "Français" },
];

const DATE_FORMATS = [
  { value: "DMY", label: "31/12/2026 (DD/MM/YYYY)" },
  { value: "MDY", label: "12/31/2026 (MM/DD/YYYY)" },
  { value: "YMD", label: "2026-12-31 (YYYY-MM-DD)" },
];

const WEEK_START = [
  { value: "mon", label: "Monday" },
  { value: "sun", label: "Sunday" },
  { value: "sat", label: "Saturday" },
];

const THEMES = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "Match system" },
];

// Common IANA zones — enough to cover most users without a full tz database.
const TIMEZONES = [
  "Asia/Ho_Chi_Minh",
  "Asia/Tokyo",
  "Asia/Singapore",
  "Asia/Kolkata",
  "Europe/London",
  "Europe/Paris",
  "America/New_York",
  "America/Los_Angeles",
  "UTC",
].map((z) => ({ value: z, label: z.replace(/_/g, " ") }));

const DEFAULTS = {
  language: "en",
  timezone: typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : "UTC",
  dateFormat: "DMY",
  weekStart: "mon",
};

export default function GeneralSettingsPage() {
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);

  const [prefs, update, loaded] = useLocalPrefs(`trella:prefs:general:${workspaceId}`, DEFAULTS);

  return (
    <SettingsContainer
      breadcrumb={[{ label: "Personal settings" }, { label: "General settings" }]}
      title="General settings"
      description="Manage your language, time zone, and other personal preferences. These apply to your account on this device."
    >
      <SettingsCard title="Language & region" description="How dates, times, and text are displayed for you.">
        <FieldRow
          label="Language"
          hint="The display language for the interface."
          control={
            <SelectField
              value={loaded ? prefs.language : DEFAULTS.language}
              onChange={(v) => update({ language: v })}
              options={LANGUAGES}
            />
          }
        />
        <FieldRow
          label="Time zone"
          hint="Used for due dates, activity timestamps, and reminders."
          control={
            <SelectField
              value={loaded ? prefs.timezone : DEFAULTS.timezone}
              onChange={(v) => update({ timezone: v })}
              options={TIMEZONES}
              width={240}
            />
          }
        />
        <FieldRow
          label="Date format"
          control={
            <SelectField
              value={loaded ? prefs.dateFormat : DEFAULTS.dateFormat}
              onChange={(v) => update({ dateFormat: v })}
              options={DATE_FORMATS}
              width={240}
            />
          }
        />
        <FieldRow
          label="Start of week"
          hint="The first day shown in calendars and timelines."
          control={
            <SelectField
              value={loaded ? prefs.weekStart : DEFAULTS.weekStart}
              onChange={(v) => update({ weekStart: v })}
              options={WEEK_START}
            />
          }
          last
        />
      </SettingsCard>

      <SettingsCard title="Appearance" description="Choose how Trella looks to you.">
        <FieldRow
          label="Theme"
          hint="Switch between light, dark, or follow your operating system."
          control={
            <SelectField
              value={mounted ? theme ?? "system" : "system"}
              onChange={(v) => setTheme(v)}
              options={THEMES}
            />
          }
          last
        />
      </SettingsCard>
    </SettingsContainer>
  );
}
