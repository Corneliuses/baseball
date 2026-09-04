import { EmailHeading, EmailText, ScoreboardPanel } from "./EmailKit";
import { EmailLayout } from "./EmailLayout";

/// The sign-in code email — what `/signin` sends instead of a magic link
/// (#60). Deliberately nothing to tap: a link would be redeemed by whichever
/// browser the OS hands it to, which on a phone is routinely not the container
/// the person requested it from.
///
/// **The code is set as a scoreboard readout**, which is the one place this
/// directory's flare is doing a job rather than wearing a costume: the code is
/// read off one screen and typed into another, so the panel is dark in a cream
/// email to pull the eye straight to it, and the figures are floodlight yellow
/// monospace at 34px because character shapes are the entire task. That panel
/// is this email's banana; there is no button to spend it on, by design.
///
/// No team name on the cap — sign-in happens before we know which team the
/// person came for, and the layout leaves it off rather than guessing.

export type SignInCodeEmailProps = {
  /// Display form, e.g. "K3M7-QP2X" — the entry form strips the dash.
  formattedCode: string;
  expiresMinutes: number;
};

export function SignInCodeEmail({
  formattedCode,
  expiresMinutes,
}: SignInCodeEmailProps) {
  return (
    <EmailLayout
      preview={`Your sign-in code is ${formattedCode}`}
      teamName={null}
      footnote="Someone asked to sign in with this email address."
    >
      <EmailHeading
        eyebrow="Sign in"
        title="Here's your code"
        subtitle="Type it into the sign-in screen."
      />

      <ScoreboardPanel label="Sign-in code">{formattedCode}</ScoreboardPanel>

      {/* One interpolated string rather than JSX text around `{expiresMinutes}`:
          React splits that into separate text nodes with comment markers
          between them, which is noise in an email and, worse, means the
          sentence a person reads is not a contiguous string in the markup. */}
      <EmailText>
        {`It works once and expires in ${expiresMinutes} minutes. Capitals don't matter, and neither does the dash.`}
      </EmailText>

      <EmailText quiet>
        If you didn&apos;t ask for this code, you can ignore this email —
        nothing happens without it.
      </EmailText>
    </EmailLayout>
  );
}
