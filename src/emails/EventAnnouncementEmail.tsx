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

/// Plain like InvitationEmail, TeamMessageEmail and EventReminderEmail — no
/// images, no layout cleverness. This is read on a phone, one-handed, and the
/// date and place have to survive being skimmed in two seconds.
///
/// **Nothing about any other family.** No roster, no attendance, no contact
/// details. Contact details are staff-facing everywhere else in the app
/// (`/directory` and the roster entry page are both COACH+), and an email
/// mailed to every household is the last place to relax that.
///
/// There is deliberately no RSVP section, which is the whole reason this is not
/// a variant of EventReminderEmail: the event was created moments ago, so
/// nobody has answered and there is no state to report. The single call to
/// action is the link.

export type EventAnnouncementEmailProps = {
  teamName: string;
  /// "Game vs Hawks" / "Practice" — from buildEventAnnouncementEmail, so the
  /// subject line and this heading cannot drift apart.
  headline: string;
  dateTimeLabel: string;
  location: string | null;
  notes: string | null;
  eventUrl: string;
};

export function EventAnnouncementEmail({
  teamName,
  headline,
  dateTimeLabel,
  location,
  notes,
  eventUrl,
}: EventAnnouncementEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>{`${dateTimeLabel}${location ? ` — ${location}` : ""}`}</Preview>
      <Body style={{ fontFamily: "sans-serif", padding: "24px" }}>
        <Container>
          <Text style={{ fontSize: "18px", fontWeight: "bold" }}>
            New on the schedule: {headline}
          </Text>
          <Text>
            {teamName} — {dateTimeLabel}
          </Text>

          {location ? <Text>Where: {location}</Text> : null}
          {notes ? (
            <Text style={{ whiteSpace: "pre-wrap" }}>Notes: {notes}</Text>
          ) : null}

          <Hr />

          <Text>
            Let your coach know if your player can make it:{" "}
            <Link href={eventUrl}>{eventUrl}</Link>
          </Text>
        </Container>
      </Body>
    </Html>
  );
}
