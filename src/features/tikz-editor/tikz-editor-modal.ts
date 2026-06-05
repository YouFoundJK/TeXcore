import { App, Modal } from 'obsidian';
import LatexReferencer from 'main';
import { AssetsManager } from './assets-manager';
import {
  type EditorElement,
  type ComponentTemplate,
  type TikzEditorContext,
  type SelectedVertex
} from './types';
import { showNotice } from 'utils/obsidian';
import { LeftSidebar } from './components/left-sidebar';
import { CanvasGrid } from './components/canvas-grid';
import { RightSidebar } from './components/right-sidebar';
import { HistoryManager } from './utils/history-manager';
import { TikzCodec } from './utils/tikz-codec';

export class TikzEditorModal extends Modal implements TikzEditorContext {
  // Constants
  public readonly PX_PER_UNIT = 80;
  public readonly ORIGIN_X = 120;
  public readonly ORIGIN_Y = 360;
  public readonly CANVAS_WIDTH = 1120;
  public readonly CANVAS_HEIGHT = 720;
  public readonly DEFAULT_STYLE = {
    bold: false,
    italic: false,
    math: false,
    color: '#f8e7ad',
    fontSize: 12,
    thickness: 1.0
  };

  // State variables
  private elements: EditorElement[] = [];
  private activeTool: 'select' | 'wire' | 'text' | 'erase' = 'select';
  private activeTemplate: ComponentTemplate | null = null;
  private selectedVertices: SelectedVertex[] = [];
  private snapToGrid = true;
  private halfGrid = false;
  private pictureOptions = '';
  private zoom = 1.0;

  // Panning state
  private isSpacePressed = false;
  private isPanning = false;
  private panStartMouse = { x: 0, y: 0 };
  private panStartScroll = { left: 0, top: 0 };

  // Sidebar / library state
  private searchQuery = '';
  private showPackageManager = false;
  private packages: TikzPackage[] = [];
  private installingPackage: string | null = null;
  private pinnedComponents: string[] = [];
  private activeTab: 'edit' | 'code' = 'edit';
  private editableCode = '';
  private codeDirty = false;

  // Helpers / Managers
  private historyManager = new HistoryManager(50);
  private codec!: TikzCodec;

  // Subcomponents
  private leftSidebar!: LeftSidebar;
  private canvasGrid!: CanvasGrid;
  private rightSidebar!: RightSidebar;

  // DOM elements
  private uiEl!: HTMLDivElement;
  private leftSidebarEl!: HTMLDivElement;
  private canvasContainerEl!: HTMLDivElement;
  private canvasWorkspaceEl!: HTMLDivElement;
  private wiresOverlayEl!: SVGElement;
  private rightSidebarEl!: HTMLDivElement;

  constructor(
    app: App,
    private plugin: LatexReferencer,
    private initialSource: string,
    private onSaveCallback?: (newSource: string) => void
  ) {
    super(app);
    this.codec = new TikzCodec(
      x => this.toCanvasX(x),
      y => this.toCanvasY(y),
      x => this.fromCanvasX(x),
      y => this.fromCanvasY(y),
      () => this.createId(),
      this.DEFAULT_STYLE
    );
  }

  // Getters / Setters
  getElements() {
    return this.elements;
  }
  setElements(elements: EditorElement[]) {
    this.elements = elements;
  }
  getActiveTool() {
    return this.activeTool;
  }
  getActiveTemplate() {
    return this.activeTemplate;
  }
  getSelectedVertices() {
    return this.selectedVertices;
  }
  setSelectedVertices(vertices: SelectedVertex[]) {
    this.selectedVertices = vertices;
  }
  isSnapToGrid() {
    return this.snapToGrid;
  }
  isHalfGrid() {
    return this.halfGrid;
  }
  getPictureOptions() {
    return this.pictureOptions;
  }
  getZoom() {
    return this.zoom;
  }
  setZoom(zoom: number) {
    this.zoom = zoom;
  }
  getSearchQuery() {
    return this.searchQuery;
  }
  setSearchQuery(query: string) {
    this.searchQuery = query;
  }
  isShowPackageManager() {
    return this.showPackageManager;
  }
  setShowPackageManager(show: boolean) {
    this.showPackageManager = show;
  }
  getPackages() {
    return this.packages;
  }
  getInstallingPackage() {
    return this.installingPackage;
  }
  getPinnedComponents() {
    return this.pinnedComponents;
  }
  setPinnedComponents(pinned: string[]) {
    this.pinnedComponents = pinned;
  }
  getActiveTab() {
    return this.activeTab;
  }
  getEditableCode() {
    return this.editableCode;
  }
  setEditableCode(code: string) {
    this.editableCode = code;
  }
  isCodeDirty() {
    return this.codeDirty;
  }
  setCodeDirty(dirty: boolean) {
    this.codeDirty = dirty;
  }
  getOnSaveCallback() {
    return this.onSaveCallback;
  }

  // Helper coordinate conversions
  toCanvasX(x: number) {
    return this.ORIGIN_X + x * this.PX_PER_UNIT;
  }

  toCanvasY(y: number) {
    return this.ORIGIN_Y - y * this.PX_PER_UNIT;
  }

  fromCanvasX(x: number) {
    return (x - this.ORIGIN_X) / this.PX_PER_UNIT;
  }

  fromCanvasY(y: number) {
    return -(y - this.ORIGIN_Y) / this.PX_PER_UNIT;
  }

  createId() {
    return 'elem_' + Math.random().toString(36).substring(2, 9);
  }

  // History operations
  saveHistoryState() {
    this.historyManager.saveState(this.elements);
    this.updateHistoryButtons();
  }

  handleUndo() {
    const previous = this.historyManager.undo();
    if (previous !== null) {
      this.elements = previous;
      this.selectedVertices = [];
      this.renderCanvas();
      this.renderRightSidebar();
      this.updateHistoryButtons();
    }
  }

  handleRedo() {
    const next = this.historyManager.redo();
    if (next !== null) {
      this.elements = next;
      this.selectedVertices = [];
      this.renderCanvas();
      this.renderRightSidebar();
      this.updateHistoryButtons();
    }
  }

  updateHistoryButtons() {
    const undoBtn = this.contentEl.querySelector(
      '.tikz-canvas-controls button[title^="Undo"]'
    ) as HTMLButtonElement;
    const redoBtn = this.contentEl.querySelector(
      '.tikz-canvas-controls button[title^="Redo"]'
    ) as HTMLButtonElement;
    if (undoBtn) undoBtn.disabled = !this.historyManager.canUndo();
    if (redoBtn) redoBtn.disabled = !this.historyManager.canRedo();
  }

  handleSelectVertices(vertices: SelectedVertex[]) {
    this.selectedVertices = vertices;
    if (vertices.length > 0) {
      this.activeTool = 'select';
      this.activeTemplate = null;
      this.leftSidebar.updateToolbarClasses();
    }
    this.renderCanvas();
    this.renderRightSidebar();
  }

  handleAddElement(elem: Omit<EditorElement, 'id'>) {
    const newId = this.createId();
    const newElem: EditorElement = {
      ...elem,
      id: newId
    };
    this.elements = [...this.elements, newElem];
    this.selectedVertices =
      newElem.type === 'wire'
        ? [
            { elementId: newId, vertex: 'start' },
            { elementId: newId, vertex: 'end' }
          ]
        : [{ elementId: newId, vertex: 'center' }];

    if (this.activeTool === 'text') {
      this.activeTool = 'select';
      this.activeTemplate = null;
      this.leftSidebar.updateToolbarClasses();
    }

    this.saveHistoryState();
    this.renderCanvas();
    this.renderRightSidebar();
  }

  handleUpdateElementPosition(
    id: string,
    x: number,
    y: number,
    x2?: number,
    y2?: number,
    saveHistory = true
  ) {
    this.elements = this.elements.map(el => {
      if (el.id === id) {
        return { ...el, x, y, x2, y2 };
      }
      return el;
    });
    if (saveHistory) {
      this.saveHistoryState();
    }
    this.renderCanvas();
  }

  handleUpdateElement(updated: EditorElement, saveHistory = true) {
    this.elements = this.elements.map(el => (el.id === updated.id ? updated : el));
    if (saveHistory) {
      this.saveHistoryState();
    }
    this.renderCanvas();
  }

  handleUpdateElements(updatedElements: EditorElement[], saveHistory = true) {
    const updateMap = new Map(updatedElements.map(el => [el.id, el]));
    this.elements = this.elements.map(el => {
      const updated = updateMap.get(el.id);
      return updated ? updated : el;
    });
    if (saveHistory) {
      this.saveHistoryState();
    }
    this.renderCanvas();
  }

  handleDeleteElement(id: string) {
    this.elements = this.elements.filter(el => el.id !== id);
    this.selectedVertices = this.selectedVertices.filter(v => v.elementId !== id);
    this.saveHistoryState();
    this.renderCanvas();
    this.renderRightSidebar();
  }

  handleSelectTool(tool: 'select' | 'wire' | 'text' | 'erase') {
    this.activeTool = tool;
    this.activeTemplate = null;
    this.selectedVertices = [];
    this.leftSidebar.updateToolbarClasses();
    this.renderLeftSidebar();
    this.renderCanvas();
    this.renderRightSidebar();
  }

  handleSelectTemplate(template: ComponentTemplate) {
    this.activeTemplate = template;
    this.selectedElementId = null;
    if (template.type === 'text') {
      this.activeTool = 'text';
    } else if (template.type === 'wire') {
      this.activeTool = 'wire';
    } else {
      this.activeTool = 'select';
    }
    this.leftSidebar.updateToolbarClasses();
    this.renderLeftSidebar();
    this.renderCanvas();
    this.renderRightSidebar();
  }

  generateTikzSource(): string {
    return this.codec.generate(this.elements, this.pictureOptions);
  }

  handleCopyCode() {
    navigator.clipboard.writeText(this.generateTikzSource());
    showNotice('TikZ code copied to clipboard!');
  }

  handleInsertCode() {
    if (this.onSaveCallback) {
      const code =
        this.activeTab === 'code' && this.codeDirty ? this.editableCode : this.generateTikzSource();
      this.onSaveCallback(code);
    }
    this.close();
  }

  async handleInstallPackage(pkgName: string) {
    console.log('[LeftSidebar] handleInstallPackage package:', pkgName);
    this.installingPackage = pkgName;
    this.renderLeftSidebar();
    try {
      const success = await AssetsManager.installPackage(pkgName);
      console.log('[LeftSidebar] handleInstallPackage success status:', success);
      if (success) {
        this.packages = [...AssetsManager.getRegistry()];
      }
    } catch (err) {
      console.error('[LeftSidebar] Error installing package:', pkgName, err);
    } finally {
      this.installingPackage = null;
      this.renderLeftSidebar();
    }
  }

  async handleUninstallPackage(pkgName: string) {
    console.log('[LeftSidebar] handleUninstallPackage package:', pkgName);
    try {
      const success = await AssetsManager.uninstallPackage(pkgName);
      console.log('[LeftSidebar] handleUninstallPackage success status:', success);
      if (success) {
        this.packages = [...AssetsManager.getRegistry()];
      }
    } catch (err) {
      console.error('[LeftSidebar] Error uninstalling package:', pkgName, err);
    } finally {
      this.renderLeftSidebar();
    }
  }

  // Toggles & tab switchers
  toggleSnapToGrid() {
    if (this.snapToGrid) {
      this.setSnappingMode('none');
    } else {
      this.setSnappingMode(this.halfGrid ? 'half' : 'grid');
    }
  }

  toggleHalfGrid() {
    if (this.halfGrid) {
      this.setSnappingMode('grid');
    } else {
      this.setSnappingMode('half');
    }
  }

  setSnappingMode(mode: 'grid' | 'half' | 'none') {
    if (mode === 'grid') {
      this.snapToGrid = true;
      this.halfGrid = false;
    } else if (mode === 'half') {
      this.snapToGrid = true;
      this.halfGrid = true;
    } else {
      this.snapToGrid = false;
    }
    this.renderLeftSidebar();
    this.renderCanvas();
  }

  togglePackageManager() {
    this.showPackageManager = !this.showPackageManager;
    this.renderLeftSidebar();
  }

  switchTab(tab: 'edit' | 'code') {
    this.activeTab = tab;
    if (tab === 'code' && !this.codeDirty) {
      try {
        this.editableCode = this.generateTikzSource();
      } catch (err) {
        console.error('[TikzEditorModal] Error generating TikZ code:', err);
        this.editableCode =
          '% Error generating TikZ code: ' + (err instanceof Error ? err.message : String(err));
      }
    }
    this.renderRightSidebar();
  }

  // Rendering delegates
  renderLeftSidebar() {
    this.leftSidebar.render();
  }
  renderCanvas() {
    this.canvasGrid.render();
  }
  renderRightSidebar() {
    this.rightSidebar.render();
  }

  private handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      console.log('[TikzEditorModal] Escape key pressed manually');
      e.preventDefault();
      e.stopPropagation();
      this.close();
      return;
    }

    // Check if typing in input/textarea
    const activeEl = activeDocument.activeElement;
    if (
      activeEl &&
      (activeEl.tagName === 'INPUT' ||
        activeEl.tagName === 'TEXTAREA' ||
        (activeEl as HTMLElement).isContentEditable)
    ) {
      return;
    }

    if (e.key === ' ' || e.code === 'Space') {
      e.preventDefault();
      if (!this.isSpacePressed) {
        this.isSpacePressed = true;
        this.canvasContainerEl.removeClass('is-grabbing');
        this.canvasContainerEl.addClass('is-grab');
      }
      return;
    }

    const key = e.key.toLowerCase();
    if (key === 'v' || key === 's') {
      e.preventDefault();
      this.handleSelectTool('select');
    } else if (key === 'w') {
      e.preventDefault();
      this.handleSelectTool('wire');
    } else if (key === 't') {
      e.preventDefault();
      this.handleSelectTool('text');
    } else if (key === 'e') {
      e.preventDefault();
      this.handleSelectTool('erase');
    } else if (key === 'g') {
      e.preventDefault();
      this.setSnappingMode('grid');
    } else if (key === 'h') {
      e.preventDefault();
      this.setSnappingMode('half');
    } else if (key === 'u') {
      e.preventDefault();
      this.setSnappingMode('none');
    }
  };

  private handleKeyUp = (e: KeyboardEvent) => {
    if (e.key === ' ' || e.code === 'Space') {
      const activeEl = activeDocument.activeElement;
      if (
        activeEl &&
        (activeEl.tagName === 'INPUT' ||
          activeEl.tagName === 'TEXTAREA' ||
          (activeEl as HTMLElement).isContentEditable)
      ) {
        return;
      }
      this.isSpacePressed = false;
      this.canvasContainerEl.removeClass('is-grab');
      this.canvasContainerEl.removeClass('is-grabbing');
    }
  };

  // Modal Lifecycles
  onOpen() {
    const { contentEl, containerEl } = this;
    contentEl.empty();

    // Debug click interceptor
    this.modalEl.addEventListener(
      'click',
      e => {
        console.log('[TikzEditorDebug] Click target:', e.target);
      },
      true
    );

    // Set custom CSS classes and sizes
    this.modalEl.addClass('tikz-editor-modal');
    containerEl.style.setProperty('--dialog-width', '95vw');
    containerEl.style.setProperty('--dialog-height', '90vh');

    // Title of the modal
    this.titleEl.setText('TikZ Graphical Editor');
    this.titleEl.style.borderBottom = '1px solid var(--border-color)';
    this.titleEl.style.paddingBottom = '10px';
    this.titleEl.style.marginBottom = '0';

    if (this.onSaveCallback) {
      const headerBtn = this.modalEl.createEl('button', {
        cls: 'tikz-header-save-btn',
        text: 'Update Block'
      });
      headerBtn.onclick = () => {
        console.log('[TikzEditorModal] Header Save clicked');
        this.handleInsertCode();
      };
    }

    // Build overall UI layout elements
    this.uiEl = contentEl.createDiv({ cls: 'tikz-editor-ui' });
    this.leftSidebarEl = this.uiEl.createDiv({ cls: 'left-sidebar' });

    // Canvas area wrapper that stays fixed (so floating controls do not scroll)
    const canvasAreaEl = this.uiEl.createDiv({ cls: 'canvas-area' });
    this.canvasContainerEl = canvasAreaEl.createDiv({ cls: 'canvas-grid-container' });

    this.rightSidebarEl = this.uiEl.createDiv({ cls: 'right-sidebar' });

    // Initialize package manager listings
    this.packages = [...AssetsManager.getRegistry()];

    // Add spacebar and shortcut key listeners
    activeDocument.addEventListener('keydown', this.handleKeyDown);
    activeDocument.addEventListener('keyup', this.handleKeyUp);

    // Add manual close button click handler
    const closeBtn = this.modalEl.querySelector('.modal-close-button') as HTMLElement | null;
    if (closeBtn) {
      closeBtn.addEventListener('click', e => {
        console.log('[TikzEditorModal] Close button clicked manually');
        e.preventDefault();
        e.stopPropagation();
        this.close();
      });
    }

    // Parse initial source code if present
    this.elements = [];
    if (this.initialSource) {
      const match = this.initialSource.match(/^\s*%\s*\[ObsiTeXState:(.*)\]\s*$/m);
      if (match && match[1]) {
        try {
          const parsed = JSON.parse(match[1]);
          if (Array.isArray(parsed.elements)) {
            this.elements = parsed.elements;
            this.pictureOptions = parsed.pictureOptions ?? '';
          }
        } catch (e) {
          console.warn('Failed to parse visual state, using fallback parser:', e);
        }
      }

      if (this.elements.length === 0) {
        const parsedResult = this.codec.parse(this.initialSource);
        this.elements = parsedResult.elements;
        this.pictureOptions = parsedResult.pictureOptions;
      }
    }

    // Initial history state
    this.historyManager.clear();
    this.saveHistoryState();

    // Construct Subcomponents
    this.leftSidebar = new LeftSidebar(this, this.leftSidebarEl);
    this.rightSidebar = new RightSidebar(this, this.rightSidebarEl);

    // Build canvas DOM layout inside modal
    this.buildCanvasDOM();

    // Render components
    this.renderLeftSidebar();
    this.renderCanvas();
    this.renderRightSidebar();
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
    this.plugin.isTikzEditorOpen = false;
    this.plugin.updateEditorExtensions();

    // Clean up key listeners
    activeDocument.removeEventListener('keydown', this.handleKeyDown);
    activeDocument.removeEventListener('keyup', this.handleKeyUp);
  }

  // DOM Builders
  private buildCanvasDOM() {
    this.canvasContainerEl.empty();

    // Get the parent canvas-area element to float controls
    const canvasAreaEl = this.canvasContainerEl.parentElement || this.canvasContainerEl;
    canvasAreaEl.querySelectorAll('.tikz-canvas-controls').forEach(el => el.remove());

    // Floating controls
    const controls = canvasAreaEl.createDiv({ cls: 'tikz-canvas-controls' });

    const zoomOutBtn = controls.createEl('button', { title: 'Zoom Out [Ctrl + -]' });
    zoomOutBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="8" y1="11" x2="14" y2="11"/></svg>`;
    zoomOutBtn.onclick = () => {
      this.zoom = Math.max(this.zoom - 0.1, 0.5);
      zoomLabel.textContent = `${Math.round(this.zoom * 100)}%`;
      this.canvasWorkspaceEl.style.transform = `scale(${this.zoom})`;
    };

    const zoomLabel = controls.createSpan({ cls: 'zoom-label', text: '100%' });

    const zoomInBtn = controls.createEl('button', { title: 'Zoom In [Ctrl + +]' });
    zoomInBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/></svg>`;
    zoomInBtn.onclick = () => {
      this.zoom = Math.min(this.zoom + 0.1, 2.0);
      zoomLabel.textContent = `${Math.round(this.zoom * 100)}%`;
      this.canvasWorkspaceEl.style.transform = `scale(${this.zoom})`;
    };

    controls.createDiv({ cls: 'divider' });

    const undoBtn = controls.createEl('button', { title: 'Undo [Ctrl + Z]' });
    undoBtn.disabled = true;
    undoBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"/></svg>`;
    undoBtn.onclick = () => this.handleUndo();

    const redoBtn = controls.createEl('button', { title: 'Redo [Ctrl + Y]' });
    redoBtn.disabled = true;
    redoBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 7v6h-6"/><path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3l3 2.7"/></svg>`;
    redoBtn.onclick = () => this.handleRedo();

    // Workspace
    this.canvasWorkspaceEl = this.canvasContainerEl.createDiv({ cls: 'canvas-workspace' });
    this.canvasWorkspaceEl.style.transformOrigin = '0 0';
    this.canvasWorkspaceEl.style.transform = `scale(${this.zoom})`;

    // Grid lines
    this.canvasWorkspaceEl.createDiv({ cls: 'grid-background' });

    // SVG elements
    const svgNS = 'http://www.w3.org/2000/svg';
    const axisOverlay = activeDocument.createElementNS(svgNS, 'svg');
    axisOverlay.setAttribute('class', 'axis-overlay');
    axisOverlay.setAttribute('width', this.CANVAS_WIDTH.toString());
    axisOverlay.setAttribute('height', this.CANVAS_HEIGHT.toString());
    this.canvasWorkspaceEl.appendChild(axisOverlay);

    this.wiresOverlayEl = activeDocument.createElementNS(svgNS, 'svg') as unknown as SVGElement;
    this.wiresOverlayEl.setAttribute('class', 'wires-overlay');
    this.wiresOverlayEl.setAttribute('width', this.CANVAS_WIDTH.toString());
    this.wiresOverlayEl.setAttribute('height', this.CANVAS_HEIGHT.toString());
    this.canvasWorkspaceEl.appendChild(this.wiresOverlayEl);

    // Instantiate CanvasGrid coordinator
    this.canvasGrid = new CanvasGrid(
      this,
      this.canvasContainerEl,
      this.canvasWorkspaceEl,
      this.wiresOverlayEl
    );

    // Panning handler via spacebar holding
    this.canvasContainerEl.addEventListener(
      'mousedown',
      e => {
        if (this.isSpacePressed) {
          e.preventDefault();
          e.stopPropagation();
          this.isPanning = true;
          this.canvasContainerEl.removeClass('is-grab');
          this.canvasContainerEl.addClass('is-grabbing');
          this.panStartMouse = { x: e.clientX, y: e.clientY };
          this.panStartScroll = {
            left: this.canvasContainerEl.scrollLeft,
            top: this.canvasContainerEl.scrollTop
          };

          const onMouseMove = (moveEvent: MouseEvent) => {
            if (!this.isPanning) return;
            const dx = moveEvent.clientX - this.panStartMouse.x;
            const dy = moveEvent.clientY - this.panStartMouse.y;
            this.canvasContainerEl.scrollLeft = this.panStartScroll.left - dx;
            this.canvasContainerEl.scrollTop = this.panStartScroll.top - dy;
          };

          const onMouseUp = () => {
            this.isPanning = false;
            this.canvasContainerEl.removeClass('is-grabbing');
            if (this.isSpacePressed) {
              this.canvasContainerEl.addClass('is-grab');
            } else {
              this.canvasContainerEl.removeClass('is-grab');
            }
            activeDocument.removeEventListener('mousemove', onMouseMove);
            activeDocument.removeEventListener('mouseup', onMouseUp);
          };

          activeDocument.addEventListener('mousemove', onMouseMove);
          activeDocument.addEventListener('mouseup', onMouseUp);
        }
      },
      true
    ); // Use capture phase to intercept before canvas events

    // Scroll container behavior initial state
    this.canvasContainerEl.scrollLeft = 0;
    this.canvasContainerEl.scrollTop = 0;

    // Mouse wheel zoom listener (centered on cursor)
    this.canvasContainerEl.addEventListener(
      'wheel',
      e => {
        const activeEl = activeDocument.activeElement;
        if (
          activeEl &&
          (activeEl.tagName === 'INPUT' ||
            activeEl.tagName === 'TEXTAREA' ||
            (activeEl as HTMLElement).isContentEditable)
        ) {
          return;
        }
        e.preventDefault();

        const oldZoom = this.zoom;
        const zoomFactor = e.ctrlKey ? 0.05 : 0.03;
        if (e.deltaY < 0) {
          this.zoom = Math.min(this.zoom + zoomFactor, 2.0);
        } else {
          this.zoom = Math.max(this.zoom - zoomFactor, 0.5);
        }

        const zoomLabel = this.contentEl.querySelector('.zoom-label');
        if (zoomLabel) {
          zoomLabel.textContent = `${Math.round(this.zoom * 100)}%`;
        }
        this.canvasWorkspaceEl.style.transform = `scale(${this.zoom})`;

        // Adjust scroll to zoom towards mouse pointer
        const rect = this.canvasContainerEl.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        const canvasX = (mouseX + this.canvasContainerEl.scrollLeft) / oldZoom;
        const canvasY = (mouseY + this.canvasContainerEl.scrollTop) / oldZoom;

        this.canvasContainerEl.scrollLeft = canvasX * this.zoom - mouseX;
        this.canvasContainerEl.scrollTop = canvasY * this.zoom - mouseY;
      },
      { passive: false }
    );
  }
}
