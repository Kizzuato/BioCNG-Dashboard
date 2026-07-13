/**
 * =============================================================================
 * PFDConfig - Process Flow Diagram Configuration
 * =============================================================================
 * 
 * Global configuration object for the CNG Process Flow Diagram.
 * Contains all component definitions, instance data, connection paths,
 * palette categories, and helper methods for data manipulation.
 * 
 * No modules - attach to window as global namespace.
 * =============================================================================
 */

var PFDConfig = (function () {
  'use strict';

  // ---------------------------------------------------------------------------
  // Canvas & Grid Settings
  // ---------------------------------------------------------------------------

  /** @type {Object} Global canvas and interaction settings */
  var settings = {
    gridSize: 20,                // Grid cell size in SVG units
    gridVisible: true,           // Whether to render the background grid
    snapToGrid: true,            // Snap dragged components to nearest grid intersection
    zoomLevel: 1,                // Current zoom multiplier (1 = 100%)
    panX: 0,                     // Horizontal pan offset
    panY: 0,                     // Vertical pan offset
    canvasWidth: 1400,           // SVG viewBox width
    canvasHeight: 700,           // SVG viewBox height
    flowAnimationEnabled: true   // Master toggle for pipe-flow CSS animations
  };

  // ---------------------------------------------------------------------------
  // Component Type Templates
  // ---------------------------------------------------------------------------

  /**
   * Template definitions for every component type.
   * Each entry describes defaults used when spawning a new instance.
   *
   * @property {string} label        - Human-readable name
   * @property {string} category     - Palette category id
   * @property {string} icon         - Emoji icon for palette
   * @property {number} defaultWidth - Default width in SVG units
   * @property {number} defaultHeight- Default height in SVG units
   * @property {string} defaultFill  - CSS variable or color for fill
   * @property {Object} defaultProps - Type-specific default properties
   */
  var componentTypes = {

    'alga-pond': {
      label: 'Algae Pond',
      category: 'vessels',
      icon: '🟢',
      defaultWidth: 160,
      defaultHeight: 80,
      defaultFill: 'var(--clr-green-500, #22c55e)',
      defaultProps: { liquidLevel: 0.5 }
    },

    'co2-absorber': {
      label: 'CO₂ Absorber',
      category: 'vessels',
      icon: '🗼',
      defaultWidth: 110,
      defaultHeight: 340,
      defaultFill: 'var(--clr-indigo-500, #6366f1)',
      defaultProps: { pressure: 1.2, temperature: 35 }
    },

    'gas-holder': {
      label: 'Gas Holder',
      category: 'vessels',
      icon: '🛢️',
      defaultWidth: 140,
      defaultHeight: 110,
      defaultFill: 'var(--clr-sky-400, #38bdf8)',
      defaultProps: { gasType: 'lean', fillPercent: 0.7 }
    },

    'pump': {
      label: 'Pump',
      category: 'equipment',
      icon: '⚙️',
      defaultWidth: 50,
      defaultHeight: 50,
      defaultFill: 'var(--clr-purple-500, #a855f7)',
      defaultProps: { rpm: 1450, flowRate: 12 }
    },

    'heat-exchanger': {
      label: 'Heat Exchanger',
      category: 'equipment',
      icon: '🔥',
      defaultWidth: 80,
      defaultHeight: 50,
      defaultFill: 'var(--clr-red-500, #ef4444)',
      defaultProps: { tempIn: 60, tempOut: 35 }
    },

    'valve': {
      label: 'Valve',
      category: 'equipment',
      icon: '🔧',
      defaultWidth: 30,
      defaultHeight: 24,
      defaultFill: 'var(--clr-slate-400, #94a3b8)',
      defaultProps: { open: true, position: 100 }
    },

    'blower': {
      label: 'Blower',
      category: 'equipment',
      icon: '🌀',
      defaultWidth: 50,
      defaultHeight: 50,
      defaultFill: 'var(--clr-teal-500, #14b8a6)',
      defaultProps: { rpm: 3000, flowRate: 25 }
    },

    'flow-controller': {
      label: 'Flow Controller',
      category: 'instruments',
      icon: '🎛️',
      defaultWidth: 36,
      defaultHeight: 36,
      defaultFill: 'var(--clr-yellow-400, #facc15)',
      defaultProps: { tag: 'FC', setpoint: 10, unit: 'L/min' }
    },

    'concentration-indicator': {
      label: 'Concentration Indicator',
      category: 'instruments',
      icon: '📊',
      defaultWidth: 36,
      defaultHeight: 36,
      defaultFill: 'var(--clr-cyan-400, #22d3ee)',
      defaultProps: { tag: 'CI', value: 0, unit: 'ppm' }
    },

    'pressure-indicator': {
      label: 'Pressure Indicator',
      category: 'instruments',
      icon: '🔵',
      defaultWidth: 40,
      defaultHeight: 28,
      defaultFill: 'var(--clr-blue-400, #60a5fa)',
      defaultProps: { tag: 'P', value: 0, unit: 'bar' }
    }
  };

  // ---------------------------------------------------------------------------
  // Component Instances (placed on canvas)
  // ---------------------------------------------------------------------------

  /**
   * Array of component instances currently rendered on the SVG canvas.
   * Each object mirrors componentType defaults but can override any property.
   */
  var components = [

    // ── Vessels ──────────────────────────────────────────────────────────────

    {
      id: 'alga-pond-1',
      type: 'alga-pond',
      label: 'Feed Pond',
      x: 60,
      y: 150,
      width: 160,
      height: 80,
      fill: 'var(--clr-green-500, #22c55e)',
      props: { liquidLevel: 0.65 }
    },
    {
      id: 'alga-pond-2',
      type: 'alga-pond',
      label: 'Return Pond',
      x: 60,
      y: 520,
      width: 160,
      height: 80,
      fill: 'var(--clr-green-500, #22c55e)',
      props: { liquidLevel: 0.45 }
    },
    {
      id: 'co2-absorber',
      type: 'co2-absorber',
      label: 'CO₂ Absorber',
      x: 550,
      y: 180,
      width: 110,
      height: 340,
      fill: 'var(--clr-indigo-500, #6366f1)',
      props: { pressure: 1.2, temperature: 35 }
    },
    {
      id: 'gas-holder-lean',
      type: 'gas-holder',
      label: 'Lean Gas Holder',
      x: 1050,
      y: 80,
      width: 140,
      height: 110,
      fill: 'var(--clr-sky-400, #38bdf8)',
      props: { gasType: 'lean', fillPercent: 0.7 }
    },
    {
      id: 'gas-holder-rich',
      type: 'gas-holder',
      label: 'Rich Gas Holder',
      x: 1050,
      y: 500,
      width: 140,
      height: 110,
      fill: 'var(--clr-orange-400, #fb923c)',
      props: { gasType: 'rich', fillPercent: 0.6 }
    },

    // ── Equipment ───────────────────────────────────────────────────────────

    {
      id: 'pump-1',
      type: 'pump',
      label: 'P-101',
      x: 280,
      y: 165,
      width: 50,
      height: 50,
      fill: 'var(--clr-purple-500, #a855f7)',
      props: { rpm: 1450, flowRate: 12 }
    },
    {
      id: 'blower-1',
      type: 'blower',
      label: 'B-201',
      x: 920,
      y: 535,
      width: 50,
      height: 50,
      fill: 'var(--clr-teal-500, #14b8a6)',
      props: { rpm: 3000, flowRate: 25 }
    },
    {
      id: 'heat-exchanger-1',
      type: 'heat-exchanger',
      label: 'HX-301',
      x: 790,
      y: 535,
      width: 80,
      height: 50,
      fill: 'var(--clr-red-500, #ef4444)',
      props: { tempIn: 60, tempOut: 35 }
    },
    {
      id: 'valve-1',
      type: 'valve',
      label: 'V-101',
      x: 380,
      y: 105,
      width: 30,
      height: 24,
      fill: 'var(--clr-slate-400, #94a3b8)',
      props: { open: true, position: 100 }
    },
    {
      id: 'valve-2',
      type: 'valve',
      label: 'V-102',
      x: 500,
      y: 540,
      width: 30,
      height: 24,
      fill: 'var(--clr-slate-400, #94a3b8)',
      props: { open: true, position: 100 }
    },

    // ── Instruments ─────────────────────────────────────────────────────────

    {
      id: 'fc-1',
      type: 'flow-controller',
      label: 'FC-101',
      x: 420,
      y: 85,
      width: 36,
      height: 36,
      fill: 'var(--clr-yellow-400, #facc15)',
      props: { tag: 'FC', setpoint: 10, unit: 'L/min' }
    },
    {
      id: 'fc-2',
      type: 'flow-controller',
      label: 'FC-201',
      x: 680,
      y: 545,
      width: 36,
      height: 36,
      fill: 'var(--clr-yellow-400, #facc15)',
      props: { tag: 'FC', setpoint: 15, unit: 'L/min' }
    },
    {
      id: 'ci-1',
      type: 'concentration-indicator',
      label: 'CI-101',
      x: 850,
      y: 155,
      width: 36,
      height: 36,
      fill: 'var(--clr-cyan-400, #22d3ee)',
      props: { tag: 'CI', value: 320, unit: 'ppm' }
    },
    {
      id: 'ci-2',
      type: 'concentration-indicator',
      label: 'CI-201',
      x: 1000,
      y: 510,
      width: 36,
      height: 36,
      fill: 'var(--clr-cyan-400, #22d3ee)',
      props: { tag: 'CI', value: 1200, unit: 'ppm' }
    },
    {
      id: 'pi-1',
      type: 'pressure-indicator',
      label: 'PI-101',
      x: 780,
      y: 155,
      width: 40,
      height: 28,
      fill: 'var(--clr-blue-400, #60a5fa)',
      props: { tag: 'P', value: 1.1, unit: 'bar' }
    },
    {
      id: 'pi-2',
      type: 'pressure-indicator',
      label: 'PI-201',
      x: 1000,
      y: 560,
      width: 40,
      height: 28,
      fill: 'var(--clr-blue-400, #60a5fa)',
      props: { tag: 'P', value: 0.8, unit: 'bar' }
    }
  ];

  // ---------------------------------------------------------------------------
  // Connection / Pipe Definitions
  // ---------------------------------------------------------------------------

  /**
   * Array of pipe connections between components.
   *
   * @property {string}   id       - Unique identifier
   * @property {string}   from     - Source component id
   * @property {string}   to       - Target component id
   * @property {string}   type     - Flow medium: 'water' | 'gas' | 'co2'
   * @property {boolean}  animated - Whether to animate flow dashes
   * @property {number[][]} path   - Array of [x, y] waypoints
   * @property {string}   [label]  - Optional label shown at midpoint
   */
  var connections = [

    // ── Water circuit (Feed → Absorber → Return) ────────────────────────────

    {
      id: 'conn-1',
      from: 'alga-pond-1',
      to: 'pump-1',
      type: 'water',
      animated: true,
      path: [[220, 190], [280, 190]],
      label: ''
    },
    {
      id: 'conn-2',
      from: 'pump-1',
      to: 'valve-1',
      type: 'water',
      animated: true,
      path: [[330, 190], [395, 190], [395, 117]],
      label: ''
    },
    {
      id: 'conn-3',
      from: 'valve-1',
      to: 'fc-1',
      type: 'water',
      animated: true,
      path: [[410, 117], [438, 117], [438, 103]],
      label: ''
    },
    {
      id: 'conn-4',
      from: 'fc-1',
      to: 'co2-absorber',
      type: 'water',
      animated: true,
      path: [[456, 103], [520, 103], [520, 300], [550, 300]],
      label: 'Feed Water'
    },
    {
      id: 'conn-14',
      from: 'co2-absorber',
      to: 'valve-2',
      type: 'water',
      animated: true,
      path: [[550, 480], [530, 480], [530, 552]],
      label: ''
    },
    {
      id: 'conn-15',
      from: 'valve-2',
      to: 'alga-pond-2',
      type: 'water',
      animated: true,
      path: [[500, 552], [350, 552], [350, 560], [220, 560]],
      label: 'Return Water'
    },

    // ── Lean gas circuit (Absorber → Lean Gas Holder) ───────────────────────

    {
      id: 'conn-5',
      from: 'co2-absorber',
      to: 'pi-1',
      type: 'gas',
      animated: true,
      path: [[660, 210], [720, 210], [720, 169], [780, 169]],
      label: ''
    },
    {
      id: 'conn-6',
      from: 'pi-1',
      to: 'ci-1',
      type: 'gas',
      animated: true,
      path: [[820, 169], [850, 169]],
      label: ''
    },
    {
      id: 'conn-7',
      from: 'ci-1',
      to: 'gas-holder-lean',
      type: 'gas',
      animated: true,
      path: [[886, 173], [950, 173], [950, 135], [1050, 135]],
      label: 'Lean Gas'
    },

    // ── Rich gas / CO₂ circuit (Rich Gas Holder → Absorber) ─────────────────

    {
      id: 'conn-8',
      from: 'gas-holder-rich',
      to: 'ci-2',
      type: 'co2',
      animated: true,
      path: [[1050, 555], [1036, 528]],
      label: ''
    },
    {
      id: 'conn-9',
      from: 'ci-2',
      to: 'pi-2',
      type: 'co2',
      animated: true,
      path: [[1000, 528], [1000, 574]],
      label: ''
    },
    {
      id: 'conn-10',
      from: 'pi-2',
      to: 'blower-1',
      type: 'co2',
      animated: true,
      path: [[1000, 574], [980, 560], [970, 560]],
      label: ''
    },
    {
      id: 'conn-11',
      from: 'blower-1',
      to: 'heat-exchanger-1',
      type: 'co2',
      animated: true,
      path: [[920, 560], [870, 560]],
      label: ''
    },
    {
      id: 'conn-12',
      from: 'heat-exchanger-1',
      to: 'fc-2',
      type: 'co2',
      animated: true,
      path: [[790, 560], [716, 563]],
      label: ''
    },
    {
      id: 'conn-13',
      from: 'fc-2',
      to: 'co2-absorber',
      type: 'co2',
      animated: true,
      path: [[680, 563], [630, 563], [630, 520], [605, 520]],
      label: 'Rich CO₂'
    }
  ];

  // ---------------------------------------------------------------------------
  // Palette Categories (for sidebar component palette)
  // ---------------------------------------------------------------------------

  /** @type {Array<{id: string, label: string, icon: string}>} */
  var paletteCategories = [
    { id: 'vessels',     label: 'Vessels & Tanks', icon: '🏗️' },
    { id: 'equipment',   label: 'Equipment',       icon: '⚙️' },
    { id: 'instruments', label: 'Instruments',      icon: '🎛️' }
  ];

  // ---------------------------------------------------------------------------
  // Helper Methods
  // ---------------------------------------------------------------------------

  /**
   * Find a component by its unique id.
   * @param {string} id - Component identifier
   * @returns {Object|undefined}
   */
  function getComponentById(id) {
    for (var i = 0; i < components.length; i++) {
      if (components[i].id === id) return components[i];
    }
    return undefined;
  }

  /**
   * Get all connections that reference a given component (as source or target).
   * @param {string} componentId
   * @returns {Object[]}
   */
  function getConnectionsForComponent(componentId) {
    var result = [];
    for (var i = 0; i < connections.length; i++) {
      if (connections[i].from === componentId || connections[i].to === componentId) {
        result.push(connections[i]);
      }
    }
    return result;
  }

  /**
   * Merge updated properties into an existing component.
   * @param {string} id      - Component identifier
   * @param {Object} updates - Key/value pairs to merge
   * @returns {Object|null}  - Updated component or null if not found
   */
  function updateComponent(id, updates) {
    var comp = getComponentById(id);
    if (!comp) return null;

    for (var key in updates) {
      if (updates.hasOwnProperty(key)) {
        // Deep-merge props sub-object
        if (key === 'props' && typeof updates.props === 'object') {
          for (var pk in updates.props) {
            if (updates.props.hasOwnProperty(pk)) {
              comp.props[pk] = updates.props[pk];
            }
          }
        } else {
          comp[key] = updates[key];
        }
      }
    }
    return comp;
  }

  /**
   * Add a new component instance to the canvas.
   * @param {Object} compData - Full component object (must include id & type)
   */
  function addComponent(compData) {
    // Ensure required fields
    if (!compData.id) compData.id = generateId(compData.type || 'comp');
    components.push(compData);
    return compData;
  }

  /**
   * Remove a component and all its connections from the canvas.
   * @param {string} id - Component identifier
   * @returns {boolean} true if removed
   */
  function removeComponent(id) {
    // Remove related connections first
    for (var i = connections.length - 1; i >= 0; i--) {
      if (connections[i].from === id || connections[i].to === id) {
        connections.splice(i, 1);
      }
    }
    // Remove the component
    for (var j = 0; j < components.length; j++) {
      if (components[j].id === id) {
        components.splice(j, 1);
        return true;
      }
    }
    return false;
  }

  /**
   * Export the entire PFD state as a JSON string.
   * @returns {string}
   */
  function exportJSON() {
    return JSON.stringify({
      settings: settings,
      components: components,
      connections: connections
    }, null, 2);
  }

  /**
   * Import PFD state from a JSON string, replacing current data.
   * @param {string} jsonStr
   */
  function importJSON(jsonStr) {
    try {
      var data = JSON.parse(jsonStr);

      if (data.settings) {
        for (var key in data.settings) {
          if (data.settings.hasOwnProperty(key)) {
            settings[key] = data.settings[key];
          }
        }
      }
      if (Array.isArray(data.components)) {
        components.length = 0;
        for (var i = 0; i < data.components.length; i++) {
          components.push(data.components[i]);
        }
      }
      if (Array.isArray(data.connections)) {
        connections.length = 0;
        for (var j = 0; j < data.connections.length; j++) {
          connections.push(data.connections[j]);
        }
      }
    } catch (e) {
      console.error('[PFDConfig] importJSON failed:', e);
    }
  }

  /**
   * Generate a unique id string with optional prefix.
   * Uses timestamp + random suffix to avoid collisions.
   * @param {string} [prefix='comp'] - Prefix for the generated id
   * @returns {string}
   */
  function generateId(prefix) {
    prefix = prefix || 'comp';
    var ts = Date.now().toString(36);
    var rand = Math.random().toString(36).substring(2, 7);
    return prefix + '-' + ts + '-' + rand;
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  return {
    settings: settings,
    componentTypes: componentTypes,
    components: components,
    connections: connections,
    paletteCategories: paletteCategories,

    // Helper methods
    getComponentById: getComponentById,
    getConnectionsForComponent: getConnectionsForComponent,
    updateComponent: updateComponent,
    addComponent: addComponent,
    removeComponent: removeComponent,
    exportJSON: exportJSON,
    importJSON: importJSON,
    generateId: generateId
  };

})();
