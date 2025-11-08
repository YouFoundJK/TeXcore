export function trimMathText(text: string): string {
    return text.match(/\$\$([\s\S]*)\$\$/)?.[1].trim() ?? '';
}

/** Parse the given markdown text and returns all comments in it as an array of lines. */
export function parseMarkdownComment(markdown: string): string[] {
    const comments: string[] = [];
    const pattern = /%%([\s\S]*?)%%/g;
    let result;
    while (result = pattern.exec(markdown)) {
        for (let line of result[1].split('\n')) {
            line = line.trim();
            if (line) comments.push(line);
        }
    }
    return comments;
}

/** Parse an one-line YAML-like string into a key-value pair. */
export function parseYamlLike(line: string): Record<string, string | undefined> | null {
    const result = line.match(/^(?<key>.*?):(?<value>.*)$/)?.groups;
    if (!result) return null;
    return { [result.key.trim()]: result.value.trim() };
}