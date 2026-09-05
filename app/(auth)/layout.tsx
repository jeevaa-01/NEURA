import type { ReactNode } from "react";

/**
 * Chrome for unauthenticated routes (sign in, sign up, and later password
 * recovery).
 *
 * The `dark` class is scoped here rather than set globally: NEURA's
 * authentication surface carries the product's dark identity without
 * restyling the public landing page. `bg-background` is repeated on this
 * wrapper because `body` resolves its background from the light `:root`
 * tokens — without it the dark card would sit on a light page.
 */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="dark flex flex-1 items-center justify-center bg-background px-6 py-12 text-foreground">
      <div className="w-full max-w-sm">{children}</div>
    </div>
  );
}
