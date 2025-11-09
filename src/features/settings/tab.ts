import { App, PluginSettingTab, Setting, TextAreaComponent } from "obsidian";
import LatexReferencer from "../../main";
import { NUMBER_STYLES } from "./settings";

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
