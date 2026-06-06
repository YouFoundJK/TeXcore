export interface EditorElementStyle {
  bold: boolean;
  italic: boolean;
  math: boolean;
  color: string;
  fontSize: number; // in pt
  thickness?: number; // line width in pt
}

export interface EditorElement {
  id: string;
  type: string; // 'text' | 'wire' | 'component'
  name: string; // Display name
  x: number; // grid units or px
  y: number;
  x2?: number; // for wire/line
  y2?: number;
  label: string;
  rotation: number; // in degrees
  style: EditorElementStyle;
  svgMarkup: string; // Inline SVG markup for display
  tikzCommand: string; // TikZ / CircuiTikZ source snippet
  radius?: number; // Radius in pt for node/circle components
}

export interface ComponentTemplate {
  name: string;
  type: string; // 'text' | 'wire' | 'component'
  category: string;
  svgMarkup: string;
  tikzCommand: string; // Template command, e.g. "\draw ({x}, {y}) to[R, l={label}] ({x2}, {y2});"
}

export interface TikzPackage {
  name: string; // e.g. 'circuitikz'
  displayName: string;
  installed: boolean;
  components: ComponentTemplate[];
}

export interface SelectedVertex {
  elementId: string;
  vertex: 'center' | 'start' | 'end';
}

export interface TikzEditorContext {
  // State getters
  getElements(): EditorElement[];
  setElements(elements: EditorElement[]): void;
  getActiveTool(): 'select' | 'wire' | 'text' | 'erase';
  getActiveTemplate(): ComponentTemplate | null;
  getSelectedVertices(): SelectedVertex[];
  setSelectedVertices(vertices: SelectedVertex[]): void;
  isSnapToGrid(): boolean;
  isHalfGrid(): boolean;
  getPictureOptions(): string;
  getZoom(): number;
  setZoom(zoom: number): void;
  getSearchQuery(): string;
  setSearchQuery(query: string): void;
  isShowPackageManager(): boolean;
  setShowPackageManager(show: boolean): void;
  getPackages(): TikzPackage[];
  getInstallingPackage(): string | null;
  getPinnedComponents(): string[];
  setPinnedComponents(pinned: string[]): void;
  getActiveTab(): 'edit' | 'code';
  getEditableCode(): string;
  setEditableCode(code: string): void;
  isCodeDirty(): boolean;
  setCodeDirty(dirty: boolean): void;
  getOnSaveCallback(): ((newSource: string) => void) | undefined;

  // Constants / config
  PX_PER_UNIT: number;
  ORIGIN_X: number;
  ORIGIN_Y: number;
  CANVAS_WIDTH: number;
  CANVAS_HEIGHT: number;
  DEFAULT_STYLE: EditorElementStyle;

  // Coordinate conversion helpers
  toCanvasX(x: number): number;
  toCanvasY(y: number): number;
  fromCanvasX(x: number): number;
  fromCanvasY(y: number): number;
  createId(): string;

  // Operations
  saveHistoryState(): void;
  handleUndo(): void;
  handleRedo(): void;
  updateHistoryButtons(): void;
  handleSelectVertices(vertices: SelectedVertex[]): void;
  handleAddElement(elem: Omit<EditorElement, 'id'>): void;
  handleUpdateElementPosition(
    id: string,
    x: number,
    y: number,
    x2?: number,
    y2?: number,
    saveHistory?: boolean
  ): void;
  handleUpdateElement(updated: EditorElement, saveHistory?: boolean): void;
  handleUpdateElements(updatedElements: EditorElement[], saveHistory?: boolean): void;
  handleDeleteElement(id: string): void;
  handleSelectTool(tool: 'select' | 'wire' | 'text' | 'erase'): void;
  handleSelectTemplate(template: ComponentTemplate): void;
  generateTikzSource(): string;
  handleCopyCode(): void;
  handleInsertCode(): void;
  handleInstallPackage(pkgName: string): Promise<void>;
  handleUninstallPackage(pkgName: string): Promise<void>;

  // View triggers
  renderLeftSidebar(): void;
  renderCanvas(): void;
  renderRightSidebar(): void;

  // State mutations
  toggleSnapToGrid(): void;
  toggleHalfGrid(): void;
  togglePackageManager(): void;
  switchTab(tab: 'edit' | 'code'): void;
  setSnappingMode(mode: 'grid' | 'half' | 'none'): void;
}
