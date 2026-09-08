import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { DirectMessageBoard } from "@/features/messages/components/direct-message-board";
import {
  getConversationReadState,
  listConversationMessages,
  requireConversationAccess,
} from "@/features/messages/services/conversation-service";
import { prisma } from "@/lib/db/client";
import { getSession } from "@/lib/auth";

export const metadata: Metadata = { title: "Direct message" };

export default async function DirectMessagePage({
  params,
}: {
  params: Promise<{ conversationId: string }>;
}) {
  const session = await getSession();
  if (!session) notFound();
  const { conversationId } = await params;
  try {
    await requireConversationAccess(conversationId, session.user.id);
  } catch {
    notFound();
  }
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: {
      members: {
        select: {
          userId: true,
          user: { select: { displayName: true, username: true } },
        },
      },
    },
  });
  const other = conversation?.members.find(
    (member) => member.userId !== session.user.id,
  )?.user;
  if (!other) notFound();
  const [history, readState] = await Promise.all([
    listConversationMessages(conversationId, session.user.id),
    getConversationReadState(conversationId, session.user.id),
  ]);
  return (
    <div className="space-y-8">
      <Link
        href="/app/messages"
        className="focus-ring inline-flex items-center gap-2 text-xs text-text-muted hover:text-text-primary"
      >
        <ArrowLeft aria-hidden className="size-3.5" /> Messages
      </Link>
      <DirectMessageBoard
        conversationId={conversationId}
        otherName={other.displayName}
        currentUserId={session.user.id}
        initialHistory={history}
        initialReadState={readState}
      />
    </div>
  );
}
