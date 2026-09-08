"use client";

import { Star } from "lucide-react";
import { useState } from "react";

import { toggleFavoriteChannelAction } from "../actions/toggle-favorite-channel";

export function FavoriteChannelButton({
  channelId,
  initialFavorited,
}: {
  channelId: string;
  initialFavorited: boolean;
}) {
  const [favorited, setFavorited] = useState(initialFavorited);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function toggle() {
    setPending(true);
    setError(null);
    const result = await toggleFavoriteChannelAction({ channelId });
    setPending(false);
    if (result.ok) setFavorited(result.data.favorited);
    else setError(result.error.message);
  }
  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        onClick={() => void toggle()}
        disabled={pending}
        aria-pressed={favorited}
        aria-label={
          favorited
            ? "Remove channel from favorites"
            : "Add channel to favorites"
        }
        className={`focus-ring inline-flex min-h-10 items-center justify-center gap-2 rounded-md border px-3.5 text-sm font-medium transition-colors ${favorited ? "border-accent/40 bg-accent-muted text-accent" : "border-border-default bg-surface text-text-secondary hover:border-border-strong hover:bg-surface-hover hover:text-text-primary"}`}
      >
        <Star
          aria-hidden
          className="size-4"
          fill={favorited ? "currentColor" : "none"}
        />
        {favorited ? "Favorited" : "Favorite"}
      </button>
      {error && (
        <span role="alert" className="max-w-40 text-xs text-danger">
          {error}
        </span>
      )}
    </span>
  );
}
