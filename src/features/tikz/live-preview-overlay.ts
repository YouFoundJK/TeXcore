import { Extension, Prec } from "@codemirror/state";
import { EditorView, ViewPlugin, ViewUpdate } from "@codemirror/view";
import { MarkdownRenderChild } from "obsidian";
import LatexReferencer from "../../main";

class TikzLivePreviewOverlay {
    private overlayEl: HTMLDivElement | null = null;
    private containerEl: HTMLDivElement | null = null;
    private currentSource: string = "";
    private debounceTimeout: any = null;
    private isDragging = false;
    private startX = 0;
    private startY = 0;
    private startLeft = 0;
    private startTop = 0;

    constructor(private view: EditorView, private plugin: LatexReferencer) {}

    public updateSource(source: string) {
        this.ensureOverlayCreated();

        if (this.currentSource === source) {
            return;
        }
        this.currentSource = source;

        // Debounce compilation to prevent excessive UI lag/compiles
        if (this.debounceTimeout) {
            clearTimeout(this.debounceTimeout);
        }
        this.debounceTimeout = setTimeout(() => {
            this.renderTikz();
        }, 300);
    }

    private ensureOverlayCreated() {
        if (this.overlayEl) return;

        const doc = this.view.dom.ownerDocument;
        const body = doc.body;

        this.overlayEl = doc.createElement("div");
        this.overlayEl.classList.add("tikz-live-preview-overlay");
        
        // CSS Styles for floating overlay
        this.overlayEl.style.position = "fixed";
        this.overlayEl.style.zIndex = "1000";
        this.overlayEl.style.top = "100px";
        this.overlayEl.style.right = "50px";
        this.overlayEl.style.width = "320px";
        this.overlayEl.style.height = "320px";
        this.overlayEl.style.backgroundColor = "var(--background-primary-alt)";
        this.overlayEl.style.border = "1px solid var(--border-color)";
        this.overlayEl.style.borderRadius = "8px";
        this.overlayEl.style.boxShadow = "0 4px 12px rgba(0, 0, 0, 0.15)";
        this.overlayEl.style.display = "flex";
        this.overlayEl.style.flexDirection = "column";
        this.overlayEl.style.overflow = "hidden";

        // Drag Handle
        const handleEl = doc.createElement("div");
        handleEl.classList.add("tikz-live-preview-handle");
        handleEl.style.cursor = "move";
        handleEl.style.padding = "6px";
        handleEl.style.backgroundColor = "var(--background-secondary-alt)";
        handleEl.style.borderBottom = "1px solid var(--border-color)";
        handleEl.style.fontSize = "0.85em";
        handleEl.style.fontWeight = "bold";
        handleEl.style.textAlign = "center";
        handleEl.style.color = "var(--text-muted)";
        handleEl.style.userSelect = "none";
        handleEl.textContent = "TikZ Live Preview";
        this.overlayEl.appendChild(handleEl);

        // Container for TikZ render
        this.containerEl = doc.createElement("div");
        this.containerEl.classList.add("tikz-live-preview-container");
        this.containerEl.classList.add("block-language-tikz");
        this.containerEl.style.flex = "1";
        this.containerEl.style.overflow = "auto";
        this.containerEl.style.display = "flex";
        this.containerEl.style.justifyContent = "center";
        this.containerEl.style.alignItems = "center";
        this.containerEl.style.padding = "10px";
        this.containerEl.style.backgroundColor = "transparent";
        this.overlayEl.appendChild(this.containerEl);

        // Drag functionality
        handleEl.onmousedown = (e: MouseEvent) => {
            this.isDragging = true;
            this.startX = e.clientX;
            this.startY = e.clientY;
            this.startLeft = this.overlayEl!.offsetLeft;
            this.startTop = this.overlayEl!.offsetTop;
            e.preventDefault();
        };

        const mouseMoveHandler = (e: MouseEvent) => {
            if (!this.isDragging || !this.overlayEl) return;
            const dx = e.clientX - this.startX;
            const dy = e.clientY - this.startY;

            let newLeft = this.startLeft + dx;
            let newTop = this.startTop + dy;

            const maxLeft = doc.defaultView!.innerWidth - this.overlayEl.offsetWidth;
            const maxTop = doc.defaultView!.innerHeight - this.overlayEl.offsetHeight;

            newLeft = Math.max(0, Math.min(newLeft, maxLeft));
            newTop = Math.max(0, Math.min(newTop, maxTop));

            this.overlayEl.style.left = `${newLeft}px`;
            this.overlayEl.style.top = `${newTop}px`;
            this.overlayEl.style.right = "auto";
        };

        const mouseUpHandler = () => {
            this.isDragging = false;
        };

        doc.addEventListener("mousemove", mouseMoveHandler);
        doc.addEventListener("mouseup", mouseUpHandler);

        // Save reference to clean up event listeners later
        (this.overlayEl as any)._cleanup = () => {
            doc.removeEventListener("mousemove", mouseMoveHandler);
            doc.removeEventListener("mouseup", mouseUpHandler);
        };

        body.appendChild(this.overlayEl);
        this.renderTikz();
    }

    private renderTikz() {
        if (!this.containerEl) return;
        this.containerEl.empty();

        if (!this.currentSource.trim()) {
            return;
        }

        let code = this.currentSource.trim();
        code = code.replaceAll("&nbsp;", "");
        code = code.split("\n").map(l => l.trim()).filter(l => l).join("\n");

        if (!code.includes("\\begin{document}")) {
            code = "\\begin{document}\n" + code + "\n\\end{document}";
        }

        const script = this.containerEl.createEl("script");
        script.setAttribute("type", "text/tikz");
        script.setAttribute("data-show-console", "true");
        script.textContent = code;
    }

    public destroy() {
        if (this.debounceTimeout) {
            clearTimeout(this.debounceTimeout);
        }
        if (this.overlayEl) {
            if (typeof (this.overlayEl as any)._cleanup === "function") {
                (this.overlayEl as any)._cleanup();
            }
            this.overlayEl.remove();
            this.overlayEl = null;
        }
        this.containerEl = null;
    }
}

export const createTikzLivePreviewPlugin = (plugin: LatexReferencer): Extension => {
    return Prec.highest(
        ViewPlugin.fromClass(
            class {
                private previewOverlay: TikzLivePreviewOverlay | null = null;

                constructor(private view: EditorView) {}

                update(update: ViewUpdate) {
                    if (!plugin.settings.enableTikzjax) {
                        this.cleanup();
                        return;
                    }

                    const state = update.state;
                    const pos = state.selection.main.head;

                    const tikzBlock = this.getTikzBlockAtPos(state, pos);
                    if (tikzBlock) {
                        if (!this.previewOverlay) {
                            this.previewOverlay = new TikzLivePreviewOverlay(this.view, plugin);
                        }
                        this.previewOverlay.updateSource(tikzBlock.source);
                    } else {
                        this.cleanup();
                    }
                }

                private getTikzBlockAtPos(state: any, pos: number): { source: string } | null {
                    try {
                        const doc = state.doc;
                        const curLine = doc.lineAt(pos).number;

                        let isInside = false;
                        let blockStartLine = -1;
                        let blockEndLine = -1;

                        // Scan backwards to find block start
                        for (let l = curLine; l >= 1; l--) {
                            const text = doc.line(l).text.trim();
                            if (text.startsWith("```tikz")) {
                                isInside = true;
                                blockStartLine = l;
                                break;
                            } else if (text === "```" && l < curLine) {
                                break;
                            }
                        }

                        if (!isInside) return null;

                        // Scan forwards to find block end
                        for (let l = curLine; l <= doc.lines; l++) {
                            const text = doc.line(l).text.trim();
                            if (text === "```") {
                                blockEndLine = l;
                                break;
                            } else if (text.startsWith("```tikz") && l > curLine) {
                                break;
                            }
                        }

                        if (blockStartLine !== -1 && blockEndLine !== -1) {
                            const lines: string[] = [];
                            for (let l = blockStartLine + 1; l < blockEndLine; l++) {
                                lines.push(doc.line(l).text);
                            }
                            return { source: lines.join("\n") };
                        }
                    } catch (e) {
                        // Fail silently on line errors
                    }
                    return null;
                }

                private cleanup() {
                    if (this.previewOverlay) {
                        this.previewOverlay.destroy();
                        this.previewOverlay = null;
                    }
                }

                destroy() {
                    this.cleanup();
                }
            }
        )
    );
};
