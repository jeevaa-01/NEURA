import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { InvitationAcceptance } from "@/features/workspaces/components/invitation-acceptance";
import { getInvitationByToken } from "@/features/workspaces/queries/get-invitation-by-token";
import { getSession } from "@/lib/auth";

export const metadata: Metadata = { title: "Workspace invitation" };

export default async function InvitationPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const session = await getSession();
  if (!session)
    redirect(`/login?next=${encodeURIComponent(`/invite/${token}`)}`);
  const invitation = await getInvitationByToken(token);
  return (
    <div className="rounded-xl border border-border-default bg-surface p-6 shadow-2xl sm:p-8">
      <InvitationAcceptance
        token={token}
        workspaceName={invitation?.workspaceName ?? "this workspace"}
        workspaceSlug={invitation?.workspaceSlug ?? ""}
        inviteEmail={invitation?.email ?? ""}
        currentUserEmail={session.user.email}
        status={invitation?.status ?? "INVALID"}
      />
    </div>
  );
}
