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

/// Plain like every other email in this directory — no images, no layout
/// cleverness. This is read on a phone, one-handed, and the dates have to
/// survive being skimmed in two seconds.
///
/// **Nothing about any other family.** No roster, no attendance, no contact
/// details. Contact details are staff-facing everywhere else in the app
/// (`/directory` and the roster entry page are both COACH+), and an email
/// mailed to every household is the last place to relax that.
///
/// The sibling of `EventAnnouncementEmail`, for the repeat-weekly batch (#70).
/// Two differences, both consequences of announcing N events rather than one:
/// the dates are a list, and the link is the schedule rather than an event
/// page — a batch has no single event to answer, and the schedule is where the
/// whole run is. Like the single version there is deliberately no RSVP section:
/// the events were created moments ago, so nobody has answered and there is no
/// state to report.
///
/// Location and notes appear once rather than per date. Every occurrence in a
/// batch carries the same ones by construction — one form filled in once — so
/// repeating them down the list would be noise that hides the dates.

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
    <Html>
      <Head />
      <Preview>
        {`${dateTimeLabels[0] ?? ""}${location ? ` — ${location}` : ""}`}
      </Preview>
      <Body style={{ fontFamily: "sans-serif", padding: "24px" }}>
        <Container>
          <Text style={{ fontSize: "18px", fontWeight: "bold" }}>
            New on the schedule: {headline}
          </Text>
          <Text>{teamName}</Text>

          {/* A list of Text rows rather than a <ul>: the other five emails in
              this directory are Text-only, and mail clients disagree about
              list indentation far more than they do about paragraphs. */}
          {dateTimeLabels.map((label) => (
            <Text key={label} style={{ margin: "4px 0" }}>
              {label}
            </Text>
          ))}

          {location ? <Text>Where: {location}</Text> : null}
          {notes ? (
            <Text style={{ whiteSpace: "pre-wrap" }}>Notes: {notes}</Text>
          ) : null}

          <Hr />

          <Text>
            Let your coach know which ones your player can make:{" "}
            <Link href={scheduleUrl}>{scheduleUrl}</Link>
          </Text>
        </Container>
      </Body>
    </Html>
  );
}
