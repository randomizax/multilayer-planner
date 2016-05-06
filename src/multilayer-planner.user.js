// ==UserScript==
// @id             iitc-plugin-multilayer-planner@randomizax
// @name           IITC plugin: Multilayer planner
// @category       Info
// @version        0.3.0.@@DATETIMEVERSION@@
// @namespace      https://github.com/jonatkins/ingress-intel-total-conversion
// @updateURL      @@UPDATEURL@@
// @downloadURL    @@DOWNLOADURL@@
// @description    [@@BUILDNAME@@-@@BUILDDATE@@] Draw layered CF plans.
// @include        https://www.ingress.com/intel*
// @include        http://www.ingress.com/intel*
// @match          https://www.ingress.com/intel*
// @match          http://www.ingress.com/intel*
// @grant          none
// ==/UserScript==

@@PLUGINSTART@@

// PLUGIN START ////////////////////////////////////////////////////////

// use own namespace for plugin
var M = window.plugin.multilayerPlanner = {};
M.overlayer = null;

// Determine whether point c, p is on the same side of the line a-b.
//  return positive if same
//  return negative if opposite
//  return zero if either p or c is exactly on a-b

M.sameSide = function (a, b, c, p, debug) {
  if (debug) console.log(["sameSide start args: a, b, c, p = ", a, b, c, p]);

  // normalize point b and p around a
  b = L.latLng(b.lat, b.lng - a.lng).wrap();
  p = L.latLng(p.lat, p.lng - a.lng).wrap();
  c = L.latLng(c.lat, c.lng - a.lng).wrap();
  a = L.latLng(a.lat, 0);

  if (debug) console.log(["rotated about z axis: a, b, c, p = ", a, b, c, p]);

  var d2r = L.LatLng.DEG_TO_RAD;

  if (b.lng == 0 || b.lng == 180 || b.lng == -180) {
    // ab is completely on north/south line
    if (debug) console.log(["northen/southern ab: ", p.lng * c.lng]);
    // same side if they reside in the same east-west hemisphere
    return Math.sign(p.lng * c.lng);
  }

  var latlng2cartesian = function (p) {
    return [Math.cos(p.lng * d2r) * Math.cos(p.lat * d2r),
            Math.sin(p.lng * d2r) * Math.cos(p.lat * d2r),
            Math.sin(p.lat * d2r)];
  };

  var a3 = latlng2cartesian(a);
  var b3 = latlng2cartesian(b);
  var c3 = latlng2cartesian(c);
  var p3 = latlng2cartesian(p);

  if (debug) console.log(["Cartesian a: latlng, cart: ", a, a3]);
  if (debug) console.log(["Cartesian b: latlng, cart: ", b, b3]);
  if (debug) console.log(["Cartesian c: latlng, cart: ", c, c3]);
  if (debug) console.log(["Cartesian p: latlng, cart: ", p, p3]);

  // Rotate globe so that a->b maps to 0,0 towards north.
  // rotate b, c, p around y axis for a.lat (degrees) ccw
  // rotate p around x axis for -zab (radians)
  // If P is in eastern hemisphere, that's on the right side

  // rotate b, c, p around y axis for a.lat (degrees) ccw
  var sinA = Math.sin(- a.lat * d2r), cosA = Math.cos(- a.lat * d2r);
  if (debug) console.log(["a.lat = " + a.lat, "sinA = " + sinA, "cosA = " + cosA]);
  var roty = function(p) {
    return [cosA * p[0] - sinA * p[2],
            p[1],
            sinA * p[0] + cosA * p[2]];
  };
  var a3r = roty(a3);
  if (debug) console.log(["A rotated y axis by a.lng. a3r should == [1,0,0]: a3r: ", a3r]);
  var b3r = roty(b3);
  if (debug) console.log(["B rotated y axis by a.lng. b3r: ", b3r]);
  var sinZab = b3r[1], cosZab = b3r[2];
  var l = Math.sqrt(sinZab * sinZab + cosZab * cosZab);
  sinZab /= l; cosZab /= l;
  if (debug) console.log("cosZab = " + cosZab + ", sinZab = " + sinZab);
  var rotx = function(p) {
    return [p[0],
            cosZab * p[1] - sinZab * p[2],
            sinZab * p[1] + cosZab * p[2]];
  };
  var b3rr = rotx(b3r);
  if (debug) console.log(["B rotated x axis by Zab. b3rr should == [cosAB, 0, sinAB]: b3rr: ", b3rr]);
  if (debug) console.log(["cosAB, sinAB = ", [Math.cos(ab), Math.sin(ab)]]);
  var c3rr = rotx(roty(c3));
  var p3rr = rotx(roty(p3));
  if (debug) console.log(["c3rr: ", c3rr]);
  if (debug) console.log(["p3rr: ", p3rr]);
  // see if c and p reside on same hemisphere eastern/western
  var result = Math.sign(c3rr[1] * p3rr[1]);
  if (debug) console.log("result : " + result);
  return result;
};


// See if point p is a good candidate for a new layer
//  that covers and shares two vertices with the triangle abc
//  returns null if not possible
//  returns [x,y] where xy is the common baseline
M.overlayerPossible = function (latlngs, p, debug) {
  var a = latlngs[0], b = latlngs[1], c = latlngs[2];
  var abc = M.sameSide(a,b,c,p);
  var bca = M.sameSide(b,c,a,p);
  var cab = M.sameSide(c,a,b,p);

  if (debug) console.log("overlayerPossible: sameSides result: abc = " + abc + ", bca = " + bca + ", cab = " + cab);

  if (abc == 0 || bca == 0 || cab == 0) {
    if (debug) console.log("overlayerPossible: some is on line");
    return null; // some is online
  }
  if (abc > 0 && bca < 0 && cab < 0) return [a,b];
  if (bca > 0 && cab < 0 && abc < 0) return [b,c];
  if (cab > 0 && abc < 0 && bca < 0) return [c,a];
  return null;
};


// Detect if a point is inside polygon.
/*
pnpoly Copyright (c) 1970-2003, Wm. Randolph Franklin

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated
documentation files (the "Software"), to deal in the Software without restriction, including without limitation the
rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit
persons to whom the Software is furnished to do so, subject to the following conditions:

  1. Redistributions of source code must retain the above copyright notice, this list of conditions and the following
     disclaimers.
  2. Redistributions in binary form must reproduce the above copyright notice in the documentation and/or other
     materials provided with the distribution.
  3. The name of W. Randolph Franklin may not be used to endorse or promote products derived from this Software without
     specific prior written permission.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE
WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
*/
M.pointInPolygon = function ( polygon, pt ) {
  var poly = polygon.getLatLngs();

  var onpoly = false;
  for(var c = false, i = -1, l = poly.length, j = l - 1; ++i < l; j = i) {
    if (poly[i].equals(pt))
      onpoly = true;
    if (((poly[i].lat <= pt.lat && pt.lat < poly[j].lat) ||
         (poly[j].lat <= pt.lat && pt.lat < poly[i].lat)) &&
        (pt.lng < (poly[j].lng - poly[i].lng) * (pt.lat - poly[i].lat) / (poly[j].lat - poly[i].lat) + poly[i].lng)) {
      c = !c;
    }
  }
  return c | onpoly;
};

M.triangleEqual = function(a,b) {
  var a_points = a.getLatLngs();
  var b_points = b.getLatLngs();
  if (a_points.length !== b_points.length) return false;
  var sorter = function(x, y) {
    var lat = x.lat - y.lat;
    return lat === 0.0 ? lat : x.lng - y.lng;
  };
  a_points = a_points.sort(sorter);
  b_points = b_points.sort(sorter);
  for (var i = 0; i < a_points.length; i++) {
    if (!a_points[i].equals(b_points[i]))
      return false;
  }
  return true;
};

// See if two triangles have a common edge.
// return [0] if two triangles are equal
// return [1, p, q] if a includes b and pq is the common edge
// return [2, p, q] if b includes a and pq is the common edge
// return [3, p, q] if a and b have a common edge pq, and a and b don't intersect
// return [4, p, q] if a and b have a common edge pq, but and b intersect
// return [5] if a and b don't have a common edge
M.commonEdge = function(a,b) {
  var a_points = a.getLatLngs();
  var b_points = b.getLatLngs();
  if (a_points.length !== 3 ||
      b_points.length !== 3)
    return [5];
  var points = {};
  var addPoints = function(latlngs, label) {
    latlngs.forEach(function (p){
      var s = p.toString();
      points[s] = points[s] || [];
      points[s].push([label, p]);
    });
  };
  addPoints(a_points, 'a');
  addPoints(b_points, 'b');
  var keys = Object.keys(points);
  if (keys.length === 3) {
    return [0];
  } else if (keys.length !== 4) {
    return [5];
  }
  var p, q, ap, bp;
  keys.forEach(function (k) {
    if (points[k].length === 2) {
      if (p) q = points[k][0][1];
      else   p = points[k][0][1];
    } else if (points[k][0][0] == 'a') {
      ap = points[k][0][1];
    } else {
      bp = points[k][0][1];
    }
  });
  if (M.pointInPolygon(a, bp))
    return [1, p, q];
  if (M.pointInPolygon(b, ap))
    return [2, p, q];
  if (M.sameSide(p, q, ap, bp) > 0)
    return [4, p, q];
  return [3, p, q];
};

// M.commonEdge Test cases
// M.p00 = L.latLng(0,0);
// M.p10 = L.latLng(1,0);
// M.p01 = L.latLng(0,1);
// M.p02 = L.latLng(0,2);
// M.p11 = L.latLng(1,1);
// M.p21 = L.latLng(2,1);
// M.pA = L.polygon([M.p00,M.p01,M.p10],{});
// M.pB = L.polygon([M.p00,M.p02,M.p11],{});
// M.pC = L.polygon([M.p00,M.p21,M.p02],{});
// M.pD = L.polygon([M.p01,M.p10,M.p11],{});
// M.pE = L.polygon([M.p00,M.p02,M.p10],{});
// console.debug(["commonEdge(A,A) should eq [0]",         M.commonEdge(M.pA, M.pA)]);
// console.debug(["commonEdge(B,C) should eq [2,p00,p02]", M.commonEdge(M.pB, M.pC)]);
// console.debug(["commonEdge(C,B) should eq [1,p00,p02]", M.commonEdge(M.pC, M.pB)]);
// console.debug(["commonEdge(A,D) should eq [3,p01,p10]", M.commonEdge(M.pA, M.pD)]);
// console.debug(["commonEdge(B,E) should eq [4,p00,p02]", M.commonEdge(M.pB, M.pE)]);
// console.debug(["commonEdge(A,C) should eq [5]",         M.commonEdge(M.pA, M.pC)]);

// Be sure to run after draw-tool is loaded.
M.defineOverlayer = function(L, button) {
  if (L.Overlayer) return;

  L.Overlayer = L.Draw.Polyline.extend({
    statics: {
      TYPE: 'polygon' // we create polygons
    },

    options: {
      icon: new L.DivIcon({
        iconSize: new L.Point(8, 8),
        className: 'leaflet-div-icon leaflet-editing-icon'
      }),
      drawError: {
        message: "Can't create non-crossing CF here"
      },
      guidelineDistance: 20,
      shapeOptions: {
	stroke: true,
	color: '#f06eaa',
	weight: 4,
	opacity: 0.5,
	fill: false,
	clickable: true
      },
      snapPoint: window.plugin.drawTools.getSnapLatLng,
      repeatMode: true,
      metric: true, // Whether to use the metric measurement system or imperial
      zIndexOffset: 2000 // This should be > than the highest z-index any map layers
    },

    initialize: function (map, options) {
      // Save the type so super can fire, need to do this as cannot do this.TYPE :(
      this.type = L.Overlayer.TYPE;

      L.Draw.Polyline.prototype.initialize.call(this, map, options);

      this._base = null;
      this._layers = [];
      M.tooltip.innerHTML = '';
    },

    reset: function () {
      this._base = null;
      this._layers = [];
      M.tooltip.innerHTML = '';
    },

    addHooks: function () {
      L.Draw.Polyline.prototype.addHooks.call(this);
      if (this._map) {
        this._markers = [];

        this._markerGroup = new L.LayerGroup();
        this._map.addLayer(this._markerGroup);

	this._poly = new L.GeodesicPolyline([], this.options.shapeOptions);

        this._tooltip.updateContent(this._getTooltipText());

	// Make a transparent marker that will used to catch click events. These click
	// events will create the vertices. We need to do this so we can ensure that
	// we can create vertices over other map layers (markers, vector layers). We
	// also do not want to trigger any click handlers of objects we are clicking on
	// while drawing.
        if (!this._mouseMarker) {
	  this._mouseMarker = L.marker(this._map.getCenter(), {
	    icon: L.divIcon({
	      className: 'leaflet-mouse-marker',
	      iconAnchor: [20, 20],
	      iconSize: [40, 40]
	    }),
	    opacity: 0,
	    zIndexOffset: this.options.zIndexOffset,
	  });
        }

        this._mouseMarker
	  .on('click', this._onClick, this)
	  .addTo(this._map);

        this._map
	  .on('mousemove', this._onMouseMove, this)
          .on('zoomend', this._onZoomEnd, this);
      }
    },

    _finishShape: function () {
      this.disable();
    },

    _onZoomEnd: function () {
      this._updateGuide();
    },

    _onMouseMove: function (e) {
      var newPos = e.layerPoint,
      latlng = e.latlng;

      // Save latlng
      this._currentLatLng = latlng;

      this._updateTooltip(latlng);

      // Update the guide line
      this._updateGuide(latlng);

      // Update the mouse marker position
      this._mouseMarker.setLatLng(latlng);

      L.DomEvent.preventDefault(e.originalEvent);
    },

    _addMultiLayer: function(layer) {
      this._base = layer;
      this._layers.push(layer);
      this._updateTooltip();
      if (M.tooltip) {
        M.tooltip.innerHTML = this._layers.length + " layers";
      }
    },

    _appendMultiLayer: function(layer) {
      this._layers.unshift(layer);
      this._updateTooltip();
      if (M.tooltip) {
        M.tooltip.innerHTML = this._layers.length + " layers";
      }
    },

    _pickFirst: function(newPos) {
      if (this._errorShown) {
	this._hideErrorTooltip();
      }

      if (this._markers.length == 0) {
        // Try picking an existing trigon
        var candidates = [];
        window.plugin.drawTools.drawnItems.eachLayer( function( layer ) {
          if (layer instanceof L.GeodesicPolygon ||
              layer instanceof L.Polygon ||
              layer instanceof L.GeodesicPolyline ||
              layer instanceof L.Polyline) {
            if (layer.getLatLngs().length == 3) {
              if ( M.pointInPolygon( layer, newPos ) ) {
                candidates.push([M.polygonInfo(layer).area, layer]);
              }
            }
          }
        });
        if (candidates.length > 0) {
          // find outermost (i.e. largest) polygon
          candidates = candidates.sort(function(a, b) { return b[0]-a[0]; });
          polygon = candidates[0][1];
          this._addMultiLayer(polygon);
          candidates = [];
          window.plugin.drawTools.drawnItems.eachLayer( function( layer ) {
            if (layer instanceof L.GeodesicPolygon ||
                layer instanceof L.Polygon ||
                layer instanceof L.GeodesicPolyline ||
                layer instanceof L.Polyline) {
              if (layer.getLatLngs().length == 3) {
                candidates.push([M.polygonInfo(layer).area, layer]);
              }
            }
          });
          candidates = candidates.sort(function(a, b) { return b[0]-a[0]; });
          var p = polygon;
          for (var i = 1; i < candidates.length; i++) {
            var v = M.commonEdge(p, candidates[i][1]);
            if (v[0] === 1) {
              p = candidates[i][1];
              this._appendMultiLayer(p);
            }
          }
          return;
        }
      }
      // if we already have that point, ignore
      var markerCount = this._markers.length;
      var found = false;
      if (markerCount >= 1) {
        var m0 = this._markers[0].getLatLng();
        if (m0.lat == newPos.lat && m0.lng == newPos.lng) found = true;
      }
      if (markerCount >= 2) {
        var m1 = this._markers[1].getLatLng();
        if (m1.lat == newPos.lat && m1.lng == newPos.lng) found = true;
      }

      if (found) {
        // ignore
      } else {
        if (markerCount == 2) {
          // this completes a base CF
          var latlngs = [this._markers[0].getLatLng(),
                         this._markers[1].getLatLng(),
                         newPos];
          var layer = L.geodesicPolygon(latlngs, L.extend({},window.plugin.drawTools.polygonOptions));
          this._fireCreatedEvent(layer);
          this._addMultiLayer(layer);

          // remove markers from map
	  this._map.removeLayer(this._markerGroup);
	  delete this._markerGroup;
	  delete this._markers;

          // add (dummy) empty layer to make removeHooks happy
          this._markers = [];
          this._markerGroup = new L.LayerGroup();
          this._map.addLayer(this._markerGroup);
        } else {
          this._markers.push(this._createMarker(newPos));
        }
      }
      // console.log("nothing");
    },

    _addPoint: function(newPos) {
      if (this._base == null) {
        this._pickFirst(newPos);
      } else {
        if (this.options.snapPoint) newPos = this.options.snapPoint(newPos);

        if (this._errorShown) {
	  this._hideErrorTooltip();
	}

        // create new layer
        var latlngs = this._base.getLatLngs();
        var ab = M.overlayerPossible(latlngs, newPos);

        if (ab == null) {
          this._showErrorTooltip();
        } else {
          ab.push(newPos);
          var layer = L.geodesicPolygon(ab, L.extend({},window.plugin.drawTools.polygonOptions));
          if (!M.triangleEqual(this._base, layer)) {
            this._fireCreatedEvent(layer);
            this._addMultiLayer(layer);
          }
        }
      }
    },

    _onClick: function (e) {
      var newPos = e.target.getLatLng();
      if (this.options.snapPoint) newPos = this.options.snapPoint(newPos);

      this._addPoint(newPos);

      this._clearGuides();

      this._updateTooltip();
    },

    _getTooltipText: function() {
      if (this._base === null) {
        if (this._markers.length == 0) {
          return { text: 'Click on an existing drawn trigon or choose three portals' };
        } else if (this._markers.length == 1) {
          return { text: 'Click on the second portal' };
        } else if (this._markers.length == 2) {
          return { text: 'Click on the third portal' };
        } else {
          return { text: 'Whoa there...' };
        }
      } else {
        return { text: 'Click on a portal to add a layer' };
      }
    },

    _updateGuide: function (latlng) {
      latlng = latlng || this._currentLatLng;
      var newPos = this._map.latLngToLayerPoint(latlng);

      // draw the guide line
      this._clearGuides();

      if (this._base) {
        // Adding new layer mode.
        // draw guides iff new overlayer is possible
        var latlngs = this._base.getLatLngs();
        var ab = M.overlayerPossible(latlngs, latlng);
        if (ab) {
          this._drawGuide(this._map.latLngToLayerPoint(ab[0]), newPos);
          this._drawGuide(this._map.latLngToLayerPoint(ab[1]), newPos);
        }
      } else {
        // Setting the first layer mode.
        if (this._markers) {
          if (this._markers[0]) {
            this._drawGuide(this._map.latLngToLayerPoint(this._markers[0].getLatLng()), newPos);
          }
          if (this._markers[1]) {
            this._drawGuide(this._map.latLngToLayerPoint(this._markers[0].getLatLng()),
                            this._map.latLngToLayerPoint(this._markers[1].getLatLng()));
            this._drawGuide(this._map.latLngToLayerPoint(this._markers[1].getLatLng()), newPos);
          }
        }
      }
    },

    _showErrorTooltip: function () {
      this._errorShown = true;

      // Update tooltip
      this._tooltip
	.showAsError()
	.updateContent({ text: this.options.drawError.message });

      // Hide the error after 2 seconds
      this._clearHideErrorTimeout();
      this._hideErrorTimeout = setTimeout(L.Util.bind(this._hideErrorTooltip, this), this.options.drawError.timeout);
    },

    _hideErrorTooltip: function () {
      this._errorShown = false;

      this._clearHideErrorTimeout();

      // Revert tooltip
      this._tooltip
	.removeError()
	.updateContent(this._getTooltipText());
    },

    _fireCreatedEvent: function (layer) {
      L.Draw.Feature.prototype._fireCreatedEvent.call(this, layer);
    },

    _cleanUpShape: function () {}
  });

  layer = M.overlayer = new L.Overlayer(window.map, {});
  layer.on('enabled', function() {
    button.classList.add("active");
  });
  layer.on('disabled', function() {
    button.classList.remove("active");
  });

  button.addEventListener("click", function(ev) {
    if (button.classList.contains("active")) {
      layer.disable();
    } else {
      layer.reset();
      layer.enable();
    }
  });

  var drawControl = window.plugin.drawTools.drawControl;
  for (var toolbarId in drawControl._toolbars) {
    if (drawControl._toolbars[toolbarId] instanceof L.Toolbar) {
      drawControl._toolbars[toolbarId].disable();
      drawControl._toolbars[toolbarId].on('enable', function() {
        if (M.overlayer)
          M.overlayer.disable();
      });
    }
  }
};

// return { area: area, cog: center_of_gravity_latlng }
M.polygonInfo = function(polygon) {
  var poly = polygon.getLatLngs();
  var n = poly.length;
  if (n == 0) return [ 0, null ] ;
  var glat = 0.0, glng = 0.0, area = 0.0;
  var p1 = poly[n-1];
  for (var i = 0; i < n; i++) {
    var p2 = poly[i];
    var s = (p2.lat * p1.lng - p1.lat * p2.lng) / 2.0;
    area += s;
    glat += s * (p1.lat + p2.lat) / 3.0;
    glng += s * (p1.lng + p2.lng) / 3.0;
    p1 = p2;
  }
  glat /= (area + 0.0);
  glng /= (area + 0.0);
  return { area: Math.abs(area), cog: new L.LatLng(glat, glng) };
};

/*
M.onTipClick = function(ev) {
  dialog({
    html: $('<div id="multilayerPlanner">' + M.farm.count() + "</div>"),
    dialogClass: 'ui-dialog-multilayer-planner',
    title: 'Multilayer Planner',
    id: 'multilayer-planner-copy',
    width: 300
  });
};
*/

var setup = function() {
  $('<style>').prop('type', 'text/css').html('@@INCLUDESTRING:src/multilayer-planner.css@@').appendTo('head');

  var parent = $(".leaflet-top.leaflet-left", window.map.getContainer());

  var button = document.createElement("a");
  button.className = "leaflet-bar-part";
  button.title = 'Plan multilayer fields';

  var tooltip = document.createElement("div");
  tooltip.className = "leaflet-control-multilayer-planner-tooltip";
  // tooltip.addEventListener("click", M.onTipClick, false);
  button.appendChild(tooltip);

  var container = document.createElement("div");
  container.className = "leaflet-control-multilayer-planner leaflet-bar leaflet-control";
  container.appendChild(button);
  parent.append(container);

  M.button = button;
  M.tooltip = tooltip;
  M.container = container;

  M.defineOverlayer(L, M.button);
};


// PLUGIN END //////////////////////////////////////////////////////////

@@PLUGINEND@@
