import { MarkdownPostProcessor, TFile, Component, MarkdownRenderChild, MarkdownRenderer, editorLivePreviewField, editorInfoField } from "obsidian";
import { EditorSelection, RangeSetBuilder, Extension, Prec, StateField } from "@codemirror/state";
import { Decoration, DecorationSet, EditorView, WidgetType } from "@codemirror/view";
import LatexReferencer from "../../main";

interface MarkdownRow {
    startLine: number;
    endLine: number;
    delimiters: number[];
    widths: string[];
}

function selectionAndRangeOverlap(selection: EditorSelection, rangeFrom: number, rangeTo: number): boolean {
    for (const range of selection.ranges) {
        if (range.from <= rangeTo && range.to >= rangeFrom) {
            return true;
        }
    }
    return false;
}

function tightenColumn(colEl: HTMLElement) {
    colEl.style.setProperty("margin-top", "0", "important");
    colEl.style.setProperty("margin-bottom", "0", "important");
    colEl.style.setProperty("padding-top", "0", "important");
    colEl.style.setProperty("padding-bottom", "0", "important");

    const selectors = "p, .math, .math-block, pre, code, .block-language-tikz, mjx-container, svg, .cm-embed-block";
    colEl.querySelectorAll(selectors).forEach((el: HTMLElement) => {
        el.style.setProperty("margin-top", "0", "important");
        el.style.setProperty("margin-bottom", "0", "important");
        el.style.setProperty("padding-top", "0", "important");
        el.style.setProperty("padding-bottom", "0", "important");
    });
}

// ==========================================
// 1. Reading View & PDF Export Post-Processor
// ==========================================
export const createRowLayoutProcessor = (plugin: LatexReferencer): MarkdownPostProcessor => {
    return (el, ctx) => {
        const file = plugin.app.vault.getAbstractFileByPath(ctx.sourcePath);
        if (!(file instanceof TFile)) return;

        // Find if this element itself is a row start paragraph, or contains one
        const startP = el.tagName.toLowerCase() === "p" && el.textContent?.trim().startsWith(";;;row")
            ? el
            : el.querySelector("p");

        if (!startP) return;

        const text = startP.textContent?.trim() || "";
        if (!text.startsWith(";;;row")) return;

        const section = ctx.getSectionInfo(el);
        if (!section) return;

        // Read the entire active page content to build the line index mapping
        plugin.app.vault.cachedRead(file).then(content => {
            const lines = content.split(/\r?\n/);
            const rows: MarkdownRow[] = [];
            let currentRow: Partial<MarkdownRow> | null = null;

            for (let i = 0; i < lines.length; i++) {
                const line = lines[i].trim();
                if (line.startsWith(";;;row")) {
                    const widthsPart = line.substring(";;;row".length).trim().replace(/^:/, "").trim();
                    let widths: string[] = [];
                    if (widthsPart) {
                        widths = widthsPart.split(/\s*\|\s*|\s*,\s*|\s+/).map(w => w.trim()).filter(w => w);
                    }
                    currentRow = {
                        startLine: i,
                        delimiters: [],
                        widths
                    };
                } else if (line === ";;") {
                    if (currentRow) {
                        currentRow.delimiters?.push(i);
                    }
                } else if (line === ";;;") {
                    if (currentRow) {
                        currentRow.endLine = i;
                        rows.push(currentRow as MarkdownRow);
                        currentRow = null;
                    }
                }
            }

            // Find the row corresponding to this start element
            const activeRow = rows.find(r => r.startLine === section.lineStart);
            if (!activeRow) return;

            // Defer DOM operations slightly to ensure siblings are attached
            setTimeout(() => {
                const parent = el.parentElement;
                if (!parent) return;

                if (el.dataset.rowProcessed === "true") return;
                el.dataset.rowProcessed = "true";

                const siblings = Array.from(parent.children) as HTMLElement[];
                const startIndex = siblings.indexOf(el as HTMLElement);
                if (startIndex === -1) return;

                // Group elements into columns based on their source line ranges
                const numColumns = activeRow.delimiters.length + 1;
                const columnsElements: HTMLElement[][] = Array.from({ length: numColumns }, () => []);
                const delimitersToRemove: HTMLElement[] = [];
                let closingElement: HTMLElement | null = null;

                siblings.forEach((sib) => {
                    const sibSec = ctx.getSectionInfo(sib);
                    if (!sibSec) return;

                    const sibLine = sibSec.lineStart;

                    if (sibLine === activeRow.startLine) return;

                    if (activeRow.delimiters.includes(sibLine)) {
                        delimitersToRemove.push(sib);
                        return;
                    }

                    if (sibLine === activeRow.endLine) {
                        closingElement = sib;
                        return;
                    }

                    for (let colIdx = 0; colIdx < numColumns; colIdx++) {
                        const startBound = colIdx === 0 ? activeRow.startLine : activeRow.delimiters[colIdx - 1];
                        const endBound = colIdx === numColumns - 1 ? activeRow.endLine : activeRow.delimiters[colIdx];

                        if (sibLine > startBound && sibLine < endBound) {
                            columnsElements[colIdx].push(sib);
                            break;
                        }
                    }
                });

                // Extract column markdown texts from lines
                const columnsMarkdown: string[] = [];
                const rowLines = lines.slice(activeRow.startLine + 1, activeRow.endLine);
                let currentColLines: string[] = [];

                for (let rIdx = 0; rIdx < rowLines.length; rIdx++) {
                    const rLine = rowLines[rIdx];
                    if (rLine.trim() === ";;") {
                        columnsMarkdown.push(currentColLines.join("\n"));
                        currentColLines = [];
                    } else {
                        currentColLines.push(rLine);
                    }
                }
                columnsMarkdown.push(currentColLines.join("\n"));

                // Create CSS grid layout columns
                const gridTracks: string[] = [];
                for (let colIdx = 0; colIdx < numColumns; colIdx++) {
                    if (colIdx < activeRow.widths.length) {
                        gridTracks.push(activeRow.widths[colIdx]);
                    } else {
                        gridTracks.push("1fr");
                    }
                }

                const rowEl = document.createElement("div");
                rowEl.classList.add("latex-referencer-row");
                rowEl.style.display = "grid";
                rowEl.style.gridTemplateColumns = gridTracks.join(" ");
                rowEl.style.gap = "1.5rem";
                rowEl.style.width = "100%";
                rowEl.style.alignItems = "center";
                rowEl.style.margin = "-0.5em 0";

                columnsMarkdown.forEach((colMarkdown) => {
                    const colEl = rowEl.createEl("div", { cls: "latex-referencer-column" });
                    colEl.style.display = "flex";
                    colEl.style.flexDirection = "column";
                    colEl.style.justifyContent = "center";
                    colEl.style.minWidth = "0";

                    // Asynchronously render markdown inside layout column
                    const comp = new MarkdownRenderChild(colEl);
                    ctx.addChild(comp);
                    MarkdownRenderer.render(plugin.app, colMarkdown, colEl, ctx.sourcePath, comp)
                        .then(() => {
                            tightenColumn(colEl);
                            setTimeout(() => tightenColumn(colEl), 50);
                            setTimeout(() => tightenColumn(colEl), 150);
                            setTimeout(() => tightenColumn(colEl), 500);
                        })
                        .catch((err) => console.error("Latex Referencer: Failed to render column markdown", err));
                });

                // Replace start element and remove all old intermediate DOM nodes
                parent.replaceChild(rowEl, el);
                delimitersToRemove.forEach(sib => sib.remove());
                if (closingElement) (closingElement as HTMLElement).remove();
                columnsElements.forEach(colEls => colEls.forEach(sib => sib.remove()));
            }, 0);
        });
    };
};

// ==========================================
// 2. Live Preview CodeMirror 6 Extension
// ==========================================
class RowLayoutWidget extends WidgetType {
    private components: MarkdownRenderChild[] = [];

    constructor(
        public plugin: LatexReferencer,
        public sourcePath: string,
        public widths: string[],
        public columnsMarkdown: string[],
        public startPos: number
    ) {
        super();
    }

    eq(other: RowLayoutWidget) {
        return this.widths.join("|") === other.widths.join("|") &&
               this.columnsMarkdown.join("---") === other.columnsMarkdown.join("---") &&
               this.sourcePath === other.sourcePath &&
               this.startPos === other.startPos;
    }

    toDOM() {
        const rowEl = document.createElement("div");
        rowEl.classList.add("latex-referencer-row");
        rowEl.style.display = "grid";

        const numColumns = this.columnsMarkdown.length;
        const gridTracks: string[] = [];
        for (let colIdx = 0; colIdx < numColumns; colIdx++) {
            if (colIdx < this.widths.length) {
                gridTracks.push(this.widths[colIdx]);
            } else {
                gridTracks.push("1fr");
            }
        }
        rowEl.style.gridTemplateColumns = gridTracks.join(" ");
        rowEl.style.gap = "1.5rem";
        rowEl.style.width = "100%";
        rowEl.style.alignItems = "center";
        rowEl.style.margin = "-0.5em 0";

        this.columnsMarkdown.forEach((colMarkdown) => {
            const colEl = rowEl.createEl("div", { cls: "latex-referencer-column" });
            colEl.style.display = "flex";
            colEl.style.flexDirection = "column";
            colEl.style.justifyContent = "center";
            colEl.style.minWidth = "0";

            // Render Markdown asynchronously inside the editor column
            const comp = new MarkdownRenderChild(colEl);
            comp.load();
            this.components.push(comp);
            MarkdownRenderer.render(this.plugin.app, colMarkdown, colEl, this.sourcePath, comp)
                .then(() => {
                    tightenColumn(colEl);
                    setTimeout(() => tightenColumn(colEl), 50);
                    setTimeout(() => tightenColumn(colEl), 150);
                    setTimeout(() => tightenColumn(colEl), 500);
                })
                .catch((err) => console.error("Latex Referencer: Failed to render Live Preview column markdown", err));
        });

        // Resolve editing flow: move selection inside the block when clicked
        rowEl.onclick = (evt: MouseEvent) => {
            try {
                const view = EditorView.findFromDOM(rowEl);
                if (view) {
                    evt.preventDefault();
                    evt.stopPropagation();
                    view.dispatch({
                        selection: { anchor: this.startPos },
                        scrollIntoView: true
                    });
                    view.focus();
                }
            } catch (err) {
                console.error("Latex Referencer: Failed to focus editor on widget click", err);
            }
        };

        return rowEl;
    }

    destroy(dom: HTMLElement) {
        this.components.forEach(comp => comp.unload());
        this.components = [];
    }
}

export const createLivePreviewRowLayoutPlugin = (plugin: LatexReferencer): Extension => {
    const layoutField = StateField.define<DecorationSet>({
        create() {
            return Decoration.none;
        },
        update(decorations, tr) {
            // Re-evaluate whenever the document contents or selections change
            if (!tr.docChanged && !tr.selection) {
                return decorations;
            }

            const { state } = tr;

            const livePreview = state.field(editorLivePreviewField, false);
            if (!livePreview) {
                return Decoration.none;
            }

            const info = state.field(editorInfoField, false);
            const file = info?.file;
            const sourcePath = file?.path ?? '';
            if (!sourcePath) {
                return Decoration.none;
            }

            const builder = new RangeSetBuilder<Decoration>();
            const docText = state.doc.toString();
            const lines = docText.split(/\r?\n/);

            let inRow = false;
            let startPos = -1;
            let startLineIdx = -1;
            let widths: string[] = [];

            for (let i = 0; i < lines.length; i++) {
                const line = lines[i].trim();
                if (!inRow) {
                    if (line.startsWith(";;;row")) {
                        inRow = true;
                        startLineIdx = i;
                        startPos = state.doc.line(i + 1).from;
                        
                        const widthsPart = line.substring(";;;row".length).trim().replace(/^:/, "").trim();
                        if (widthsPart) {
                            widths = widthsPart.split(/\s*\|\s*|\s*,\s*|\s+/).map(w => w.trim()).filter(w => w);
                        } else {
                            widths = [];
                        }
                    }
                } else {
                    if (line === ";;;") {
                        inRow = false;
                        const endPos = state.doc.line(i + 1).to;

                        // Decorate if cursor selection is completely outside this block
                        if (!selectionAndRangeOverlap(state.selection, startPos, endPos)) {
                            const columnsMarkdown: string[] = [];
                            const rowLines = lines.slice(startLineIdx + 1, i);
                            let currentColLines: string[] = [];
                            
                            for (let rIdx = 0; rIdx < rowLines.length; rIdx++) {
                                const rLine = rowLines[rIdx];
                                if (rLine.trim() === ";;") {
                                    columnsMarkdown.push(currentColLines.join("\n"));
                                    currentColLines = [];
                                } else {
                                    currentColLines.push(rLine);
                                }
                            }
                            columnsMarkdown.push(currentColLines.join("\n"));

                            builder.add(
                                startPos,
                                endPos,
                                Decoration.replace({
                                    widget: new RowLayoutWidget(plugin, sourcePath, widths, columnsMarkdown, startPos),
                                    block: true
                                })
                            );
                        }
                    }
                }
            }

            return builder.finish();
        },
        provide(field) {
            return EditorView.decorations.from(field);
        }
    });

    return Prec.highest(layoutField);
};
