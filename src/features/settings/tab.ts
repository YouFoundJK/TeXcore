import { App, PluginSettingTab, Setting, TextAreaComponent } from "obsidian";
import LatexReferencer from "../../main";
import { NUMBER_STYLES } from "./settings";
import { NoteSuggestModal } from "../custom-notes/modal";

export class MathSettingTab extends PluginSettingTab {
    constructor(app: App, public plugin: LatexReferencer) {
        super(app, plugin);
    }

    display() {
        const { containerEl } = this;
        containerEl.empty();

        containerEl.createEl("h2", { text: "Equation Numbering & Referencing" });

        new Setting(containerEl)
            .setName("Number only referenced equations")
            .setDesc("If turned on, only equations that are referenced somewhere will be numbered.")
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.numberOnlyReferencedEquations)
                .onChange(async value => {
                    this.plugin.settings.numberOnlyReferencedEquations = value;
                    await this.plugin.saveSettings();
                })
            );

        new Setting(containerEl)
            .setName("Equation number prefix")
            .addText(text => text
                .setValue(this.plugin.settings.eqNumberPrefix)
                .onChange(async value => {
                    this.plugin.settings.eqNumberPrefix = value;
                    await this.plugin.saveSettings();
                })
            );

        new Setting(containerEl)
            .setName("Equation number suffix")
            .addText(text => text
                .setValue(this.plugin.settings.eqNumberSuffix)
                .onChange(async value => {
                    this.plugin.settings.eqNumberSuffix = value;
                    await this.plugin.saveSettings();
                })
            );

        new Setting(containerEl)
            .setName("Equation number initial count")
            .addText(text => text
                .setValue(String(this.plugin.settings.eqNumberInit))
                .onChange(async value => {
                    const num = parseInt(value);
                    if (!isNaN(num)) {
                        this.plugin.settings.eqNumberInit = num;
                        await this.plugin.saveSettings();
                    }
                })
            );

        new Setting(containerEl)
            .setName("Equation number style")
            .addDropdown(dropdown => {
                for (const style of NUMBER_STYLES) {
                    dropdown.addOption(style, style);
                }
                dropdown
                    .setValue(this.plugin.settings.eqNumberStyle)
                    .onChange(async value => {
                        this.plugin.settings.eqNumberStyle = value as typeof NUMBER_STYLES[number];
                        await this.plugin.saveSettings();
                    })
            });

        new Setting(containerEl)
            .setName("Reference link prefix")
            .addText(text => text
                .setValue(this.plugin.settings.eqRefPrefix)
                .onChange(async value => {
                    this.plugin.settings.eqRefPrefix = value;
                    await this.plugin.saveSettings();
                })
            );

        new Setting(containerEl)
            .setName("Reference link suffix")
            .addText(text => text
                .setValue(this.plugin.settings.eqRefSuffix)
                .onChange(async value => {
                    this.plugin.settings.eqRefSuffix = value;
                    await this.plugin.saveSettings();
                })
            );

        new Setting(containerEl)
            .setName("Show note title in equation link")
            .setDesc("If turned on, a link to an equation will be like \"Note title > (1.1)\".")
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.noteTitleInEquationLink)
                .onChange(async value => {
                    this.plugin.settings.noteTitleInEquationLink = value;
                    await this.plugin.saveSettings();
                })
            );

        containerEl.createEl("h2", { text: "Autocomplete & Search" });

        new Setting(containerEl)
            .setName("Enable autocompletion")
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.enableSuggest)
                .onChange(async value => {
                    this.plugin.settings.enableSuggest = value;
                    await this.plugin.saveSettings();
                })
            );

        new Setting(containerEl)
            .setName("Trigger for autocompletion")
            .addText(text => text
                .setValue(this.plugin.settings.triggerSuggest)
                .onChange(async value => {
                    this.plugin.settings.triggerSuggest = value;
                    await this.plugin.saveSettings();
                })
            );

        new Setting(containerEl)
            .setName("Render math in suggestions")
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.renderMathInSuggestion)
                .onChange(async value => {
                    this.plugin.settings.renderMathInSuggestion = value;
                    await this.plugin.saveSettings();
                })
            );

        containerEl.createEl("h2", { text: "PDF Export" });

        new Setting(containerEl).setName("Add file name as title").addToggle((toggle) =>
            toggle
                .setTooltip("Add file name as title")
                .setValue(this.plugin.settings.showTitle)
                .onChange(async (value) => {
                    this.plugin.settings.showTitle = value;
                    this.plugin.saveSettings();
                }),
        );
        new Setting(containerEl).setName("Display headers").addToggle((toggle) =>
            toggle
                .setTooltip("Display header")
                .setValue(this.plugin.settings.displayHeader)
                .onChange(async (value) => {
                    this.plugin.settings.displayHeader = value;
                    this.plugin.saveSettings();
                }),
        );
        new Setting(containerEl).setName("Display footer").addToggle((toggle) =>
            toggle
                .setTooltip("Display footer")
                .setValue(this.plugin.settings.displayFooter)
                .onChange(async (value) => {
                    this.plugin.settings.displayFooter = value;
                    this.plugin.saveSettings();
                }),
        );

        new Setting(containerEl)
            .setName("Print background")
            .setDesc("Whether to print background graphics")
            .addToggle((toggle) =>
                toggle.setValue(this.plugin.settings.printBackground).onChange(async (value) => {
                    this.plugin.settings.printBackground = value;
                    this.plugin.saveSettings();
                }),
            );

        new Setting(containerEl)
            .setName("Generate tagged PDF")
            .setDesc(
                "Whether or not to generate a tagged (accessible) PDF. Defaults to false. As this property is experimental, the generated PDF may not adhere fully to PDF/UA and WCAG standards.",
            )
            .addToggle((toggle) =>
                toggle.setValue(this.plugin.settings.generateTaggedPDF).onChange(async (value) => {
                    this.plugin.settings.generateTaggedPDF = value;
                    this.plugin.saveSettings();
                }),
            );

        new Setting(containerEl).setName("Max headings level of the outline").addDropdown((dropdown) => {
            dropdown
                .addOptions(Object.fromEntries(["1", "2", "3", "4", "5", "6"].map((level) => [level, `h${level}`])))
                .setValue(this.plugin.settings.maxLevel)
                .onChange(async (value: string) => {
                    this.plugin.settings.maxLevel = value;
                    this.plugin.saveSettings();
                });
        });

        new Setting(containerEl)
            .setName("PDF metadata")
            .setDesc("Add frontMatter(title, author, keywords, subject creator, etc) to pdf metadata")
            .addToggle((toggle) =>
                toggle.setValue(this.plugin.settings.displayMetadata).onChange(async (value) => {
                    this.plugin.settings.displayMetadata = value;
                    this.plugin.saveSettings();
                }),
            );

        new Setting(containerEl).setName("Advanced").setHeading();

        const headerContentAreaSetting = new Setting(containerEl);
        headerContentAreaSetting.settingEl.setAttribute("style", "display: grid; grid-template-columns: 1fr;");
        headerContentAreaSetting
            .setName("Header Template")
            .setDesc(
                "HTML template for the print header. " +
                "Should be valid HTML markup with following classes used to inject printing values into them: " +
                'date (formatted print date), title (document title), url (document location), pageNumber (current page number) and totalPages (total pages in the document). For example, <span class="title"></span> would generate span containing the title.',
            );
        const hederContentArea = new TextAreaComponent(headerContentAreaSetting.controlEl);

        setAttributes(hederContentArea.inputEl, {
            style: "margin-top: 12px; width: 100%; height: 6vh;",
        });
        hederContentArea.setValue(this.plugin.settings.headerTemplate).onChange(async (value) => {
            this.plugin.settings.headerTemplate = value;
            this.plugin.saveSettings();
        });

        const footerContentAreaSetting = new Setting(containerEl);
        footerContentAreaSetting.settingEl.setAttribute("style", "display: grid; grid-template-columns: 1fr;");
        footerContentAreaSetting
            .setName("Footer Template")
            .setDesc("HTML template for the print footer. Should use the same format as the headerTemplate.");
        const footerContentArea = new TextAreaComponent(footerContentAreaSetting.controlEl);

        setAttributes(footerContentArea.inputEl, {
            style: "margin-top: 12px; width: 100%; height: 6vh;",
        });
        footerContentArea.setValue(this.plugin.settings.footerTemplate).onChange(async (value) => {
            this.plugin.settings.footerTemplate = value;
            this.plugin.saveSettings();
        });

        new Setting(containerEl)
            .setName("Add timestamp to output file name")
            .setDesc("Add timestamp to output file name")
            .addToggle((cb) => {
                cb.setValue(this.plugin.settings.isTimestamp).onChange(async (value) => {
                    this.plugin.settings.isTimestamp = value;
                    await this.plugin.saveSettings();
                });
            });

        new Setting(containerEl)
            .setName("Select the css snippet that are not enabled")
            .setDesc("Select the css snippet that are not enabled")
            .addToggle((cb) => {
                cb.setValue(this.plugin.settings.enabledCss).onChange(async (value) => {
                    this.plugin.settings.enabledCss = value;
                    await this.plugin.saveSettings();
                });
            });

        new Setting(containerEl)
            .setName("Limit the number of concurrent renders")
            .setDesc("Limit the number of concurrent renders")
            .addText((cb) => {
                const concurrency = this.plugin.settings?.concurrency;
                cb.setValue(concurrency?.length > 0 ? concurrency : "5").onChange(async (value) => {
                    this.plugin.settings.concurrency = value;
                    await this.plugin.saveSettings();
                });
            });

        containerEl.createEl("h2", { text: "TikZJax Rendering" });

        new Setting(containerEl)
            .setName("Enable TikZ rendering")
            .setDesc("Renders ```tikz code blocks into diagrams using TikZJax (requires an internet connection on first run to fetch WebAssembly resources).")
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.enableTikzjax)
                .onChange(async value => {
                    this.plugin.settings.enableTikzjax = value;
                    await this.plugin.saveSettings();
                })
            );

        new Setting(containerEl)
            .setName("Invert dark colors in dark mode")
            .setDesc("Automatically maps hardcoded dark colors (like black) to currentColor so they adapt to Obsidian's dark theme.")
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.invertColorsInDarkMode)
                .onChange(async value => {
                    this.plugin.settings.invertColorsInDarkMode = value;
                    await this.plugin.saveSettings();
                })
            );

        containerEl.createEl("h2", { text: "Zotero Cleanup" });

        new Setting(containerEl)
            .setName("Directories to search")
            .setDesc("Comma-separated list of directories to search recursively for Zotero annotations (e.g. 'Zotero,Notes/Readings').")
            .addTextArea((textArea) => {
                textArea
                    .setValue(this.plugin.settings.zoteroCleanDirectories)
                    .onChange(async (value) => {
                        this.plugin.settings.zoteroCleanDirectories = value;
                        await this.plugin.saveSettings();
                    });
                textArea.inputEl.setAttr("rows", 3);
            });

        containerEl.createEl("h2", { text: "Custom Note Hotkeys" });
        containerEl.createEl("p", {
            text: "Configure hotkeys to quickly open specific notes in your vault. You can define optional default hotkeys here, and further customize or rebind them within Obsidian's global 'Hotkeys' settings.",
            cls: "setting-item-description"
        });

        new Setting(containerEl)
            .setName("Add new hotkey mapping")
            .setDesc("Create a new shortcut command to open a specific note.")
            .addButton(btn => btn
                .setButtonText("+ Add hotkey mapping")
                .setCta()
                .onClick(async () => {
                    if (!this.plugin.settings.customNoteHotkeys) {
                        this.plugin.settings.customNoteHotkeys = [];
                    }
                    this.plugin.settings.customNoteHotkeys.push({
                        id: Date.now().toString(),
                        notePath: "",
                        name: "",
                        hotkeyModifiers: ["Mod"],
                        hotkeyKey: ""
                    });
                    await this.plugin.saveSettings();
                    this.plugin.customNoteManager.registerCommands();
                    this.display();
                })
            );

        const hotkeys = this.plugin.settings.customNoteHotkeys || [];
        hotkeys.forEach((item, index) => {
            const hotkeyContainer = containerEl.createEl("div", {
                cls: "custom-note-hotkey-item",
                attr: {
                    style: "border: 1px solid var(--background-modifier-border); padding: 15px; margin-bottom: 15px; border-radius: 8px; background-color: var(--background-primary-alt);"
                }
            });

            const titleRow = hotkeyContainer.createEl("div", {
                attr: { style: "display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;" }
            });
            titleRow.createEl("strong", { text: `Hotkey Mapping #${index + 1}` });
            
            const deleteBtn = titleRow.createEl("button", {
                text: "Delete",
                cls: "mod-warning",
                attr: { style: "background-color: var(--background-modifier-error); color: var(--text-on-accent);" }
            });
            deleteBtn.addEventListener("click", async () => {
                hotkeys.splice(index, 1);
                await this.plugin.saveSettings();
                this.plugin.customNoteManager.registerCommands();
                this.display();
            });

            new Setting(hotkeyContainer)
                .setName("Friendly name")
                .setDesc("A clear label for the Obsidian command (e.g. 'Daily Planner').")
                .addText(text => text
                    .setPlaceholder("e.g. My Note")
                    .setValue(item.name)
                    .onChange(async value => {
                        item.name = value;
                        await this.plugin.saveSettings();
                        this.plugin.customNoteManager.registerCommands();
                    })
                );

            const pathSetting = new Setting(hotkeyContainer)
                .setName("Note path")
                .setDesc("The relative vault path to the target markdown note.");
            
            pathSetting.addText(text => {
                text.setPlaceholder("e.g. Folder/My Note.md")
                    .setValue(item.notePath)
                    .onChange(async value => {
                        item.notePath = value;
                        await this.plugin.saveSettings();
                        this.plugin.customNoteManager.registerCommands();
                    });
                
                pathSetting.addButton(btn => btn
                    .setIcon("search")
                    .setTooltip("Browse/Search vault notes")
                    .onClick(() => {
                        new NoteSuggestModal(this.app, async (file) => {
                            text.setValue(file.path);
                            item.notePath = file.path;
                            await this.plugin.saveSettings();
                            this.plugin.customNoteManager.registerCommands();
                        }).open();
                    })
                );
            });

            const hotkeySetting = new Setting(hotkeyContainer)
                .setName("Default hotkey")
                .setDesc("Select modifiers and input a key (e.g., '1', 'a') to assign a default shortcut.");

            const isMod = item.hotkeyModifiers.includes("Mod");
            const isAlt = item.hotkeyModifiers.includes("Alt");
            const isShift = item.hotkeyModifiers.includes("Shift");

            hotkeySetting.addToggle(toggle => toggle
                .setTooltip("Ctrl / Cmd (Mod)")
                .setValue(isMod)
                .onChange(async value => {
                    if (value) {
                        if (!item.hotkeyModifiers.includes("Mod")) item.hotkeyModifiers.push("Mod");
                    } else {
                        item.hotkeyModifiers = item.hotkeyModifiers.filter(m => m !== "Mod");
                    }
                    await this.plugin.saveSettings();
                    this.plugin.customNoteManager.registerCommands();
                })
            );
            hotkeySetting.controlEl.createSpan({ text: "Ctrl/Cmd ", attr: { style: "margin-right: 15px; font-size: 0.9em;" } });

            hotkeySetting.addToggle(toggle => toggle
                .setTooltip("Alt")
                .setValue(isAlt)
                .onChange(async value => {
                    if (value) {
                        if (!item.hotkeyModifiers.includes("Alt")) item.hotkeyModifiers.push("Alt");
                    } else {
                        item.hotkeyModifiers = item.hotkeyModifiers.filter(m => m !== "Alt");
                    }
                    await this.plugin.saveSettings();
                    this.plugin.customNoteManager.registerCommands();
                })
            );
            hotkeySetting.controlEl.createSpan({ text: "Alt ", attr: { style: "margin-right: 15px; font-size: 0.9em;" } });

            hotkeySetting.addToggle(toggle => toggle
                .setTooltip("Shift")
                .setValue(isShift)
                .onChange(async value => {
                    if (value) {
                        if (!item.hotkeyModifiers.includes("Shift")) item.hotkeyModifiers.push("Shift");
                    } else {
                        item.hotkeyModifiers = item.hotkeyModifiers.filter(m => m !== "Shift");
                    }
                    await this.plugin.saveSettings();
                    this.plugin.customNoteManager.registerCommands();
                })
            );
            hotkeySetting.controlEl.createSpan({ text: "Shift ", attr: { style: "margin-right: 15px; font-size: 0.9em;" } });

            hotkeySetting.addText(text => text
                .setPlaceholder("Key (e.g. 1, a)")
                .setValue(item.hotkeyKey || "")
                .onChange(async value => {
                    item.hotkeyKey = value;
                    await this.plugin.saveSettings();
                    this.plugin.customNoteManager.registerCommands();
                })
            );
        });

        new Setting(containerEl).setName("Debug").setHeading();
        new Setting(containerEl)
            .setName("This is useful for troubleshooting.")
            .setDesc("This is useful for troubleshooting.")
            .addToggle((cb) => {
                cb.setValue(this.plugin.settings.debug).onChange(async (value) => {
                    this.plugin.settings.debug = value;
                    await this.plugin.saveSettings();
                });
            });
    }
}

function setAttributes(element: HTMLTextAreaElement, attributes: { [x: string]: string }) {
    for (const key in attributes) {
        element.setAttribute(key, attributes[key]);
    }
}
