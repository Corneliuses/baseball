/// The name a player wears on a diamond marker, for every diamond in the app.
///
/// Markers sit as little as 60px apart, so only a first name fits — and first
/// names collide constantly on a youth roster. Two Avas on one team is
/// ordinary, and a board showing "Ava" twice is worse than useless to the
/// person reading it: on `/view` that is a parent who cannot tell which kid is
/// theirs, and in the positions editor it is the coach, on the screen where
/// mixing up two same-named kids gets *written* to the chart.
///
/// Lives here rather than beside either diamond because both need it and they
/// must not drift: a name the viewer sees disambiguated and the editor shows
/// twice is its own kind of bug, and that is exactly the state this module was
/// extracted to end.
///
/// Keyed by an opaque `id` rather than a player id: the view page keys its
/// markers on `playerId` and the editor keys its chips on `entryId`, and
/// neither should have to reshape its rows to borrow this.

/// Generational suffixes, stripped before the surname is read.
///
/// Deliberately conservative: `jr`/`sr`/`ii`/`iii`/`iv` and nothing else. Bare
/// `I` and `V` are left out — they are vanishingly rare as suffixes and a
/// plausible transliteration or initial otherwise, and mistaking a real name
/// for a suffix is the worse failure of the two.
const SUFFIXES = new Set(["jr", "sr", "ii", "iii", "iv"]);

function isSuffix(token: string): boolean {
  return SUFFIXES.has(token.replace(/\.$/, "").toLocaleLowerCase());
}

export function buildDiamondNames(
  people: readonly { id: string; playerName: string }[],
): Map<string, string> {
  // Tokenized once and reused: splitting every player twice — once to count,
  // once to label — is the kind of thing that reads as free and isn't.
  const parts = people.map((person) => {
    const tokens = person.playerName.trim().split(/\s+/).filter(Boolean);

    // "Ben Ortiz Jr" must yield "Ben O.", not "Ben J." — an initial matching no
    // name anywhere else on the page, which is worse than no initial at all.
    // A person who is only "Ben Jr" has no surname to read, so they fall back
    // to the bare first name rather than borrowing the suffix.
    let end = tokens.length - 1;
    while (end > 0 && isSuffix(tokens[end])) {
      end -= 1;
    }

    return {
      id: person.id,
      // Falls back to the whole string for a name that is all whitespace, so
      // this can never emit an empty marker label.
      first: tokens[0] ?? person.playerName,
      last: end > 0 ? tokens[end] : null,
    };
  });

  // Counted case-insensitively, displayed exactly as entered. Nothing
  // normalizes a player's name on the way in — `playerSchema` in the roster
  // actions only trims it — so "Ava Castellanos" and "ava Rodriguez" are both
  // storable, and a case-sensitive count would call them distinct and render
  // two unlabelled markers reading "Ava" and "ava".
  //
  // The display side keeps `first` untouched: silently recapitalizing a coach's
  // roster on the diamond would be its own small bug, and the two markers
  // differ by their initials either way.
  const counts = new Map<string, number>();
  for (const part of parts) {
    const key = part.first.toLocaleLowerCase();
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return new Map(
    parts.map((part) => {
      const shared = (counts.get(part.first.toLocaleLowerCase()) ?? 0) > 1;
      return [
        part.id,
        shared && part.last ? `${part.first} ${part.last[0]}.` : part.first,
      ];
    }),
  );
}
