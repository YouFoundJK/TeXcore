import { type ParamType } from './render';

interface Props {
  startCount: number;
}

export class Progress {
  private container: HTMLDivElement;
  private renderStates: { filename: string; status: number; element?: HTMLDivElement }[] = [];

  constructor(options: { target: HTMLElement; props: Props }) {
    this.container = options.target.createDiv({ cls: 'progress' });
    this.container.setCssStyles({ fontSize: '14px' });
    this.container.createDiv({ text: 'Rendering...' });
  }

  initRenderStates(data: ParamType[]) {
    this.renderStates = [];

    // Clear previous items if any
    const existingItems = this.container.querySelectorAll('.progress-item');
    existingItems.forEach(el => el.remove());

    data.forEach(param => {
      const itemDiv = this.container.createDiv({ cls: 'progress-item' });
      itemDiv.setCssStyles({ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px' });

      const iconSpan = itemDiv.createSpan({ cls: 'progress-icon' });
      // Lucide-like loader SVG (with some basic style to rotate if desired)
      const parser = new DOMParser();
      const doc = parser.parseFromString(
        `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-loader spin-icon" style="animation: spin 1s linear infinite;">
          <path d="M12 2v4"/>
          <path d="m16.2 6.2 2.9-2.9"/>
          <path d="M18 12h4"/>
          <path d="m16.2 17.8 2.9 2.9"/>
          <path d="M12 18v4"/>
          <path d="m4.9 19.1 2.9-2.9"/>
          <path d="M2 12h4"/>
          <path d="m4.9 4.9 2.9 2.9"/>
        </svg>`,
        'image/svg+xml'
      );
      const svg = doc.documentElement;
      iconSpan.appendChild(activeDocument.importNode(svg, true));

      itemDiv.createSpan({ text: param.file.name });

      this.renderStates.push({
        status: 0,
        filename: param.file.name,
        element: itemDiv
      });
    });

    // Ensure CSS keyframes for rotation are added to the document if not present
    if (!activeDocument.getElementById('progress-spin-style')) {
      const style = activeDocument.createElement('style');
      style.id = 'progress-spin-style';
      style.textContent = `
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `;
      activeDocument.head?.appendChild(style);
    }
  }

  updateRenderStates(i: number) {
    if (this.renderStates[i]) {
      this.renderStates[i].status = 1;
      const itemDiv = this.renderStates[i].element;
      if (itemDiv) {
        const iconSpan = itemDiv.querySelector('.progress-icon');
        if (iconSpan) {
          iconSpan.textContent = '';
          const parser = new DOMParser();
          const doc = parser.parseFromString(
            `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-square-check-big" style="color: var(--text-success, #4caf50);">
              <path d="m9 11 3 3L22 4"/>
              <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
            </svg>`,
            'image/svg+xml'
          );
          const svg = doc.documentElement;
          iconSpan.appendChild(activeDocument.importNode(svg, true));
        }
      }
    }
  }

  destroy() {
    if (this.container) {
      this.container.remove();
    }
  }
}
