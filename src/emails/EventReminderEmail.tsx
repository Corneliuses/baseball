import type { CSSProperties } from "react";
import { Section, Text } from "@react-email/components";

import type { RsvpState } from "@/lib/rsvp";
import { EMAIL_COLOR, EMAIL_FONT, EMAIL_RSVP_COLOR } from "./brand";
import {
  BananaButton,
  EmailHeading,
  EmailText,
  FactPanel,
  FactRow,
  LinkFallback,
  SectionLabel,
} from "./EmailKit";
import { EmailLayout } from "./EmailLayout";
import { rsvpReminderLabel } from "./event-reminder-email";

/// The day-of reminder — read on a phone, one-handed, at breakfast. Time and
/// place go in the ticket stub so they survive being skimmed in two seconds,
/// and the eyebrow is the one in this directory set in seam red rather than
/// field green: **TODAY** is the entire claim, and it is competing with every
/// other email that morning.
///
/// Only the recipient's own kids appear. Contact details and other families'
/// attendance are staff-facing everywhere else in the app (`/directory` and the
/// roster entry page are both COACH+), and a reminder mailed to every household
/// is the last place to relax that.
///
/// Each kid's row keeps `rsvpReminderLabel`'s sentence and adds a coloured edge
/// in that state's colour (`EMAIL_RSVP_COLOR`, the same green / seam red /
/// muted the app uses). Colour is the second carrier, never the only one — the
/// sentence says it in words, which is what survives a colour-blind reader, a
/// plain-text client, and a screenshot forwarded to the other parent.

export type EventReminderEmailProps = {
  teamName: string;
  /// "Game vs Hawks" / "Practice" — from buildEventReminderEmail, so the
  /// subject line and this heading cannot drift apart.
  headline: string;
  timeLabel: string;
  location: string | null;
  notes: string | null;
  kids: { playerId: string; name: string; rsvp: RsvpState }[];
  eventUrl: string;
};

export function EventReminderEmail({
  teamName,
  headline,
  timeLabel,
  location,
  notes,
  kids,
  eventUrl,
}: EventReminderEmailProps) {
  const needsAnswer = kids.some((kid) => kid.rsvp === "no-response");

  return (
    <EmailLayout
      preview={`Today at ${timeLabel}${location ? ` — ${location}` : ""}`}
      teamName={teamName}
      footnote={`You're getting this because your player is on ${teamName}'s roster.`}
    >
      <EmailHeading
        eyebrow="Today"
        tone="stitch"
        title={headline}
        subtitle={teamName}
      />

      <FactPanel>
        <FactRow label="Time" mono>
          {timeLabel}
        </FactRow>
        {location ? <FactRow label="Where">{location}</FactRow> : null}
        {notes ? <FactRow label="Notes">{notes}</FactRow> : null}
      </FactPanel>

      <SectionLabel>{kids.length === 1 ? "Your player" : "Your players"}</SectionLabel>
      <Section style={{ margin: "0 0 20px" }}>
        {kids.map((kid) => (
          <Text
            key={kid.playerId}
            style={{
              ...kidRowStyle,
              borderLeft: `3px solid ${EMAIL_RSVP_COLOR[kid.rsvp]}`,
            }}
          >
            {rsvpReminderLabel(kid.name, kid.rsvp)}
          </Text>
        ))}
      </Section>

      <EmailText>
        {needsAnswer
          ? "Let your coach know if they can make it."
          : "Something changed? You can still update the answer."}
      </EmailText>

      <BananaButton href={eventUrl}>
        {needsAnswer ? "Answer now" : "Update your answer"}
      </BananaButton>
      <LinkFallback href={eventUrl} />
    </EmailLayout>
  );
}

const kidRowStyle: CSSProperties = {
  fontFamily: EMAIL_FONT.body,
  fontSize: "16px",
  lineHeight: "22px",
  fontWeight: 600,
  color: EMAIL_COLOR.ink,
  backgroundColor: EMAIL_COLOR.page,
  margin: "0 0 8px",
  padding: "10px 14px",
  borderRadius: "0 8px 8px 0",
};
