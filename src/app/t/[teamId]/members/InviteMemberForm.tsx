"use client";

import * as React from "react";
import { useActionState } from "react";

import { SubmitButton } from "@/components/SubmitButton";
import { StatusBanner } from "@/components/StatusBanner";
import { messageFor } from "@/lib/error-messages";

import { inviteMemberAction } from "./actions";
import { INVITE_MEMBER_INITIAL_STATE } from "./invite-member-state";
import { MEMBER_ERROR_MESSAGES } from "./member-messages";

const fieldClass =
  "w-full rounded-md border border-border bg-background px-3 py-2 text-base text-foreground focus:outline-none focus:ring-2 focus:ring-ring";

/**
 * Invite one coach or parent onto the team.
 *
 * A small form, but it had the same C5 problem as the big ones: a typo in the
 * address blanked the address, so fixing a typo meant retyping the whole thing
 * from memory. Values come back from the returned state and are held in local
 * state after that, so a rejection costs nothing.
 *
 * Inviting an OWNER isn't offered — the owner who creates a team already holds
 * OWNER on it, and the action's schema rejects it independently of this markup.
 */
export function InviteMemberForm({ teamId }: { teamId: string }) {
  const [state, formAction] = useActionState(
    inviteMemberAction,
    INVITE_MEMBER_INITIAL_STATE,
  );

  const rejected = state.status === "invalid" ? state : null;

  const [email, setEmail] = React.useState(() => rejected?.values.email ?? "");
  const [role, setRole] = React.useState(
    () => rejected?.values.role || "PARENT",
  );

  const message = rejected
    ? messageFor(MEMBER_ERROR_MESSAGES, rejected.code)
    : null;
  const errorId = "invite-member-error";

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="teamId" value={teamId} />

      <div className="space-y-2">
        <label
          htmlFor="email"
          className="block text-sm font-medium text-foreground"
        >
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          placeholder="coach@example.com"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          aria-invalid={message ? true : undefined}
          aria-describedby={message ? errorId : undefined}
          className={`${fieldClass} ${message ? "border-2 border-destructive" : ""}`}
        />
      </div>

      <div className="space-y-2">
        <label
          htmlFor="role"
          className="block text-sm font-medium text-foreground"
        >
          Role
        </label>
        <select
          id="role"
          name="role"
          value={role}
          onChange={(event) => setRole(event.target.value)}
          className={fieldClass}
        >
          <option value="PARENT">Parent</option>
          <option value="COACH">Coach</option>
        </select>
      </div>

      {message ? (
        <StatusBanner tone="error" id={errorId}>
          {message}
        </StatusBanner>
      ) : null}

      <SubmitButton className="w-full" pendingLabel="Sending…">
        Send invitation
      </SubmitButton>
    </form>
  );
}
