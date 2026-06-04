export function splitIntoLines(text: string): string[] {
  // https://stackoverflow.com/a/5035005/13613783
  return text.split(/\r?\n/);
}

export function insertAt<Type>(array: Type[], item: Type, index: number) {
  array.splice(index, 0, item);
}
