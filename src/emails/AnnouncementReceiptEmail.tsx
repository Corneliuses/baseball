import {
  Body,
  Container,
  Head,
  Html,
  Link,
  Preview,
  Text,
} from "@react-email/components";

/// The coach's copy of what happened when their event was announced (#45).
/// Plain like every other template here — it is a receipt, read once, usually
/// on a phone, and most of the time deleted.
///
/// Addressed to one person about their own action, so it carries **no**
/// `List-Unsubscribe`: RFC 2369's header describes a list the recipient belongs
/// to, and this is the app answering a question the coach just asked. It names
/// no family and no address either — a coach chasing a bounce looks the parent
/// up in the roster, and a summary that quoted addresses would put contact
/// details in a mailbox for no reason.

export type AnnouncementReceiptEmailProps = {
  summary: string;
  needsAttention: boolean;
  scheduleUrl: string;
};

export function AnnouncementReceiptEmail({
  summary,
  needsAttention,
  scheduleUrl,
}: AnnouncementReceiptEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>{summary}</Preview>
      <Body style={{ fontFamily: "sans-serif", padding: "24px" }}>
        <Container>
          <Text style={{ fontSize: "18px", fontWeight: "bold" }}>
            {needsAttention ? "Some parents weren't told" : "Announcement sent"}
          </Text>
          <Text>{summary}</Text>

          {needsAttention ? (
            <Text>
              Check those families&apos; email addresses on the roster, or reach
              them another way — nothing will retry on its own.
            </Text>
          ) : null}

          <Text>
            <Link href={scheduleUrl}>{scheduleUrl}</Link>
          </Text>
        </Container>
      </Body>
    </Html>
  );
}
