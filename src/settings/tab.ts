import { App, PluginSettingTab, Setting, TextAreaComponent, setIcon } from 'obsidian';
import LatexReferencer from 'main';
import { NUMBER_STYLES } from './settings';
import { NoteSuggestModal } from '../ui/custom-notes/modal';
import { setCssProps } from 'utils/obsidian';
import { createDescWithDocs } from './docsLinks';
import { changelogData } from './changelogData';
import { t } from '../i18n/t';
import { SettingsGroupModal } from '../ui/modals/SettingsGroupModal';

type SettingsTabId = 'general' | 'integrations' | 'hotkeys' | 'changelog';

interface TabCategory {
  id: SettingsTabId;
  labelKey: string;
  descKey: string;
}

const TABS: TabCategory[] = [
  {
    id: 'general',
    labelKey: 'settings.tab.general',
    descKey: 'settings.tab.generalDesc'
  },
  {
    id: 'integrations',
    labelKey: 'settings.tab.integrations',
    descKey: 'settings.tab.integrationsDesc'
  },
  {
    id: 'hotkeys',
    labelKey: 'settings.tab.hotkeys',
    descKey: 'settings.tab.hotkeysDesc'
  },
  {
    id: 'changelog',
    labelKey: 'settings.tab.changelog',
    descKey: 'settings.tab.changelogDesc'
  }
];

export class MathSettingTab extends PluginSettingTab {
  private activeTab: SettingsTabId = 'general';
  private searchQuery = '';
  private searchExpanded = false;
  private searchDebounceId: number | null = null;

  constructor(
    app: App,
    public plugin: LatexReferencer
  ) {
    super(app, plugin);
  }

  display() {
    this.render();
  }

  render() {
    const { containerEl } = this;
    containerEl.empty();

    const shellEl = containerEl.createDiv('TeXcore-settings-shell');

    // Header
    const headerEl = shellEl.createDiv('TeXcore-settings-header');
    headerEl.createEl('p', {
      text: t('settings.description'),
      cls: 'TeXcore-settings-header-desc'
    });

    // Tabs & Search row
    const tabsRowEl = shellEl.createDiv('TeXcore-settings-tabs-row');
    const tabsEl = tabsRowEl.createDiv('TeXcore-settings-tabs');

    TABS.forEach(tab => {
      const isActive = tab.id === this.activeTab;
      const button = tabsEl.createEl('button', {
        cls: `full-calendar-settings-tab${isActive ? ' is-active' : ''}`,
        text: t(tab.labelKey)
      });
      button.type = 'button';
      button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
      button.addEventListener('click', () => {
        if (this.activeTab === tab.id) return;
        this.activeTab = tab.id;
        this.render();
      });
    });

    // Search wrap
    const searchWrapEl = tabsRowEl.createDiv('TeXcore-settings-search-wrap');

    const searchButtonEl = searchWrapEl.createEl('button', {
      cls: 'clickable-icon TeXcore-settings-search-trigger'
    });
    searchButtonEl.type = 'button';
    searchButtonEl.ariaLabel = 'Search settings';
    setIcon(searchButtonEl, 'search');

    const inputWrapEl = searchWrapEl.createDiv('TeXcore-settings-search-input-wrap');
    setCssProps(inputWrapEl, {
      position: 'relative',
      width: this.searchExpanded || this.searchQuery ? '170px' : '0px',
      overflow: 'hidden',
      transition: 'width 140ms ease'
    });

    const searchInputEl = inputWrapEl.createEl('input', {
      cls: 'TeXcore-settings-search-input'
    });
    searchInputEl.type = 'text';
    searchInputEl.placeholder = 'Search settings...';
    searchInputEl.value = this.searchQuery;

    const clearButtonEl = inputWrapEl.createEl('button', {
      cls: 'clickable-icon TeXcore-settings-search-clear'
    });
    clearButtonEl.type = 'button';
    clearButtonEl.ariaLabel = 'Clear search';
    setCssProps(clearButtonEl, {
      position: 'absolute',
      right: '6px',
      top: '50%',
      transform: 'translateY(-50%)',
      display: this.searchQuery ? 'inline-flex' : 'none'
    });
    setIcon(clearButtonEl, 'x');

    const renderSearchResults = () => {
      this.renderSettingsContent(contentEl);
      setCssProps(clearButtonEl, { display: this.searchQuery ? 'inline-flex' : 'none' });
      setCssProps(searchButtonEl, {
        display: this.searchExpanded || !!this.searchQuery ? 'none' : 'inline-flex'
      });
      searchButtonEl.toggleClass('is-active', this.searchExpanded || !!this.searchQuery);
      inputWrapEl.toggleClass('is-active-query', !!this.searchQuery);
    };

    searchButtonEl.addEventListener('click', () => {
      this.searchExpanded = true;
      setCssProps(inputWrapEl, { width: '170px' });
      setCssProps(searchButtonEl, { display: 'none' });
      searchInputEl.focus();
      searchButtonEl.toggleClass('is-active', true);
    });

    searchInputEl.addEventListener('blur', () => {
      if (this.searchQuery) return;
      this.searchExpanded = false;
      setCssProps(inputWrapEl, { width: '0px' });
      setCssProps(searchButtonEl, { display: 'inline-flex' });
      searchButtonEl.toggleClass('is-active', false);
    });

    searchInputEl.addEventListener('input', () => {
      this.searchQuery = searchInputEl.value;
      if (this.searchDebounceId !== null) {
        window.clearTimeout(this.searchDebounceId);
      }
      this.searchDebounceId = window.setTimeout(renderSearchResults, 80);
    });

    clearButtonEl.addEventListener('mousedown', evt => {
      evt.preventDefault();
      this.searchQuery = '';
      searchInputEl.value = '';
      renderSearchResults();
      searchInputEl.focus();
    });

    // Content Panel
    const contentEl = shellEl.createDiv('TeXcore-settings-content');
    this.renderSettingsContent(contentEl);

    // Footer
    this.renderFooter(shellEl);
  }

  private renderSettingsContent(containerEl: HTMLElement): void {
    containerEl.empty();
    const query = this.searchQuery.trim();

    if (!query) {
      const activeTab = TABS.find(t => t.id === this.activeTab);
      if (activeTab) {
        const introEl = containerEl.createDiv('TeXcore-settings-category-intro');
        introEl.createEl('p', { text: t(activeTab.descKey) });
      }
      const panelEl = containerEl.createDiv('TeXcore-settings-panel');
      this.renderCategoryContent(this.activeTab, panelEl);
      return;
    }

    let hasAnyMatches = false;
    for (const tab of TABS) {
      if (tab.id === 'changelog') continue; // Skip changelog in search filters

      const sectionEl = containerEl.createDiv('TeXcore-settings-search-section');
      const introEl = sectionEl.createDiv('TeXcore-settings-category-intro');
      new Setting(introEl).setName(t(tab.labelKey)).setHeading();
      introEl.createEl('p', { text: t(tab.descKey) });

      const panelEl = sectionEl.createDiv('TeXcore-settings-panel');
      this.renderCategoryContent(tab.id, panelEl);

      const sectionHasMatches = this.applySearchFilter(panelEl, query);
      if (!sectionHasMatches) {
        sectionEl.remove();
      } else {
        hasAnyMatches = true;
      }
    }

    if (!hasAnyMatches) {
      const emptyEl = containerEl.createDiv('TeXcore-settings-search-empty');
      emptyEl.createEl('p', { text: `No settings match "${query}".` });
    }
  }

  private renderCategoryContent(tabId: SettingsTabId, panelEl: HTMLElement): void {
    switch (tabId) {
      case 'general':
        this.renderGeneral(panelEl);
        break;
      case 'integrations':
        this.renderIntegrations(panelEl);
        break;
      case 'hotkeys':
        this.renderHotkeys(panelEl);
        break;
      case 'changelog':
        this.renderChangelog(panelEl);
        break;
    }
  }

  private renderGeneral(containerEl: HTMLElement): void {
    const isSearching = !!this.searchQuery.trim();

    if (isSearching) {
      this.renderDetailedGeneralSettings(containerEl);
      this.renderDetailedAutocompleteSettings(containerEl);
      return;
    }

    new Setting(containerEl)
      .setName('Equation numbering & referencing')
      .setDesc(
        'Configure automatic numbering prefixes, suffixes, initial counts, styles, and link formatting.'
      )
      .addExtraButton(button => {
        button
          .setIcon('gear')
          .setTooltip('Configure options')
          .onClick(() => {
            new SettingsGroupModal(this.app, 'Equation Numbering & Referencing', bodyEl =>
              this.renderDetailedGeneralSettings(bodyEl)
            ).open();
          });
      });

    new Setting(containerEl)
      .setName('Autocomplete & search')
      .setDesc('Configure triggers, autocompletion options, and rendering behaviors.')
      .addExtraButton(button => {
        button
          .setIcon('gear')
          .setTooltip('Configure options')
          .onClick(() => {
            new SettingsGroupModal(this.app, 'Autocomplete & Search', bodyEl =>
              this.renderDetailedAutocompleteSettings(bodyEl)
            ).open();
          });
      });
  }

  private renderDetailedGeneralSettings(containerEl: HTMLElement): void {
    new Setting(containerEl).setName('Equation numbering & referencing').setHeading();

    new Setting(containerEl)
      .setName('Number only referenced equations')
      .setDesc(
        createDescWithDocs(
          'If turned on, only equations that are referenced somewhere will be numbered.',
          [{ text: 'Learn more', path: 'features/equations/' }]
        )
      )
      .addToggle(toggle =>
        toggle
          .setValue(this.plugin.settings.numberOnlyReferencedEquations)
          .onChange(async value => {
            this.plugin.settings.numberOnlyReferencedEquations = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl).setName('Equation number prefix').addText(text =>
      text.setValue(this.plugin.settings.eqNumberPrefix).onChange(async value => {
        this.plugin.settings.eqNumberPrefix = value;
        await this.plugin.saveSettings();
      })
    );

    new Setting(containerEl).setName('Equation number suffix').addText(text =>
      text.setValue(this.plugin.settings.eqNumberSuffix).onChange(async value => {
        this.plugin.settings.eqNumberSuffix = value;
        await this.plugin.saveSettings();
      })
    );

    new Setting(containerEl).setName('Equation number initial count').addText(text =>
      text.setValue(String(this.plugin.settings.eqNumberInit)).onChange(async value => {
        const num = parseInt(value);
        if (!isNaN(num)) {
          this.plugin.settings.eqNumberInit = num;
          await this.plugin.saveSettings();
        }
      })
    );

    new Setting(containerEl).setName('Equation number style').addDropdown(dropdown => {
      for (const style of NUMBER_STYLES) {
        dropdown.addOption(style, style);
      }
      dropdown.setValue(this.plugin.settings.eqNumberStyle).onChange(async value => {
        this.plugin.settings.eqNumberStyle = value as (typeof NUMBER_STYLES)[number];
        await this.plugin.saveSettings();
      });
    });

    new Setting(containerEl).setName('Reference link prefix').addText(text =>
      text.setValue(this.plugin.settings.eqRefPrefix).onChange(async value => {
        this.plugin.settings.eqRefPrefix = value;
        await this.plugin.saveSettings();
      })
    );

    new Setting(containerEl).setName('Reference link suffix').addText(text =>
      text.setValue(this.plugin.settings.eqRefSuffix).onChange(async value => {
        this.plugin.settings.eqRefSuffix = value;
        await this.plugin.saveSettings();
      })
    );

    new Setting(containerEl)
      .setName('Show note title in equation link')
      .setDesc('If turned on, a link to an equation will be like "note title > (1.1)".')
      .addToggle(toggle =>
        toggle.setValue(this.plugin.settings.noteTitleInEquationLink).onChange(async value => {
          this.plugin.settings.noteTitleInEquationLink = value;
          await this.plugin.saveSettings();
        })
      );
  }

  private renderDetailedAutocompleteSettings(containerEl: HTMLElement): void {
    new Setting(containerEl).setName('Autocomplete & search').setHeading();

    new Setting(containerEl)
      .setName('Enable autocompletion')
      .setDesc(
        createDescWithDocs('Enable auto-suggestions for equations and theorems as you type.', [
          { text: 'Learn more', path: 'features/search/' }
        ])
      )
      .addToggle(toggle =>
        toggle.setValue(this.plugin.settings.enableSuggest).onChange(async value => {
          this.plugin.settings.enableSuggest = value;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl).setName('Trigger for autocompletion').addText(text =>
      text.setValue(this.plugin.settings.triggerSuggest).onChange(async value => {
        this.plugin.settings.triggerSuggest = value;
        await this.plugin.saveSettings();
      })
    );

    new Setting(containerEl).setName('Render math in suggestions').addToggle(toggle =>
      toggle.setValue(this.plugin.settings.renderMathInSuggestion).onChange(async value => {
        this.plugin.settings.renderMathInSuggestion = value;
        await this.plugin.saveSettings();
      })
    );
  }

  private renderDetailedZoteroSettings(containerEl: HTMLElement): void {
    new Setting(containerEl).setName('Zotero cleanup').setHeading();

    new Setting(containerEl)
      .setName('Enable Zotero cleanup')
      .setDesc('Enable the command to remove duplicate Zotero annotations in your active notes.')
      .addToggle(toggle =>
        toggle.setValue(this.plugin.settings.enableZoteroCleanup).onChange(async value => {
          this.plugin.settings.enableZoteroCleanup = value;
          await this.plugin.saveSettings();
          this.plugin.registerZoteroCommand();
        })
      );

    new Setting(containerEl)
      .setName('Directories to search')
      .setDesc(
        "Comma-separated list of directories to search recursively for Zotero annotations (e.g. 'Zotero,notes/readings')."
      )
      .addTextArea(textArea => {
        textArea.setValue(this.plugin.settings.zoteroCleanDirectories).onChange(async value => {
          this.plugin.settings.zoteroCleanDirectories = value;
          await this.plugin.saveSettings();
        });
        textArea.inputEl.setAttr('rows', 3);
      });
  }

  private renderDetailedPdfSettings(containerEl: HTMLElement): void {
    new Setting(containerEl).setName('Pdf export').setHeading();

    new Setting(containerEl)
      .setName('Add file name as title')
      .setDesc(
        createDescWithDocs('Add the current file name as the heading/title in exported PDFs.', [
          { text: 'Learn more', path: 'features/pdf-export/' }
        ])
      )
      .addToggle(toggle =>
        toggle.setValue(this.plugin.settings.showTitle).onChange(async value => {
          this.plugin.settings.showTitle = value;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl).setName('Display headers').addToggle(toggle =>
      toggle.setValue(this.plugin.settings.displayHeader).onChange(async value => {
        this.plugin.settings.displayHeader = value;
        await this.plugin.saveSettings();
      })
    );

    new Setting(containerEl).setName('Display footer').addToggle(toggle =>
      toggle.setValue(this.plugin.settings.displayFooter).onChange(async value => {
        this.plugin.settings.displayFooter = value;
        await this.plugin.saveSettings();
      })
    );

    new Setting(containerEl)
      .setName('Print background')
      .setDesc('Whether to print background graphics')
      .addToggle(toggle =>
        toggle.setValue(this.plugin.settings.printBackground).onChange(async value => {
          this.plugin.settings.printBackground = value;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName('Generate tagged pdf')
      .setDesc(
        'Whether or not to generate a tagged (accessible) pdf. Defaults to false. As this property is experimental, the generated pdf may not adhere fully to pdf/ua and wcag standards.'
      )
      .addToggle(toggle =>
        toggle.setValue(this.plugin.settings.generateTaggedPDF).onChange(async value => {
          this.plugin.settings.generateTaggedPDF = value;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl).setName('Max headings level of the outline').addDropdown(dropdown => {
      dropdown
        .addOptions(
          Object.fromEntries(['1', '2', '3', '4', '5', '6'].map(level => [level, `h${level}`]))
        )
        .setValue(this.plugin.settings.maxLevel)
        .onChange(async (value: string) => {
          this.plugin.settings.maxLevel = value;
          await this.plugin.saveSettings();
        });
    });

    new Setting(containerEl)
      .setName('Pdf metadata')
      .setDesc('Add frontMatter(title, author, keywords, subject creator, etc) to pdf metadata')
      .addToggle(toggle =>
        toggle.setValue(this.plugin.settings.displayMetadata).onChange(async value => {
          this.plugin.settings.displayMetadata = value;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl).setName('Advanced').setHeading();

    const headerContentAreaSetting = new Setting(containerEl);
    setCssProps(headerContentAreaSetting.settingEl, {
      display: 'grid',
      'grid-template-columns': '1fr'
    });
    headerContentAreaSetting
      .setName('Header template')
      .setDesc(
        'HTML template for the print header. ' +
          'Should be valid HTML markup with following classes used to inject printing values into them: ' +
          'date (formatted print date), title (document title), url (document location), pageNumber (current page number) and totalPages (total pages in the document). For example, <span class="title"></span> would generate span containing the title.'
      );
    const hederContentArea = new TextAreaComponent(headerContentAreaSetting.controlEl);

    setCssProps(hederContentArea.inputEl, {
      'margin-top': '12px',
      width: '100%',
      height: '6vh'
    });
    hederContentArea.setValue(this.plugin.settings.headerTemplate).onChange(async value => {
      this.plugin.settings.headerTemplate = value;
      await this.plugin.saveSettings();
    });

    const footerContentAreaSetting = new Setting(containerEl);
    setCssProps(footerContentAreaSetting.settingEl, {
      display: 'grid',
      'grid-template-columns': '1fr'
    });
    footerContentAreaSetting
      .setName('Footer template')
      .setDesc(
        'Html template for the print footer. Should use the same format as the headerTemplate.'
      );
    const footerContentArea = new TextAreaComponent(footerContentAreaSetting.controlEl);

    setCssProps(footerContentArea.inputEl, {
      'margin-top': '12px',
      width: '100%',
      height: '6vh'
    });
    footerContentArea.setValue(this.plugin.settings.footerTemplate).onChange(async value => {
      this.plugin.settings.footerTemplate = value;
      await this.plugin.saveSettings();
    });

    new Setting(containerEl)
      .setName('Add timestamp to output file name')
      .setDesc('Add timestamp to output file name')
      .addToggle(cb => {
        cb.setValue(this.plugin.settings.isTimestamp).onChange(async value => {
          this.plugin.settings.isTimestamp = value;
          await this.plugin.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName('Select the css snippet that are not enabled')
      .setDesc('Select the css snippet that are not enabled')
      .addToggle(cb => {
        cb.setValue(this.plugin.settings.enabledCss).onChange(async value => {
          this.plugin.settings.enabledCss = value;
          await this.plugin.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName('Limit the number of concurrent renders')
      .setDesc('Limit the number of concurrent renders')
      .addText(cb => {
        const concurrency = this.plugin.settings?.concurrency;
        cb.setValue(concurrency?.length > 0 ? concurrency : '5').onChange(async value => {
          this.plugin.settings.concurrency = value;
          await this.plugin.saveSettings();
        });
      });
  }

  private renderDetailedTikzSettings(containerEl: HTMLElement): void {
    new Setting(containerEl).setName('TikZJax rendering').setHeading();

    new Setting(containerEl)
      .setName('Enable TikZ rendering')
      .setDesc(
        'Renders ```tikz code blocks into diagrams using TikZJax (requires an internet connection on first run to fetch WebAssembly resources).'
      )
      .addToggle(toggle =>
        toggle.setValue(this.plugin.settings.enableTikzjax).onChange(async value => {
          this.plugin.settings.enableTikzjax = value;
          await this.plugin.saveSettings();
          if (value) {
            await this.plugin.initTikzRenderer();
          }
        })
      );

    new Setting(containerEl)
      .setName('Invert dark colors in dark mode')
      .setDesc(
        "Automatically maps hardcoded dark colors (like black) to currentColor so they adapt to Obsidian's dark theme."
      )
      .addToggle(toggle =>
        toggle.setValue(this.plugin.settings.invertColorsInDarkMode).onChange(async value => {
          this.plugin.settings.invertColorsInDarkMode = value;
          await this.plugin.saveSettings();
        })
      );
  }

  private renderIntegrations(containerEl: HTMLElement): void {
    const isSearching = !!this.searchQuery.trim();

    if (isSearching) {
      this.renderDetailedPdfSettings(containerEl);
      this.renderDetailedTikzSettings(containerEl);
      this.renderDetailedZoteroSettings(containerEl);
      return;
    }

    new Setting(containerEl)
      .setName('Pdf export options')
      .setDesc('Configure layout, templates, and rendering limits for pdf exports.')
      .addExtraButton(button => {
        button
          .setIcon('gear')
          .setTooltip('Configure options')
          .onClick(() => {
            new SettingsGroupModal(this.app, 'PDF Export Options', bodyEl =>
              this.renderDetailedPdfSettings(bodyEl)
            ).open();
          });
      });

    new Setting(containerEl)
      .setName('Tikzjax rendering')
      .setDesc('Configure TikZ rendering options and dark mode behavior.')
      .addExtraButton(button => {
        button
          .setIcon('gear')
          .setTooltip('Configure options')
          .onClick(() => {
            new SettingsGroupModal(this.app, 'TikZJax Rendering Options', bodyEl =>
              this.renderDetailedTikzSettings(bodyEl)
            ).open();
          });
      });

    new Setting(containerEl)
      .setName('Zotero cleanup')
      .setDesc('Configure Zotero search directories and automatic annotations cleanup.')
      .addExtraButton(button => {
        button
          .setIcon('gear')
          .setTooltip('Configure options')
          .onClick(() => {
            new SettingsGroupModal(this.app, 'Zotero Cleanup Options', bodyEl =>
              this.renderDetailedZoteroSettings(bodyEl)
            ).open();
          });
      });
  }

  private renderHotkeys(containerEl: HTMLElement): void {
    new Setting(containerEl).setName('Custom note hotkeys').setHeading();
    containerEl.createEl('p', {
      text: "Configure hotkeys to quickly open specific notes in your vault. You can define optional default hotkeys here, and further customize or rebind them within Obsidian's global 'hotkeys' settings.",
      cls: 'setting-item-description'
    });

    new Setting(containerEl)
      .setName('Add new hotkey mapping')
      .setDesc(
        createDescWithDocs('Create a new shortcut command to open a specific note.', [
          { text: 'Learn more', path: 'features/snippets/' }
        ])
      )
      .addButton(btn =>
        btn.onClick(async () => {
          if (!this.plugin.settings.customNoteHotkeys) {
            this.plugin.settings.customNoteHotkeys = [];
          }
          this.plugin.settings.customNoteHotkeys.push({
            id: Date.now().toString(),
            notePath: '',
            name: '',
            hotkeyModifiers: ['Mod'],
            hotkeyKey: ''
          });
          await this.plugin.saveSettings();
          this.plugin.customNoteManager.registerCommands();
          this.render();
        })
      );

    const hotkeys = this.plugin.settings.customNoteHotkeys || [];
    hotkeys.forEach((item, index) => {
      const hotkeyContainer = containerEl.createEl('div', {
        cls: 'custom-note-hotkey-item'
      });
      setCssProps(hotkeyContainer, {
        border: '1px solid var(--background-modifier-border)',
        padding: '15px',
        'margin-bottom': '15px',
        'border-radius': '8px',
        'background-color': 'var(--background-primary-alt)'
      });

      const titleRow = hotkeyContainer.createEl('div');
      setCssProps(titleRow, {
        display: 'flex',
        'justify-content': 'space-between',
        'align-items': 'center',
        'margin-bottom': '10px'
      });
      titleRow.createEl('strong', { text: `Hotkey Mapping #${index + 1}` });

      const deleteBtn = titleRow.createEl('button', {
        text: 'Delete',
        cls: 'mod-warning'
      });
      setCssProps(deleteBtn, {
        'background-color': 'var(--background-modifier-error)',
        color: 'var(--text-on-accent)'
      });
      deleteBtn.addEventListener('click', () => {
        void (async () => {
          hotkeys.splice(index, 1);
          await this.plugin.saveSettings();
          this.plugin.customNoteManager.registerCommands();
          this.render();
        })();
      });

      new Setting(hotkeyContainer)
        .setName('Friendly name')
        .setDesc("A clear label for the Obsidian command (e.g. 'daily planner').")
        .addText(text =>
          text
            .setPlaceholder('E.g. My note')
            .setValue(item.name)
            .onChange(async value => {
              item.name = value;
              await this.plugin.saveSettings();
              this.plugin.customNoteManager.registerCommands();
            })
        );

      const pathSetting = new Setting(hotkeyContainer)
        .setName('Note path')
        .setDesc('The relative vault path to the target Markdown note.');

      pathSetting.addText(text => {
        text
          .setPlaceholder('e.g. Folder/My Note.md')
          .setValue(item.notePath)
          .onChange(async value => {
            item.notePath = value;
            await this.plugin.saveSettings();
            this.plugin.customNoteManager.registerCommands();
          });

        pathSetting.addButton(btn =>
          btn
            .setIcon('search')
            .setTooltip('Browse/search vault notes')
            .onClick(() => {
              new NoteSuggestModal(this.app, file => {
                void (async () => {
                  text.setValue(file.path);
                  item.notePath = file.path;
                  await this.plugin.saveSettings();
                  this.plugin.customNoteManager.registerCommands();
                })();
              }).open();
            })
        );
      });

      const hotkeySetting = new Setting(hotkeyContainer)
        .setName('Default hotkey')
        .setDesc("Select modifiers and input a key (e.g., '1', 'a') to assign a default shortcut.");

      const isMod = item.hotkeyModifiers.includes('Mod');
      const isAlt = item.hotkeyModifiers.includes('Alt');
      const isShift = item.hotkeyModifiers.includes('Shift');

      hotkeySetting.addToggle(toggle =>
        toggle
          .setTooltip('Ctrl / cmd (mod)')
          .setValue(isMod)
          .onChange(async value => {
            if (value) {
              if (!item.hotkeyModifiers.includes('Mod')) item.hotkeyModifiers.push('Mod');
            } else {
              item.hotkeyModifiers = item.hotkeyModifiers.filter(m => m !== 'Mod');
            }
            await this.plugin.saveSettings();
            this.plugin.customNoteManager.registerCommands();
          })
      );
      const span1 = hotkeySetting.controlEl.createSpan({
        text: 'Ctrl/Cmd '
      });
      setCssProps(span1, { 'margin-right': '15px', 'font-size': '0.9em' });

      hotkeySetting.addToggle(toggle =>
        toggle
          .setTooltip('Alt')
          .setValue(isAlt)
          .onChange(async value => {
            if (value) {
              if (!item.hotkeyModifiers.includes('Alt')) item.hotkeyModifiers.push('Alt');
            } else {
              item.hotkeyModifiers = item.hotkeyModifiers.filter(m => m !== 'Alt');
            }
            await this.plugin.saveSettings();
            this.plugin.customNoteManager.registerCommands();
          })
      );
      const span2 = hotkeySetting.controlEl.createSpan({
        text: 'Alt '
      });
      setCssProps(span2, { 'margin-right': '15px', 'font-size': '0.9em' });

      hotkeySetting.addToggle(toggle =>
        toggle
          .setTooltip('Shift')
          .setValue(isShift)
          .onChange(async value => {
            if (value) {
              if (!item.hotkeyModifiers.includes('Shift')) item.hotkeyModifiers.push('Shift');
            } else {
              item.hotkeyModifiers = item.hotkeyModifiers.filter(m => m !== 'Shift');
            }
            await this.plugin.saveSettings();
            this.plugin.customNoteManager.registerCommands();
          })
      );
      const span3 = hotkeySetting.controlEl.createSpan({
        text: 'Shift '
      });
      setCssProps(span3, { 'margin-right': '15px', 'font-size': '0.9em' });

      hotkeySetting.addText(text =>
        text
          .setPlaceholder('Key (e.g. 1, a)')
          .setValue(item.hotkeyKey || '')
          .onChange(async value => {
            item.hotkeyKey = value;
            await this.plugin.saveSettings();
            this.plugin.customNoteManager.registerCommands();
          })
      );
    });

    new Setting(containerEl).setName('Debug').setHeading();
    new Setting(containerEl)
      .setName('This is useful for troubleshooting.')
      .setDesc('This is useful for troubleshooting.')
      .addToggle(cb => {
        cb.setValue(this.plugin.settings.debug).onChange(async value => {
          this.plugin.settings.debug = value;
          await this.plugin.saveSettings();
        });
      });
  }

  private renderChangelog(containerEl: HTMLElement): void {
    new Setting(containerEl).setName(t('settings.header.whatsNew')).setHeading();
    const changelogList = containerEl.createDiv('TeXcore-changelog-view-list');

    changelogData.forEach(version => {
      const verContainer = changelogList.createDiv('TeXcore-changelog-version-container');
      new Setting(verContainer)
        .setName(`Version ${version.version} (${version.date})`)
        .setHeading();

      version.changes.forEach(change => {
        const colonIndex = change.description.indexOf(':');
        let title: string;
        let desc = change.description;
        if (colonIndex !== -1) {
          title = change.description.substring(0, colonIndex).trim();
          desc = change.description.substring(colonIndex + 1).trim();
        } else {
          title = change.type.charAt(0).toUpperCase() + change.type.slice(1);
        }

        let emoji = '✨';
        if (change.type === 'new') {
          emoji = '🚀';
        } else if (change.type === 'fix') {
          emoji = '🛠️';
        }

        const itemEl = verContainer.createDiv(
          `full-calendar-change-item full-calendar-change-type-${change.type}`
        );
        itemEl.createDiv({
          cls: 'full-calendar-change-icon',
          text: emoji
        });
        const contentWrap = itemEl.createDiv('change-content');
        contentWrap.createDiv({
          cls: 'full-calendar-change-title',
          text: title
        });
        contentWrap.createDiv({
          cls: 'full-calendar-change-description',
          text: desc
        });
      });
    });
  }

  private renderFooter(containerEl: HTMLElement): void {
    const footerEl = containerEl.createDiv({ cls: 'full-calendar-settings-footer' });
    footerEl.createEl('p', {
      text: t('settings.footer.question'),
      cls: 'full-calendar-settings-footer-text'
    });

    const linksContainer = footerEl.createDiv({ cls: 'full-calendar-settings-footer-links' });

    linksContainer.createEl('a', {
      text: t('settings.footer.supportOnKofi'),
      attr: {
        href: 'https://youfoundjk.github.io/TeXcore/donation/ko-fi'
      },
      cls: 'full-calendar-settings-footer-link'
    });
    linksContainer.createEl('a', {
      text: t('settings.footer.suggestFeature'),
      attr: {
        href: 'https://github.com/YouFoundJK/TeXcore/discussions'
      },
      cls: 'full-calendar-settings-footer-link'
    });
    linksContainer.createEl('a', {
      text: t('settings.footer.reportBug'),
      attr: {
        href: 'https://github.com/YouFoundJK/TeXcore/issues'
      },
      cls: 'full-calendar-settings-footer-link'
    });
  }

  private applySearchFilter(containerEl: HTMLElement, query: string): boolean {
    const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
    const settingEls = Array.from(containerEl.querySelectorAll<HTMLElement>('.setting-item'));

    let visibleCount = 0;
    settingEls.forEach(settingEl => {
      const titleEl = settingEl.querySelector<HTMLElement>('.setting-item-name');
      const descriptionEl = settingEl.querySelector<HTMLElement>('.setting-item-description');
      const title = titleEl?.textContent ?? '';
      const description = descriptionEl?.textContent ?? '';
      const haystack = `${title} ${description}`.toLowerCase();

      const isMatch = tokens.every(token => haystack.includes(token));
      setCssProps(settingEl, { display: isMatch ? '' : 'none' });
      if (isMatch) {
        this.highlightSearchTokens(titleEl, tokens);
        this.highlightSearchTokens(descriptionEl, tokens);
        visibleCount += 1;
      }
    });

    return visibleCount > 0;
  }

  private highlightSearchTokens(el: HTMLElement | null, tokens: string[]): void {
    if (!el) return;
    const rawText = el.textContent ?? '';
    if (!rawText || tokens.length === 0) return;

    const escapedTokens = tokens
      .filter(Boolean)
      .map(token => token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    if (escapedTokens.length === 0) return;

    const regex = new RegExp(`(${escapedTokens.join('|')})`, 'gi');
    const doc = window.activeDocument ?? window.document;
    const fragment = doc.createDocumentFragment();
    let lastIndex = 0;

    for (const match of rawText.matchAll(regex)) {
      const matchText = match[0];
      const matchIndex = match.index ?? -1;
      if (matchIndex < 0) continue;

      if (matchIndex > lastIndex) {
        fragment.append(rawText.slice(lastIndex, matchIndex));
      }

      const markEl = doc.createElement('mark');
      markEl.textContent = matchText;
      fragment.append(markEl);
      lastIndex = matchIndex + matchText.length;
    }

    if (lastIndex < rawText.length) {
      fragment.append(rawText.slice(lastIndex));
    }

    el.empty();
    el.append(fragment);
  }
}
