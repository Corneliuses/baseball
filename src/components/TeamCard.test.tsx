import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { TeamCard } from "./TeamCard";

describe("TeamCard", () => {
  const baseProps = {
    id: "team-1",
    name: "Test Team",
    season: "2026",
    allPlay: true,
    isClickable: false,
  };

  it("should render team name and season", () => {
    render(<TeamCard {...baseProps} />);

    expect(screen.getByText("Test Team")).toBeInTheDocument();
    expect(screen.getByText("Season: 2026")).toBeInTheDocument();
  });

  it("should display allPlay status", () => {
    const { rerender } = render(<TeamCard {...baseProps} allPlay={true} />);
    expect(screen.getByText("All players bat and field")).toBeInTheDocument();

    rerender(<TeamCard {...baseProps} allPlay={false} />);
    expect(screen.getByText("Selective lineup")).toBeInTheDocument();
  });

  it("should handle missing season", () => {
    render(<TeamCard {...baseProps} season={null} />);

    expect(screen.queryByText(/Season:/)).not.toBeInTheDocument();
  });

  it("should render as a link when isClickable is true", () => {
    render(<TeamCard {...baseProps} isClickable={true} />);

    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", "/t/team-1");
  });

  it("should not render as a link when isClickable is false", () => {
    render(<TeamCard {...baseProps} isClickable={false} />);

    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("should not show an Archived badge for an active team", () => {
    render(<TeamCard {...baseProps} archivedAt={null} />);

    expect(screen.queryByText("Archived")).not.toBeInTheDocument();
  });

  it("should show an Archived badge for an archived team", () => {
    render(<TeamCard {...baseProps} archivedAt={new Date("2026-09-01")} />);

    expect(screen.getByText("Archived")).toBeInTheDocument();
  });

  it("should still be clickable when archived", () => {
    render(<TeamCard {...baseProps} isClickable={true} archivedAt={new Date("2026-09-01")} />);

    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", "/t/team-1");
  });
});
