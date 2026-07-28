import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { TeamSelector } from "./TeamSelector";

describe("TeamSelector", () => {
  const mockTeams = [
    {
      id: "team-1",
      name: "My Team",
      season: "2026",
      allPlay: true,
      createdAt: new Date("2026-07-28"),
    },
    {
      id: "team-2",
      name: "Other Team",
      season: "2026",
      allPlay: false,
      createdAt: new Date("2026-07-27"),
    },
  ];

  it("should display empty state when no teams", () => {
    render(<TeamSelector teams={[]} />);

    expect(screen.getByText("No teams available")).toBeInTheDocument();
    expect(
      screen.getByText("Teams will appear here once they are created.")
    ).toBeInTheDocument();
  });

  it("should render all teams in a single section when user has no teams", () => {
    render(<TeamSelector teams={mockTeams} userTeamIds={[]} />);

    expect(screen.getByText("All Teams")).toBeInTheDocument();
    expect(screen.getByText("My Team")).toBeInTheDocument();
    expect(screen.getByText("Other Team")).toBeInTheDocument();
    expect(screen.queryByText("My Teams")).not.toBeInTheDocument();
  });

  it("should split teams into 'My Teams' and 'All Teams' sections when user is member", () => {
    render(<TeamSelector teams={mockTeams} userTeamIds={["team-1"]} />);

    expect(screen.getByText("My Teams")).toBeInTheDocument();
    expect(screen.getByText("All Teams")).toBeInTheDocument();

    const myTeamsSection = screen.getByText("My Teams").parentElement;
    const allTeamsSection = screen.getByText("All Teams").parentElement;

    expect(myTeamsSection?.textContent).toContain("My Team");
    expect(allTeamsSection?.textContent).toContain("Other Team");
  });

  it("should only show 'My Teams' section when user is member of all teams", () => {
    render(
      <TeamSelector teams={mockTeams} userTeamIds={["team-1", "team-2"]} />
    );

    expect(screen.getByText("My Teams")).toBeInTheDocument();
    expect(screen.queryByText("All Teams")).not.toBeInTheDocument();
  });
});
