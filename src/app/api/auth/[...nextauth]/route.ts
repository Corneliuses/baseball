import { handlers } from "@/auth";

/// The magic-link callback needs a real HTTP endpoint, which is why this is a
/// Route Handler rather than a Server Action.

export const { GET, POST } = handlers;
