import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";

import { BleacherChatterCard } from "./BleacherChatterCard";

const URL = "https://groupme.com/join_group/12345678/AbCdEfGh";
const JOINED_KEY = "ybtm:groupme-joined:team-1";

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
});

describe("BleacherChatterCard before joining", () => {
  it("invites the family into the stands, linking out to GroupMe", () => {
    render(<BleacherChatterCard teamId="team-1" groupMeUrl={URL} />);

    expect(screen.getByText("Bleacher chatter")).toBeInTheDocument();
    const link = screen.getByRole("link", {
      name: /join the chatter/i,
    });
    expect(link).toHaveAttribute("href", URL);
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noreferrer");
  });

  it("keeps the bleacher art decorative", () => {
    const { container } = render(
      <BleacherChatterCard teamId="team-1" groupMeUrl={URL} />,
    );

    for (const svg of container.querySelectorAll("svg")) {
      expect(svg.getAttribute("aria-hidden")).toBe("true");
    }
  });

  // Team home's banana belongs to the kids' marquee strips (design-plan.md
  // §2), and this card's fun budget is spent on the crowd instead.
  it("never goes banana", () => {
    const { container } = render(
      <BleacherChatterCard teamId="team-1" groupMeUrl={URL} />,
    );

    expect(container.innerHTML).not.toContain("banana");
  });

  // The server has no localStorage to consult, so the first paint is always
  // the full card — the joined collapse happens after hydration, never during
  // it. Without this, a joined phone would hydration-mismatch on every visit.
  it("renders the full card on the server even for a joined browser", () => {
    window.localStorage.setItem(JOINED_KEY, "1");

    const html = renderToStaticMarkup(
      <BleacherChatterCard teamId="team-1" groupMeUrl={URL} />,
    );

    expect(html).toContain("Bleacher chatter");
  });
});

describe("BleacherChatterCard once this browser has joined", () => {
  it("collapses to the you're-in row when tapped, remembering it", () => {
    render(<BleacherChatterCard teamId="team-1" groupMeUrl={URL} />);

    fireEvent.click(screen.getByRole("link", { name: /join the chatter/i }));

    expect(screen.getByText("You’re in the stands.")).toBeInTheDocument();
    expect(window.localStorage.getItem(JOINED_KEY)).toBe("1");
  });

  it("opens collapsed on a later visit, keeping the link", () => {
    window.localStorage.setItem(JOINED_KEY, "1");

    render(<BleacherChatterCard teamId="team-1" groupMeUrl={URL} />);

    expect(screen.queryByText("Bleacher chatter")).not.toBeInTheDocument();
    const link = screen.getByRole("link", { name: "Open GroupMe" });
    expect(link).toHaveAttribute("href", URL);
  });

  // A family on two teams joins two chats: joined on one team must not
  // silence the other team's card.
  it("remembers per team, not per browser", () => {
    window.localStorage.setItem(JOINED_KEY, "1");

    render(<BleacherChatterCard teamId="team-2" groupMeUrl={URL} />);

    expect(screen.getByText("Bleacher chatter")).toBeInTheDocument();
  });
});
