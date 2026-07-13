// ============================================================================
// PFD Interactions Module
// ============================================================================
// Handles all user interactions for the Process Flow Diagram editor:
//   - Component drag & drop (with snap-to-grid)
//   - Component selection & deselection
//   - Properties panel (inspect/edit component attributes)
//   - Palette drag-to-canvas (new component creation)
//   - Zoom & pan controls
//   - Minimap rendering & viewport tracking
//   - Grid rendering & toggling
//   - Export / Import layout as JSON
//   - Toast notifications
//
// Dependencies (global objects):
//   PFDConfig     – from config.js
//   PFDComponents – from components.js
//   PFDPipes      – from pipes.js
//   PFDApp        – from app.js  (referenced for re-render calls)
// ============================================================================

const PFDInteractions = {

  // ── State ──────────────────────────────────────────────────────────────
  /** @type {string|null} ID of the currently selected component */
  selectedComponentId: null,

  /** @type {boolean} Whether a drag operation is in progress */
  isDragging: false,

  /** @type {{x: number, y: number}} Offset between cursor and component origin */
  dragOffset: { x: 0, y: 0 },

  /** @type {SVGGElement|null} The SVG <g> element being dragged */
  dragTarget: null,

  /** @type {SVGSVGElement|null} Reference to the main SVG canvas */
  svgCanvas: null,

  /** @type {SVGGElement|null} Reference to the grid layer group */
  gridLayer: null,

  /** @type {SVGSVGElement|null} Reference to the minimap SVG */
  minimapSvg: null,

  /** @type {SVGSVGElement|null} Reference to the main SVG (for minimap) */
  mainSvgRef: null,

  /** @type {number} Current zoom level */
  zoomLevel: 1.0,

  /** @type {{x: number, y: number}} Current pan offset */
  panOffset: { x: 0, y: 0 },

  /** @type {boolean} Whether middle-mouse panning is active */
  isPanning: false,

  /** @type {{x: number, y: number}} Starting cursor position for pan */
  panStart: { x: 0, y: 0 },

  // ══════════════════════════════════════════════════════════════════════
  //  Initialization
  // ══════════════════════════════════════════════════════════════════════

  /**
   * Initialize the interactions module.
   * Stores SVG canvas reference and attaches a background click handler
   * so clicking empty canvas space deselects everything.
   *
   * @param {SVGSVGElement} svgCanvas - The main PFD SVG element
   */
  init(svgCanvas) {
    this.svgCanvas = svgCanvas;

    // Click on the canvas background deselects any selected component
    svgCanvas.addEventListener('click', (e) => {
      // Only deselect if the click target is the SVG itself or the
      // background rect / grid – not a component group
      if (
        e.target === svgCanvas ||
        e.target.id === 'grid-layer' ||
        e.target.closest('#grid-layer') ||
        e.target.tagName === 'svg'
      ) {
        this.deselectAll();
      }
    });
  },

  // ══════════════════════════════════════════════════════════════════════
  //  Drag & Drop (move components on canvas)
  // ══════════════════════════════════════════════════════════════════════

  /**
   * Enable drag-and-drop for all rendered PFD components.
   * Queries `.pfd-component` groups inside the SVG and wires up
   * mousedown / mousemove / mouseup handlers.
   */
  enableDragDrop() {
    const groups = this.svgCanvas.querySelectorAll('.pfd-component');

    groups.forEach((group) => {
      // ── mousedown ────────────────────────────────────────────────
      group.addEventListener('mousedown', (e) => {
        // Ignore right-click
        if (e.button !== 0) return;
        e.stopPropagation();

        const componentId = group.dataset.componentId;
        if (!componentId) return;

        // Select the component on mousedown
        this.selectComponent(componentId);

        // Convert screen coordinates to SVG user-space coordinates
        const ctm = this.svgCanvas.getScreenCTM().inverse();
        const svgPoint = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm);

        // Retrieve current component position from config
        const comp = PFDConfig.components.find((c) => c.id === componentId);
        if (!comp) return;

        // Calculate drag offset (cursor pos minus component origin)
        this.dragOffset = {
          x: svgPoint.x - comp.x,
          y: svgPoint.y - comp.y,
        };

        this.isDragging = true;
        this.dragTarget = group;
        group.classList.add('dragging');
      });
    });

    // ── Document-level mousemove ──────────────────────────────────────
    document.addEventListener('mousemove', (e) => {
      if (!this.isDragging || !this.dragTarget) return;

      // Convert screen coords → SVG coords
      const ctm = this.svgCanvas.getScreenCTM().inverse();
      const svgPoint = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm);

      let newX = svgPoint.x - this.dragOffset.x;
      let newY = svgPoint.y - this.dragOffset.y;

      // Snap to grid if enabled
      if (PFDConfig.settings.snapToGrid) {
        const gs = PFDConfig.settings.gridSize;
        newX = Math.round(newX / gs) * gs;
        newY = Math.round(newY / gs) * gs;
      }

      // Update SVG transform
      this.dragTarget.setAttribute('transform', `translate(${newX}, ${newY})`);

      // Persist position change back to config
      const compId = this.dragTarget.dataset.componentId;
      PFDConfig.updateComponent(compId, { x: newX, y: newY });
    });

    // ── Document-level mouseup ───────────────────────────────────────
    document.addEventListener('mouseup', () => {
      if (!this.isDragging) return;

      if (this.dragTarget) {
        this.dragTarget.classList.remove('dragging');
      }

      this.isDragging = false;
      this.dragTarget = null;

      // Recalculate pipe/connection paths after drag
      PFDPipes.recalculateConnectionPaths();

      // Re-render pipes to reflect new geometry
      const pipesLayer = document.getElementById('pipes-layer');
      if (pipesLayer) {
        pipesLayer.innerHTML = PFDPipes.renderAllPipes();
      }

      // Update minimap to reflect new positions
      this.updateMinimap();

      // Refresh the properties panel if a component is selected
      if (this.selectedComponentId) {
        this.showPropertiesPanel(this.selectedComponentId);
      }
    });
  },

  // ══════════════════════════════════════════════════════════════════════
  //  Selection
  // ══════════════════════════════════════════════════════════════════════

  /**
   * Select a component by ID.
   * Highlights the component's SVG group and opens the properties panel.
   *
   * @param {string} id - Component ID
   */
  selectComponent(id) {
    // Deselect previous
    if (this.selectedComponentId) {
      const prev = this.svgCanvas.querySelector(
        `[data-component-id="${this.selectedComponentId}"]`
      );
      if (prev) prev.classList.remove('selected');
    }

    // Select new
    const group = this.svgCanvas.querySelector(`[data-component-id="${id}"]`);
    if (group) {
      group.classList.add('selected');
    }

    this.selectedComponentId = id;
    this.showPropertiesPanel(id);
  },

  /**
   * Deselect all components and clear the properties panel.
   */
  deselectAll() {
    const allSelected = this.svgCanvas.querySelectorAll('.pfd-component.selected');
    allSelected.forEach((el) => el.classList.remove('selected'));
    this.selectedComponentId = null;
    this.clearPropertiesPanel();
  },

  // ══════════════════════════════════════════════════════════════════════
  //  Properties Panel
  // ══════════════════════════════════════════════════════════════════════

  /**
   * Populate the properties panel with editable fields for the given component.
   * Generates form inputs for position, size, label, and custom properties.
   * Each input triggers live updates to config, SVG, pipes, and minimap.
   *
   * @param {string} componentId - ID of the component to inspect
   */
  showPropertiesPanel(componentId) {
    const comp = PFDConfig.components.find((c) => c.id === componentId);
    if (!comp) return;

    const panel = document.getElementById('properties-panel');
    if (!panel) return;

    // Look up the component type definition for icon/metadata
    const typeDef = PFDConfig.componentTypes[comp.type] || {};
    const icon = typeDef.icon || '⚙';
    const typeLabel = typeDef.label || comp.type;

    // ── Build HTML ─────────────────────────────────────────────────────
    let html = `
      <div class="props-header">
        <span class="props-header__icon">${icon}</span>
        <div class="props-header__info">
          <h3 class="props-header__title">${comp.label || typeLabel}</h3>
          <span class="props-header__type">${typeLabel}</span>
        </div>
      </div>

      <!-- Position -->
      <div class="props-section">
        <h4 class="props-section__title">Position</h4>
        <div class="props-row">
          <label class="props-label" for="prop-x">X</label>
          <input class="props-input" type="number" id="prop-x" value="${comp.x}"
                 data-prop="x" data-comp-id="${componentId}" />
        </div>
        <div class="props-row">
          <label class="props-label" for="prop-y">Y</label>
          <input class="props-input" type="number" id="prop-y" value="${comp.y}"
                 data-prop="y" data-comp-id="${componentId}" />
        </div>
      </div>

      <!-- Size -->
      <div class="props-section">
        <h4 class="props-section__title">Size</h4>
        <div class="props-row">
          <label class="props-label" for="prop-width">Width</label>
          <input class="props-input" type="number" id="prop-width" value="${comp.width}"
                 data-prop="width" data-comp-id="${componentId}" />
        </div>
        <div class="props-row">
          <label class="props-label" for="prop-height">Height</label>
          <input class="props-input" type="number" id="prop-height" value="${comp.height}"
                 data-prop="height" data-comp-id="${componentId}" />
        </div>
      </div>

      <!-- Label -->
      <div class="props-section">
        <h4 class="props-section__title">Label</h4>
        <div class="props-row">
          <label class="props-label" for="prop-label">Text</label>
          <input class="props-input" type="text" id="prop-label" value="${comp.label || ''}"
                 data-prop="label" data-comp-id="${componentId}" />
        </div>
      </div>
    `;

    // ── Custom Properties ──────────────────────────────────────────────
    if (comp.props && Object.keys(comp.props).length > 0) {
      html += `<div class="props-section"><h4 class="props-section__title">Properties</h4>`;

      for (const [key, value] of Object.entries(comp.props)) {
        const inputType = typeof value === 'number' ? 'number' : 'text';
        const inputId = `prop-custom-${key}`;
        html += `
          <div class="props-row">
            <label class="props-label" for="${inputId}">${key}</label>
            <input class="props-input" type="${inputType}" id="${inputId}"
                   value="${value}" data-prop="props.${key}"
                   data-comp-id="${componentId}" />
          </div>
        `;
      }

      html += `</div>`;
    }

    // ── Delete Button ──────────────────────────────────────────────────
    html += `
      <div class="props-section props-section--actions">
        <button class="btn btn--danger" id="btn-delete-component"
                data-comp-id="${componentId}">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
               stroke="currentColor" stroke-width="2">
            <polyline points="3 6 5 6 21 6"/>
            <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4
                     a2 2 0 012-2h4a2 2 0 012 2v2"/>
          </svg>
          Delete Component
        </button>
      </div>
    `;

    panel.innerHTML = html;

    // ── Attach input handlers ──────────────────────────────────────────
    const inputs = panel.querySelectorAll('.props-input');
    inputs.forEach((input) => {
      const handler = () => {
        const propPath = input.dataset.prop;
        const compId = input.dataset.compId;
        let val = input.type === 'number' ? parseFloat(input.value) : input.value;

        // Build changes object (supports nested props via dot notation)
        const changes = {};
        if (propPath.startsWith('props.')) {
          const propKey = propPath.replace('props.', '');
          const currentComp = PFDConfig.components.find((c) => c.id === compId);
          if (currentComp) {
            const updatedProps = { ...currentComp.props, [propKey]: val };
            changes.props = updatedProps;
          }
        } else {
          changes[propPath] = val;
        }

        // 1. Update config
        PFDConfig.updateComponent(compId, changes);

        // 2. Re-render the specific component SVG
        const compGroup = this.svgCanvas.querySelector(
          `[data-component-id="${compId}"]`
        );
        const updatedComp = PFDConfig.components.find((c) => c.id === compId);
        if (compGroup && updatedComp) {
          compGroup.innerHTML = PFDComponents.renderComponentInner(updatedComp);
          compGroup.setAttribute(
            'transform',
            `translate(${updatedComp.x}, ${updatedComp.y})`
          );
        }

        // 3. If position or size changed, recalculate pipes
        if (['x', 'y', 'width', 'height'].includes(propPath)) {
          PFDPipes.recalculateConnectionPaths();
          const pipesLayer = document.getElementById('pipes-layer');
          if (pipesLayer) {
            pipesLayer.innerHTML = PFDPipes.renderAllPipes();
          }
        }

        // 4. Update minimap
        this.updateMinimap();
      };

      // Use 'input' for live updates and 'change' as a fallback
      input.addEventListener('input', handler);
      input.addEventListener('change', handler);
    });

    // ── Delete button handler ──────────────────────────────────────────
    const deleteBtn = document.getElementById('btn-delete-component');
    if (deleteBtn) {
      deleteBtn.addEventListener('click', () => {
        const compId = deleteBtn.dataset.compId;
        const confirmed = confirm(
          'Are you sure you want to delete this component? This action cannot be undone.'
        );
        if (!confirmed) return;

        // Remove from config
        PFDConfig.components = PFDConfig.components.filter((c) => c.id !== compId);
        // Also remove any connections referencing this component
        PFDConfig.connections = PFDConfig.connections.filter(
          (conn) => conn.from !== compId && conn.to !== compId
        );

        this.deselectAll();
        PFDApp.reRender();
        this.showToast('Component deleted', 'info');
      });
    }
  },

  /**
   * Clear the properties panel and show an empty-state placeholder.
   */
  clearPropertiesPanel() {
    const panel = document.getElementById('properties-panel');
    if (!panel) return;

    panel.innerHTML = `
      <div class="props-empty">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none"
             stroke="currentColor" stroke-width="1.5" opacity="0.3">
          <circle cx="12" cy="12" r="10"/>
          <path d="M12 16v-4M12 8h.01"/>
        </svg>
        <p>Select a component to view its properties</p>
      </div>
    `;
  },

  // ══════════════════════════════════════════════════════════════════════
  //  Palette Drag → Canvas (create new components)
  // ══════════════════════════════════════════════════════════════════════

  /**
   * Initialize palette drag-start handlers and canvas drop handlers
   * so users can drag component types from the sidebar onto the canvas.
   */
  initPaletteDrag() {
    // ── Palette items: set up dragstart ────────────────────────────────
    const paletteItems = document.querySelectorAll('.palette-item');
    paletteItems.forEach((item) => {
      item.setAttribute('draggable', 'true');
      item.addEventListener('dragstart', (e) => {
        const compType = item.dataset.componentType;
        e.dataTransfer.setData('text/plain', compType);
        e.dataTransfer.effectAllowed = 'copy';
      });
    });

    // ── Canvas container: dragover & drop ──────────────────────────────
    const canvasContainer = document.getElementById('canvas-container');
    if (!canvasContainer) return;

    canvasContainer.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    });

    canvasContainer.addEventListener('drop', (e) => {
      e.preventDefault();

      const compType = e.dataTransfer.getData('text/plain');
      if (!compType) return;

      // Calculate SVG coordinates of the drop position
      const ctm = this.svgCanvas.getScreenCTM().inverse();
      const svgPoint = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm);

      // Look up the component type template
      const template = PFDConfig.componentTypes[compType];
      if (!template) {
        this.showToast(`Unknown component type: ${compType}`, 'error');
        return;
      }

      // Generate a unique ID
      const uniqueId = `${compType}-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;

      // Create new component object from template defaults
      const newComp = {
        id: uniqueId,
        type: compType,
        label: template.label || compType,
        x: Math.round(svgPoint.x - (template.defaultWidth || 120) / 2),
        y: Math.round(svgPoint.y - (template.defaultHeight || 80) / 2),
        width: template.defaultWidth || 120,
        height: template.defaultHeight || 80,
        props: { ...(template.defaultProps || {}) },
      };

      // Snap to grid if enabled
      if (PFDConfig.settings.snapToGrid) {
        const gs = PFDConfig.settings.gridSize;
        newComp.x = Math.round(newComp.x / gs) * gs;
        newComp.y = Math.round(newComp.y / gs) * gs;
      }

      // Add to config
      PFDConfig.components.push(newComp);

      // Re-render entire canvas
      PFDApp.reRender();

      // Select the newly added component
      this.selectComponent(uniqueId);

      this.showToast(`${template.label || compType} added`, 'success');
    });
  },

  // ══════════════════════════════════════════════════════════════════════
  //  Zoom & Pan
  // ══════════════════════════════════════════════════════════════════════

  /**
   * Initialize zoom (scroll wheel) and pan (middle mouse drag) on the canvas.
   *
   * @param {SVGSVGElement} svgCanvas - The main SVG element
   */
  initZoomPan(svgCanvas) {
    // ── Wheel zoom ─────────────────────────────────────────────────────
    svgCanvas.addEventListener('wheel', (e) => {
      e.preventDefault();

      const delta = e.deltaY > 0 ? -0.1 : 0.1;
      this.zoomLevel = Math.min(3.0, Math.max(0.3, this.zoomLevel + delta));

      this._applyTransform();
      this._updateZoomDisplay();
      this.updateMinimap();
    }, { passive: false });

    // ── Middle mouse pan ───────────────────────────────────────────────
    svgCanvas.addEventListener('mousedown', (e) => {
      // Middle button (button === 1)
      if (e.button !== 1) return;
      e.preventDefault();

      this.isPanning = true;
      this.panStart = { x: e.clientX - this.panOffset.x, y: e.clientY - this.panOffset.y };
      svgCanvas.style.cursor = 'grabbing';
    });

    document.addEventListener('mousemove', (e) => {
      if (!this.isPanning) return;

      this.panOffset = {
        x: e.clientX - this.panStart.x,
        y: e.clientY - this.panStart.y,
      };

      this._applyTransform();
      this.updateMinimap();
    });

    document.addEventListener('mouseup', (e) => {
      if (e.button === 1 && this.isPanning) {
        this.isPanning = false;
        svgCanvas.style.cursor = '';
      }
    });
  },

  /**
   * Zoom in by 0.1 step.
   */
  zoomIn() {
    this.zoomLevel = Math.min(3.0, this.zoomLevel + 0.1);
    this._applyTransform();
    this._updateZoomDisplay();
    this.updateMinimap();
  },

  /**
   * Zoom out by 0.1 step.
   */
  zoomOut() {
    this.zoomLevel = Math.max(0.3, this.zoomLevel - 0.1);
    this._applyTransform();
    this._updateZoomDisplay();
    this.updateMinimap();
  },

  /**
   * Reset zoom to 100% and pan to origin.
   */
  resetZoom() {
    this.zoomLevel = 1.0;
    this.panOffset = { x: 0, y: 0 };
    this._applyTransform();
    this._updateZoomDisplay();
    this.updateMinimap();
  },

  /**
   * Apply current zoom + pan transform to the canvas-transform group.
   * @private
   */
  _applyTransform() {
    const transformGroup = document.getElementById('canvas-transform');
    if (transformGroup) {
      transformGroup.setAttribute(
        'transform',
        `translate(${this.panOffset.x}, ${this.panOffset.y}) scale(${this.zoomLevel})`
      );
    }
  },

  /**
   * Update the zoom level display text.
   * @private
   */
  _updateZoomDisplay() {
    const zoomDisplay = document.getElementById('zoom-level');
    if (zoomDisplay) {
      zoomDisplay.textContent = `${Math.round(this.zoomLevel * 100)}%`;
    }
  },

  // ══════════════════════════════════════════════════════════════════════
  //  Minimap
  // ══════════════════════════════════════════════════════════════════════

  /**
   * Initialize the minimap with a simplified overview of the diagram.
   *
   * @param {SVGSVGElement} minimapSvg  - The minimap SVG element
   * @param {SVGSVGElement} mainSvg     - The main canvas SVG element
   */
  initMinimap(minimapSvg, mainSvg) {
    this.minimapSvg = minimapSvg;
    this.mainSvgRef = mainSvg;
    this.updateMinimap();
  },

  /**
   * Re-render minimap content based on current PFDConfig state.
   * Draws simplified component rects and connection lines.
   */
  updateMinimap() {
    if (!this.minimapSvg) return;

    const scale = 0.1; // Minimap is 10% of actual size
    let content = '';

    // Draw each component as a small colored rectangle
    PFDConfig.components.forEach((comp) => {
      const typeDef = PFDConfig.componentTypes[comp.type] || {};
      const color = typeDef.color || '#64748b';

      content += `<rect x="${comp.x * scale}" y="${comp.y * scale}"
                        width="${comp.width * scale}" height="${comp.height * scale}"
                        fill="${color}" rx="1" opacity="0.8"/>`;
    });

    // Draw connections as thin lines
    if (PFDConfig.connections) {
      PFDConfig.connections.forEach((conn) => {
        const fromComp = PFDConfig.components.find((c) => c.id === conn.from);
        const toComp = PFDConfig.components.find((c) => c.id === conn.to);
        if (fromComp && toComp) {
          const x1 = (fromComp.x + fromComp.width / 2) * scale;
          const y1 = (fromComp.y + fromComp.height / 2) * scale;
          const x2 = (toComp.x + toComp.width / 2) * scale;
          const y2 = (toComp.y + toComp.height / 2) * scale;
          content += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"
                            stroke="#475569" stroke-width="0.5"/>`;
        }
      });
    }

    // Draw viewport rectangle
    const viewBox = this.svgCanvas ? this.svgCanvas.viewBox.baseVal : null;
    if (viewBox) {
      const vx = (-this.panOffset.x / this.zoomLevel) * scale;
      const vy = (-this.panOffset.y / this.zoomLevel) * scale;
      const vw = (viewBox.width / this.zoomLevel) * scale;
      const vh = (viewBox.height / this.zoomLevel) * scale;

      content += `<rect x="${vx}" y="${vy}" width="${vw}" height="${vh}"
                        fill="none" stroke="var(--accent-primary, #3b82f6)"
                        stroke-width="1" rx="1" opacity="0.7"/>`;
    }

    this.minimapSvg.innerHTML = content;

    // Also update the viewport indicator overlay
    const viewportDiv = document.getElementById('minimap-viewport');
    if (viewportDiv && viewBox) {
      const vx = (-this.panOffset.x / this.zoomLevel) * scale;
      const vy = (-this.panOffset.y / this.zoomLevel) * scale;
      const vw = (viewBox.width / this.zoomLevel) * scale;
      const vh = (viewBox.height / this.zoomLevel) * scale;
      viewportDiv.style.left = `${vx}px`;
      viewportDiv.style.top = `${vy}px`;
      viewportDiv.style.width = `${vw}px`;
      viewportDiv.style.height = `${vh}px`;
    }
  },

  // ══════════════════════════════════════════════════════════════════════
  //  Grid
  // ══════════════════════════════════════════════════════════════════════

  /**
   * Render the background grid lines into the given SVG group element.
   * Grid lines are drawn at gridSize intervals with a subtle stroke.
   *
   * @param {SVGGElement} svgElement - The grid-layer <g> element
   */
  renderGrid(svgElement) {
    this.gridLayer = svgElement;
    const gridSize = PFDConfig.settings.gridSize || 20;
    const canvasWidth = 1400;
    const canvasHeight = 700;
    let lines = '';

    // Vertical lines
    for (let x = 0; x <= canvasWidth; x += gridSize) {
      lines += `<line x1="${x}" y1="0" x2="${x}" y2="${canvasHeight}"
                      stroke="#1e293b" stroke-width="0.5"/>`;
    }

    // Horizontal lines
    for (let y = 0; y <= canvasHeight; y += gridSize) {
      lines += `<line x1="0" y1="${y}" x2="${canvasWidth}" y2="${y}"
                      stroke="#1e293b" stroke-width="0.5"/>`;
    }

    svgElement.innerHTML = lines;

    // Apply initial visibility from settings
    if (!PFDConfig.settings.gridVisible) {
      svgElement.style.display = 'none';
    }
  },

  /**
   * Toggle grid visibility and update the toggle button state.
   */
  toggleGrid() {
    PFDConfig.settings.gridVisible = !PFDConfig.settings.gridVisible;

    if (this.gridLayer) {
      this.gridLayer.style.display = PFDConfig.settings.gridVisible ? '' : 'none';
    }

    const btn = document.getElementById('btn-toggle-grid');
    if (btn) {
      btn.classList.toggle('active', PFDConfig.settings.gridVisible);
    }
  },

  /**
   * Toggle snap-to-grid behavior and update the snap button state.
   */
  toggleSnapToGrid() {
    PFDConfig.settings.snapToGrid = !PFDConfig.settings.snapToGrid;

    const btn = document.getElementById('btn-snap-grid');
    if (btn) {
      btn.classList.toggle('active', PFDConfig.settings.snapToGrid);
    }

    const state = PFDConfig.settings.snapToGrid ? 'enabled' : 'disabled';
    this.showToast(`Snap to grid ${state}`, 'info');
  },

  // ══════════════════════════════════════════════════════════════════════
  //  Export / Import
  // ══════════════════════════════════════════════════════════════════════

  /**
   * Export the current layout as a JSON file download.
   */
  exportLayout() {
    const jsonData = PFDConfig.exportJSON();
    const blob = new Blob([jsonData], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = url;
    link.download = `pfd-layout-${Date.now()}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    URL.revokeObjectURL(url);
    this.showToast('Layout exported', 'success');
  },

  /**
   * Import a layout from a JSON file.
   * Triggers a hidden file input, reads the selected file, and re-renders.
   */
  importLayout() {
    const fileInput = document.getElementById('file-import');
    if (!fileInput) return;

    // Reset to allow re-importing the same file
    fileInput.value = '';

    // Set up the change handler before triggering click
    fileInput.onchange = (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (evt) => {
        try {
          PFDConfig.importJSON(evt.target.result);
          PFDApp.reRender();
          this.showToast('Layout imported', 'success');
        } catch (err) {
          console.error('Import failed:', err);
          this.showToast('Import failed: invalid file', 'error');
        }
      };
      reader.readAsText(file);
    };

    fileInput.click();
  },

  // ══════════════════════════════════════════════════════════════════════
  //  Toast Notifications
  // ══════════════════════════════════════════════════════════════════════

  /**
   * Show a temporary toast notification.
   *
   * @param {string} message - The message to display
   * @param {'success'|'error'|'info'|'warning'} [type='info'] - Toast type
   */
  showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    // Icon SVGs for each toast type
    const icons = {
      success: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none"
                     stroke="currentColor" stroke-width="2">
                  <path d="M20 6L9 17l-5-5"/>
                </svg>`,
      error: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none"
                   stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10"/>
                <line x1="15" y1="9" x2="9" y2="15"/>
                <line x1="9" y1="9" x2="15" y2="15"/>
              </svg>`,
      warning: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none"
                     stroke="currentColor" stroke-width="2">
                  <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94
                           a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
                  <line x1="12" y1="9" x2="12" y2="13"/>
                  <line x1="12" y1="17" x2="12.01" y2="17"/>
                </svg>`,
      info: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" stroke-width="2">
               <circle cx="12" cy="12" r="10"/>
               <line x1="12" y1="16" x2="12" y2="12"/>
               <line x1="12" y1="8" x2="12.01" y2="8"/>
             </svg>`,
    };

    const toast = document.createElement('div');
    toast.className = `toast toast--${type}`;
    toast.innerHTML = `
      <span class="toast__icon">${icons[type] || icons.info}</span>
      <span class="toast__message">${message}</span>
    `;

    container.appendChild(toast);

    // Trigger entrance animation
    requestAnimationFrame(() => toast.classList.add('toast--visible'));

    // Auto-remove after 3 seconds
    setTimeout(() => {
      toast.classList.remove('toast--visible');
      toast.classList.add('toast--exiting');
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  },
};
