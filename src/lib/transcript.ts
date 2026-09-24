export function mergeTranscriptText(current: string, fragment: string) {
  if (!fragment) return current;
  if (!current) return fragment;
  if (fragment.startsWith(current)) return fragment;
  if (current.endsWith(fragment)) return current;
  return `${current}${/^[,.;:!?)}\]]/.test(fragment) ? "" : " "}${fragment}`;
}
