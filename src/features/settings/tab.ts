import { App, PluginSettingTab, Setting } from "obsidian";
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
    }
}
