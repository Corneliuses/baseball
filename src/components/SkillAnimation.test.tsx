import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { SkillAnimation } from "./SkillAnimation";
import { getSkill } from "@/lib/skills";

describe("SkillAnimation", () => {
  it("renders the starting position from the server, before any clock runs", () => {
    const skill = getSkill("one-hand-control")!;
    const html = renderToStaticMarkup(<SkillAnimation skill={skill} />);

    expect(html).toContain(`Step 1 of ${skill.frames.length}`);
    expect(html).toContain(skill.frames[0].caption);
    expect(html).toContain("data-kid");
    expect(html).toContain("data-ball");
    // Both hands on the ball at the start.
    expect(html).toContain('data-arm="left"');
    expect(html).toContain('data-arm="right"');
  });

  it("draws the wall and its spot only for a skill that uses one", () => {
    const wall = renderToStaticMarkup(<SkillAnimation skill={getSkill("wall-backspin")!} />);
    expect(wall).toContain("data-wall");
    expect(wall).toContain("data-spot");

    const slides = renderToStaticMarkup(
      <SkillAnimation skill={getSkill("defensive-slides")!} />,
    );
    expect(slides).not.toContain("data-wall");
    expect(slides).not.toContain("data-ball");
    expect(slides.match(/data-cone/g)).toHaveLength(2);
  });

  it("lists every step for a screen reader, hides the drawing, and spends no banana", () => {
    const skill = getSkill("figure-eight")!;
    const html = renderToStaticMarkup(<SkillAnimation skill={skill} />);

    for (const frame of skill.frames) {
      expect(html).toContain(frame.caption.replace(/'/g, "&#x27;"));
    }
    expect(html).toMatch(/<div[^>]*aria-hidden="true"[^>]*><svg/);
    expect(html).not.toContain("banana");
  });
});
