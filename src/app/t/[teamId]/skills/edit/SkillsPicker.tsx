"use client";

import { LibraryPicker } from "@/components/LibraryPicker";
import { SkillAnimation } from "@/components/SkillAnimation";
import { MAX_TEAM_SKILLS, type Skill } from "@/lib/skills";

import { saveSkillsAction } from "./actions";

/// The coach's checklist of the at-home skills library: the shared
/// `LibraryPicker`, previewing each skill with the animation families will
/// see. The cap is `validateSkills` in the action; the disabled boxes only
/// help.
export function SkillsPicker({
  teamId,
  library,
  chosen,
  baseline,
}: {
  teamId: string;
  library: readonly Skill[];
  chosen: readonly string[];
  baseline: readonly string[];
}) {
  return (
    <LibraryPicker
      teamId={teamId}
      library={library}
      chosen={chosen}
      baseline={baseline}
      max={MAX_TEAM_SKILLS}
      noun="skills"
      fieldName="skill"
      action={saveSkillsAction}
      saveLabel="Save skills"
      renderPreview={(skill) => <SkillAnimation skill={skill} />}
    />
  );
}
