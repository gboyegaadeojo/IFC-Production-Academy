import { youtubeEmbedUrl } from "@/lib/domain/youtube-stream";

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
