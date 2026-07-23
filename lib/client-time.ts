export function toLocalDateTimeInput(date = new Date()): string {
  const rounded = new Date(date);
  rounded.setSeconds(0, 0);
  return new Date(rounded.getTime() - rounded.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}
