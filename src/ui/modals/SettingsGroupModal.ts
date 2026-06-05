import { App, Modal, ButtonComponent } from 'obsidian';

export class SettingsGroupModal extends Modal {
  constructor(
    app: App,
    private modalTitle: string,
    private onRender: (bodyEl: HTMLElement) => void,
    private onCloseCallback?: () => void
  ) {
    super(app);
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    this.modalEl.addClass('ofc-settings-modal-wide');

    const shellEl = contentEl.createDiv('ofc-settings-modal-shell');

    // Header
    const headerEl = shellEl.createDiv('modal-header');
    headerEl.createEl('h2', { text: this.modalTitle });

    // Body
    const bodyEl = shellEl.createDiv('ofc-settings-modal-body');
    this.onRender(bodyEl);

    // Footer
    const footerEl = shellEl.createDiv('ofc-settings-modal-footer');
    new ButtonComponent(footerEl)
      .setButtonText('Close')
      .setCta()
      .onClick(() => {
        this.close();
      });
  }

  onClose() {
    this.contentEl.empty();
    if (this.onCloseCallback) {
      this.onCloseCallback();
    }
  }
}
