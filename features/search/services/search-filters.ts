import type { Prisma } from "@/lib/generated/prisma/client";

export function termsFor(query: string) {
  return [
    ...new Set(
      query
        .toLocaleLowerCase()
        .split(/\s+/)
        .map((term) => term.replace(/[^\p{L}\p{N}_-]/gu, ""))
        .filter((term) => term.length > 1),
    ),
  ].slice(0, 8);
}

function contains(value: string): Prisma.StringFilter {
  return { contains: value, mode: "insensitive" };
}

function nullableContains(value: string): Prisma.StringNullableFilter {
  return { contains: value, mode: "insensitive" };
}

type SearchQueryFields = {
  userId?: string;
  from?: string;
  to?: string;
};

function dateFilter(query: Pick<SearchQueryFields, "from" | "to">) {
  if (!query.from && !query.to) return undefined;
  return {
    ...(query.from ? { gte: dateBoundary(query.from, false) } : {}),
    ...(query.to ? { lt: dateBoundary(query.to, true) } : {}),
  };
}

function dateBoundary(value: string, end: boolean) {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? new Date(`${value}T00:00:00.000Z`)
    : new Date(value);
  if (end && /^\d{4}-\d{2}-\d{2}$/.test(value))
    date.setUTCDate(date.getUTCDate() + 1);
  return date;
}

export function buildTaskSearchWhere(
  query: SearchQueryFields,
  workspaceIds: string[],
  terms: string[],
): Prisma.WorkspaceTaskWhereInput {
  return {
    workspaceId: { in: workspaceIds },
    ...(dateFilter(query) ? { createdAt: dateFilter(query) } : {}),
    AND: [
      ...(query.userId
        ? [
            {
              OR: [{ createdById: query.userId }, { assigneeId: query.userId }],
            },
          ]
        : []),
      {
        OR: terms.flatMap((term) => [
          { title: contains(term) },
          { description: nullableContains(term) },
        ]),
      },
    ],
  };
}
