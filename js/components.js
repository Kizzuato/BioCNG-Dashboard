/**
 * =============================================================================
 * PFDComponents - SVG Component Renderers
 * =============================================================================
 *
 * Global object providing SVG rendering functions for every PFD component type.
 * Each renderer produces an SVG fragment string (relative to component origin 0,0)
 * that is inserted into a positioned <g> element on the canvas.
 *
 * Depends on: PFDConfig (config.js must be loaded first)
 * No modules - plain script tag, attaches to window.
 * =============================================================================
 */

var PFDComponents = (function () {
  'use strict';

  // ---------------------------------------------------------------------------
  // SVG <defs> — Gradients, Patterns, Filters, Markers
  // ---------------------------------------------------------------------------

  /**
   * Generates the SVG <defs> block containing all reusable definitions:
   * gradients, patterns, filters, and markers used across the diagram.
   *
   * @returns {string} SVG <defs> element as a string
   */
  function createDefs() {
    return [
      '<defs>',

      // ── Linear Gradients ────────────────────────────────────────────────

      // Algae pond gradient (dark green → light green, vertical)
      '  <linearGradient id="grad-alga" x1="0" y1="0" x2="0" y2="1">',
      '    <stop offset="0%" stop-color="#15803d"/>',
      '    <stop offset="100%" stop-color="#4ade80"/>',
      '  </linearGradient>',

      // CO₂ absorber gradient (dark indigo → light indigo, vertical)
      '  <linearGradient id="grad-absorber" x1="0" y1="0" x2="0" y2="1">',
      '    <stop offset="0%" stop-color="#3730a3"/>',
      '    <stop offset="100%" stop-color="#818cf8"/>',
      '  </linearGradient>',

      // Lean gas holder gradient (dark sky → light sky, vertical)
      '  <linearGradient id="grad-gas-lean" x1="0" y1="0" x2="0" y2="1">',
      '    <stop offset="0%" stop-color="#0369a1"/>',
      '    <stop offset="100%" stop-color="#7dd3fc"/>',
      '  </linearGradient>',

      // Rich gas holder gradient (dark orange → light orange, vertical)
      '  <linearGradient id="grad-gas-rich" x1="0" y1="0" x2="0" y2="1">',
      '    <stop offset="0%" stop-color="#c2410c"/>',
      '    <stop offset="100%" stop-color="#fdba74"/>',
      '  </linearGradient>',

      // Pump gradient (purple shades, horizontal)
      '  <linearGradient id="grad-pump" x1="0" y1="0" x2="1" y2="1">',
      '    <stop offset="0%" stop-color="#7e22ce"/>',
      '    <stop offset="100%" stop-color="#c084fc"/>',
      '  </linearGradient>',

      // Heat exchanger gradient (red → orange, horizontal)
      '  <linearGradient id="grad-heat" x1="0" y1="0" x2="1" y2="0">',
      '    <stop offset="0%" stop-color="#dc2626"/>',
      '    <stop offset="100%" stop-color="#fb923c"/>',
      '  </linearGradient>',

      // ── Patterns ────────────────────────────────────────────────────────

      // Cross-hatch pattern for absorber internals
      '  <pattern id="cross-hatch" patternUnits="userSpaceOnUse" width="10" height="10">',
      '    <path d="M0,10 L10,0" stroke="#94a3b8" stroke-width="0.8" opacity="0.5"/>',
      '    <path d="M0,0 L10,10" stroke="#94a3b8" stroke-width="0.8" opacity="0.3"/>',
      '  </pattern>',

      // ── Filters ─────────────────────────────────────────────────────────

      // Drop shadow for component elevation
      '  <filter id="drop-shadow" x="-20%" y="-20%" width="140%" height="140%">',
      '    <feDropShadow dx="0" dy="2" stdDeviation="3" flood-color="#000" flood-opacity="0.5"/>',
      '  </filter>',

      // Glow effect for highlighted / active states
      '  <filter id="glow" x="-30%" y="-30%" width="160%" height="160%">',
      '    <feGaussianBlur in="SourceGraphic" stdDeviation="4" result="blur"/>',
      '    <feComposite in="SourceGraphic" in2="blur" operator="over"/>',
      '  </filter>',

      // ── Markers ─────────────────────────────────────────────────────────

      // Arrow marker for pipe direction indication
      '  <marker id="arrow" markerWidth="8" markerHeight="6" refX="7" refY="3"',
      '    orient="auto" markerUnits="userSpaceOnUse">',
      '    <path d="M0,0 L8,3 L0,6 Z" fill="#94a3b8"/>',
      '  </marker>',

      '</defs>'
    ].join('\n');
  }

  // ---------------------------------------------------------------------------
  // Main render dispatcher
  // ---------------------------------------------------------------------------

  /**
   * Route to the appropriate renderer based on component type.
   *
   * @param {Object} comp - Component data object from PFDConfig.components
   * @returns {string} Inner SVG markup (relative to component origin)
   */
  function renderComponent(comp) {
    switch (comp.type) {
      case 'alga-pond':                return renderAlgaPond(comp);
      case 'co2-absorber':             return renderAbsorber(comp);
      case 'gas-holder':               return renderGasHolder(comp);
      case 'pump':                     return renderPump(comp);
      case 'blower':                   return renderBlower(comp);
      case 'heat-exchanger':           return renderHeatExchanger(comp);
      case 'valve':                    return renderValve(comp);
      case 'flow-controller':          return renderFlowController(comp);
      case 'concentration-indicator':  return renderConcentrationIndicator(comp);
      case 'pressure-indicator':       return renderPressureIndicator(comp);
      default:
        console.warn('[PFDComponents] Unknown type:', comp.type);
        return '';
    }
  }

  // ---------------------------------------------------------------------------
  // Individual Component Renderers
  // ---------------------------------------------------------------------------

  /**
   * Render an algae pond vessel with liquid fill, animated wave, and label.
   * The liquid level is driven by comp.props.liquidLevel (0–1).
   *
   * @param {Object} comp - Component data
   * @returns {string} SVG markup
   */
  function renderAlgaPond(comp) {
    var w = comp.width;
    var h = comp.height;
    var level = (comp.props && comp.props.liquidLevel) || 0.5;
    var liquidH = Math.round(h * level);
    var liquidY = h - liquidH;

    // Build a sine-wave path for the liquid surface
    var wavePath = 'M0,' + liquidY;
    for (var wx = 0; wx <= w; wx += 10) {
      var wy = liquidY + Math.sin(wx * 0.08) * 3;
      wavePath += ' L' + wx + ',' + wy.toFixed(1);
    }
    wavePath += ' L' + w + ',' + h + ' L0,' + h + ' Z';

    return [
      // Clip path for liquid containment
      '<clipPath id="clip-' + comp.id + '">',
      '  <rect x="0" y="0" width="' + w + '" height="' + h + '" rx="8"/>',
      '</clipPath>',

      // Main vessel body
      '<rect x="0" y="0" width="' + w + '" height="' + h + '" rx="8"',
      '  fill="url(#grad-alga)" stroke="#15803d" stroke-width="2"',
      '  filter="url(#drop-shadow)"/>',

      // Liquid fill with wave
      '<g clip-path="url(#clip-' + comp.id + ')">',
      '  <path d="' + wavePath + '"',
      '    fill="rgba(34,197,94,0.45)" class="animate-wave"/>',
      '</g>',

      // Label below the vessel
      '<text x="' + (w / 2) + '" y="' + (h + 16) + '"',
      '  text-anchor="middle" font-family="Inter, sans-serif"',
      '  font-size="11" fill="#94a3b8" font-weight="500">',
      '  ' + (comp.label || '') + '</text>'
    ].join('\n');
  }

  /**
   * Render the CO₂ absorber column: body, dome, cross-hatch, bubbles, label.
   *
   * @param {Object} comp - Component data
   * @returns {string} SVG markup
   */
  function renderAbsorber(comp) {
    var w = comp.width;
    var h = comp.height;
    var bodyW = w - 10;           // Slightly narrower body
    var bodyX = 5;                // Centered offset
    var domeH = Math.round(h * 0.12); // Dome takes ~12% of height
    var bodyH = h - domeH;

    // Generate 8 bubble positions (pseudo-random but deterministic)
    var bubbles = '';
    var seed = 7;
    for (var b = 0; b < 8; b++) {
      seed = (seed * 13 + 17) % 97;
      var bx = bodyX + 8 + (seed % (bodyW - 16));
      seed = (seed * 13 + 17) % 97;
      var by = domeH + 20 + (seed % (bodyH - 40));
      var br = 2 + (b % 3);
      var delay = (b * 0.4).toFixed(1);
      bubbles += '<circle cx="' + bx + '" cy="' + by + '" r="' + br + '"' +
        ' fill="rgba(255,255,255,0.4)" class="animate-bubble"' +
        ' style="animation-delay:' + delay + 's"/>\n';
    }

    // Dome arc: starts at top-left of body, arcs to top-right
    var domeArc = 'M' + bodyX + ',' + domeH +
      ' A' + (bodyW / 2) + ',' + domeH + ' 0 0,1 ' + (bodyX + bodyW) + ',' + domeH;

    return [
      // Main column body
      '<rect x="' + bodyX + '" y="' + domeH + '" width="' + bodyW + '" height="' + bodyH + '"',
      '  rx="4" fill="url(#grad-absorber)" stroke="#4338ca" stroke-width="2"',
      '  filter="url(#drop-shadow)"/>',

      // Dome cap
      '<path d="' + domeArc + '"',
      '  fill="url(#grad-absorber)" stroke="#4338ca" stroke-width="2"/>',

      // Cross-hatch overlay for column internals visual
      '<rect x="' + bodyX + '" y="' + domeH + '" width="' + bodyW + '" height="' + bodyH + '"',
      '  rx="4" fill="url(#cross-hatch)" opacity="0.3"/>',

      // Bubbles
      bubbles,

      // Label below
      '<text x="' + (w / 2) + '" y="' + (h + 16) + '"',
      '  text-anchor="middle" font-family="Inter, sans-serif"',
      '  font-size="11" fill="#94a3b8" font-weight="500">',
      '  ' + (comp.label || '') + '</text>'
    ].join('\n');
  }

  /**
   * Render a gas holder: rectangular base with a dome top.
   * Uses lean or rich gradient based on comp.props.gasType.
   *
   * @param {Object} comp - Component data
   * @returns {string} SVG markup
   */
  function renderGasHolder(comp) {
    var w = comp.width;
    var h = comp.height;
    var gasType = (comp.props && comp.props.gasType) || 'lean';
    var gradId = gasType === 'rich' ? 'grad-gas-rich' : 'grad-gas-lean';
    var strokeColor = gasType === 'rich' ? '#c2410c' : '#0369a1';

    var domeH = Math.round(h * 0.4);  // Upper 40% is dome
    var baseH = h - domeH;            // Lower 60% is rectangle

    // Dome arc from left edge to right edge at domeH level
    var domeArc = 'M0,' + domeH +
      ' A' + (w / 2) + ',' + domeH + ' 0 0,1 ' + w + ',' + domeH;

    return [
      // Base rectangle (lower 60%)
      '<rect x="0" y="' + domeH + '" width="' + w + '" height="' + baseH + '"',
      '  fill="url(#' + gradId + ')" stroke="' + strokeColor + '" stroke-width="2"',
      '  filter="url(#drop-shadow)"/>',

      // Dome cap (upper 40%)
      '<path d="' + domeArc + '"',
      '  fill="url(#' + gradId + ')" stroke="' + strokeColor + '" stroke-width="2"/>',

      // Gentle bobbing animation wrapper
      '<g class="animate-bob">',
      '  <rect x="' + (w * 0.15) + '" y="' + (domeH + 8) + '"',
      '    width="' + (w * 0.7) + '" height="2" rx="1"',
      '    fill="rgba(255,255,255,0.25)"/>',
      '</g>',

      // Label
      '<text x="' + (w / 2) + '" y="' + (h + 16) + '"',
      '  text-anchor="middle" font-family="Inter, sans-serif"',
      '  font-size="11" fill="#94a3b8" font-weight="500">',
      '  ' + (comp.label || '') + '</text>'
    ].join('\n');
  }

  /**
   * Render a centrifugal pump: outer circle + inner rotating arrow triangle.
   *
   * @param {Object} comp - Component data
   * @returns {string} SVG markup
   */
  function renderPump(comp) {
    var w = comp.width;
    var h = comp.height;
    var cx = w / 2;
    var cy = h / 2;
    var r = Math.min(w, h) / 2 - 2;

    // Inner triangle (pointing right) for impeller indication
    var triSize = r * 0.55;
    var triPath = 'M' + (cx + triSize) + ',' + cy +
      ' L' + (cx - triSize * 0.5) + ',' + (cy - triSize * 0.7) +
      ' L' + (cx - triSize * 0.5) + ',' + (cy + triSize * 0.7) + ' Z';

    return [
      // Outer circle
      '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '"',
      '  fill="url(#grad-pump)" stroke="#7e22ce" stroke-width="2"',
      '  filter="url(#drop-shadow)"/>',

      // Rotating impeller arrow
      '<g class="animate-pump" style="transform-origin:' + cx + 'px ' + cy + 'px">',
      '  <path d="' + triPath + '" fill="rgba(255,255,255,0.85)"/>',
      '</g>',

      // Label
      '<text x="' + cx + '" y="' + (h + 14) + '"',
      '  text-anchor="middle" font-family="Inter, sans-serif"',
      '  font-size="10" fill="#94a3b8" font-weight="500">',
      '  ' + (comp.label || '') + '</text>'
    ].join('\n');
  }

  /**
   * Render a blower: outer circle + rotating fan blades.
   *
   * @param {Object} comp - Component data
   * @returns {string} SVG markup
   */
  function renderBlower(comp) {
    var w = comp.width;
    var h = comp.height;
    var cx = w / 2;
    var cy = h / 2;
    var r = Math.min(w, h) / 2 - 2;
    var bladeR = r * 0.7;

    // Generate 4 fan blade arcs evenly spaced (0°, 90°, 180°, 270°)
    var blades = '';
    for (var i = 0; i < 4; i++) {
      var angle = i * 90;
      var rad1 = (angle - 15) * Math.PI / 180;
      var rad2 = (angle + 40) * Math.PI / 180;
      var x1 = cx + Math.cos(rad1) * bladeR;
      var y1 = cy + Math.sin(rad1) * bladeR;
      var x2 = cx + Math.cos(rad2) * bladeR;
      var y2 = cy + Math.sin(rad2) * bladeR;
      blades += '<path d="M' + cx + ',' + cy + ' L' + x1.toFixed(1) + ',' + y1.toFixed(1) +
        ' A' + bladeR + ',' + bladeR + ' 0 0,1 ' + x2.toFixed(1) + ',' + y2.toFixed(1) + ' Z"' +
        ' fill="rgba(255,255,255,0.7)"/>\n';
    }

    return [
      // Outer circle
      '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '"',
      '  fill="#0d9488" stroke="#0f766e" stroke-width="2"',
      '  filter="url(#drop-shadow)"/>',

      // Rotating fan blade group
      '<g class="animate-pump" style="transform-origin:' + cx + 'px ' + cy + 'px">',
      blades,
      '  <circle cx="' + cx + '" cy="' + cy + '" r="4" fill="#134e4a"/>',
      '</g>',

      // Label
      '<text x="' + cx + '" y="' + (h + 14) + '"',
      '  text-anchor="middle" font-family="Inter, sans-serif"',
      '  font-size="10" fill="#94a3b8" font-weight="500">',
      '  ' + (comp.label || '') + '</text>'
    ].join('\n');
  }

  /**
   * Render a heat exchanger: outer rectangle with internal zigzag pattern.
   *
   * @param {Object} comp - Component data
   * @returns {string} SVG markup
   */
  function renderHeatExchanger(comp) {
    var w = comp.width;
    var h = comp.height;

    // Build zigzag polyline (3 full zigzag segments)
    var zigzag = '';
    var segments = 4;
    var segW = (w - 16) / segments;
    var zigY1 = h * 0.25;
    var zigY2 = h * 0.75;
    var pts = [];
    pts.push((8) + ',' + (h / 2));
    for (var s = 0; s < segments; s++) {
      var xBase = 8 + s * segW;
      var yTarget = (s % 2 === 0) ? zigY1 : zigY2;
      pts.push((xBase + segW / 2).toFixed(0) + ',' + yTarget.toFixed(0));
    }
    pts.push((w - 8) + ',' + (h / 2));
    zigzag = pts.join(' ');

    return [
      // Outer shell
      '<rect x="0" y="0" width="' + w + '" height="' + h + '"',
      '  rx="4" fill="url(#grad-heat)" stroke="#b91c1c" stroke-width="2"',
      '  filter="url(#drop-shadow)" class="animate-heat"/>',

      // Internal zigzag tubing
      '<polyline points="' + zigzag + '"',
      '  fill="none" stroke="rgba(255,255,255,0.7)" stroke-width="2"',
      '  stroke-linecap="round" stroke-linejoin="round"/>',

      // Label
      '<text x="' + (w / 2) + '" y="' + (h + 14) + '"',
      '  text-anchor="middle" font-family="Inter, sans-serif"',
      '  font-size="10" fill="#94a3b8" font-weight="500">',
      '  ' + (comp.label || '') + '</text>'
    ].join('\n');
  }

  /**
   * Render a valve as a bowtie (two triangles meeting at center).
   *
   * @param {Object} comp - Component data
   * @returns {string} SVG markup
   */
  function renderValve(comp) {
    var w = comp.width;
    var h = comp.height;
    var midX = w / 2;
    var midY = h / 2;

    // Left triangle: top-left corner → center → bottom-left corner
    // Right triangle: center → top-right corner → bottom-right corner
    var bowtiePath = 'M0,0 L' + midX + ',' + midY + ' L0,' + h +
      ' Z M' + w + ',0 L' + midX + ',' + midY + ' L' + w + ',' + h + ' Z';

    return [
      '<path d="' + bowtiePath + '"',
      '  fill="#64748b" stroke="#475569" stroke-width="1.5"',
      '  filter="url(#drop-shadow)"/>',

      // Label
      '<text x="' + midX + '" y="' + (h + 12) + '"',
      '  text-anchor="middle" font-family="Inter, sans-serif"',
      '  font-size="9" fill="#94a3b8" font-weight="500">',
      '  ' + (comp.label || '') + '</text>'
    ].join('\n');
  }

  /**
   * Render a flow controller instrument bubble (circle with FC text).
   *
   * @param {Object} comp - Component data
   * @returns {string} SVG markup
   */
  function renderFlowController(comp) {
    var w = comp.width;
    var h = comp.height;
    var cx = w / 2;
    var cy = h / 2;
    var r = Math.min(w, h) / 2 - 1;
    var tag = (comp.props && comp.props.tag) || 'FC';

    return [
      // Outer dashed circle
      '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '"',
      '  fill="#1e293b" stroke="#facc15" stroke-width="1.5"',
      '  stroke-dasharray="3 2"/>',

      // Tag text
      '<text x="' + cx + '" y="' + (cy + 3.5) + '"',
      '  text-anchor="middle" font-family="Inter, sans-serif"',
      '  font-size="10" font-weight="600" fill="#facc15">',
      '  ' + tag + '</text>',

      // Label below
      '<text x="' + cx + '" y="' + (h + 12) + '"',
      '  text-anchor="middle" font-family="Inter, sans-serif"',
      '  font-size="9" fill="#94a3b8" font-weight="500">',
      '  ' + (comp.label || '') + '</text>'
    ].join('\n');
  }

  /**
   * Render a concentration indicator instrument bubble (circle with CI text).
   *
   * @param {Object} comp - Component data
   * @returns {string} SVG markup
   */
  function renderConcentrationIndicator(comp) {
    var w = comp.width;
    var h = comp.height;
    var cx = w / 2;
    var cy = h / 2;
    var r = Math.min(w, h) / 2 - 1;
    var tag = (comp.props && comp.props.tag) || 'CI';

    return [
      // Outer dashed circle
      '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '"',
      '  fill="#1e293b" stroke="#22d3ee" stroke-width="1.5"',
      '  stroke-dasharray="3 2"/>',

      // Tag text
      '<text x="' + cx + '" y="' + (cy + 3.5) + '"',
      '  text-anchor="middle" font-family="Inter, sans-serif"',
      '  font-size="10" font-weight="600" fill="#22d3ee">',
      '  ' + tag + '</text>',

      // Label below
      '<text x="' + cx + '" y="' + (h + 12) + '"',
      '  text-anchor="middle" font-family="Inter, sans-serif"',
      '  font-size="9" fill="#94a3b8" font-weight="500">',
      '  ' + (comp.label || '') + '</text>'
    ].join('\n');
  }

  /**
   * Render a pressure indicator: small rounded rectangle with P text.
   *
   * @param {Object} comp - Component data
   * @returns {string} SVG markup
   */
  function renderPressureIndicator(comp) {
    var w = comp.width;
    var h = comp.height;
    var cx = w / 2;
    var cy = h / 2;
    var tag = (comp.props && comp.props.tag) || 'P';

    return [
      // Rounded rect body
      '<rect x="0" y="0" width="' + w + '" height="' + h + '"',
      '  rx="4" fill="#1e293b" stroke="#60a5fa" stroke-width="1.5"/>',

      // Tag text centered
      '<text x="' + cx + '" y="' + (cy + 4) + '"',
      '  text-anchor="middle" font-family="Inter, sans-serif"',
      '  font-size="10" font-weight="600" fill="#60a5fa">',
      '  ' + tag + '</text>',

      // Label below
      '<text x="' + cx + '" y="' + (h + 12) + '"',
      '  text-anchor="middle" font-family="Inter, sans-serif"',
      '  font-size="9" fill="#94a3b8" font-weight="500">',
      '  ' + (comp.label || '') + '</text>'
    ].join('\n');
  }

  // ---------------------------------------------------------------------------
  // Batch Renderer
  // ---------------------------------------------------------------------------

  /**
   * Render all components from PFDConfig.components into the supplied SVG
   * group element. Clears existing children first.
   *
   * Each component is wrapped in a <g> with:
   *   - id matching component id
   *   - classes: 'pfd-component pfd-{type}'
   *   - data-component-id attribute
   *   - transform: translate(x, y)
   *
   * @param {SVGGElement} svgGroupElement - The parent <g> to append into
   */
  function renderAllComponents(svgGroupElement) {
    if (!svgGroupElement) {
      console.error('[PFDComponents] renderAllComponents: no target element');
      return;
    }

    // Clear existing component nodes
    svgGroupElement.innerHTML = '';

    var comps = PFDConfig.components;
    for (var i = 0; i < comps.length; i++) {
      var comp = comps[i];

      // Create the wrapper <g> element in the SVG namespace
      var g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      g.setAttribute('id', comp.id);
      g.setAttribute('class', 'pfd-component pfd-' + comp.type);
      g.setAttribute('data-component-id', comp.id);
      g.setAttribute('transform', 'translate(' + comp.x + ',' + comp.y + ')');

      // Render inner SVG content
      g.innerHTML = renderComponent(comp);

      svgGroupElement.appendChild(g);
    }
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  return {
    createDefs: createDefs,
    renderComponent: renderComponent,

    // Individual renderers (exposed for direct use / testing)
    renderAlgaPond: renderAlgaPond,
    renderAbsorber: renderAbsorber,
    renderGasHolder: renderGasHolder,
    renderPump: renderPump,
    renderBlower: renderBlower,
    renderHeatExchanger: renderHeatExchanger,
    renderValve: renderValve,
    renderFlowController: renderFlowController,
    renderConcentrationIndicator: renderConcentrationIndicator,
    renderPressureIndicator: renderPressureIndicator,

    // Batch renderer
    renderAllComponents: renderAllComponents
  };

})();
