import type { CSSProperties } from "react";
import { Section, Text } from "@react-email/components";

import { EMAIL_COLOR, EMAIL_FONT } from "./brand";
import { EmailHeading, EmailText, QuietLink } from "./EmailKit";
import { EmailLayout } from "./EmailLayout";

/// The coach's copy of what happened when their event was announced (#45).
/// Read once, usually on a phone, and most of the time deleted — so it is a
/// **calm** email in the design-plan.md §7 sense: no banana, no button, one
/// status panel that is field green when the run was clean and seam red when it
/// was not. The colour is never the only carrier; the summary sentence says the
/// same thing in words.
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
    <EmailLayout
      preview={summary}
      footnote="You're getting this because you added the event."
    >
      <EmailHeading
        eyebrow="Announcement"
        tone={needsAttention ? "stitch" : "green"}
        title={needsAttention ? "Some parents weren't told" : "Announcement sent"}
      />

      <Section
        style={{
          ...statusPanelStyle,
          borderLeft: `4px solid ${
            needsAttention ? EMAIL_COLOR.stitch : EMAIL_COLOR.green
          }`,
        }}
      >
        <Text style={statusTextStyle}>{summary}</Text>
      </Section>

      {needsAttention ? (
        <EmailText>
          Check those families&apos; email addresses on the roster, or reach
          them another way — nothing will retry on its own.
        </EmailText>
      ) : null}

      <QuietLink href={scheduleUrl}>Open the schedule</QuietLink>
    </EmailLayout>
  );
}

const statusPanelStyle: CSSProperties = {
  backgroundColor: EMAIL_COLOR.page,
  borderRadius: "0 10px 10px 0",
  padding: "14px 16px",
  margin: "0 0 20px",
};

const statusTextStyle: CSSProperties = {
  fontFamily: EMAIL_FONT.body,
  fontSize: "16px",
  lineHeight: "24px",
  color: EMAIL_COLOR.ink,
  margin: 0,
};
