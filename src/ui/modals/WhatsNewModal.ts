import { App, Modal, ButtonComponent } from 'obsidian';
import { changelogData } from '../../settings/changelogData';
import { t } from '../../i18n/t';

type SettingsManager = {
  open: () => void;
  openTabById: (id: string) => void;
};

type AppWithSettings = App & { setting: SettingsManager };

export class WhatsNewModal extends Modal {
  constructor(
    app: App,
    private manifestId: string
  ) {
    super(app);
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('obsitexcore-whats-new-modal');

    // Header
    const headerRow = contentEl.createDiv('obsitexcore-whats-new-header-row');
    headerRow.createEl('h2', { text: t('modals.whatsNew.title') });

    const seeAllButtonWrap = headerRow.createDiv('obsitexcore-whats-new-header-actions');
    new ButtonComponent(seeAllButtonWrap)
      .setButtonText(t('modals.whatsNew.openSettings'))
      .onClick(() => {
        this.close();
        const settingsManager = (this.app as AppWithSettings).setting;
        if (settingsManager && typeof settingsManager.open === 'function') {
          settingsManager.open();
          settingsManager.openTabById(this.manifestId);
        }
      });

    // Content container
    const bodyEl = contentEl.createDiv('obsitexcore-whats-new-body');
    const latestVersion = changelogData[0];

    const versionHeader = bodyEl.createDiv('obsitexcore-whats-new-version-header');
    versionHeader.createEl('h3', {
      text: `Version ${latestVersion.version} (${latestVersion.date})`
    });

    const changeList = bodyEl.createDiv('obsitexcore-whats-new-list');
    latestVersion.changes.forEach(change => {
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

      const itemEl = changeList.createDiv(`full-calendar-change-item full-calendar-change-type-${change.type}`);
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

    // Donation Footer
    const donationFooter = contentEl.createDiv('obsitexcore-whats-new-donation-footer');
    donationFooter.createEl('p', {
      text: 'ObsiTeXcore is built to bring LaTeX-like equation indexing and referencing workflows to Obsidian. If this plugin provides value to you, please consider supporting the development!',
      cls: 'obsitexcore-whats-new-donation-message'
    });

    const donationActions = donationFooter.createDiv('obsitexcore-whats-new-donation-actions');
    new ButtonComponent(donationActions)
      .setButtonText(t('modals.whatsNew.supportKofi'))
      .setCta()
      .onClick(() => {
        window.open('https://youfoundjk.github.io/ObsiTeXcore/donation/ko-fi', '_blank');
      });
  }

  onClose() {
    this.contentEl.empty();
  }
}
