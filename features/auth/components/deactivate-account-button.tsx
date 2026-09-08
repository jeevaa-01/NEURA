"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { deactivateAccountAction } from "../actions/deactivate-account";
import { signOut } from "@/lib/auth/client";
import { LOGIN_ROUTE } from "@/lib/constants";

export function DeactivateAccountButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function deactivate() {
    if (
      !window.confirm(
        "Deactivate your NEURA account? You will be signed out on every device, and your account will no longer be able to sign in.",
      )
    )
      return;
    setPending(true);
    setMessage(null);
    const result = await deactivateAccountAction();
    if (!result.ok) {
      setPending(false);
      setMessage(result.message);
      return;
    }
    await signOut().catch(() => undefined);
    router.push(LOGIN_ROUTE);
    router.refresh();
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <button
        type="button"
        onClick={deactivate}
        disabled={pending}
        aria-busy={pending}
        className="focus-ring rounded-md border border-danger/60 px-3 py-2 text-xs font-medium text-danger hover:bg-danger/10 disabled:opacity-50"
      >
        {pending ? "Deactivating…" : "Deactivate account"}
      </button>
      {message && (
        <p role="status" className="text-xs text-danger">
          {message}
        </p>
      )}
    </div>
  );
}
