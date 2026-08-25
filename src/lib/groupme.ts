/// GroupMe invite-link validation — pure, DB-free (see AGENTS.md).
///
/// The settings form asks for "the team's GroupMe link", so the check holds
/// the field to what its label claims: an https URL on groupme.com or one of
/// its subdomains (share links are `https://groupme.com/join_group/…`; the
/// web client lives on `web.groupme.com`). Anything else — another site, a
/// bare group name, http — is rejected rather than stored and rendered as a
/// link every parent on the team is invited to tap.

export function isGroupMeUrl(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }

  if (url.protocol !== "https:") {
    return false;
  }

  return (
    url.hostname === "groupme.com" || url.hostname.endsWith(".groupme.com")
  );
}
