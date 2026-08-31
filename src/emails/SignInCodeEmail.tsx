import {
  Body,
  Container,
  Head,
  Html,
  Preview,
  Text,
} from "@react-email/components";

/// The sign-in code email — what `/signin` sends instead of a magic link
/// (#60). Deliberately nothing to tap: a link would be redeemed by whichever
/// browser the OS hands it to, which on a phone is routinely not the
/// container the person requested it from. The code is read here and typed
/// there, so it is large, monospaced, and the first thing in the body.

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
    <Html>
      <Head />
      <Preview>Your sign-in code is {formattedCode}</Preview>
      <Body style={{ fontFamily: "sans-serif", padding: "24px" }}>
        <Container>
          <Text>Type this code into the sign-in screen:</Text>
          <Text
            style={{
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
              fontSize: "32px",
              fontWeight: 700,
              letterSpacing: "4px",
            }}
          >
            {formattedCode}
          </Text>
          <Text>
            It works once and expires in {expiresMinutes} minutes. Capitals
            don&apos;t matter, and neither does the dash.
          </Text>
          <Text>
            If you didn&apos;t ask for this code, you can ignore this email —
            nothing happens without it.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}
