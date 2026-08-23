"use client";

import * as React from "react";
import { useFormStatus } from "react-dom";

import { Button, type ButtonProps } from "@/components/ui/button";
import { BaseballSpinner } from "@/components/BaseballSpinner";

/**
 * A submit button that knows its form is busy.
 *
 * Before this, no form in the app gave any feedback between the tap and the
 * next render (Dugout Report C5). On a phone at a field that reads as "nothing
 * happened", and the honest response to nothing happening is to tap again —
 * which on the bulk invite means a second batch of real emails, nine seconds
 * into the first.
 *
 * `useFormStatus` reads the pending state of the nearest enclosing form, which
 * is why this has to be a client component **inside** the form rather than a
 * prop on it: the hook returns `{ pending: false }` for the component that
 * renders the `<form>` itself. Server-component pages keep their `<form
 * action={serverAction}>` exactly as it was and swap only the button.
 *
 * Progressive enhancement is intact. The button is a plain submit until React
 * hydrates; a form submitted before then posts and navigates the way it always
 * did. Pending state is a courtesy on top, never a gate — which matters on the
 * one-bar-of-signal phone this app is designed around.
 *
 * `disabled` composes rather than overrides: the chart editors already disable
 * their save button on a clean draft, and that stays true while pending adds
 * its own reason.
 */
export interface SubmitButtonProps extends Omit<ButtonProps, "type" | "asChild"> {
  /// What the button says while the action is in flight. Present tense and
  /// specific — "Sending…", "Saving…" — because it is also the accessible
  /// name for however long the submission takes, and it is the whole of the
  /// signal for a reader whose OS asks for reduced motion (the spinner holds
  /// still for them).
  pendingLabel?: string;
}

export function SubmitButton({
  children,
  pendingLabel = "Working…",
  disabled,
  ...props
}: SubmitButtonProps) {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" disabled={pending || disabled} {...props}>
      {pending ? (
        <>
          <BaseballSpinner />
          {pendingLabel}
        </>
      ) : (
        children
      )}
    </Button>
  );
}
