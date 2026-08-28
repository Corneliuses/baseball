import { handlers } from "@/auth";

/// Auth.js's email callback needs a real HTTP endpoint, which is why this is a
/// Route Handler rather than a Server Action. Since #60 the browser arrives
/// here from `submitSignInCode` rebuilding the URL with a typed code, rather
/// than from a link in an email — the endpoint itself is indifferent to which.

export const { GET, POST } = handlers;
