import { describe, expect, it } from "vitest";
import { mergeTranscriptText } from "../src/lib/transcript";

describe("streaming transcript assembly", () => {
  it("joins spoken fragments into one readable turn", () => {
    const fragments = ["Hello! I have an", "opening for the", "Interior reset", "this Saturday", "at 3:00 PM."];
    expect(fragments.reduce(mergeTranscriptText, "")).toBe("Hello! I have an opening for the Interior reset this Saturday at 3:00 PM.");
  });

  it("does not insert a space before punctuation or duplicate cumulative updates", () => {
    expect(mergeTranscriptText("Sunday at 10:00 AM", ".")).toBe("Sunday at 10:00 AM.");
    expect(mergeTranscriptText("Sunday", "Sunday at 10:00 AM")).toBe("Sunday at 10:00 AM");
  });
});
