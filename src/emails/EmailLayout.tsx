import type { CSSProperties, ReactNode } from "react";
import {
  Body,
  Container,
  Head,
  Html,
  Preview,
  Section,
  Text,
} from "@react-email/components";

import { EMAIL_COLOR, EMAIL_FONT, EMAIL_WIDTH } from "./brand";
import { StitchRule, captionStyle } from "./EmailKit";

/// The shell every email in this directory wears: cream page stock, a charcoal
/// scoreboard cap with the team's name on it, one card of warm white, and a
/// seam-red rule above the footer.
///
/// It exists because eight templates each opening `<Body style={{fontFamily:
/// "sans-serif", padding: "24px"}}>` is eight chances to be a slightly different
/// product, and because the inbox is the app's **first** surface — a parent
/// meets this before they ever open a page. See `brand.ts` for why the palette
/// is frozen hex and why there are no images and no web fonts.
///
/// Two structural notes, both about Gmail rather than taste:
///
///   - The cream ground is painted by a full-width `Section` **as well as** the
///     `Body`. Gmail's webmail drops `<body>` styling, so an email that puts its
///     page colour only there is white in the client most of this roster reads
///     mail in — and a cream card floating on white looks like a bug.
///   - `color-scheme: light` asks clients not to auto-invert. Apple Mail
///     listens; the Gmail and Outlook apps do not, and recolour regardless.
///     So the meta is a courtesy, not a defence — the defence is that the
///     palette is arranged to survive their pass (see `brand.ts`), and the
///     call to action in particular is built so that the recolour cannot put
///     light text on the banana.
///
/// The header band carries the **team name**, not a logo. It is the fastest
/// answer to the question a parent with kids on two teams actually has, and it
/// works with images blocked. It is required, as `string | null`, so that a
/// template cannot forget it: the receipt did exactly that in the first cut,
/// and a coach running two teams got a receipt that named neither.

export type EmailLayoutProps = {
  /// Inbox preview text — the line under the subject. Every template sets it
  /// to the fact a parent needs before opening.
  preview: string;
  /// Shown on the scoreboard cap. `null` only for the sign-in code, which is
  /// sent before we know which team the person is here for — every other
  /// email has a team, and passing it is not optional.
  teamName: string | null;
  /// The grey line under the seam: why this message arrived. One sentence
  /// per *reason*, shared where the reason is shared (`rosterFootnote` in
  /// `copy.ts` covers the four roster-triggered emails) and written here
  /// where it is not — an invitation, a code someone asked for.
  footnote?: ReactNode;
  children: ReactNode;
};

export function EmailLayout({
  preview,
  teamName,
  footnote,
  children,
}: EmailLayoutProps) {
  return (
    <Html lang="en">
      <Head>
        <meta name="color-scheme" content="light" />
        <meta name="supported-color-schemes" content="light" />
      </Head>
      <Preview>{preview}</Preview>
      <Body style={bodyStyle}>
        <Section style={pageStyle}>
          <Container style={containerStyle}>
            <Section style={bandStyle}>
              <Text style={bandProductStyle}>Team Manager</Text>
              {teamName ? <Text style={bandTeamStyle}>{teamName}</Text> : null}
            </Section>

            <Section style={cardStyle}>{children}</Section>

            <StitchRule />

            {footnote ? <Text style={footnoteStyle}>{footnote}</Text> : null}
            <Text style={signatureStyle}>Youth Baseball Team Manager</Text>
          </Container>
        </Section>
      </Body>
    </Html>
  );
}

const bodyStyle: CSSProperties = {
  backgroundColor: EMAIL_COLOR.page,
  color: EMAIL_COLOR.ink,
  fontFamily: EMAIL_FONT.body,
  margin: 0,
  padding: 0,
};

const pageStyle: CSSProperties = {
  backgroundColor: EMAIL_COLOR.page,
  padding: "24px 12px 32px",
};

const containerStyle: CSSProperties = {
  maxWidth: EMAIL_WIDTH,
  width: "100%",
};

const bandStyle: CSSProperties = {
  backgroundColor: EMAIL_COLOR.scoreboard,
  // The grass line: the field green edge that separates the scoreboard cap
  // from the card, and the only place in the shell the brand's green is a
  // surface rather than an accent.
  borderBottom: `4px solid ${EMAIL_COLOR.green}`,
  borderRadius: "14px 14px 0 0",
  padding: "16px 24px 14px",
};

const bandProductStyle: CSSProperties = {
  ...captionStyle,
  letterSpacing: "2.5px",
  color: EMAIL_COLOR.onScoreboard,
};

const bandTeamStyle: CSSProperties = {
  fontFamily: EMAIL_FONT.display,
  fontSize: "20px",
  lineHeight: "26px",
  fontWeight: 700,
  color: EMAIL_COLOR.onScoreboard,
  margin: "4px 0 0",
};

const cardStyle: CSSProperties = {
  backgroundColor: EMAIL_COLOR.card,
  border: `1px solid ${EMAIL_COLOR.border}`,
  borderTop: "none",
  borderRadius: "0 0 14px 14px",
  padding: "26px 24px 22px",
};

const footnoteStyle: CSSProperties = {
  fontFamily: EMAIL_FONT.body,
  fontSize: "12px",
  lineHeight: "18px",
  color: EMAIL_COLOR.quietInk,
  margin: "0 0 6px",
  padding: "0 4px",
};

const signatureStyle: CSSProperties = {
  ...captionStyle,
  fontWeight: 400,
  color: EMAIL_COLOR.quietInk,
  padding: "0 4px",
};
