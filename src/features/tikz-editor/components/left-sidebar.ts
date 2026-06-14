import { type TikzEditorContext, type ComponentTemplate } from '../types';
import { AssetsManager } from '../assets-manager';

export class LeftSidebar {
  private activeLibraryTab: 'basic' | 'all' = 'basic';

  constructor(
    private context: TikzEditorContext,
    private containerEl: HTMLElement
  ) {}

  public render() {
    this.containerEl.empty();

    // 1. Toolbar
    const toolbar = this.containerEl.createDiv({ cls: 'toolbar' });

    // Helper to add tool button
    const addToolBtn = (
      tool: 'select' | 'wire' | 'text' | 'erase',
      label: string,
      iconHtml: string
    ) => {
      const btn = toolbar.createEl('button', { cls: 'tool-btn', title: label });

      const parser = new DOMParser();
      const doc = parser.parseFromString(iconHtml, 'image/svg+xml');
      btn.appendChild(activeDocument.importNode(doc.documentElement, true));

      if (this.context.getActiveTool() === tool) btn.addClass('active');
      btn.onclick = () => {
        this.context.handleSelectTool(tool);
      };
    };

    addToolBtn(
      'select',
      'Select / Move [V]',
      `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m3 3 7.07 16.97 2.51-7.39 7.39-2.51L3 3z"/><path d="m13 13 6 6"/></svg>`
    );

    // Wire button
    const wireBtn = toolbar.createEl('button', { cls: 'tool-btn', title: 'Wire [w]' });

    wireBtn.createDiv({ cls: 'wire-icon' });
    if (this.context.getActiveTool() === 'wire') wireBtn.addClass('active');
    wireBtn.onclick = () => {
      this.context.handleSelectTool('wire');
    };

    addToolBtn(
      'text',
      'Text [T]',
      `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="4 7 4 4 20 4 20 7"/><line x1="9" y1="20" x2="15" y2="20"/><line x1="12" y1="4" x2="12" y2="20"/></svg>`
    );
    addToolBtn(
      'erase',
      'Eraser [E]',
      `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.4 5.4c1 1 1 2.5 0 3.4L13 21Z"/><path d="M22 21H7"/><path d="m5 11 9 9"/></svg>`
    );

    toolbar.createDiv({ cls: 'divider' });

    // Snap to grid (Full)
    const snapBtn = toolbar.createEl('button', {
      cls: 'tool-btn',
      title: 'Snap to grid (full) [g]'
    });

    const snapParser = new DOMParser();
    const snapDoc = snapParser.parseFromString(
      `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M3 9h18"/><path d="M3 15h18"/><path d="M9 3v18"/><path d="M15 3v18"/></svg>`,
      'image/svg+xml'
    );
    snapBtn.appendChild(activeDocument.importNode(snapDoc.documentElement, true));

    if (this.context.isSnapToGrid() && !this.context.isHalfGrid()) snapBtn.addClass('active');
    snapBtn.onclick = () => {
      this.context.setSnappingMode('grid');
    };

    // Half grid
    const halfGridBtn = toolbar.createEl('button', {
      cls: 'tool-btn text-toggle',
      title: 'Snap to half grid [h]'
    });
    halfGridBtn.textContent = '.5';
    if (this.context.isSnapToGrid() && this.context.isHalfGrid()) halfGridBtn.addClass('active');
    halfGridBtn.onclick = () => {
      this.context.setSnappingMode('half');
    };

    // Unsnapped / Free movement
    const unsnapBtn = toolbar.createEl('button', {
      cls: 'tool-btn',
      title: 'Unsnapped (free movement) [u]'
    });

    const unsnapParser = new DOMParser();
    const unsnapDoc = unsnapParser.parseFromString(
      `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="2" y1="2" x2="22" y2="22"/><path d="M7 21v-8M7 9V3M17 21v-2M17 13V3M3 7h4M13 7h8M3 17h18"/></svg>`,
      'image/svg+xml'
    );
    unsnapBtn.appendChild(activeDocument.importNode(unsnapDoc.documentElement, true));

    if (!this.context.isSnapToGrid()) unsnapBtn.addClass('active');
    unsnapBtn.onclick = () => {
      this.context.setSnappingMode('none');
    };

    // 2. Search
    const searchBox = this.containerEl.createDiv({ cls: 'search-box' });

    const searchIconSpan = searchBox.createEl('span', { cls: 'search-icon' });
    const searchParser = new DOMParser();
    const searchDoc = searchParser.parseFromString(
      `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>`,
      'image/svg+xml'
    );
    searchIconSpan.appendChild(activeDocument.importNode(searchDoc.documentElement, true));
    const searchInput = searchBox.createEl('input', {
      type: 'text',
      placeholder: 'Search for Component...'
    });
    searchInput.value = this.context.getSearchQuery();
    searchInput.oninput = () => {
      this.context.setSearchQuery(searchInput.value);
      this.renderLibraryList();
    };

    // 2.5 Library Tabs
    const tabsContainer = this.containerEl.createDiv({ cls: 'library-tabs' });
    const basicTabBtn = tabsContainer.createEl('button', {
      cls: `tab-btn${this.activeLibraryTab === 'basic' ? ' active' : ''}`,
      text: 'Basic'
    });
    const allTabBtn = tabsContainer.createEl('button', {
      cls: `tab-btn${this.activeLibraryTab === 'all' ? ' active' : ''}`,
      text: 'All'
    });

    basicTabBtn.onclick = () => {
      if (this.activeLibraryTab === 'basic') return;
      this.activeLibraryTab = 'basic';
      basicTabBtn.addClass('active');
      allTabBtn.removeClass('active');
      this.renderLibraryList();
    };

    allTabBtn.onclick = () => {
      if (this.activeLibraryTab === 'all') return;
      this.activeLibraryTab = 'all';
      allTabBtn.addClass('active');
      basicTabBtn.removeClass('active');
      this.renderLibraryList();
    };

    // 3. Component Library List Container
    this.containerEl.createDiv({ cls: 'library' });
    this.renderLibraryList();

    // 4. Packages Footer
    const pkgSection = this.containerEl.createDiv({ cls: 'packages-section' });
    const pkgHeader = pkgSection.createDiv({ cls: 'packages-header' });

    const pkgTitle = pkgHeader.createDiv({ cls: 'title' });

    const pkgTitleSpan = pkgTitle.createSpan();
    const pkgParser = new DOMParser();
    const pkgDoc = pkgParser.parseFromString(
      `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>`,
      'image/svg+xml'
    );
    pkgTitleSpan.appendChild(activeDocument.importNode(pkgDoc.documentElement, true));
    pkgTitle.createSpan({ text: ' Packages' });

    const addPkgBtn = pkgHeader.createEl('button', {
      cls: 'add-pkg-btn',
      title: 'Manage packages'
    });

    const addPkgParser = new DOMParser();
    const addPkgDoc = addPkgParser.parseFromString(
      `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`,
      'image/svg+xml'
    );
    addPkgBtn.appendChild(activeDocument.importNode(addPkgDoc.documentElement, true));
    addPkgBtn.onclick = () => {
      this.context.togglePackageManager();
    };

    // Package popover if active
    if (this.context.isShowPackageManager()) {
      const popover = pkgSection.createDiv({ cls: 'pkg-manager' });
      const popHeader = popover.createDiv({ cls: 'pkg-manager-header' });
      popHeader.createSpan({ text: 'Manage Packages' });

      const closePopover = popHeader.createEl('button', { cls: 'close-btn' });

      closePopover.textContent = '×';
      closePopover.onclick = () => {
        this.context.togglePackageManager();
      };

      const pkgList = popover.createDiv({ cls: 'pkg-list' });
      this.context.getPackages().forEach(pkg => {
        const item = pkgList.createDiv({ cls: 'pkg-item' });
        const info = item.createDiv({ cls: 'pkg-info' });
        info.createDiv({ cls: 'pkg-name', text: pkg.displayName });
        info.createDiv({ cls: 'pkg-status', text: pkg.installed ? 'Installed' : 'Available' });

        const actions = item.createDiv({ cls: 'pkg-actions' });
        if (pkg.installed) {
          const btn = actions.createEl('button', { cls: 'pkg-btn uninstall', text: 'Remove' });
          btn.onclick = () => this.context.handleUninstallPackage(pkg.name);
        } else if (this.context.getInstallingPackage() === pkg.name) {
          const btn = actions.createEl('button', { cls: 'pkg-btn loading' });
          btn.disabled = true;
          const spinSpan = btn.createSpan({ cls: 'spin' });
          const loaderParser = new DOMParser();
          const loaderDoc = loaderParser.parseFromString(
            `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="2" x2="12" y2="6"/><line x1="12" y1="18" x2="12" y2="22"/><line x1="4.93" y1="4.93" x2="7.76" y2="7.76"/><line x1="16.24" y1="16.24" x2="19.07" y2="19.07"/><line x1="2" y1="12" x2="6" y2="12"/><line x1="18" y1="12" x2="22" y2="12"/><line x1="4.93" y1="19.07" x2="7.76" y2="16.24"/><line x1="16.24" y1="7.76" x2="19.07" y2="4.93"/></svg>`,
            'image/svg+xml'
          );
          spinSpan.appendChild(activeDocument.importNode(loaderDoc.documentElement, true));
        } else {
          const btn = actions.createEl('button', { cls: 'pkg-btn install', text: 'Install' });
          btn.onclick = () => this.context.handleInstallPackage(pkg.name);
        }
      });
    }
  }

  private renderLibraryList() {
    const libraryContainer = this.containerEl.querySelector('.library') as HTMLElement;
    if (!libraryContainer) return;
    libraryContainer.empty();

    // Category components builder
    const core = AssetsManager.getCoreComponents();
    const extra = this.context
      .getPackages()
      .filter(p => p.installed)
      .flatMap(p => p.components);
    const all = [...core, ...extra];

    const pinnedComponents = this.context.getPinnedComponents();
    const pinned = all.filter(
      c => pinnedComponents.includes(c.name) && !core.some(coreComp => coreComp.name === c.name)
    );
    const basic = [...core, ...pinned];

    const searchQuery = this.context.getSearchQuery().trim().toLowerCase();

    const categoriesMap = new Map<string, ComponentTemplate[]>();

    if (this.activeLibraryTab === 'basic') {
      // Basic Tab: Show commonly used (basic) components, optionally filtered by search
      const filteredBasic = searchQuery
        ? basic.filter(
            c =>
              c.name.toLowerCase().includes(searchQuery) ||
              c.category.toLowerCase().includes(searchQuery)
          )
        : basic;

      if (filteredBasic.length > 0) {
        categoriesMap.set('Basic', filteredBasic);
      }
    } else {
      // All Tab: Show all components grouped by their categories
      const filteredAll = searchQuery
        ? all.filter(
            c =>
              c.name.toLowerCase().includes(searchQuery) ||
              c.category.toLowerCase().includes(searchQuery)
          )
        : all;

      filteredAll.forEach(c => {
        // Core components are displayed under 'Basic'
        const category = core.some(coreComp => coreComp.name === c.name) ? 'Basic' : c.category;

        if (!categoriesMap.has(category)) {
          categoriesMap.set(category, []);
        }
        const catList = categoriesMap.get(category);
        if (catList && !catList.some(comp => comp.name === c.name)) {
          catList.push(c);
        }
      });
    }

    if (categoriesMap.size === 0) {
      libraryContainer.createDiv({
        cls: 'empty-library',
        text: 'No components found. Try installing packages!'
      });
      return;
    }

    categoriesMap.forEach((comps, category) => {
      const section = libraryContainer.createDiv({ cls: 'category-section' });
      section.createDiv({ cls: 'category-header', text: category });

      const grid = section.createDiv({ cls: 'grid' });
      comps.forEach(comp => {
        const isActive = this.context.getActiveTemplate()?.name === comp.name;
        const card = grid.createDiv({
          cls: `comp-card${isActive ? ' active-template' : ''}`,
          attr: { role: 'button', tabindex: '0', title: `Click to select ${comp.name}` }
        });

        // Pin button for non-core packages if search active
        if (searchQuery.trim() && !core.some(coreComp => coreComp.name === comp.name)) {
          const isPinned = pinnedComponents.includes(comp.name);
          const pinBtn = card.createEl('button', {
            cls: `pin-btn${isPinned ? ' pinned' : ''}`,
            title: isPinned ? 'Pinned in Basic' : 'Pin to Basic'
          });
          const pinParser = new DOMParser();
          const pinDoc = pinParser.parseFromString(
            `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="17" x2="12" y2="22"/><path d="M5 17h14v-1.76a2 2 0 0 0-.44-1.24l-2.78-3.47A2 2 0 0 1 15 9.3V5a2 2 0 0 0-2-2h-2a2 2 0 0 0-2 2v4.3a2 2 0 0 1-.78 1.23l-2.78 3.5a2 2 0 0 0-.44 1.24z"/></svg>`,
            'image/svg+xml'
          );
          pinBtn.appendChild(activeDocument.importNode(pinDoc.documentElement, true));
          pinBtn.onclick = e => {
            e.stopPropagation();
            if (isPinned) {
              this.context.setPinnedComponents(pinnedComponents.filter(name => name !== comp.name));
            } else {
              this.context.setPinnedComponents([...pinnedComponents, comp.name]);
            }
            this.context.renderLeftSidebar();
          };
        }

        const svgContainer = card.createDiv({ cls: 'svg-container' });

        const compSvgParser = new DOMParser();
        const compSvgDoc = compSvgParser.parseFromString(comp.svgMarkup, 'text/html');
        const svgNode = compSvgDoc.querySelector('svg');
        if (svgNode) {
          svgContainer.appendChild(activeDocument.importNode(svgNode, true));
        }
        card.createEl('span', { cls: 'comp-label', text: comp.name });

        card.onclick = () => {
          this.context.handleSelectTemplate(comp);
        };
        card.onkeydown = e => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            this.context.handleSelectTemplate(comp);
          }
        };
      });
    });
  }

  public updateToolbarClasses() {
    const toolbar = this.containerEl.querySelector('.toolbar');
    if (!toolbar) return;
    toolbar.querySelectorAll('.tool-btn').forEach(btn => btn.removeClass('active'));

    const activeTool = this.context.getActiveTool();
    const selectBtn = toolbar.querySelector('button[title^="Select / Move"]');
    const wireBtn = toolbar.querySelector('button[title^="Wire"]');
    const textBtn = toolbar.querySelector('button[title^="Text"]');
    const eraseBtn = toolbar.querySelector('button[title^="Eraser"]');

    if (activeTool === 'select' && selectBtn) selectBtn.addClass('active');
    if (activeTool === 'wire' && wireBtn) wireBtn.addClass('active');
    if (activeTool === 'text' && textBtn) textBtn.addClass('active');
    if (activeTool === 'erase' && eraseBtn) eraseBtn.addClass('active');
  }
}
