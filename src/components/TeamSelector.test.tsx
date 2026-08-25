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
      groupMeUrl: null,
      archivedAt: null,
      createdAt: new Date("2026-07-28"),
    },
    {
      id: "team-2",
      name: "Other Team",
      season: "2026",
      allPlay: false,
      groupMeUrl: null,
      archivedAt: null,
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

  it("should not show an Archived Teams section when nothing is archived", () => {
    render(<TeamSelector teams={mockTeams} userTeamIds={["team-1"]} />);

    expect(screen.queryByText("Archived Teams")).not.toBeInTheDocument();
  });

  it("should render archived teams in their own section, separate from active teams", () => {
    const teamsWithArchived = [
      ...mockTeams,
      {
        id: "team-3",
        name: "Retired Team",
        season: "2024",
        allPlay: true,
        groupMeUrl: null,
        archivedAt: new Date("2024-09-01"),
        createdAt: new Date("2024-01-01"),
      },
    ];

    render(<TeamSelector teams={teamsWithArchived} userTeamIds={["team-1", "team-3"]} />);

    expect(screen.getByText("Archived Teams")).toBeInTheDocument();
    const archivedSection = screen.getByText("Archived Teams").parentElement;
    expect(archivedSection?.textContent).toContain("Retired Team");

    // The archived team must not also appear in the active "My Teams" section.
    const myTeamsSection = screen.getByText("My Teams").parentElement;
    expect(myTeamsSection?.textContent).not.toContain("Retired Team");
  });

  it("should not render an empty 'My Teams' heading when the caller's only team is archived", () => {
    const onlyArchived = [
      {
        id: "team-3",
        name: "Retired Team",
        season: "2024",
        allPlay: true,
        groupMeUrl: null,
        archivedAt: new Date("2024-09-01"),
        createdAt: new Date("2024-01-01"),
      },
    ];

    render(<TeamSelector teams={onlyArchived} userTeamIds={["team-3"]} />);

    // userTeamIds is non-empty, but there is no active team to list under it.
    expect(screen.queryByText("My Teams")).not.toBeInTheDocument();
    expect(screen.getByText("Archived Teams")).toBeInTheDocument();
    expect(screen.getByText("Retired Team")).toBeInTheDocument();
  });

  it("should not render an empty 'All Teams' heading when every active team belongs to the caller", () => {
    render(<TeamSelector teams={mockTeams} userTeamIds={["team-1", "team-2"]} />);

    expect(screen.queryByText("All Teams")).not.toBeInTheDocument();
  });

  it("should link to an archived team the caller is a member of, but not one they aren't", () => {
    const teamsWithArchived = [
      {
        id: "team-3",
        name: "My Archived Team",
        season: "2024",
        allPlay: true,
        groupMeUrl: null,
        archivedAt: new Date("2024-09-01"),
        createdAt: new Date("2024-01-01"),
      },
      {
        id: "team-4",
        name: "Someone Else's Archived Team",
        season: "2024",
        allPlay: true,
        groupMeUrl: null,
        archivedAt: new Date("2024-09-01"),
        createdAt: new Date("2024-01-01"),
      },
    ];

    render(<TeamSelector teams={teamsWithArchived} userTeamIds={["team-3"]} />);

    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAttribute("href", "/t/team-3");
  });
});
