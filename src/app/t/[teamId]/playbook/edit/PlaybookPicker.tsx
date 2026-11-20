"use client";

import { LibraryPicker } from "@/components/LibraryPicker";
import { PlayAnimation } from "@/components/PlayAnimation";
import { MAX_PLAYBOOK_PLAYS, type Play } from "@/lib/plays";

import { savePlaybookAction } from "./actions";

/// The coach's checklist of the play library: the shared `LibraryPicker`,
/// previewing each play with the animation parents will see. The cap is
/// `validatePlaybook` in the action; the picker's disabled boxes only help.
export function PlaybookPicker({
  teamId,
  library,
  chosen,
  baseline,
}: {
  teamId: string;
  library: readonly Play[];
  chosen: readonly string[];
  baseline: readonly string[];
}) {
  return (
    <LibraryPicker
      teamId={teamId}
      library={library}
      chosen={chosen}
      baseline={baseline}
      max={MAX_PLAYBOOK_PLAYS}
      noun="plays"
      fieldName="play"
      action={savePlaybookAction}
      saveLabel="Save playbook"
      renderPreview={(play) => <PlayAnimation play={play} />}
    />
  );
}
