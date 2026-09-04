import {
  BananaButton,
  EmailHeading,
  EmailText,
  FactPanel,
  FactRow,
  LinkFallback,
} from "./EmailKit";
import { EmailLayout } from "./EmailLayout";

/// "A new game is on the schedule." Read on a phone, one-handed, so the date
/// and place sit in a ticket stub (`FactPanel`) where they survive being
/// skimmed in two seconds — the layout equivalent of what these lines were
/// already trying to do as bare paragraphs.
///
/// **Nothing about any other family.** No roster, no attendance, no contact
/// details. Contact details are staff-facing everywhere else in the app
/// (`/directory` and the roster entry page are both COACH+), and an email
/// mailed to every household is the last place to relax that.
///
/// There is deliberately no RSVP *state* section, which is the whole reason
/// this is not a variant of EventReminderEmail: the event was created moments
/// ago, so nobody has answered and there is no state to report. The single call
/// to action is the button, and it is this email's banana.

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
    <EmailLayout
      preview={`${dateTimeLabel}${location ? ` — ${location}` : ""}`}
      teamName={teamName}
      footnote={`You're getting this because your player is on ${teamName}'s roster.`}
    >
      <EmailHeading
        eyebrow="New on the schedule"
        title={headline}
        subtitle={teamName}
      />

      <FactPanel>
        <FactRow label="When" mono>
          {dateTimeLabel}
        </FactRow>
        {location ? <FactRow label="Where">{location}</FactRow> : null}
        {notes ? <FactRow label="Notes">{notes}</FactRow> : null}
      </FactPanel>

      <EmailText>Can your player make it? One tap either way.</EmailText>

      <BananaButton href={eventUrl}>Let your coach know</BananaButton>
      <LinkFallback href={eventUrl} />
    </EmailLayout>
  );
}
