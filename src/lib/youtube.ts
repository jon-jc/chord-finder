/** YouTube URL parsing. */

const ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;

/**
 * Extract the 11-character video id from any common YouTube URL form:
 * watch, youtu.be, shorts, embed, live, music.youtube.com, with or without
 * protocol and extra query params. Returns null when no id is found.
 */
export function parseYouTubeId(input: string): string | null {
  const trimmed = input.trim();
  if (ID_PATTERN.test(trimmed)) return trimmed;

  let url: URL;
  try {
    url = new URL(trimmed.includes("://") ? trimmed : `https://${trimmed}`);
  } catch {
    return null;
  }

  const host = url.hostname.replace(/^www\.|^m\./, "");
  if (
    host !== "youtube.com" &&
    host !== "music.youtube.com" &&
    host !== "youtube-nocookie.com" &&
    host !== "youtu.be"
  ) {
    return null;
  }

  let candidate: string | null = null;
  if (host === "youtu.be") {
    candidate = url.pathname.split("/")[1] ?? null;
  } else {
    const segments = url.pathname.split("/").filter(Boolean);
    if (segments[0] === "watch") {
      candidate = url.searchParams.get("v");
    } else if (["shorts", "embed", "live", "v"].includes(segments[0] ?? "")) {
      candidate = segments[1] ?? null;
    } else if (url.searchParams.has("v")) {
      candidate = url.searchParams.get("v");
    }
  }

  return candidate && ID_PATTERN.test(candidate) ? candidate : null;
}

export function embedUrl(videoId: string): string {
  return `https://www.youtube-nocookie.com/embed/${videoId}?rel=0`;
}
