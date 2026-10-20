/// The app's name, in one place. Every page title, the header, the manifest,
/// the email shell and the ICS feed read it from here, so a rename is one edit.
///
/// Pure on purpose — no env reads, no imports — so client components and
/// `src/emails/` can both take it without pulling anything else across.
/// `app-name.test.ts` fails if the old name is typed anywhere again.
export const APP_NAME = "Cornelius Team Manager";

/// What shows under the home-screen icon (the manifest's `short_name`) and on
/// the email cap. Home-screen labels truncate around a dozen characters on
/// iOS, where the full name would read as "Cornelius Te…".
export const APP_SHORT_NAME = "Team Manager";
