/**
 * =============================================================================
 * PFDPipes - Pipe / Connection Renderer
 * =============================================================================
 *
 * Global object responsible for rendering pipe connections between PFD
 * components. Pipes are drawn as dual-stroke SVG paths (background + foreground)
 * with optional animated flow dashes and directional arrows.
 *
 * Depends on: PFDConfig (config.js must be loaded first)
 * No modules - plain script tag, attaches to window.
 * =============================================================================
 */

var PFDPipes = (function () {
  'use strict';

  // ---------------------------------------------------------------------------
  // Constants & Color Mapping
  // ---------------------------------------------------------------------------

  /**
   * Flow-type → color mapping.
   * Provides visually distinct colours for each medium flowing through pipes.
   *
   * @param {string} type - One of 'water', 'gas', 'co2'
   * @returns {string} CSS colour value
   */
  function getFlowColor(type) {
    switch (type) {
      case 'water': return '#22d3ee';   // Cyan for water
      case 'gas':   return '#a78bfa';   // Purple/violet for lean gas
      case 'co2':   return '#fb923c';   // Orange for CO₂-rich gas
      default:      return '#94a3b8';   // Slate fallback
    }
  }

  /** Corner rounding radius for quadratic bezier at bends */
  var CORNER_RADIUS = 6;

  // ---------------------------------------------------------------------------
  // Path Builder
  // ---------------------------------------------------------------------------

  /**
   * Convert an array of [x, y] waypoints into an SVG path `d` string.
   *
   * For straight segments the function uses L (lineto).
   * At each bend (middle waypoint) it optionally smooths the corner with a
   * quadratic bezier (Q) command using CORNER_RADIUS to create rounded elbows.
   *
   * @param {number[][]} points - Array of [x, y] coordinate pairs
   * @returns {string} SVG path `d` attribute value
   */
  function buildPath(points) {
    if (!points || points.length === 0) return '';
    if (points.length === 1) return 'M' + points[0][0] + ',' + points[0][1];

    // With only two points, draw a straight line
    if (points.length === 2) {
      return 'M' + points[0][0] + ',' + points[0][1] +
        ' L' + points[1][0] + ',' + points[1][1];
    }

    var d = 'M' + points[0][0] + ',' + points[0][1];

    for (var i = 1; i < points.length - 1; i++) {
      var prev = points[i - 1];
      var curr = points[i];
      var next = points[i + 1];

      // Calculate distance to prev & next to clamp radius
      var dPrev = Math.hypot(curr[0] - prev[0], curr[1] - prev[1]);
      var dNext = Math.hypot(next[0] - curr[0], next[1] - curr[1]);
      var r = Math.min(CORNER_RADIUS, dPrev / 2, dNext / 2);

      if (r < 1) {
        // Too short for a curve, just lineto
        d += ' L' + curr[0] + ',' + curr[1];
      } else {
        // Point just before the corner
        var dx1 = curr[0] - prev[0];
        var dy1 = curr[1] - prev[1];
        var len1 = Math.hypot(dx1, dy1);
        var bx = curr[0] - (dx1 / len1) * r;
        var by = curr[1] - (dy1 / len1) * r;

        // Point just after the corner
        var dx2 = next[0] - curr[0];
        var dy2 = next[1] - curr[1];
        var len2 = Math.hypot(dx2, dy2);
        var ax = curr[0] + (dx2 / len2) * r;
        var ay = curr[1] + (dy2 / len2) * r;

        // Line to pre-corner, then quadratic bezier through corner point
        d += ' L' + bx.toFixed(1) + ',' + by.toFixed(1);
        d += ' Q' + curr[0] + ',' + curr[1] + ' ' + ax.toFixed(1) + ',' + ay.toFixed(1);
      }
    }

    // Final lineto the last point
    var last = points[points.length - 1];
    d += ' L' + last[0] + ',' + last[1];

    return d;
  }

  // ---------------------------------------------------------------------------
  // Connection Renderer
  // ---------------------------------------------------------------------------

  /**
   * Render a single pipe connection as an SVG <g> fragment string.
   *
   * Each connection is drawn as two layered paths:
   *   1. Background stroke (darker, wider) — gives a pipe-wall appearance
   *   2. Foreground stroke (coloured, narrower) — represents the flowing medium
   *
   * Animated connections get stroke-dasharray + CSS animation class.
   * A label is rendered at the midpoint of the path if provided.
   *
   * @param {Object} conn - Connection object from PFDConfig.connections
   * @returns {string} SVG markup for the connection group
   */
  function renderConnection(conn) {
    var pathD = buildPath(conn.path);
    var color = getFlowColor(conn.type);

    var parts = [];

    // Background pipe path (wide, dark)
    parts.push(
      '<path d="' + pathD + '"',
      '  fill="none" stroke="#334155" stroke-width="7"',
      '  stroke-linecap="round" stroke-linejoin="round"/>'
    );

    // Foreground flow path (narrower, coloured)
    var flowAttrs = 'fill="none" stroke="' + color + '" stroke-width="3"' +
      ' stroke-linecap="round" stroke-linejoin="round"';

    // Add animated dash if enabled
    if (conn.animated && PFDConfig.settings.flowAnimationEnabled) {
      flowAttrs += ' stroke-dasharray="8 4" class="animate-flow"';
    }

    parts.push(
      '<path d="' + pathD + '" ' + flowAttrs + '/>'
    );

    // Optional label at midpoint
    if (conn.label) {
      var mid = _getMidpoint(conn.path);
      parts.push(
        '<text x="' + mid[0] + '" y="' + (mid[1] - 8) + '"',
        '  text-anchor="middle" font-family="Inter, sans-serif"',
        '  font-size="9" fill="#cbd5e1" font-weight="500"',
        '  paint-order="stroke" stroke="#0f172a" stroke-width="3">',
        '  ' + conn.label + '</text>'
      );
    }

    return parts.join('\n');
  }

  /**
   * Calculate the approximate midpoint of a waypoint array.
   * Uses the middle segment's midpoint for label placement.
   *
   * @param {number[][]} points
   * @returns {number[]} [x, y] midpoint
   * @private
   */
  function _getMidpoint(points) {
    if (!points || points.length === 0) return [0, 0];
    if (points.length === 1) return points[0].slice();

    // Walk along segments to find the one containing the half-length
    var totalLen = 0;
    var segLens = [];
    for (var i = 1; i < points.length; i++) {
      var sl = Math.hypot(
        points[i][0] - points[i - 1][0],
        points[i][1] - points[i - 1][1]
      );
      segLens.push(sl);
      totalLen += sl;
    }

    var halfLen = totalLen / 2;
    var accum = 0;
    for (var j = 0; j < segLens.length; j++) {
      if (accum + segLens[j] >= halfLen) {
        var frac = (halfLen - accum) / segLens[j];
        return [
          points[j][0] + (points[j + 1][0] - points[j][0]) * frac,
          points[j][1] + (points[j + 1][1] - points[j][1]) * frac
        ];
      }
      accum += segLens[j];
    }

    // Fallback: return last point
    return points[points.length - 1].slice();
  }

  // ---------------------------------------------------------------------------
  // Batch Renderer
  // ---------------------------------------------------------------------------

  /**
   * Render all connections from PFDConfig.connections into the supplied SVG
   * group element. Clears existing children first.
   *
   * Each connection is wrapped in a <g> with:
   *   - id matching connection id
   *   - classes: 'pfd-pipe pfd-pipe-{type}'
   *   - data-connection-id attribute
   *
   * @param {SVGGElement} svgGroupElement - The parent <g> to append pipe groups into
   */
  function renderAllConnections(svgGroupElement) {
    if (!svgGroupElement) {
      console.error('[PFDPipes] renderAllConnections: no target element');
      return;
    }

    // Clear existing pipe nodes
    svgGroupElement.innerHTML = '';

    var conns = PFDConfig.connections;
    for (var i = 0; i < conns.length; i++) {
      var conn = conns[i];

      // Create wrapper <g> in SVG namespace
      var g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      g.setAttribute('id', conn.id);
      g.setAttribute('class', 'pfd-pipe pfd-pipe-' + conn.type);
      g.setAttribute('data-connection-id', conn.id);

      // Render inner SVG paths and labels
      g.innerHTML = renderConnection(conn);

      svgGroupElement.appendChild(g);
    }
  }

  // ---------------------------------------------------------------------------
  // Dynamic Updates
  // ---------------------------------------------------------------------------

  /**
   * Update a specific connection's path and re-render only that pipe.
   *
   * @param {string}     connId  - Connection identifier
   * @param {number[][]} newPath - New array of [x, y] waypoints
   */
  function updateConnectionPath(connId, newPath) {
    // Find and update in config
    var conns = PFDConfig.connections;
    var conn = null;
    for (var i = 0; i < conns.length; i++) {
      if (conns[i].id === connId) {
        conns[i].path = newPath;
        conn = conns[i];
        break;
      }
    }

    if (!conn) {
      console.warn('[PFDPipes] updateConnectionPath: id not found -', connId);
      return;
    }

    // Re-render just this pipe element in the DOM
    var el = document.getElementById(connId);
    if (el) {
      el.innerHTML = renderConnection(conn);
    }
  }

  /**
   * Recalculate all connection paths after component positions change
   * (e.g., after a drag operation).
   *
   * Strategy: adjust the first and last waypoints of each connection to
   * snap to the nearest edge midpoint of the source/target component.
   *
   * This is a best-effort auto-router — complex re-routing would require
   * a full pathfinding implementation.
   */
  function recalculateConnectionPaths() {
    var conns = PFDConfig.connections;

    for (var i = 0; i < conns.length; i++) {
      var conn = conns[i];
      var fromComp = PFDConfig.getComponentById(conn.from);
      var toComp = PFDConfig.getComponentById(conn.to);

      if (!fromComp || !toComp || !conn.path || conn.path.length < 2) continue;

      // ── Snap first waypoint to source component edge ─────────────────
      var fromCenter = [
        fromComp.x + fromComp.width / 2,
        fromComp.y + fromComp.height / 2
      ];
      var firstPt = conn.path[0];
      var snappedFirst = _snapToEdge(fromComp, firstPt, fromCenter);
      conn.path[0] = snappedFirst;

      // ── Snap last waypoint to target component edge ──────────────────
      var toCenter = [
        toComp.x + toComp.width / 2,
        toComp.y + toComp.height / 2
      ];
      var lastPt = conn.path[conn.path.length - 1];
      var snappedLast = _snapToEdge(toComp, lastPt, toCenter);
      conn.path[conn.path.length - 1] = snappedLast;
    }
  }

  /**
   * Snap a point to the nearest edge midpoint of a component.
   *
   * @param {Object}   comp    - Component with x, y, width, height
   * @param {number[]} point   - Current [x, y] position
   * @param {number[]} center  - Component center [x, y]
   * @returns {number[]} Snapped [x, y]
   * @private
   */
  function _snapToEdge(comp, point, center) {
    // Four edge midpoints
    var edges = [
      [comp.x,                      comp.y + comp.height / 2], // left
      [comp.x + comp.width,         comp.y + comp.height / 2], // right
      [comp.x + comp.width / 2,     comp.y],                   // top
      [comp.x + comp.width / 2,     comp.y + comp.height]      // bottom
    ];

    var best = edges[0];
    var bestDist = Math.hypot(point[0] - edges[0][0], point[1] - edges[0][1]);

    for (var e = 1; e < edges.length; e++) {
      var d = Math.hypot(point[0] - edges[e][0], point[1] - edges[e][1]);
      if (d < bestDist) {
        bestDist = d;
        best = edges[e];
      }
    }

    return best.slice();
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  return {
    getFlowColor: getFlowColor,
    buildPath: buildPath,
    renderConnection: renderConnection,
    renderAllConnections: renderAllConnections,
    updateConnectionPath: updateConnectionPath,
    recalculateConnectionPaths: recalculateConnectionPaths
  };

})();
