// ==UserScript==
// @id             iitc-plugin-multilayer-planner@randomizax
// @name           IITC plugin: Report multilayer planner
// @category       Info
// @version        0.1.0.@@DATETIMEVERSION@@
// @namespace      https://github.com/jonatkins/ingress-intel-total-conversion
// @updateURL      @@UPDATEURL@@
// @downloadURL    @@DOWNLOADURL@@
// @description    [@@BUILDNAME@@-@@BUILDDATE@@] Draw layered triangles.
// @include        https://www.ingress.com/intel*
// @include        http://www.ingress.com/intel*
// @match          https://www.ingress.com/intel*
// @match          http://www.ingress.com/intel*
// @grant          none
// ==/UserScript==

@@PLUGINSTART@@

// PLUGIN START ////////////////////////////////////////////////////////

// use own namespace for plugin
window.plugin.multilayerPlanner = {};
window.plugin.multilayerPlanner.clicker = null;

// Determine whether point c, p is on the same side of the line a-b.
//  return positive if same
//  return negative if opposite
//  return zero if either p or c is exactly on a-b

window.plugin.multilayerPlanner.sameSide = function (a, b, c, p) {
  // normalize point b and p around a
  b = L.latLng(b.lat, b.lng - a.lng).wrap();
  p = L.latLng(p.lat, p.lng - a.lng).wrap();
  c = L.latLng(c.lat, c.lng - a.lng).wrap();
  a = L.latLng(a.lat, 0);

  // console.log(["rotated about z axis: a, b, c, p = ", a, b, c, p]);

  if (b.lng == 0 || b.lng == 180 || b.lng == -180) {
    // ab is completely on north/south line
    // console.log(["northen/southern ab: ", p.lng * c.lng]);
    return Math.sign(p.lng * c.lng); // same side if they reside in the same hemisphere
  }

  var d2r = L.LatLng.DEG_TO_RAD;
  var latlng2cartesian = function (p) {
    return [Math.cos(p.lng * d2r) * Math.cos(p.lat * d2r),
            Math.sin(p.lng * d2r) * Math.cos(p.lat * d2r),
            Math.sin(p.lat * d2r)];
  };

  // var a3 = latlng2cartesian(a);
  var b3 = latlng2cartesian(b);
  var c3 = latlng2cartesian(c);
  var p3 = latlng2cartesian(p);

  // console.log(["Cartesian a: latlng, cart: ", a, a3]);
  // console.log(["Cartesian b: latlng, cart: ", b, b3]);
  // console.log(["Cartesian c: latlng, cart: ", c, c3]);
  // console.log(["Cartesian p: latlng, cart: ", p, p3]);

  var R = 6378137;
  var ab = a.distanceTo(b) / R; // in radians
  // console.log(["distance ab = " + a.distanceTo(b), "ab = " + ab]);
  var sinZab = Math.cos(b.lat * d2r) * Math.sin(b.lng * d2r) / Math.sin(ab);
  var cosZab = Math.sqrt(1 - sinZab * sinZab);

  // Rotate globe so that a->b maps to 0,0 towards north.
  // rotate b, c, p around y axis for a.lat (degrees) ccw
  // rotate p around x axis for -zab (radians)
  // If P is in eastern hemisphere, that's on the right side

  // rotate b, c, p around y axis for a.lat (degrees) ccw
  var sinA = Math.sin(- a.lat * d2r), cosA = Math.cos(- a.lat * d2r);
  // console.log(["a.lat = " + a.lat, "sinA = " + sinA, "cosA = " + cosA]);
  var roty = function(p) {
    return [cosA * p[0] - sinA * p[2],
            p[1],
            sinA * p[0] + cosA * p[2]];
  };
  // var a3r = roty(a3);
  // console.log(["A rotated y axis by a.lng. a3r should == [1,0,0]: a3r: ", a3r]);
  var b3r = roty(b3);
  // console.log(["B rotated y axis by a.lng. b3r: ", b3r]);
  if (b3r[2] < 0) cosZab = - cosZab;
  var rotx = function(p) {
    return [p[0],
            cosZab * p[1] - sinZab * p[2],
            sinZab * p[1] + cosZab * p[2]];
  };
  // var b3rr = rotx(b3r);
  // console.log(["B rotated x axis by Zab. b3rr should == [cosAB, 0, sinAB]: b3rr: ", b3rr]);
  // console.log(["cosAB, sinAB = ", [Math.cos(ab), Math.sin(ab)]]);
  var c3rr = rotx(roty(c3));
  var p3rr = rotx(roty(p3));
  // console.log(["c3rr: ", c3rr]);
  // console.log(["p3rr: ", p3rr]);
  // see if c and p reside on same hemisphere eastern/western
  return Math.sign(c3rr[1] * p3rr[1]);
};


// Interpolate between a and b at ratio lngPos (0..1).
window.plugin.multilayerPlanner.geodesicInterpolate = function (a, b, lngPos) {
  var R = 6378137; // earth radius in meters (doesn't have to be exact)
  var d2r = Math.PI/180.0;
  var r2d = 180.0/Math.PI;

  // maths based on http://williams.best.vwh.net/avform.htm#Int

  var lat1 = a.lat * d2r;
  var lat2 = b.lat * d2r;
  var lng1 = a.lng * d2r;
  var lng2 = b.lng * d2r;

  var dLng = lng2-lng1;

  var sinLat1 = Math.sin(lat1);
  var sinLat2 = Math.sin(lat2);
  var cosLat1 = Math.cos(lat1);
  var cosLat2 = Math.cos(lat2);

  var sinLat1CosLat2 = sinLat1*cosLat2;
  var sinLat2CosLat1 = sinLat2*cosLat1;

  var cosLat1CosLat2SinDLng = cosLat1*cosLat2*Math.sin(dLng);

  var iLng = lng1+dLng * lngPos;
  var iLat = Math.atan( (sinLat1CosLat2*Math.sin(lng2-iLng) + sinLat2CosLat1*Math.sin(iLng-lng1))
                        / cosLat1CosLat2SinDLng)

  var point = L.latLng ( [iLat*r2d, iLng*r2d] );
  return point;
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
window.plugin.multilayerPlanner.pointInPolygon = function ( polygon, pt ) {
  var poly = polygon.getLatLngs();

  var onpoly = false;
  for(var c = false, i = -1, l = poly.length, j = l - 1; ++i < l; j = i) {
    if (poly[i].lat == pt.lat && poly[i].lng == pt.lng)
      onpoly = true;
    if (((poly[i].lat <= pt.lat && pt.lat < poly[j].lat) ||
         (poly[j].lat <= pt.lat && pt.lat < poly[i].lat)) &&
        (pt.lng < (poly[j].lng - poly[i].lng) * (pt.lat - poly[i].lat) / (poly[j].lat - poly[i].lat) + poly[i].lng)) {
      c = !c;
    }
  }
  return c | onpoly;
};

// Be sure to run after draw-tool is loaded.
window.plugin.multilayerPlanner.defineClicker = function(L) {
  if (L.Clicker) return;

  L.Clicker = L.Draw.Feature.extend({
    statics: {
      TYPE: 'clicker'
    },

    options: {
      icon: new L.DivIcon({
        iconSize: new L.Point(8, 8),
        className: 'leaflet-div-icon leaflet-editing-icon'
      }),
      repeatMode: true,
      metric: true, // Whether to use the metric measurement system or imperial
      zIndexOffset: 2000 // This should be > than the highest z-index any map layers
    },

    initialize: function (map, options) {
      // Save the type so super can fire, need to do this as cannot do this.TYPE :(
      this.type = L.Clicker.TYPE;

      L.Draw.Feature.prototype.initialize.call(this, map, options);

      this._base = null;
    },

    addHooks: function () {
      L.Draw.Feature.prototype.addHooks.call(this);
      if (this._map) {
        this._markers = [];

        this._markerGroup = new L.LayerGroup();
        this._map.addLayer(this._markerGroup);

        this._tooltip.updateContent(this._getTooltipText());

        if (!this._mouseMarker) {
	  this._mouseMarker = L.marker(this._map.getCenter(), {
	    icon: L.divIcon({
	      className: 'leaflet-mouse-marker',
	      iconAnchor: [20, 20],
	      iconSize: [40, 40]
	    }),
	    opacity: 0,
	    zIndexOffset: this.options.zIndexOffset
	  });
        }

        this._mouseMarker
	  .on('click', this._onClick, this)
	  .addTo(this._map);

        this._map
	  .on('mousemove', this._onMouseMove, this);
      }
    },

    removeHooks: function () {
      L.Draw.Feature.prototype.removeHooks.call(this);

      this._mouseMarker.off('click', this._onClick, this);
      this._map.removeLayer(this._mouseMarker);
      delete this._mouseMarker;

      this._map
        .off('mousemove', this._onMouseMove, this);
    },

    _finishShape: function () {
      this.disable();
    },

    _onMouseMove: function (e) {
      var newPos = e.layerPoint,
      latlng = e.latlng;

      // Save latlng
      this._currentLatLng = latlng;

      this._updateTooltip(latlng);

      // Update the mouse marker position
      this._mouseMarker.setLatLng(latlng);

      L.DomEvent.preventDefault(e.originalEvent);
    },

    _onClick: function (e) {
      var latlng = e.target.getLatLng();

      // console.log(["Clicker._onClick", latlng]);
      window.plugin.multilayerPlanner.pick(latlng);

      this._updateTooltip();
    },

    _getTooltipText: function() {
      if (window.plugin.multilayerPlanner.base === null) {
        return { text: 'Click on existing trigon' };
      } else {
      }
    },

    _updateTooltip: function (latLng) {
      var text = this._getTooltipText();

      if (latLng) {
        this._tooltip.updatePosition(latLng);
      }

      if (!this._errorShown) {
        this._tooltip.updateContent(text);
      }
    },

  });
};

// return { area: area, cog: center_of_gravity_latlng }
window.plugin.multilayerPlanner.polygonInfo = function(polygon) {
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
  return { area: area, cog: new L.LatLng(glat, glng) };
};

// Pick a portal at the point.
//  Or a portals enclosed in the (innermost) polygon at the point.
window.plugin.multilayerPlanner.pick = function(point) {
  var portalGuid = window.plugin.multilayerPlanner.portalOnPoint(point);

  if (portalGuid) {
    var portal = window.portals[portalGuid];
    // console.log([portal.options.data.title, portal.getLatLng()]);
    window.plugin.multilayerPlanner.farm.add(portalGuid, window.plugin.multilayerPlanner.Farm.CORE);
  } else {
    var candidates = [];
    window.plugin.drawTools.drawnItems.eachLayer( function( layer ) {
      if ( window.plugin.multilayerPlanner.pointInPolygon( layer, point ) ) {
        if (layer instanceof L.GeodesicCircle ||
            layer instanceof L.Circle ||
            layer instanceof L.GeodesicPolygon ||
            layer instanceof L.Polygon ||
            layer instanceof L.GeodesicPolyline ||
            layer instanceof L.Polyline) {
          candidates.push([Math.abs(window.plugin.multilayerPlanner.polygonInfo(layer).area), layer]);
        }
      }
    });
    if (candidates.length == 0) {
      // console.log("nothing");
    } else {
      // find innermost (i.e. smallest) polygon
      candidates = candidates.sort(function(a, b) { return a[0]-b[0]; });
      polygon = candidates[0][1];
      $.each(window.portals, function(i, portal) {
        if (window.plugin.multilayerPlanner.pointInPolygon( polygon, portal.getLatLng() )) {
          // console.log([portal.options.data.title, portal.getLatLng()]);
          window.plugin.multilayerPlanner.farm.add(portal.options.guid, window.plugin.multilayerPlanner.farm.CORE);
        }
      });
    }
  }
  window.plugin.multilayerPlanner.updateStats();
};

window.plugin.multilayerPlanner.updateStats = function() {
  window.plugin.multilayerPlanner.tooltip.innerHTML = window.plugin.multilayerPlanner.farm.count();
};

window.plugin.multilayerPlanner.onBtnClick = function(ev) {
  var btn = window.plugin.multilayerPlanner.button,
  tooltip = window.plugin.multilayerPlanner.tooltip,
  layer = window.plugin.multilayerPlanner.layer;

  if (btn.classList.contains("active")) {
    window.plugin.multilayerPlanner.clicker.disable();
    btn.classList.remove("active");
  } else {
    window.plugin.multilayerPlanner.farm = new window.plugin.multilayerPlanner.Farm();
    window.plugin.multilayerPlanner.clicker.enable();
    btn.classList.add("active");
    window.plugin.multilayerPlanner.updateStats();
  }
};

window.plugin.multilayerPlanner.onTipClick = function(ev) {
  dialog({
    html: $('<div id="multilayerPlanner">' + window.plugin.multilayerPlanner.farm.count() + "</div>"),
    dialogClass: 'ui-dialog-multilayer-planner',
    title: 'Multilayer Planner',
    id: 'multilayer-planner-copy',
    width: 300
  });
};

var setup = function() {
  $('<style>').prop('type', 'text/css').html('@@INCLUDESTRING:src/multilayer-planner.css@@').appendTo('head');

  window.plugin.multilayerPlanner.defineClicker(L);
  window.plugin.multilayerPlanner.clicker = new L.Clicker(map, {});

  var parent = $(".leaflet-top.leaflet-left", window.map.getContainer());

  var button = document.createElement("a");
  button.className = "leaflet-bar-part";
  button.addEventListener("click", window.plugin.multilayerPlanner.onBtnClick, false);
  button.title = 'Count portal levels in polygons';

  var tooltip = document.createElement("div");
  tooltip.className = "leaflet-control-multilayer-planner-tooltip";
  tooltip.addEventListener("click", window.plugin.multilayerPlanner.onTipClick, false);
  button.appendChild(tooltip);

  var container = document.createElement("div");
  container.className = "leaflet-control-multilayer-planner leaflet-bar leaflet-control";
  container.appendChild(button);
  parent.append(container);

  window.plugin.multilayerPlanner.button = button;
  window.plugin.multilayerPlanner.tooltip = tooltip;
  window.plugin.multilayerPlanner.container = container;
};


// PLUGIN END //////////////////////////////////////////////////////////

@@PLUGINEND@@
