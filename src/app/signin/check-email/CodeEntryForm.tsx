"use client";

import * as React from "react";
import { useActionState } from "react";

import { StatusBanner } from "@/components/StatusBanner";
import { SubmitButton } from "@/components/SubmitButton";
import { messageFor } from "@/lib/error-messages";

import { submitSignInCode } from "../actions";
import { CHECK_EMAIL_INITIAL_STATE } from "../check-email-state";
import { CODE_ENTRY_MESSAGES } from "../signin-messages";

/**
 * The code-entry box, as a form that keeps what was typed.
 *
 * A redirect on a mistyped code emptied the field, which on eight characters
 * read from a notification while standing somewhere is the moment a parent
 * gives up and asks for another email. `useActionState` returns the failure
 * with the characters intact instead — the convention every form people type
 * into follows here (AGENTS.md; `AddPlayerForm` is the annotated reference).
 *
 * The value is controlled so it survives the rejection without depending on
 * when React resets an uncontrolled form, and its initial value still comes
 * from the returned state, which is what refills the box when JavaScript
 * never ran at all.
 *
 * `serverMessage` is the other way this screen can fail: Auth.js rejects a
 * wrong-but-well-formed code at the callback, and the page bounces it back
 * here as `?error=wrong-code`. It arrives as a prop rather than being read
 * here so this component stays a leaf, and both sentences come out of one
 * table so the two routes cannot drift.
 */
export function CodeEntryForm({
  serverMessage,
}: {
  serverMessage?: string | null;
}) {
  const [state, formAction] = useActionState(
    submitSignInCode,
    CHECK_EMAIL_INITIAL_STATE,
  );

  const rejected = state.status === "invalid" ? state : null;
  const [code, setCode] = React.useState(() => rejected?.value ?? "");

  const message = rejected
    ? messageFor(CODE_ENTRY_MESSAGES, rejected.code)
    : (serverMessage ?? null);
  const errorId = "code-error";

  return (
    <form action={formAction} className="space-y-4">
      <div className="space-y-2">
        <label
          htmlFor="code"
          className="block text-sm font-medium text-foreground"
        >
          Sign-in code
        </label>
        <input
          id="code"
          name="code"
          type="text"
          // The one autofill hint that matters: on a phone the code arrives
          // as a notification, and this lets the keyboard offer it without a
          // trip to the mail app.
          autoComplete="one-time-code"
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          required
          maxLength={12}
          placeholder="K3M7-QP2X"
          value={code}
          onChange={(event) => setCode(event.target.value)}
          aria-invalid={message ? true : undefined}
          aria-describedby={message ? errorId : undefined}
          className={`w-full rounded-md bg-background px-3 py-2 font-mono text-lg tracking-widest text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring ${
            message
              ? "border-2 border-destructive"
              : "border border-border"
          }`}
        />
      </div>

      {message ? (
        <StatusBanner tone="error" id={errorId}>
          {message}
        </StatusBanner>
      ) : null}

      {/* This screen's one banana (design-plan.md §2), matching the request
          form it follows. */}
      <SubmitButton
        className="w-full bg-banana text-banana-foreground hover:bg-banana/90"
        pendingLabel="Signing you in…"
      >
        Sign in
      </SubmitButton>
    </form>
  );
}
