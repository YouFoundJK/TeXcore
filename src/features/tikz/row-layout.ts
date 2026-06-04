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

function formatWidth(w: string): string {
    w = w.trim();
    if (/^\d+(\.\d+)?$/.test(w)) {
        return w + "%";
    }
    return w;
}

function splitParagraphAtNodeBoundary(p: HTMLParagraphElement, delimiterNode: Node) {
    const parent = p.parentElement;
    if (!parent) return;

    const newP = document.createElement("p");
    for (let attr of Array.from(p.attributes)) {
        newP.setAttribute(attr.name, attr.value);
    }

    let nextNode = delimiterNode.nextSibling as Node;
    while (nextNode) {
        const toMove = nextNode;
        nextNode = nextNode.nextSibling as Node;
        newP.appendChild(toMove);
    }

    if (p.nextSibling) {
        parent.insertBefore(newP, p.nextSibling);
    } else {
        parent.appendChild(newP);
    }

    const cleanupBr = (el: HTMLElement) => {
        while (el.firstChild && el.firstChild.nodeName.toLowerCase() === "br") el.removeChild(el.firstChild);
        while (el.lastChild && el.lastChild.nodeName.toLowerCase() === "br") el.removeChild(el.lastChild);
    };
    cleanupBr(p);
    cleanupBr(newP);
}

function preprocessContainerRows(container: HTMLElement) {
    let mutated = true;
    while (mutated) {
        mutated = false;
        const paragraphs = Array.from(container.querySelectorAll("p"));
        
        for (const p of paragraphs) {
            if (!p.parentElement) continue;

            const childNodes = Array.from(p.childNodes);
            for (let i = 0; i < childNodes.length; i++) {
                const node = childNodes[i];
                if (node.nodeType !== Node.TEXT_NODE) continue;

                const text = node.textContent || "";
                const lines = text.split("\n");
                let offset = 0;

                for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
                    const line = lines[lineIdx].trim();
                    const isStart = line.startsWith(";;;row");
                    const isDelimiter = line === ";;";
                    const isClose = line === ";;;";

                    if (isStart || isDelimiter || isClose) {
                        const lineStartIdx = text.indexOf(line, offset);
                        if (lineStartIdx !== -1) {
                            const textNode = node as Text;
                            
                            // Split after the delimiter line first
                            const delimEndIdx = lineStartIdx + line.length;
                            if (delimEndIdx < text.length) {
                                textNode.splitText(delimEndIdx);
                            }
                            
                            // Split before the delimiter line
                            let delimNode: Node = textNode;
                            if (lineStartIdx > 0) {
                                delimNode = textNode.splitText(lineStartIdx);
                            }

                            // Split the paragraph before the delimiter node if it's not the first child
                            if (delimNode.previousSibling) {
                                const newP = document.createElement("p");
                                for (let attr of Array.from(p.attributes)) {
                                    newP.setAttribute(attr.name, attr.value);
                                }
                                
                                let curr = delimNode;
                                while (curr) {
                                    const next = curr.nextSibling;
                                    newP.appendChild(curr);
                                    curr = next as Node;
                                }
                                
                                if (p.nextSibling) {
                                    p.parentElement.insertBefore(newP, p.nextSibling);
                                } else {
                                    p.parentElement.appendChild(newP);
                                }
                                
                                const cleanupBr = (el: HTMLElement) => {
                                    while (el.firstChild && el.firstChild.nodeName.toLowerCase() === "br") el.removeChild(el.firstChild);
                                    while (el.lastChild && el.lastChild.nodeName.toLowerCase() === "br") el.removeChild(el.lastChild);
                                };
                                cleanupBr(p);
                                cleanupBr(newP);
                                
                                mutated = true;
                                break;
                            }

                            // Split the paragraph after the delimiter node if there are subsequent siblings
                            if (delimNode.nextSibling) {
                                splitParagraphAtNodeBoundary(p, delimNode);
                                mutated = true;
                                break;
                            }
                        }
                    }
                    offset += lines[lineIdx].length + 1;
                }
                if (mutated) break;
            }
            if (mutated) break;
        }
    }
}


function tightenColumn(colEl: HTMLElement) {
    colEl.style.setProperty("margin-top", "0", "important");
    colEl.style.setProperty("margin-bottom", "0", "important");
    colEl.style.setProperty("padding-top", "0", "important");
    colEl.style.setProperty("padding-bottom", "0", "important");
    colEl.style.setProperty("display", "flex", "important");
    colEl.style.setProperty("flex-direction", "column", "important");
    colEl.style.setProperty("justify-content", "center", "important");
    colEl.style.setProperty("align-items", "center", "important");

    const selectors = "p, .math, .math-block, pre, code, .block-language-tikz, mjx-container, svg, .cm-embed-block";
    colEl.querySelectorAll(selectors).forEach((el: HTMLElement) => {
        el.style.setProperty("margin-top", "0", "important");
        el.style.setProperty("margin-bottom", "0", "important");
        el.style.setProperty("padding-top", "0", "important");
        el.style.setProperty("padding-bottom", "0", "important");
        el.style.setProperty("line-height", "normal", "important");
        
        const tag = el.tagName.toLowerCase();
        if (
            tag === "p" || 
            tag === "pre" ||
            tag === "code" ||
            el.classList.contains("math-block") || 
            el.classList.contains("math") || 
            el.classList.contains("block-language-tikz") || 
            el.classList.contains("cm-embed-block")
        ) {
            const displayType = (el.classList.contains("math") && !el.classList.contains("math-block")) || tag === "code"
                ? "inline-flex" 
                : "flex";
            
            el.style.setProperty("display", displayType, "important");
            el.style.setProperty("align-items", "center", "important");
            el.style.setProperty("justify-content", "center", "important");
            el.style.setProperty("vertical-align", "middle", "important");
        } else if (tag === "svg" || tag === "mjx-container") {
            el.style.setProperty("vertical-align", "middle", "important");
        }
    });
}

// ==========================================
// 1. Reading View & PDF Export Post-Processor
// ==========================================
export const createRowLayoutProcessor = (plugin: LatexReferencer): MarkdownPostProcessor => {
    return (el, ctx) => {
        // Find the main container (e.g. .markdown-preview-view or .markdown-preview-section)
        let cont: HTMLElement | null = el.parentElement;
        while (cont && 
               !cont.classList.contains("markdown-preview-view") && 
               !cont.classList.contains("markdown-rendered") && 
               !cont.classList.contains("markdown-preview-section")) {
            cont = cont.parentElement;
        }
        if (!cont) {
            cont = el;
        }
        
        // Split merged paragraphs to isolate delimiters into standalone blocks
        preprocessContainerRows(cont);

        // Find all target paragraphs inside el that start with ;;;row
        const targetParagraphs: HTMLElement[] = [];
        if (el.tagName.toLowerCase() === "p" && el.textContent?.trim().startsWith(";;;row")) {
            targetParagraphs.push(el);
        } else {
            el.querySelectorAll("p").forEach((p) => {
                if (p.textContent?.trim().startsWith(";;;row")) {
                    targetParagraphs.push(p);
                }
            });
        }

        if (targetParagraphs.length === 0) return;

        targetParagraphs.forEach((startP) => {
            const text = startP.textContent?.trim() || "";

            // Defer DOM operations slightly to ensure siblings are attached
            setTimeout(() => {
                const parent = startP.parentElement;
                if (!parent) return;

                if (startP.dataset.rowProcessed === "true") return;

                // Find the main container (e.g. .markdown-preview-view or .markdown-preview-section)
                let container: HTMLElement | null = startP.parentElement;
                while (container && 
                       !container.classList.contains("markdown-preview-view") && 
                       !container.classList.contains("markdown-rendered") && 
                       !container.classList.contains("markdown-preview-section")) {
                    container = container.parentElement;
                }
                if (!container) {
                    container = startP.parentElement;
                }

                // Find topBlock (direct child of the container)
                let topBlock: HTMLElement | null = startP;
                while (topBlock && topBlock.parentElement !== container) {
                    topBlock = topBlock.parentElement;
                }
                if (!topBlock) return;

                const getBlockContent = (block: HTMLElement): HTMLElement => {
                    if (block.tagName.toLowerCase() === "div" && block.children.length === 1 && !block.className) {
                        return block.firstElementChild as HTMLElement;
                    }
                    return block;
                };

                // Traverse next siblings of topBlock under container
                const columnsElements: HTMLElement[][] = [[]];
                const delimitersToRemove: HTMLElement[] = [];
                let closingElement: HTMLElement | null = null;
                let foundEnd = false;

                let sibBlock = topBlock.nextElementSibling as HTMLElement | null;
                
                while (sibBlock) {
                    const contentEl = getBlockContent(sibBlock);
                    const textVal = contentEl.textContent?.trim() || "";
                    const isDelimiter = contentEl.tagName.toLowerCase() === "p" && textVal === ";;";
                    const isClose = contentEl.tagName.toLowerCase() === "p" && textVal === ";;;";

                    if (isDelimiter) {
                        delimitersToRemove.push(sibBlock);
                        columnsElements.push([]);
                    } else if (isClose) {
                        closingElement = sibBlock;
                        foundEnd = true;
                        break;
                    } else {
                        columnsElements[columnsElements.length - 1].push(sibBlock);
                    }
                    sibBlock = sibBlock.nextElementSibling as HTMLElement | null;
                }

                if (!foundEnd) return;

                startP.dataset.rowProcessed = "true";

                // Parse widths from the start line
                const widthsPart = text.substring(";;;row".length).trim().replace(/^:/, "").trim();
                let widths: string[] = [];
                if (widthsPart) {
                    widths = widthsPart.split(/\s*\|\s*|\s*,\s*|\s+/).map(w => w.trim()).filter(w => w).map(formatWidth);
                }

                const numColumns = columnsElements.length;
                const gridTracks: string[] = [];
                for (let colIdx = 0; colIdx < numColumns; colIdx++) {
                    if (colIdx < widths.length) {
                        gridTracks.push(widths[colIdx]);
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

                columnsElements.forEach((colEls) => {
                    const colEl = rowEl.createEl("div", { cls: "latex-referencer-column" });
                    colEl.style.display = "flex";
                    colEl.style.flexDirection = "column";
                    colEl.style.justifyContent = "center";
                    colEl.style.minWidth = "0";

                    // Move existing elements into the column
                    colEls.forEach(item => colEl.appendChild(item));

                    tightenColumn(colEl);
                    setTimeout(() => tightenColumn(colEl), 50);
                    setTimeout(() => tightenColumn(colEl), 150);
                    setTimeout(() => tightenColumn(colEl), 500);
                });

                // Replace start element and remove all old intermediate DOM nodes
                if (topBlock.parentElement) {
                    topBlock.parentElement.replaceChild(rowEl, topBlock);
                }
                
                delimitersToRemove.forEach(sib => sib.remove());
                if (closingElement) (closingElement as HTMLElement).remove();
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
               this.sourcePath === other.sourcePath;
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
                    const pos = view.posAtDOM(rowEl);
                    view.dispatch({
                        selection: { anchor: pos },
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
                            widths = widthsPart.split(/\s*\|\s*|\s*,\s*|\s+/).map(w => w.trim()).filter(w => w).map(formatWidth);
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
