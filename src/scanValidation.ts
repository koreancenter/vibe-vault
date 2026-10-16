export function assertCloudScanSource(source: unknown, unavailableMessage: string): asserts source is 'gemini' {
  if (source !== 'gemini') {
    throw new Error(unavailableMessage);
  }
}
