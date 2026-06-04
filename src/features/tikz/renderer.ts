import { Notice, requestUrl } from "obsidian";
import LatexReferencer from "../../main";

export class TikzRenderer {
    private tikzjaxJs: string = "";
    private tikzjaxCss: string = "";
    private isLoaded: boolean = false;

    constructor(public plugin: LatexReferencer) {}

    async onLoad() {
        if (!this.plugin.settings.enableTikzjax) {
            return;
        }

        try {
            await this.ensureResourcesCached();
            await this.loadResourcesFromCache();

            // Support pop-out windows and main window
            this.plugin.app.workspace.onLayoutReady(() => {
                this.loadTikZJaxAllWindows();
                this.plugin.registerEvent(
                    this.plugin.app.workspace.on("window-open", (win, window) => {
                        this.loadTikZJax(window.document);
                    })
                );
            });

            this.registerCodeBlockProcessor();
            this.isLoaded = true;
        } catch (error) {
            console.error("Latex Referencer: Failed to initialize TikZJax rendering", error);
            new Notice("Failed to initialize TikZJax diagram rendering.");
        }
    }

    onUnload() {
        if (!this.isLoaded) return;
        this.unloadTikZJaxAllWindows();
    }

    private async fetchWithFallback(urls: string[]): Promise<string> {
        let lastError: any = null;
        for (const url of urls) {
            try {
                const res = await requestUrl({
                    url,
                    headers: {
                        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/100.0.0.0 Safari/537.36",
                        "Accept": "*/*",
                        "Referer": "https://tikzjax.com/"
                    }
                });
                if (res.status === 200) {
                    return res.text;
                }
                throw new Error(`Request failed with status ${res.status}`);
            } catch (err) {
                console.warn(`Latex Referencer: Failed to fetch TikZJax asset from ${url}. Trying next fallback.`, err);
                lastError = err;
            }
        }
        throw lastError || new Error("All download attempts failed.");
    }

    private async ensureResourcesCached() {
        const adapter = this.plugin.app.vault.adapter;
        const pluginDir = this.plugin.manifest.dir;
        
        if (!pluginDir) {
            throw new Error("Plugin manifest directory is not defined.");
        }

        const jsPath = `${pluginDir}/tikzjax.js`;

        // If the cached file is the wrong one (official 458KB instead of 7MB offline version), delete it to trigger redownload
        if (await adapter.exists(jsPath)) {
            const content = await adapter.read(jsPath);
            if (!content.includes("MutationObserver")) {
                new Notice("Outdated TikZJax engine detected. Clearing cache to fetch offline-capable version...");
                await adapter.remove(jsPath);
            }
        }

        // Check and fetch tikzjax.js
        if (!(await adapter.exists(jsPath))) {
            new Notice("Downloading TikZJax engine (one-time setup)...");
            const jsUrls = [
                "https://cdn.jsdelivr.net/gh/artisticat1/obsidian-tikzjax@main/tikzjax.js",
                "https://raw.githubusercontent.com/artisticat1/obsidian-tikzjax/main/tikzjax.js"
            ];
            try {
                const text = await this.fetchWithFallback(jsUrls);
                await adapter.write(jsPath, text);
                new Notice("TikZJax engine cached successfully.");
            } catch (err) {
                console.error("Failed to download tikzjax.js", err);
                throw new Error("Failed to download TikZJax JavaScript resource.");
            }
        }

        // Check and fetch styles.css (cached locally as tikzjax.css)
        const cssPath = `${pluginDir}/tikzjax.css`;
        if (!(await adapter.exists(cssPath))) {
            const cssUrls = [
                "https://cdn.jsdelivr.net/gh/artisticat1/obsidian-tikzjax@main/styles.css",
                "https://raw.githubusercontent.com/artisticat1/obsidian-tikzjax/main/styles.css"
            ];
            try {
                const text = await this.fetchWithFallback(cssUrls);
                await adapter.write(cssPath, text);
            } catch (err) {
                console.error("Failed to download tikzjax.css", err);
                throw new Error("Failed to download TikZJax CSS resource.");
            }
        }
    }

    private async loadResourcesFromCache() {
        const adapter = this.plugin.app.vault.adapter;
        const pluginDir = this.plugin.manifest.dir;

        if (!pluginDir) return;

        let jsText = await adapter.read(`${pluginDir}/tikzjax.js`);

        // Patch tikzjax.js to handle dynamic execution, reload, and proper cleanup
        const originalTrigger = `"complete"==document.readyState?w():window.addEventListener("load",w),window.addEventListener("unload",(async function(){u&&u.disconnect(),await e.terminate(await H)}))`;
        
        const patchedTrigger = `window.TikzJaxCleanup=async function(){u&&u.disconnect();if(H){try{await e.terminate(await H)}catch(err){}}window.TikzJax=undefined;window.TikzJaxCleanup=undefined;},document.readyState!=="loading"?w():window.addEventListener("load",w),window.addEventListener("unload",(async function(){if(window.TikzJaxCleanup)await window.TikzJaxCleanup();}))`;

        if (jsText.includes(originalTrigger)) {
            jsText = jsText.replace(originalTrigger, patchedTrigger);
        } else {
            console.warn("Latex Referencer: Could not find original trigger in tikzjax.js for patching.");
        }

        this.tikzjaxJs = jsText;

        if (await adapter.exists(`${pluginDir}/tikzjax.css`)) {
            this.tikzjaxCss = await adapter.read(`${pluginDir}/tikzjax.css`);
        }
    }

    private loadTikZJax(doc: Document) {
        if (doc.getElementById("tikzjax")) return;

        // Ingest TikZJax styles (specifically font-face mappings for math glyphs)
        if (!doc.getElementById("tikzjax-css") && this.tikzjaxCss) {
            const style = doc.createElement("style");
            style.id = "tikzjax-css";
            style.textContent = this.tikzjaxCss;
            doc.head.appendChild(style);
        }

        // Ingest Custom Styling to integrate seamlessly with the note theme
        const customStyle = doc.createElement("style");
        customStyle.id = "tikzjax-custom-styles";
        customStyle.textContent = `
            .block-language-tikz {
                display: flex;
                justify-content: center;
                align-items: center;
                padding: 1rem 0;
                margin: 1.5em 0;
                overflow-x: auto;
                background-color: transparent;
            }
            .block-language-tikz svg {
                max-width: 100%;
                height: auto;
                color: var(--text-normal);
            }
            .block-language-tikz .tikzjax-error {
                color: var(--text-error);
                font-family: var(--font-monospace);
                font-size: 0.9em;
                padding: 1rem;
            }
        `;
        doc.head.appendChild(customStyle);

        // Ingest JS Script
        const script = doc.createElement("script");
        script.id = "tikzjax";
        script.type = "text/javascript";
        script.textContent = this.tikzjaxJs;
        doc.body.appendChild(script);

        doc.addEventListener("tikzjax-load-finished", this.postProcessSvg);
    }

    private unloadTikZJax(doc: Document) {
        // Trigger the cleanup function in the document's window context if it exists
        const win = doc.defaultView as any;
        if (win && typeof win.TikzJaxCleanup === "function") {
            win.TikzJaxCleanup().catch((err: any) => console.error("Latex Referencer: Error cleaning up TikZJax", err));
        }

        doc.getElementById("tikzjax")?.remove();
        doc.getElementById("tikzjax-css")?.remove();
        doc.getElementById("tikzjax-custom-styles")?.remove();
        doc.removeEventListener("tikzjax-load-finished", this.postProcessSvg);
    }

    private loadTikZJaxAllWindows() {
        for (const win of this.getAllWindows()) {
            this.loadTikZJax(win.document);
        }
    }

    private unloadTikZJaxAllWindows() {
        for (const win of this.getAllWindows()) {
            this.unloadTikZJax(win.document);
        }
    }

    private getAllWindows(): Window[] {
        const windows: Window[] = [];
        if (typeof window !== "undefined") {
            windows.push(window);
        }
        
        // Retrieve pop-out windows from workspace
        const workspace = this.plugin.app.workspace as any;
        const floatingSplit = workspace.floatingSplit;
        if (floatingSplit && floatingSplit.children) {
            for (const child of floatingSplit.children) {
                const win = child.view?.containerEl?.win;
                if (win && !windows.includes(win)) {
                    windows.push(win);
                }
            }
        }
        return windows;
    }

    private postProcessSvg = (e: Event) => {
        if (!this.plugin.settings.invertColorsInDarkMode) return;

        const svg = e.target as SVGElement;
        if (!svg || svg.tagName.toLowerCase() !== "svg") return;

        // Ensure text and lines adapt cleanly in dark mode
        const elements = svg.querySelectorAll("[stroke], [fill]");
        elements.forEach((el) => {
            const stroke = el.getAttribute("stroke");
            if (stroke === "black" || stroke === "#000" || stroke === "#000000") {
                el.setAttribute("stroke", "currentColor");
            }

            const fill = el.getAttribute("fill");
            if (fill === "black" || fill === "#000" || fill === "#000000") {
                el.setAttribute("fill", "currentColor");
            }
        });
    };

    private tidyTikzSource(tikzSource: string): string {
        // Remove non-breaking space characters, otherwise we get errors
        tikzSource = tikzSource.replaceAll("&nbsp;", "");
        
        let lines = tikzSource.split("\n");
        // Trim whitespace and remove empty lines
        lines = lines.map(line => line.trim()).filter(line => line);
        
        return lines.join("\n");
    }

    private registerCodeBlockProcessor() {
        this.plugin.registerMarkdownCodeBlockProcessor("tikz", (source, el, ctx) => {
            el.empty();
            
            if (!this.plugin.settings.enableTikzjax) {
                const pre = el.createEl("pre");
                const code = pre.createEl("code");
                code.textContent = source;
                return;
            }

            let code = this.tidyTikzSource(source);
            // Wrap in LaTeX document template if not already present
            if (!code.includes("\\begin{document}")) {
                code = "\\begin{document}\n" + code + "\n\\end{document}";
            }

            const script = el.createEl("script");
            script.setAttribute("type", "text/tikz");
            script.setAttribute("data-show-console", "true");
            script.textContent = code;
        });
    }
}
