import { type TikzEditorContext, type EditorElement } from '../types';

export class RightSidebar {
  constructor(
    private context: TikzEditorContext,
    private containerEl: HTMLElement
  ) {}

  public render() {
    this.containerEl.empty();

    // Tabs Header
    const tabsHeader = this.containerEl.createDiv({ cls: 'tabs-header' });

    const activeTab = this.context.getActiveTab();
    const editTabBtn = tabsHeader.createEl('button', {
      cls: 'tab-btn' + (activeTab === 'edit' ? ' active' : ''),
      text: 'Edit Component'
    });
    editTabBtn.createSpan({ cls: 'tab-icon' }).innerHTML =
      `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="10" x2="20" y2="3"/><line x1="2" y1="14" x2="6" y2="14"/><line x1="10" y1="8" x2="14" y2="8"/><line x1="18" y1="16" x2="22" y2="16"/></svg> `;
    editTabBtn.onclick = () => {
      console.log('[RightSidebar] Switch to tab: edit');
      this.context.switchTab('edit');
    };

    const codeTabBtn = tabsHeader.createEl('button', {
      cls: 'tab-btn' + (activeTab === 'code' ? ' active' : ''),
      text: 'Code'
    });
    codeTabBtn.createSpan({ cls: 'tab-icon' }).innerHTML =
      `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg> `;
    codeTabBtn.onclick = () => {
      console.log('[RightSidebar] Switch to tab: code');
      this.context.switchTab('code');
    };

    const tabContent = this.containerEl.createDiv({ cls: 'tab-content' });

    if (activeTab === 'edit') {
      const selectedVertices = this.context.getSelectedVertices();
      const uniqueIds = Array.from(new Set(selectedVertices.map(v => v.elementId)));
      const selectedElements = this.context.getElements().filter(el => uniqueIds.includes(el.id));

      if (selectedElements.length === 1) {
        const selectedElement = selectedElements[0];
        const editPanel = tabContent.createDiv({ cls: 'edit-panel' });
        editPanel.createDiv({ cls: 'section-title' }).innerHTML =
          `Edit component: <span class="comp-name">${selectedElement.name}</span>`;

        // 1. Label text input
        const labelGroup = editPanel.createDiv({ cls: 'control-group' });
        labelGroup.createEl('label', { attr: { for: 'label-input' }, text: 'Label Text' });
        const inputRow = labelGroup.createDiv({ cls: 'input-row' });
        const labelInput = inputRow.createEl('input', {
          type: 'text',
          value: selectedElement.label,
          attr: { id: 'label-input', placeholder: 'Enter label...' }
        });
        labelInput.oninput = () => {
          console.log('[RightSidebar] handleLabelChange to:', labelInput.value);
          this.context.handleUpdateElement({
            ...selectedElement,
            label: labelInput.value
          });
        };

        // 2. Text size and Color picker
        const fontColorGroup = editPanel.createDiv({ cls: 'control-group' });
        fontColorGroup.createEl('label', {
          attr: { for: 'font-size-select' },
          text: 'Text size & color'
        });
        const fontColorRow = fontColorGroup.createDiv({ cls: 'row gap' });

        const fontSizeSelect = fontColorRow.createEl('select', {
          attr: { id: 'font-size-select' }
        });
        [10, 12, 14, 18, 24].forEach(pt => {
          const opt = fontSizeSelect.createEl('option', { value: pt.toString(), text: `${pt} pt` });
          if (selectedElement.style.fontSize === pt) opt.selected = true;
        });
        fontSizeSelect.onchange = () => {
          const size = parseInt(fontSizeSelect.value) || 12;
          console.log('[RightSidebar] handleFontSizeChange to:', size);
          this.context.handleUpdateElement({
            ...selectedElement,
            style: { ...selectedElement.style, fontSize: size }
          });
        };

        const colorPickerWrap = fontColorRow.createDiv({ cls: 'color-picker-wrap' });
        const colorInput = colorPickerWrap.createEl('input', {
          type: 'color',
          value: /^#[0-9a-f]{6}$/i.test(selectedElement.style.color)
            ? selectedElement.style.color
            : '#f8e7ad'
        });
        colorInput.oninput = () => {
          console.log('[RightSidebar] handleColorChange to:', colorInput.value);
          this.context.handleUpdateElement({
            ...selectedElement,
            style: { ...selectedElement.style, color: colorInput.value }
          });
        };

        // 2.5 Thickness Slider
        const thicknessGroup = editPanel.createDiv({ cls: 'control-group' });
        const currentThickness = selectedElement.style.thickness ?? 1.0;
        const thicknessLabel = thicknessGroup.createEl('label', {
          attr: { for: 'thickness-slider' },
          text: `Thickness (${currentThickness} pt)`
        });
        const thicknessSlider = thicknessGroup.createEl('input', {
          type: 'range',
          value: currentThickness.toString(),
          attr: { id: 'thickness-slider', min: '0.1', max: '10', step: '0.1' }
        });
        thicknessSlider.oninput = () => {
          const val = parseFloat(thicknessSlider.value) || 1.0;
          thicknessLabel.textContent = `Thickness (${val} pt)`;
          this.context.handleUpdateElement({
            ...selectedElement,
            style: { ...selectedElement.style, thickness: val }
          });
        };

        // 3. Style buttons
        const styleGroup = editPanel.createDiv({ cls: 'control-group' });
        styleGroup.createSpan({ cls: 'label-heading', text: 'Styles' });
        const styleBtnsRow = styleGroup.createDiv({ cls: 'row style-btns' });

        const boldBtn = styleBtnsRow.createEl('button', {
          cls: selectedElement.style.bold ? 'active' : '',
          text: 'B',
          title: 'Bold'
        });
        boldBtn.onclick = () => {
          console.log('[RightSidebar] toggleStyle bold to:', !selectedElement.style.bold);
          this.context.handleUpdateElement({
            ...selectedElement,
            style: { ...selectedElement.style, bold: !selectedElement.style.bold }
          });
        };

        const italicBtn = styleBtnsRow.createEl('button', {
          cls: selectedElement.style.italic ? 'active' : '',
          text: 'I',
          title: 'Italic'
        });
        italicBtn.onclick = () => {
          console.log('[RightSidebar] toggleStyle italic to:', !selectedElement.style.italic);
          this.context.handleUpdateElement({
            ...selectedElement,
            style: { ...selectedElement.style, italic: !selectedElement.style.italic }
          });
        };

        const mathBtn = styleBtnsRow.createEl('button', {
          cls: selectedElement.style.math ? 'active' : '',
          text: '$',
          title: 'Math Formula ($...$)'
        });
        mathBtn.onclick = () => {
          console.log('[RightSidebar] toggleStyle math to:', !selectedElement.style.math);
          this.context.handleUpdateElement({
            ...selectedElement,
            style: { ...selectedElement.style, math: !selectedElement.style.math }
          });
        };

        // 4. Rotation Slider
        const rotationGroup = editPanel.createDiv({ cls: 'control-group' });
        const rotationLabel = rotationGroup.createEl('label', {
          attr: { for: 'rotation-slider' },
          text: `Rotation (${selectedElement.rotation} deg)`
        });
        const slider = rotationGroup.createEl('input', {
          type: 'range',
          value: selectedElement.rotation.toString(),
          attr: { id: 'rotation-slider', min: '0', max: '359' }
        });

        const applyRotation = (angle: number) => {
          if (
            selectedElement.type === 'wire' &&
            selectedElement.x2 !== undefined &&
            selectedElement.y2 !== undefined
          ) {
            const len = Math.hypot(
              selectedElement.x2 - selectedElement.x,
              selectedElement.y2 - selectedElement.y
            );
            const rad = (angle * Math.PI) / 180;
            let targetX2 = selectedElement.x + len * Math.cos(rad);
            let targetY2 = selectedElement.y + len * Math.sin(rad);

            targetX2 = Math.round(targetX2);
            targetY2 = Math.round(targetY2);

            this.context.handleUpdateElement({
              ...selectedElement,
              rotation: angle,
              x2: targetX2,
              y2: targetY2
            });
          } else {
            this.context.handleUpdateElement({
              ...selectedElement,
              rotation: angle
            });
          }
        };

        slider.oninput = () => {
          const angle = parseInt(slider.value) || 0;
          rotationLabel.textContent = `Rotation (${angle} deg)`;
          applyRotation(angle);
        };

        // Presets row
        const presetsRow = rotationGroup.createDiv({ cls: 'presets-row' });
        [-90, -45, 0, 45, 90].forEach(preset => {
          const btn = presetsRow.createEl('button', { cls: 'preset-btn', text: `${preset} deg` });
          btn.onclick = () => {
            const newAngle = (preset + 360) % 360;
            console.log('[RightSidebar] handleRotateChange preset to:', preset, '->', newAngle);
            slider.value = newAngle.toString();
            rotationLabel.textContent = `Rotation (${newAngle} deg)`;
            applyRotation(newAngle);
          };
        });

        // 4b. Radius Slider (only for node/circle components)
        const isNode =
          selectedElement.name.toLowerCase().includes('node') ||
          selectedElement.name.toLowerCase().includes('circle') ||
          selectedElement.radius !== undefined;
        if (isNode) {
          if (selectedElement.radius === undefined) {
            if (selectedElement.name.toLowerCase().includes('junction')) {
              selectedElement.radius = 2.5;
            } else if (selectedElement.name.toLowerCase().includes('circle')) {
              selectedElement.radius = 12.0;
            } else {
              selectedElement.radius = 2.0;
            }
          }

          const isCircleShape = selectedElement.name.toLowerCase().includes('circle');
          const minRadius = isCircleShape ? '2.0' : '1.0';
          const maxRadius = isCircleShape ? '30.0' : '8.0';
          const stepRadius = isCircleShape ? '1.0' : '0.5';

          const radiusGroup = editPanel.createDiv({ cls: 'control-group' });
          const radiusLabel = radiusGroup.createEl('label', {
            attr: { for: 'radius-slider' },
            text: `Radius (${selectedElement.radius} pt)`
          });
          const radiusSlider = radiusGroup.createEl('input', {
            type: 'range',
            value: selectedElement.radius.toString(),
            attr: { id: 'radius-slider', min: minRadius, max: maxRadius, step: stepRadius }
          });
          radiusSlider.oninput = () => {
            const rad = parseFloat(radiusSlider.value) || 2.0;
            radiusLabel.textContent = `Radius (${rad} pt)`;
            this.context.handleUpdateElement({
              ...selectedElement,
              radius: rad
            });
          };
        }

        // 5. Delete element
        const deleteWrap = editPanel.createDiv({ cls: 'delete-btn-wrap' });
        const deleteBtn = deleteWrap.createEl('button', { cls: 'delete-btn' });
        deleteBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg> Delete Element`;
        deleteBtn.onclick = () => {
          console.log('[RightSidebar] Click delete element:', selectedElement.id);
          this.context.handleDeleteElement(selectedElement.id);
        };
      } else if (selectedElements.length > 1) {
        const editPanel = tabContent.createDiv({ cls: 'edit-panel' });
        editPanel.createDiv({ cls: 'section-title' }).innerHTML =
          `Edit multiple components <span class="comp-name">(${selectedElements.length})</span>`;

        const firstElement = selectedElements[0];

        // Shared Style Properties (Color, Thickness, Styles)
        const fontColorGroup = editPanel.createDiv({ cls: 'control-group' });
        fontColorGroup.createEl('label', { text: 'Shared Styles' });
        const fontColorRow = fontColorGroup.createDiv({ cls: 'row gap' });

        const fontSizeSelect = fontColorRow.createEl('select', {
          attr: { id: 'font-size-select' }
        });
        [10, 12, 14, 18, 24].forEach(pt => {
          const opt = fontSizeSelect.createEl('option', { value: pt.toString(), text: `${pt} pt` });
          if (firstElement.style.fontSize === pt) opt.selected = true;
        });
        fontSizeSelect.onchange = () => {
          const size = parseInt(fontSizeSelect.value) || 12;
          const updated = selectedElements.map(el => ({
            ...el,
            style: { ...el.style, fontSize: size }
          }));
          this.context.handleUpdateElements(updated);
        };

        const colorPickerWrap = fontColorRow.createDiv({ cls: 'color-picker-wrap' });
        const colorInput = colorPickerWrap.createEl('input', {
          type: 'color',
          value: /^#[0-9a-f]{6}$/i.test(firstElement.style.color)
            ? firstElement.style.color
            : '#f8e7ad'
        });
        colorInput.oninput = () => {
          const updated = selectedElements.map(el => ({
            ...el,
            style: { ...el.style, color: colorInput.value }
          }));
          this.context.handleUpdateElements(updated);
        };

        const thicknessGroup = editPanel.createDiv({ cls: 'control-group' });
        const currentThickness = firstElement.style.thickness ?? 1.0;
        const thicknessLabel = thicknessGroup.createEl('label', {
          attr: { for: 'thickness-slider' },
          text: `Thickness (${currentThickness} pt)`
        });
        const thicknessSlider = thicknessGroup.createEl('input', {
          type: 'range',
          value: currentThickness.toString(),
          attr: { id: 'thickness-slider', min: '0.1', max: '10', step: '0.1' }
        });
        thicknessSlider.oninput = () => {
          const val = parseFloat(thicknessSlider.value) || 1.0;
          thicknessLabel.textContent = `Thickness (${val} pt)`;
          const updated = selectedElements.map(el => ({
            ...el,
            style: { ...el.style, thickness: val }
          }));
          this.context.handleUpdateElements(updated);
        };

        const styleGroup = editPanel.createDiv({ cls: 'control-group' });
        styleGroup.createSpan({ cls: 'label-heading', text: 'Styles' });
        const styleBtnsRow = styleGroup.createDiv({ cls: 'row style-btns' });

        const boldBtn = styleBtnsRow.createEl('button', {
          cls: firstElement.style.bold ? 'active' : '',
          text: 'B',
          title: 'Bold'
        });
        boldBtn.onclick = () => {
          const val = !firstElement.style.bold;
          const updated = selectedElements.map(el => ({
            ...el,
            style: { ...el.style, bold: val }
          }));
          this.context.handleUpdateElements(updated);
        };

        const italicBtn = styleBtnsRow.createEl('button', {
          cls: firstElement.style.italic ? 'active' : '',
          text: 'I',
          title: 'Italic'
        });
        italicBtn.onclick = () => {
          const val = !firstElement.style.italic;
          const updated = selectedElements.map(el => ({
            ...el,
            style: { ...el.style, italic: val }
          }));
          this.context.handleUpdateElements(updated);
        };

        const mathBtn = styleBtnsRow.createEl('button', {
          cls: firstElement.style.math ? 'active' : '',
          text: '$',
          title: 'Math Formula ($...$)'
        });
        mathBtn.onclick = () => {
          const val = !firstElement.style.math;
          const updated = selectedElements.map(el => ({
            ...el,
            style: { ...el.style, math: val }
          }));
          this.context.handleUpdateElements(updated);
        };

        // Delete elements
        const deleteWrap = editPanel.createDiv({ cls: 'delete-btn-wrap' });
        const deleteBtn = deleteWrap.createEl('button', { cls: 'delete-btn' });
        deleteBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg> Delete All Selected`;
        deleteBtn.onclick = () => {
          selectedElements.forEach(el => this.context.handleDeleteElement(el.id));
        };
      } else {
        tabContent.createDiv({ cls: 'empty-state' }).innerHTML =
          `<p>Select a component on the canvas to configure its styles and properties.</p>`;
      }
    } else {
      // Code tab
      const codePanel = tabContent.createDiv({ cls: 'code-panel' });
      codePanel.createDiv({ cls: 'section-title', text: 'Generated TikZ Code' });

      const textArea = codePanel.createEl('textarea');
      textArea.value = this.context.getEditableCode();
      textArea.oninput = () => {
        console.log('[RightSidebar] Textarea edit code');
        const codeValue = textArea.value;
        this.context.setEditableCode(codeValue);
        this.context.setCodeDirty(codeValue !== this.context.generateTikzSource());
      };

      const codeActions = codePanel.createDiv({ cls: 'code-actions' });
      const copyBtn = codeActions.createEl('button', { cls: 'action-btn secondary' });
      copyBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg> Copy Code`;
      copyBtn.onclick = () => {
        if (this.context.isCodeDirty()) {
          console.log('[RightSidebar] Copy custom modified code');
          navigator.clipboard.writeText(this.context.getEditableCode());
        } else {
          console.log('[RightSidebar] Copy generated code');
          this.context.handleCopyCode();
        }
      };

      // Update button is now in the header next to the close button
    }
  }
}
