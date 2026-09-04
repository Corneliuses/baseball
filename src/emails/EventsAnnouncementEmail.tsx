import type { CSSProperties } from "react";
import { Section, Text } from "@react-email/components";

import { EMAIL_COLOR, EMAIL_FONT } from "./brand";
import {
  BananaButton,
  EmailHeading,
  EmailText,
  FactPanel,
  FactRow,
  LinkFallback,
  SectionLabel,
  SlotDot,
} from "./EmailKit";
import { EmailLayout } from "./EmailLayout";

/// The sibling of `EventAnnouncementEmail`, for the repeat-weekly batch (#70).
/// Two differences, both consequences of announcing N events rather than one:
/// the dates are a list, and the button is the schedule rather than an event
/// page — a batch has no single event to answer, and the schedule is where the
/// whole run is. Like the single version there is deliberately no RSVP state:
/// the events were created moments ago, so nobody has answered.
///
/// **Nothing about any other family**, for the same reason as its sibling.
///
/// The dates are a scorecard: a numbered dot per line, monospaced dates, a
/// dashed rule between them. That is the one piece of layout this email has
/// that the others do not, and it is the thing it exists to deliver — a season
/// as a list a parent can run a thumb down. Location and notes appear once
/// beneath, rather than per date: every occurrence in a batch carries the same
/// ones by construction (one form, filled in once), so repeating them would be
/// noise hiding the dates.

export type EventsAnnouncementEmailProps = {
  teamName: string;
  /// "8 games vs Hawks" / "8 practices" — from buildEventsAnnouncementEmail, so
  /// the subject line and this heading cannot drift apart.
  headline: string;
  /// Each occurrence as "Sat, Apr 4, 2026 at 5:30 PM", soonest first.
  dateTimeLabels: readonly string[];
  location: string | null;
  notes: string | null;
  scheduleUrl: string;
};

export function EventsAnnouncementEmail({
  teamName,
  headline,
  dateTimeLabels,
  location,
  notes,
  scheduleUrl,
}: EventsAnnouncementEmailProps) {
  return (
    <EmailLayout
      preview={`${dateTimeLabels[0] ?? ""}${location ? ` — ${location}` : ""}`}
      teamName={teamName}
      footnote={`You're getting this because your player is on ${teamName}'s roster.`}
    >
      <EmailHeading
        eyebrow="New on the schedule"
        title={headline}
        subtitle={teamName}
      />

      <SectionLabel>The run</SectionLabel>
      <Section style={{ margin: "0 0 20px" }}>
        {/* Rows of Text rather than a <ul>: mail clients disagree about list
            indentation far more than they do about paragraphs, and the dot
            carries the counting anyway. */}
        {dateTimeLabels.map((label, index) => (
          <Text
            key={label}
            style={{
              ...dateRowStyle,
              ...(index === dateTimeLabels.length - 1
                ? { borderBottom: "none" }
                : {}),
            }}
          >
            <SlotDot>{index + 1}</SlotDot>
            {label}
          </Text>
        ))}
      </Section>

      {location || notes ? (
        <FactPanel>
          {location ? <FactRow label="Where">{location}</FactRow> : null}
          {notes ? <FactRow label="Notes">{notes}</FactRow> : null}
        </FactPanel>
      ) : null}

      <EmailText>
        Answer them one at a time — the schedule has every date with its own
        buttons.
      </EmailText>

      <BananaButton href={scheduleUrl}>See the schedule</BananaButton>
      <LinkFallback href={scheduleUrl} />
    </EmailLayout>
  );
}

const dateRowStyle: CSSProperties = {
  fontFamily: EMAIL_FONT.mono,
  fontSize: "15px",
  lineHeight: "22px",
  color: EMAIL_COLOR.ink,
  borderBottom: `1px dashed ${EMAIL_COLOR.border}`,
  margin: 0,
  padding: "9px 2px",
};
