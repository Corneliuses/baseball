import {
  Body,
  Container,
  Head,
  Hr,
  Html,
  Link,
  Preview,
  Text,
} from "@react-email/components";

import type { RsvpState } from "@/lib/rsvp";
import { rsvpReminderLabel } from "./event-reminder-email";

/// Plain like InvitationEmail and TeamMessageEmail — no images, no layout
/// cleverness. This is read on a phone, one-handed, at breakfast: the time and
/// place have to survive being skimmed in two seconds.
///
/// Only the recipient's own kids appear. Contact details and other families'
/// attendance are staff-facing everywhere else in the app (`/directory` and
/// the roster entry page are both COACH+), and a reminder mailed to every
/// household is the last place to relax that.

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
    <Html>
      <Head />
      <Preview>{`Today at ${timeLabel}${location ? ` — ${location}` : ""}`}</Preview>
      <Body style={{ fontFamily: "sans-serif", padding: "24px" }}>
        <Container>
          <Text style={{ fontSize: "18px", fontWeight: "bold" }}>
            Today: {headline}
          </Text>
          <Text>
            {teamName} — {timeLabel}
          </Text>

          {location ? <Text>Where: {location}</Text> : null}
          {notes ? (
            <Text style={{ whiteSpace: "pre-wrap" }}>Notes: {notes}</Text>
          ) : null}

          <Hr />

          {kids.map((kid) => (
            <Text key={kid.playerId}>{rsvpReminderLabel(kid.name, kid.rsvp)}</Text>
          ))}

          <Text>
            {needsAnswer
              ? "Let your coach know if they can make it:"
              : "Need to change an answer?"}{" "}
            <Link href={eventUrl}>{eventUrl}</Link>
          </Text>
        </Container>
      </Body>
    </Html>
  );
}
