/// GroupMe invite-link validation — pure, DB-free (see AGENTS.md).
///
/// The settings form asks for "the team's GroupMe link" and team home renders
/// what it stores as a link every family is invited to tap, so the check holds
/// the field to a link that actually *joins* a group:
///
///   1. https, on groupme.com or one of its subdomains (the web client lives
///      on web.groupme.com and shares the same join route).
///   2. A `/join_group/…` path with something after it — the shape of the
///      share link GroupMe's own "Share group" button produces.
///
/// Rule 2 is the one that earns its keep. Host-only checking passed
/// `https://web.groupme.com/chats` — the address bar of the web client, which
/// is the likeliest thing an owner copies when they go looking for "the link"
/// — and every family tapping it would land on a chat list or a sign-in page
/// belonging to nobody, with nothing to tell the owner it was wrong. A
/// rejection is visible and says what to paste instead; a link to the wrong
/// page is silent.
///
/// The cost is the other way round: if GroupMe ever issues invites under
/// another path, this refuses a link that would have worked. That is the
/// intended trade — the owner sees the refusal and can say so.

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

  const onGroupMe =
    url.hostname === "groupme.com" || url.hostname.endsWith(".groupme.com");
  if (!onGroupMe) {
    return false;
  }

  // Split on "/" and drop the empty leading segment; a trailing slash leaves
  // an empty final one, so segments are filtered rather than counted raw.
  const segments = url.pathname.split("/").filter((segment) => segment !== "");
  return segments[0] === "join_group" && segments.length > 1;
}
