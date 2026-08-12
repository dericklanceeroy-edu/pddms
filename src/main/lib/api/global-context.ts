import type { RoleLiterals } from "@lib/access-control";
import type { User } from "@lib/db/tables";

/**
 * Shared global singleton context by all handlers that is passed to
 * their setup functions.
 */
export interface GlobalSingletonContext {
    session?: {
        role: RoleLiterals
        user: User
    }
}
