import { getChannelBySlug } from "../services/channel-service";
import { channelSlugSchema } from "../validations/channel-schema";

export async function getChannelBySlugForUser(
  workspaceId: string,
  channelSlug: string,
  userId: string,
) {
  const parsedSlug = channelSlugSchema.safeParse(channelSlug);
  if (!parsedSlug.success) return null;
  try {
    return await getChannelBySlug(workspaceId, parsedSlug.data, userId);
  } catch {
    return null;
  }
}
