// ==UserScript==
// @id             iitc-plugin-multilayer-planner@randomizax
// @name           IITC plugin: Multilayer planner
// @category       Info
// @version        0.1.1.@@DATETIMEVERSION@@
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
window.plugin.multilayerPlanner.overlayer = null;

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

  var R = 6378137;
  var d2r = L.LatLng.DEG_TO_RAD;

  if (b.lng == 0 || b.lng == 180 || b.lng == -180) {
    // ab is completely on north/south line
    // console.log(["northen/southern ab: ", p.lng * c.lng]);
    // same side if they reside in the same east-west hemisphere
    return Math.sign(p.lng * c.lng);
  }

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


// See if point p is a good candidate for a new layer
//  that covers and shares two vertices with the triangle abc
//  returns null if not possible
//  returns [x,y] where xy is the common baseline
window.plugin.multilayerPlanner.overlayerPossible = function (latlngs,p) {
  var a = latlngs[0], b = latlngs[1], c = latlngs[2];
  var abc = window.plugin.multilayerPlanner.sameSide(a,b,c,p);
  var bca = window.plugin.multilayerPlanner.sameSide(b,c,a,p);
  var cab = window.plugin.multilayerPlanner.sameSide(c,a,b,p);

  if (abc == 0 || bca == 0 || cab == 0) return null; // some is online
  if (abc > 0 && bca < 0 && cab < 0) return [a,b];
  if (bca > 0 && cab < 0 && abc < 0) return [b,c];
  if (cab > 0 && abc < 0 && bca < 0) return [c,a];
  return null;
};

/*
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
*/

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
window.plugin.multilayerPlanner.defineOverlayer = function(L) {
  if (L.Overlayer) return;

  L.Overlayer = L.Draw.Polyline.extend({
    statics: {
      TYPE: 'overlayer'
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
      // Need to set this here to ensure the correct message is used.
      this.options.drawError.message = L.drawLocal.draw.handlers.polyline.error;

      // Merge default drawError options with custom options
      if (options && options.drawError) {
	options.drawError = L.Util.extend({}, this.options.drawError, options.drawError);
      }

      // Save the type so super can fire, need to do this as cannot do this.TYPE :(
      this.type = L.Overlayer.TYPE;

      L.Draw.Polyline.prototype.initialize.call(this, map, options);

      this._base = null;
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
      this._base = null;
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

    _onClick: function (e) {
      var newPos = e.target.getLatLng();

      if (this._base == null) {
        if (this._errorShown) {
	  this._hideErrorTooltip();
	}

        // pick first trigon
        var candidates = [];
        window.plugin.drawTools.drawnItems.eachLayer( function( layer ) {
          if ( window.plugin.multilayerPlanner.pointInPolygon( layer, newPos ) ) {
            if (layer instanceof L.GeodesicPolygon ||
                layer instanceof L.Polygon ||
                layer instanceof L.GeodesicPolyline ||
                layer instanceof L.Polyline) {
              if (layer.getLatLngs().length == 3) {
                candidates.push([Math.abs(window.plugin.multilayerPlanner.polygonInfo(layer).area), layer]);
              }
            }
          }
        });
        if (candidates.length == 0) {
          // console.log("nothing");
        } else {
          // find outermost (i.e. largest) polygon
          candidates = candidates.sort(function(a, b) { return b[0]-a[0]; });
          polygon = candidates[0][1];
          this._base = polygon;
        }
      } else {
        if (this.options.snapPoint) newPos = this.options.snapPoint(newPos);

        if (this._errorShown) {
	  this._hideErrorTooltip();
	}

        // create new layer
        var latlngs = this._base.getLatLngs();
        var ab = window.plugin.multilayerPlanner.overlayerPossible(latlngs, newPos);

        if (ab == null) {
          this._showErrorTooltip();
        } else {
          ab.push(newPos);
          var layer = L.geodesicPolygon(ab, L.extend({},window.plugin.drawTools.polygonOptions));
          window.plugin.drawTools.drawnItems.addLayer(layer);
          this._base = layer;
        }
      }

      this._clearGuides();

      this._updateTooltip();
    },

    _getTooltipText: function() {
      if (this._base === null) {
        return { text: 'Click on an existing field' };
      } else {
        return { text: 'Click on portal to add a layer' };
      }
    },

    _updateGuide: function (latlng) {
      latlng = latlng || this._currentLatLng;
      var newPos = this._map.latLngToLayerPoint(latlng);

      // draw the guide line
      this._clearGuides();

      // draw guides iff new overlayer is possible
      if (this._base) {
        var latlngs = this._base.getLatLngs();
        var ab = window.plugin.multilayerPlanner.overlayerPossible(latlngs, latlng);
        if (ab) {
          this._drawGuide(this._map.latLngToLayerPoint(ab[0]), newPos);
          this._drawGuide(this._map.latLngToLayerPoint(ab[1]), newPos);
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

    _fireCreatedEvent: function () {},
    _cleanUpShape: function () {}
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

window.plugin.multilayerPlanner.onBtnClick = function(ev) {
  var btn = window.plugin.multilayerPlanner.button,
  tooltip = window.plugin.multilayerPlanner.tooltip,
  layer = window.plugin.multilayerPlanner.layer;

  if (btn.classList.contains("active")) {
    window.plugin.multilayerPlanner.overlayer.disable();
    btn.classList.remove("active");
  } else {
    window.plugin.multilayerPlanner.overlayer = new L.Overlayer(map, {});
    window.plugin.multilayerPlanner.overlayer.enable();
    btn.classList.add("active");
  }
};

/*
window.plugin.multilayerPlanner.onTipClick = function(ev) {
  dialog({
    html: $('<div id="multilayerPlanner">' + window.plugin.multilayerPlanner.farm.count() + "</div>"),
    dialogClass: 'ui-dialog-multilayer-planner',
    title: 'Multilayer Planner',
    id: 'multilayer-planner-copy',
    width: 300
  });
};
*/

var setup = function() {
  $('<style>').prop('type', 'text/css').html('@@INCLUDESTRING:src/multilayer-planner.css@@').appendTo('head');

  window.plugin.multilayerPlanner.defineOverlayer(L);

  var parent = $(".leaflet-top.leaflet-left", window.map.getContainer());

  var button = document.createElement("a");
  button.className = "leaflet-bar-part";
  button.addEventListener("click", window.plugin.multilayerPlanner.onBtnClick, false);
  button.title = 'Plan multilayer fields';

  var tooltip = document.createElement("div");
  tooltip.className = "leaflet-control-multilayer-planner-tooltip";
  // tooltip.addEventListener("click", window.plugin.multilayerPlanner.onTipClick, false);
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
