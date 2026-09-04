import type { CSSProperties, ReactNode } from "react";
import {
  Button,
  Column,
  Hr,
  Link,
  Row,
  Section,
  Text,
} from "@react-email/components";

import { EMAIL_COLOR, EMAIL_FONT } from "./brand";

/// The pieces every email is built from — the email-safe translation of
/// design-plan.md §5's texture vocabulary. Each motif here is the same idea as
/// its on-screen counterpart, rebuilt out of the three things a mail client can
/// be trusted with: a background colour, a border, and text.
///
///   - **Stitch divider** → `StitchRule`. On screen it is two dashed SVG arcs;
///     here it is a dashed seam-red rule, because SVG is dropped outright by
///     Outlook and inconsistently supported everywhere else.
///   - **Ticket stub** → `FactPanel`. The perforated RSVP-able surface, flattened
///     to clay stock with a Field Green edge. This is where the when and where
///     live, which is the whole reason a parent opened the message.
///   - **Chalk box** → `NoteBlock`, for text a human typed (a coach's note, an
///     event's notes) so it reads as quoted rather than as app copy.
///   - **Scoreboard** → `ScoreboardPanel`. Charcoal in both themes, floodlight
///     mono figures. Used for the one number an email exists to deliver.
///   - **Jersey dot** → `SlotDot`, the batting-slot disc, spent here on the
///     index of each date in a repeat-weekly announcement.
///
/// Everything is inline style objects rather than classes: a `<style>` block is
/// stripped by Gmail's webmail, and Tailwind never had a chance — the class
/// names would arrive with nothing to resolve them.

/// A page-level heading: a small monospaced eyebrow, then the slab headline,
/// then one optional line of context.
///
/// The eyebrow is the layer that lets the headline stay a real sentence. "New
/// on the schedule" as a 26px slab and "Game vs Robert" underneath reads as two
/// competing titles; as an eyebrow it reads as a stamp on an envelope.
export function EmailHeading({
  eyebrow,
  title,
  subtitle,
  tone = "green",
}: {
  eyebrow: string;
  title: string;
  /// The team name, usually — the line that tells a parent with kids on two
  /// teams which one this is about.
  subtitle?: string;
  /// `stitch` is for the one eyebrow that is an alarm ("TODAY"). Everything
  /// else is green, and a third tone would make the distinction meaningless.
  tone?: "green" | "stitch";
}) {
  return (
    <>
      <Text
        style={{
          ...eyebrowStyle,
          color: tone === "stitch" ? EMAIL_COLOR.stitch : EMAIL_COLOR.green,
        }}
      >
        {eyebrow}
      </Text>
      <Text style={headlineStyle}>{title}</Text>
      {subtitle ? <Text style={subtitleStyle}>{subtitle}</Text> : null}
    </>
  );
}

/// Body copy. A named component rather than a bare `<Text>` so that no email
/// has to remember the type size, and so "a paragraph" and "a paragraph that
/// preserves the line breaks a human typed" are one decision apart.
export function EmailText({
  children,
  preserveBreaks = false,
  quiet = false,
}: {
  children: ReactNode;
  preserveBreaks?: boolean;
  quiet?: boolean;
}) {
  return (
    <Text
      style={{
        ...bodyStyle,
        ...(quiet ? { color: EMAIL_COLOR.quietInk, fontSize: "14px" } : {}),
        ...(preserveBreaks ? { whiteSpace: "pre-wrap" } : {}),
      }}
    >
      {children}
    </Text>
  );
}

/// The ticket stub: clay stock, a Field Green edge, and label/value rows. Holds
/// the facts a parent is scanning for — when, where, anything the coach added.
export function FactPanel({ children }: { children: ReactNode }) {
  return <Section style={factPanelStyle}>{children}</Section>;
}

/// One row of the stub. The label is a monospaced caption in the margin, so the
/// values line up as a column a thumb can scan.
export function FactRow({
  label,
  children,
  mono = false,
}: {
  label: string;
  children: ReactNode;
  /// Dates, times and anything else that is a readout rather than a sentence.
  mono?: boolean;
}) {
  return (
    <Row style={{ marginBottom: "10px" }}>
      <Column style={factLabelCellStyle}>
        <Text style={factLabelStyle}>{label}</Text>
      </Column>
      <Column>
        <Text
          style={{
            ...factValueStyle,
            // Monospace runs wide, and "Wed, Sep 16, 2026 at 5:45 PM" has to
            // fit beside its label on a 360px phone without wrapping mid-date.
            ...(mono
              ? {
                  fontFamily: EMAIL_FONT.mono,
                  fontSize: "15px",
                  letterSpacing: "-0.2px",
                }
              : {}),
          }}
        >
          {children}
        </Text>
      </Column>
    </Row>
  );
}

/// Text a person typed, set apart from text the app wrote. Same job as the
/// chalk box on screen: this is quoted material, and a parent should be able to
/// tell at a glance that the coach chose these words.
export function NoteBlock({ children }: { children: ReactNode }) {
  return (
    <Section style={noteBlockStyle}>
      <Text style={{ ...bodyStyle, margin: 0, whiteSpace: "pre-wrap" }}>
        {children}
      </Text>
    </Section>
  );
}

/// The scoreboard: charcoal panel, chalk caption, floodlight figures.
///
/// Reserved for the single number a message exists to carry — today the sign-in
/// code. Everything about it is the readout: the panel is dark in a cream email
/// on purpose, so the eye lands there first and the code can be read at a
/// glance and typed into another screen.
export function ScoreboardPanel({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <Section style={scoreboardStyle}>
      <Text style={scoreboardLabelStyle}>{label}</Text>
      <Text style={scoreboardValueStyle}>{children}</Text>
    </Section>
  );
}

/// The Banana Yellow call to action — **one per email, or none**
/// (design-plan.md §2). Navy on banana, never white, and a navy keyline so the
/// button still reads as a button against cream stock in a client that ignores
/// the radius.
export function BananaButton({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  return (
    <Section style={{ padding: "6px 0 4px" }}>
      <Button href={href} style={bananaButtonStyle}>
        {children}
      </Button>
    </Section>
  );
}

/// The same URL as plain text under a button.
///
/// Kept from the original plain templates and deliberately not dropped for
/// looking untidy: mail clients strip links, corporate gateways rewrite them,
/// and a parent forwarding the message to the other parent sends the text. It
/// is small and grey because it is a fallback, not an instruction.
export function LinkFallback({ href }: { href: string }) {
  return (
    <Text style={fallbackStyle}>
      Or paste this into your browser:
      <br />
      <span style={{ wordBreak: "break-all" }}>{href}</span>
    </Text>
  );
}

/// A quiet link for the calm emails — the ones whose point is the message
/// itself, where a yellow button would be shouting over the sender.
export function QuietLink({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  return (
    <Text style={{ ...bodyStyle, fontSize: "14px" }}>
      <Link href={href} style={linkStyle}>
        {children}
      </Link>
    </Text>
  );
}

/// The seam. Replaces a plain rule between sections.
export function StitchRule() {
  return <Hr style={stitchRuleStyle} />;
}

/// The jersey dot, as a squared-off chip a mail client can actually draw: navy
/// ground, cream monospaced figure.
export function SlotDot({ children }: { children: ReactNode }) {
  return <span style={slotDotStyle}>{children}</span>;
}

/// A small caption above a list or a panel.
export function SectionLabel({ children }: { children: ReactNode }) {
  return <Text style={{ ...eyebrowStyle, color: EMAIL_COLOR.quietInk }}>{children}</Text>;
}

const eyebrowStyle: CSSProperties = {
  fontFamily: EMAIL_FONT.mono,
  fontSize: "11px",
  fontWeight: 700,
  letterSpacing: "1.5px",
  textTransform: "uppercase",
  margin: "0 0 6px",
};

const headlineStyle: CSSProperties = {
  fontFamily: EMAIL_FONT.display,
  fontSize: "26px",
  lineHeight: "32px",
  // Bold, because almost nobody receiving this has Rockwell: the stack lands
  // on Georgia for most readers, and Georgia at regular weight is a book, not
  // a scoreboard. Bold is the closest a system serif gets to Alfa Slab's heft.
  fontWeight: 700,
  color: EMAIL_COLOR.ink,
  margin: "0 0 6px",
};

const subtitleStyle: CSSProperties = {
  fontFamily: EMAIL_FONT.body,
  fontSize: "15px",
  lineHeight: "22px",
  color: EMAIL_COLOR.quietInk,
  margin: "0 0 18px",
};

const bodyStyle: CSSProperties = {
  fontFamily: EMAIL_FONT.body,
  fontSize: "16px",
  lineHeight: "24px",
  color: EMAIL_COLOR.ink,
  margin: "0 0 16px",
};

const factPanelStyle: CSSProperties = {
  backgroundColor: EMAIL_COLOR.stub,
  borderLeft: `4px solid ${EMAIL_COLOR.green}`,
  borderRadius: "10px",
  padding: "16px 18px 6px",
  margin: "0 0 20px",
};

const factLabelCellStyle: CSSProperties = {
  width: "74px",
  verticalAlign: "top",
};

const factLabelStyle: CSSProperties = {
  fontFamily: EMAIL_FONT.mono,
  fontSize: "11px",
  fontWeight: 700,
  letterSpacing: "1px",
  textTransform: "uppercase",
  color: EMAIL_COLOR.quietInk,
  margin: "3px 0 0",
};

const factValueStyle: CSSProperties = {
  fontFamily: EMAIL_FONT.body,
  fontSize: "16px",
  lineHeight: "22px",
  fontWeight: 600,
  color: EMAIL_COLOR.ink,
  margin: 0,
  whiteSpace: "pre-wrap",
};

const noteBlockStyle: CSSProperties = {
  backgroundColor: EMAIL_COLOR.page,
  border: `1px dashed ${EMAIL_COLOR.border}`,
  borderRadius: "10px",
  padding: "14px 16px",
  margin: "0 0 20px",
};

const scoreboardStyle: CSSProperties = {
  backgroundColor: EMAIL_COLOR.scoreboard,
  borderRadius: "12px",
  padding: "18px 20px",
  margin: "0 0 20px",
  textAlign: "center",
};

const scoreboardLabelStyle: CSSProperties = {
  fontFamily: EMAIL_FONT.mono,
  fontSize: "11px",
  fontWeight: 700,
  letterSpacing: "2px",
  textTransform: "uppercase",
  color: EMAIL_COLOR.onScoreboard,
  margin: "0 0 8px",
};

const scoreboardValueStyle: CSSProperties = {
  fontFamily: EMAIL_FONT.mono,
  fontSize: "34px",
  lineHeight: "40px",
  fontWeight: 700,
  letterSpacing: "5px",
  color: EMAIL_COLOR.floodlight,
  margin: 0,
};

const bananaButtonStyle: CSSProperties = {
  backgroundColor: EMAIL_COLOR.banana,
  color: EMAIL_COLOR.ink,
  border: `2px solid ${EMAIL_COLOR.ink}`,
  borderRadius: "10px",
  fontFamily: EMAIL_FONT.body,
  fontSize: "16px",
  fontWeight: 700,
  letterSpacing: "0.2px",
  padding: "14px 24px",
  textDecoration: "none",
  display: "inline-block",
};

const fallbackStyle: CSSProperties = {
  fontFamily: EMAIL_FONT.mono,
  fontSize: "12px",
  lineHeight: "18px",
  color: EMAIL_COLOR.quietInk,
  margin: "0 0 16px",
};

const linkStyle: CSSProperties = {
  color: EMAIL_COLOR.green,
  fontWeight: 600,
  textDecoration: "underline",
};

const stitchRuleStyle: CSSProperties = {
  width: "100%",
  border: "none",
  borderTop: `2px dashed ${EMAIL_COLOR.stitch}`,
  margin: "20px 0",
};

const slotDotStyle: CSSProperties = {
  display: "inline-block",
  backgroundColor: EMAIL_COLOR.ink,
  color: EMAIL_COLOR.page,
  fontFamily: EMAIL_FONT.mono,
  fontSize: "12px",
  fontWeight: 700,
  borderRadius: "999px",
  padding: "3px 9px",
  marginRight: "10px",
};
