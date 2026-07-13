// ============================================================================
// PFD Application Orchestrator
// ============================================================================
// Main entry point that bootstraps the PFD editor.
// Responsibilities:
//   - Acquire DOM references (SVG canvas, layers, panels)
//   - Render initial state (defs, grid, pipes, components)
//   - Initialize all interaction handlers
//   - Build the component palette sidebar
//   - Provide a centralized reRender() for full refreshes
//
// Dependencies (global objects):
//   PFDConfig       – from config.js   (data model & settings)
//   PFDComponents   – from components.js (SVG rendering for components)
//   PFDPipes        – from pipes.js    (SVG rendering for connections)
//   PFDInteractions – from interactions.js (user interaction handlers)
// ============================================================================

const PFDApp = {

  // ── DOM References ─────────────────────────────────────────────────────
  /** @type {SVGSVGElement|null} The main SVG canvas */
  svgCanvas: null,

  /** @type {SVGGElement|null} Layer group for component symbols */
  componentsLayer: null,

  /** @type {SVGGElement|null} Layer group for pipe/connection paths */
  pipesLayer: null,

  /** @type {SVGGElement|null} Layer group for grid lines */
  gridLayer: null,

  // ══════════════════════════════════════════════════════════════════════
  //  Initialization
  // ══════════════════════════════════════════════════════════════════════

  /**
   * Bootstrap the entire PFD application.
   * Called once when the DOM is ready.
   */
  init() {
    // ── 1. Acquire DOM references ──────────────────────────────────────
    this.svgCanvas       = document.getElementById('pfd-canvas');
    this.componentsLayer = document.getElementById('components-layer');
    this.pipesLayer      = document.getElementById('pipes-layer');
    this.gridLayer       = document.getElementById('grid-layer');

    if (!this.svgCanvas || !this.componentsLayer || !this.pipesLayer || !this.gridLayer) {
      console.error('[PFDApp] Missing required SVG elements. Aborting init.');
      return;
    }

    // ── 2. Render SVG <defs> (gradients, filters, markers) ─────────────
    const defsEl = document.getElementById('pfd-defs');
    if (defsEl) {
      defsEl.innerHTML = PFDComponents.renderDefs();
    }

    // ── 3. Render grid ─────────────────────────────────────────────────
    PFDInteractions.renderGrid(this.gridLayer);

    // ── 4. Render pipes / connections ──────────────────────────────────
    PFDPipes.recalculateConnectionPaths();
    this.pipesLayer.innerHTML = PFDPipes.renderAllPipes();

    // ── 5. Render components ───────────────────────────────────────────
    this.componentsLayer.innerHTML = PFDComponents.renderAllComponents();

    // ── 6. Initialize interactions ─────────────────────────────────────
    PFDInteractions.init(this.svgCanvas);
    PFDInteractions.enableDragDrop();
    PFDInteractions.initZoomPan(this.svgCanvas);
    PFDInteractions.initPaletteDrag();

    // ── 7. Initialize minimap ──────────────────────────────────────────
    const minimapSvg = document.getElementById('minimap-canvas');
    if (minimapSvg) {
      PFDInteractions.initMinimap(minimapSvg, this.svgCanvas);
    }

    // ── 8. Build palette sidebar ───────────────────────────────────────
    this.buildPalette();

    // ── 9. Wire up toolbar buttons ─────────────────────────────────────
    this.initToolbar();

    // ── 10. Clear properties panel to empty state ──────────────────────
    PFDInteractions.clearPropertiesPanel();

    console.log(
      '%c[PFDApp] ✓ Initialization complete',
      'color: #22c55e; font-weight: bold;'
    );
  },

  // ══════════════════════════════════════════════════════════════════════
  //  Toolbar
  // ══════════════════════════════════════════════════════════════════════

  /**
   * Wire up all toolbar button click handlers to their corresponding
   * PFDInteractions methods.
   */
  initToolbar() {
    // Zoom controls
    const btnZoomIn = document.getElementById('btn-zoom-in');
    const btnZoomOut = document.getElementById('btn-zoom-out');
    const btnZoomReset = document.getElementById('btn-zoom-reset');

    if (btnZoomIn) btnZoomIn.addEventListener('click', () => PFDInteractions.zoomIn());
    if (btnZoomOut) btnZoomOut.addEventListener('click', () => PFDInteractions.zoomOut());
    if (btnZoomReset) btnZoomReset.addEventListener('click', () => PFDInteractions.resetZoom());

    // Grid & snap controls
    const btnToggleGrid = document.getElementById('btn-toggle-grid');
    const btnSnapGrid = document.getElementById('btn-snap-grid');

    if (btnToggleGrid) btnToggleGrid.addEventListener('click', () => PFDInteractions.toggleGrid());
    if (btnSnapGrid) btnSnapGrid.addEventListener('click', () => PFDInteractions.toggleSnapToGrid());

    // Flow animation toggle
    const btnToggleFlow = document.getElementById('btn-toggle-flow');
    if (btnToggleFlow) {
      btnToggleFlow.addEventListener('click', () => {
        // Toggle flow animation on pipes
        PFDConfig.settings.flowAnimated = !PFDConfig.settings.flowAnimated;
        btnToggleFlow.classList.toggle('active', PFDConfig.settings.flowAnimated);

        // Re-render pipes with or without animation
        const pipesLayer = document.getElementById('pipes-layer');
        if (pipesLayer) {
          pipesLayer.innerHTML = PFDPipes.renderAllPipes();
        }

        const state = PFDConfig.settings.flowAnimated ? 'enabled' : 'disabled';
        PFDInteractions.showToast(`Flow animation ${state}`, 'info');
      });
    }

    // Export / Import
    const btnExport = document.getElementById('btn-export');
    const btnImport = document.getElementById('btn-import');

    if (btnExport) btnExport.addEventListener('click', () => PFDInteractions.exportLayout());
    if (btnImport) btnImport.addEventListener('click', () => PFDInteractions.importLayout());
  },

  // ══════════════════════════════════════════════════════════════════════
  //  Palette Builder
  // ══════════════════════════════════════════════════════════════════════

  /**
   * Generate the palette sidebar HTML from PFDConfig.paletteCategories
   * and componentTypes. Each palette item is a draggable card.
   */
  buildPalette() {
    const paletteContainer = document.getElementById('palette-list');
    if (!paletteContainer) return;

    const categories = PFDConfig.paletteCategories || [];
    const types = PFDConfig.componentTypes || {};
    let html = '';

    categories.forEach((category) => {
      html += `
        <div class="palette-category">
          <h4 class="palette-category__title">${category.label}</h4>
          <div class="palette-category__items">
      `;

      (category.types || []).forEach((typeKey) => {
        const typeDef = types[typeKey];
        if (!typeDef) return;

        html += `
          <div class="palette-item" data-component-type="${typeKey}"
               draggable="true" title="Drag to add ${typeDef.label}">
            <span class="palette-item__icon">${typeDef.icon || '⚙'}</span>
            <span class="palette-item__label">${typeDef.label || typeKey}</span>
          </div>
        `;
      });

      html += `
          </div>
        </div>
      `;
    });

    paletteContainer.innerHTML = html;

    // Re-initialize palette drag after building
    // (slight delay to ensure DOM is ready)
    requestAnimationFrame(() => PFDInteractions.initPaletteDrag());
  },

  // ══════════════════════════════════════════════════════════════════════
  //  Re-Render
  // ══════════════════════════════════════════════════════════════════════

  /**
   * Full re-render of the entire canvas.
   * Called after bulk changes (import, component add/delete, etc.)
   */
  reRender() {
    // 1. Re-render defs (gradients, filters)
    const defsEl = document.getElementById('pfd-defs');
    if (defsEl) {
      defsEl.innerHTML = PFDComponents.renderDefs();
    }

    // 2. Re-render pipes
    PFDPipes.recalculateConnectionPaths();
    if (this.pipesLayer) {
      this.pipesLayer.innerHTML = PFDPipes.renderAllPipes();
    }

    // 3. Re-render components
    if (this.componentsLayer) {
      this.componentsLayer.innerHTML = PFDComponents.renderAllComponents();
    }

    // 4. Re-enable drag-drop on new DOM elements
    PFDInteractions.enableDragDrop();

    // 5. Update minimap
    PFDInteractions.updateMinimap();

    // 6. Re-initialize palette drag handlers
    PFDInteractions.initPaletteDrag();
  },
};

// ════════════════════════════════════════════════════════════════════════════
//  Bootstrap on DOM Ready
// ════════════════════════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
  PFDApp.init();
});
