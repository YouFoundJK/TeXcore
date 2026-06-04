import { CachedMetadata, ListItemCache, Loc, Pos } from "obsidian";

type ListItem = {
    type: "item";
    text: string;
    checkbox: "x" | " " | undefined;
};

type ListBlock = {
    type: "list";
    items: (ListItem | ListBlock)[];
};

type ListBlockItem = {
    type: "listitem";
    text: string;
    checkbox: " " | "x" | undefined;
    depth: number;
    parent: number;
};

const makeListItems = (
    list: ListBlock,
    startingLine: number,
    depth: number = 0
): ListBlockItem[] => {
    if (startingLine === 0) {
        startingLine = 1;
    }
    const lines: ListBlockItem[] = [];
    for (const i of list.items) {
        if (i.type === "item") {
            lines.push({
                type: "listitem",
                text: i.text,
                checkbox: i.checkbox,
                depth,
                parent: depth === 0 ? -startingLine : startingLine,
            });
        } else {
            lines.push(
                ...makeListItems(i, startingLine + lines.length - 1, depth + 1)
            );
        }
    }
    return lines;
};

type FileBlock =
    | {
        type: "heading";
        text: string;
        level: number;
    }
    | ListBlock
    | { type: "frontmatter"; key: string; text: unknown }
    | { type: "text"; text: string };

const makeFile = (
    lines: FileBlock[],
    tabChars = " ".repeat(4)
): [string, CachedMetadata] => {
    let lineNum = 0;
    let content = "";

    const appendLine = (line: string): Pos => {
        const start: Loc = { line: lineNum, col: 0, offset: content.length };
        content += `${line}\n`;
        const end: Loc = {
            line: lineNum++,
            col: line.length,
            offset: content.length - 1,
        };
        return { start, end };
    };

    const meta: CachedMetadata = {};

    const frontmatter = lines.flatMap((l) =>
        l.type === "frontmatter" ? l : []
    );

    if (frontmatter.length > 0) {
        const data: Record<string, unknown> = {};
        const { start } = appendLine("---");
        for (const elt of frontmatter) {
            if (Array.isArray(elt.text)) {
                appendLine(`${elt.key}: [${(elt.text as unknown[]).join(',')}]`);
            } else {
                appendLine(`${elt.key}: ${String(elt.text)}`);
            }
            data[elt.key] = elt.text;
        }
        const { end } = appendLine("---");
        meta.frontmatter = {
            position: { start, end },
            ...data,
        };
    }

    const blocks = lines.flatMap((l) => (l.type !== "frontmatter" ? l : []));
    for (const block of blocks) {
        switch (block.type) {
            case "heading": {
                if (!meta.headings) {
                    meta.headings = [];
                }
                const position = appendLine(
                    "#".repeat(block.level) + " " + block.text
                );
                meta.headings.push({
                    position,
                    heading: block.text,
                    level: block.level,
                });
                continue;
            }

            case "list": {
                if (!meta.listItems) {
                    meta.listItems = [];
                }
                for (const item of makeListItems(block, lineNum)) {
                    const indent = tabChars.repeat(item.depth);
                    const position = appendLine(
                        indent +
                        "- " +
                        (item.checkbox ? `[${item.checkbox}] ` : "") +
                        item.text
                    );
                    if (indent.length > 0) {
                        position.start.col += indent.length - 2;
                        position.start.offset += indent.length - 2;
                    }

                    const listItem: ListItemCache = {
                        position,
                        parent: item.parent,
                    };
                    if (item.checkbox) {
                        listItem["task"] = item.checkbox;
                    }

                    meta.listItems.push(listItem);
                }

                continue;
            }

            case "text":
                appendLine(block.text);
        }
    }

    return [content, meta];
};

export class ListBuilder {
    items: (ListItem | ListBlock)[] = [];

    constructor(items: (ListItem | ListBlock)[] = []) {
        this.items = items;
    }

    item(text: string, checkbox?: boolean) {
        const i: ListItem = {
            type: "item",
            text,
            checkbox:
                checkbox === true ? "x" : checkbox === false ? " " : undefined,
        };
        return new ListBuilder([...this.items, i]);
    }

    list(lb: ListBuilder) {
        return new ListBuilder([...this.items, lb.done()]);
    }

    done(): ListBlock {
        return { type: "list", items: this.items };
    }
}

export class FileBuilder {
    private lines: FileBlock[];

    constructor(lines: FileBlock[] = []) {
        this.lines = lines;
    }

    frontmatter(frontmatter: Record<string, unknown>): FileBuilder {
        const frontmatterLines = Object.entries(frontmatter).map(
            ([k, v]): FileBlock => ({ type: "frontmatter", key: k, text: v })
        );
        return new FileBuilder([...this.lines, ...frontmatterLines]);
    }

    heading(level: number, text: string): FileBuilder {
        return new FileBuilder([
            ...this.lines,
            { type: "heading", level, text },
        ]);
    }

    text(text: string): FileBuilder {
        return new FileBuilder([...this.lines, { type: "text", text }]);
    }

    list(list: ListBuilder): FileBuilder {
        return new FileBuilder([...this.lines, list.done()]);
    }

    done() {
        return makeFile(this.lines);
    }
}
