import { type YoutubeStatus, youtubeEmbedUrl } from "@/lib/domain/youtube-stream";

/** Just whether YouTube says the stream is live, in words and not only colour. */
export function YoutubeLiveTile({ status }: { status: YoutubeStatus }) {
  if (status === "off") {
    return (
      <p className="text-small text-text-secondary">
        Not connected yet. See Service Dashboard setup, under Connections.
      </p>
    );
  }
  return status === "live" ? (
    <p className="flex items-center gap-2 text-title font-bold text-success">
      <span aria-hidden="true" className="size-3 rounded-full bg-current" />
      Live
    </p>
  ) : (
    <p className="flex items-center gap-2 text-title font-semibold text-text-muted">
      <span aria-hidden="true" className="size-3 rounded-full border-2 border-current" />
      Not live
    </p>
  );
}

/**
 * The channel's live stream, muted. It needs no weekly link: YouTube plays whatever the channel is
 * streaming. It runs a little behind the room, so it isn't for judging timing.
 */
export function StreamPreviewTile({ channelId }: { channelId: string | null }) {
  if (!channelId) {
    return (
      <p className="text-small text-text-secondary">
        Not connected yet. Add the YouTube channel in Service Dashboard setup, under Connections.
      </p>
    );
  }
  return (
    <iframe
      title="The YouTube livestream"
      src={youtubeEmbedUrl(channelId)}
      allow="autoplay; encrypted-media"
      className="min-h-0 w-full flex-1 rounded-button border-0 bg-bg"
    />
  );
}
