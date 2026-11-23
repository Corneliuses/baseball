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
    // Two cones from above, and the same two from the front.
    expect(slides.match(/data-cone/g)).toHaveLength(4);
  });

  it("draws a second view from the front or the side, labelled, in step with the top view", () => {
    const front = renderToStaticMarkup(<SkillAnimation skill={getSkill("crossovers")!} />);
    expect(front).toContain('data-skill-profile="front"');
    expect(front).toContain("From the front");
    expect(front).toContain("From above");
    expect(front).toContain("data-profile-kid");
    expect(front).toContain("data-profile-ball");

    const side = renderToStaticMarkup(<SkillAnimation skill={getSkill("wall-backspin")!} />);
    expect(side).toContain('data-skill-profile="side"');
    expect(side).toContain("From the side");
    // The wall and its tape mark show in both views.
    expect(side.match(/data-spot/g)).toHaveLength(2);

    const slides = renderToStaticMarkup(
      <SkillAnimation skill={getSkill("defensive-slides")!} />,
    );
    expect(slides).not.toContain("data-profile-ball");
  });

  it("lists every step for a screen reader, hides the drawing, and spends no banana", () => {
    const skill = getSkill("figure-eight")!;
    const html = renderToStaticMarkup(<SkillAnimation skill={skill} />);

    for (const frame of skill.frames) {
      expect(html).toContain(frame.caption.replace(/'/g, "&#x27;"));
    }
    // Both drawings (and their labels) sit inside one hidden grid.
    expect(html).toMatch(/<div[^>]*aria-hidden="true"[^>]*><figure/);
    expect(html.match(/<svg/g)).toHaveLength(2);
    expect(html).not.toContain("banana");
  });
});
