import type { ReactNode } from "react";

/**
 * Chrome for unauthenticated routes (sign in, sign up, password recovery).
 *
 * The authentication phase adds the routes themselves; this layout only fixes
 * the shell they render into.
 */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-1 items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm">{children}</div>
    </div>
  );
}
