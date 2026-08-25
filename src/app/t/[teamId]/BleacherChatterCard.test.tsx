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

  // The stands stay 88px tall at every card width — a wider card sees more
  // crowd (`slice` crops the wings), never a taller one. `meet` here would
  // letterbox the planks short of the card's edges; proportional scaling drew
  // a 275px crowd inside the layout's max-w-7xl column.
  it("caps the stands at phone height and crops wider views, never scales", () => {
    const { container } = render(
      <BleacherChatterCard teamId="team-1" groupMeUrl={URL} />,
    );

    const art = container.querySelector('svg[viewBox="0 0 1280 88"]');
    expect(art).not.toBeNull();
    expect(art!.getAttribute("preserveAspectRatio")).toBe("xMidYMid slice");
    expect(art!.getAttribute("class")).toContain("h-[88px]");
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
  it("collapses when tapped, remembering it", () => {
    render(<BleacherChatterCard teamId="team-1" groupMeUrl={URL} />);

    fireEvent.click(screen.getByRole("link", { name: /join the chatter/i }));

    expect(screen.getByText("You’re in the stands")).toBeInTheDocument();
    expect(screen.queryByText(/where the families sit/i)).not.toBeInTheDocument();
    expect(window.localStorage.getItem(JOINED_KEY)).toBe("1");
  });

  it("drops the pitch but keeps the identity and the way back in", () => {
    window.localStorage.setItem(JOINED_KEY, "1");

    render(<BleacherChatterCard teamId="team-1" groupMeUrl={URL} />);

    // The pitch is gone...
    expect(screen.queryByText(/where the families sit/i)).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: /join the chatter/i }),
    ).not.toBeInTheDocument();

    // ...but the card is still recognisably the bleachers, and still a door.
    expect(screen.getByText("Bleacher chatter")).toBeInTheDocument();
    const link = screen.getByRole("link", { name: /bleacher chatter/i });
    expect(link).toHaveAttribute("href", URL);
    expect(link).toHaveAttribute("target", "_blank");
  });

  // The failure this replaces: a check mark and a small underlined text link,
  // which read as a dismissed notice rather than the way into the team chat.
  it("makes the whole row the tap target, not a text link", () => {
    window.localStorage.setItem(JOINED_KEY, "1");

    const { container } = render(
      <BleacherChatterCard teamId="team-1" groupMeUrl={URL} />,
    );

    expect(container.querySelectorAll("a")).toHaveLength(1);
    const link = container.querySelector("a")!;
    expect(link.className).toContain("flex");
    expect(link.className).toContain("p-3");
    // The cropped stands ride along, so the row is still visibly the card.
    expect(link.querySelector('svg[viewBox="672 0 88 88"]')).not.toBeNull();
  });

  // A family on two teams joins two chats: joined on one team must not
  // silence the other team's card.
  it("remembers per team, not per browser", () => {
    window.localStorage.setItem(JOINED_KEY, "1");

    render(<BleacherChatterCard teamId="team-2" groupMeUrl={URL} />);

    expect(screen.getByText(/where the families sit/i)).toBeInTheDocument();
  });
});
