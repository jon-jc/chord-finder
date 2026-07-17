import { describe, expect, it } from "vitest";
import { embedUrl, parseYouTubeId } from "../youtube";

describe("parseYouTubeId", () => {
  it("parses standard watch URLs", () => {
    expect(parseYouTubeId("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe(
      "dQw4w9WgXcQ"
    );
    expect(
      parseYouTubeId("https://youtube.com/watch?v=dQw4w9WgXcQ&t=42s&list=PL1")
    ).toBe("dQw4w9WgXcQ");
    expect(parseYouTubeId("http://m.youtube.com/watch?v=dQw4w9WgXcQ")).toBe(
      "dQw4w9WgXcQ"
    );
  });

  it("parses short and app URL forms", () => {
    expect(parseYouTubeId("https://youtu.be/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    expect(parseYouTubeId("https://youtu.be/dQw4w9WgXcQ?t=10")).toBe("dQw4w9WgXcQ");
    expect(parseYouTubeId("https://www.youtube.com/shorts/dQw4w9WgXcQ")).toBe(
      "dQw4w9WgXcQ"
    );
    expect(parseYouTubeId("https://www.youtube.com/embed/dQw4w9WgXcQ")).toBe(
      "dQw4w9WgXcQ"
    );
    expect(parseYouTubeId("https://www.youtube.com/live/dQw4w9WgXcQ")).toBe(
      "dQw4w9WgXcQ"
    );
    expect(parseYouTubeId("https://music.youtube.com/watch?v=dQw4w9WgXcQ")).toBe(
      "dQw4w9WgXcQ"
    );
  });

  it("handles protocol-less input and bare ids", () => {
    expect(parseYouTubeId("youtube.com/watch?v=dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    expect(parseYouTubeId("youtu.be/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    expect(parseYouTubeId("dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    expect(parseYouTubeId("  https://youtu.be/dQw4w9WgXcQ  ")).toBe("dQw4w9WgXcQ");
  });

  it("rejects non-YouTube URLs and malformed ids", () => {
    expect(parseYouTubeId("https://vimeo.com/12345")).toBeNull();
    expect(parseYouTubeId("https://example.com/watch?v=dQw4w9WgXcQ")).toBeNull();
    expect(parseYouTubeId("https://www.youtube.com/watch?v=short")).toBeNull();
    expect(parseYouTubeId("https://www.youtube.com/")).toBeNull();
    expect(parseYouTubeId("not a url at all !!!")).toBeNull();
    expect(parseYouTubeId("")).toBeNull();
  });

  it("builds a privacy-enhanced embed URL", () => {
    expect(embedUrl("dQw4w9WgXcQ")).toBe(
      "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?rel=0"
    );
  });
});
