import type { Metadata } from "next";

import { SearchExperience } from "@/features/search/components/search-experience";
import { getUserWorkspaces } from "@/features/workspaces/queries/get-user-workspaces";
import { MemberStatus } from "@/lib/generated/prisma/client";
import { prisma } from "@/lib/db/client";
import { requireSession } from "@/lib/auth";

export const metadata: Metadata = { title: "Search" };

export default async function SearchPage() {
  const session = await requireSession("/app/search");
  const workspaces = await getUserWorkspaces(session.user.id);
  const members = await prisma.workspaceMember.findMany({
    where: {
      workspaceId: { in: workspaces.map((workspace) => workspace.id) },
      status: MemberStatus.ACTIVE,
      user: { isActive: true },
    },
    orderBy: { joinedAt: "asc" },
    take: 200,
    select: {
      user: { select: { id: true, displayName: true, username: true } },
    },
  });
  const people = [
    ...new Map(
      members.map((member) => [
        member.user.id,
        {
          id: member.user.id,
          name: member.user.displayName,
          username: member.user.username,
        },
      ]),
    ).values(),
  ];
  return (
    <SearchExperience
      people={people}
      workspaces={workspaces.map((workspace) => ({
        id: workspace.id,
        name: workspace.name,
        channels: workspace.channels.map((channel) => ({
          id: channel.id,
          name: channel.name,
          isPrivate: channel.isPrivate,
        })),
      }))}
    />
  );
}
