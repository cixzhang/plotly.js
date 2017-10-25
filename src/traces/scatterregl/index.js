/**
* Copyright 2012-2017, Plotly, Inc.
* All rights reserved.
*
* This source code is licensed under the MIT license found in the
* LICENSE file in the root directory of this source tree.
*/

'use strict';

var Lib = require('../../lib');
var getTraceColor = require('../scatter/get_trace_color');
var ErrorBars = require('../../components/errorbars');
var extend = require('object-assign');
var Axes = require('../../plots/cartesian/axes');
var kdtree = require('kdgrass');
var Fx = require('../../components/fx');
var subTypes = require('../scatter/subtypes');
var calcColorscales = require('../scatter/colorscale_calc');
var Drawing = require('../../components/drawing');
var makeBubbleSizeFn = require('../scatter/make_bubble_size_func');
var DASHES = require('../../constants/gl2d_dashes');
var str2RGBArray = require('../../lib/str2rgbarray');
var formatColor = require('../../lib/gl_format_color');
var linkTraces = require('../scatter/link_traces');
var createScatter = require('regl-scatter2d');
var createLine = require('regl-line2d');
var createError = require('regl-error2d');
var svgSdf = require('svg-path-sdf');
var Plots = require('../../plots/plots');

var MAXDIST = Fx.constants.MAXDIST;
var DESELECTDIM = 0.2;
var SYMBOL_SDF_SIZE = 200;
var SYMBOL_SIZE = 20;
var SYMBOL_STROKE = SYMBOL_SIZE / 20;
var SYMBOL_SDF = {};
var SYMBOL_SVG_CIRCLE = Drawing.symbolFuncs[0](SYMBOL_SIZE * 0.05);


var ScatterRegl = module.exports = extend({}, require('../scatter'));


ScatterRegl.name = 'scatterregl';
ScatterRegl.categories = ['gl', 'gl2d', 'regl', 'symbols', 'errorBarsOK', 'markerColorscale', 'showLegend', 'scatter-like'];


ScatterRegl.calc = function calc(container, trace) {
    var layout = container._fullLayout;
    var positions;
    var stash = {};
    var xaxis = Axes.getFromId(container, trace.xaxis);
    var yaxis = Axes.getFromId(container, trace.yaxis);

    //FIXME: find a better way to obtain subplot object from trace
    var subplot = layout._plots[trace.xaxis + trace.yaxis];

    // makeCalcdata runs d2c (data-to-coordinate) on every point
    var x = xaxis.type === 'linear' ? trace.x : xaxis.makeCalcdata(trace, 'x');
    var y = yaxis.type === 'linear' ? trace.y : yaxis.makeCalcdata(trace, 'y');

    var count = Math.max(x ? x.length : 0, y ? y.length: 0), i, l, xx, yy, ptrX = 0, ptrY = 0;
    var lineOptions, scatterOptions, errorOptions, errorXOptions, errorYOptions, fillOptions;
    var selection = trace.selection;
    var sizes, selIds;
    var isVisible, hasLines, hasErrorX, hasErrorY, hasError, hasMarkers, hasFill;
    var linePositions;

    // convert log axes
    if(xaxis.type === 'log') {
        for(i = 0, l = x.length; i < l; i++) {
            x[i] = xaxis.d2l(x[i]);
        }
    }
    if(yaxis.type === 'log') {
        for(i = 0, l = y.length; i < l; i++) {
            y[i] = yaxis.d2l(y[i]);
        }
    }

    // we need hi-precision for scatter2d
    positions = new Array(count * 2);
    var xbounds = [Infinity, -Infinity], ybounds = [Infinity, -Infinity]

    for(i = 0; i < count; i++) {
        // if no x defined, we are creating simple int sequence (API)
        // we use parseFloat because it gives NaN (we need that for empty values to avoid drawing lines) and it is incredibly fast
        xx = x ? parseFloat(x[i]) : i;
        yy = y ? parseFloat(y[i]) : i;

        if (xbounds[0] > xx) xbounds[0] = xx;
        if (xbounds[1] < xx) xbounds[1] = xx;
        if (ybounds[0] > yy) ybounds[0] = yy;
        if (ybounds[1] < yy) ybounds[1] = yy;

        positions[i * 2] = xx;
        positions[i * 2 + 1] = yy;
    }

    // calculate axes range
    var pad = 20;
    if (xaxis._min) {
        xaxis._min.push({ val: xbounds[0], pad: pad });
    }
    if (xaxis._max) {
        xaxis._max.push({ val: xbounds[1], pad: pad });
    }
    if (yaxis._min) {
        yaxis._min.push({ val: ybounds[0], pad: pad });
    }
    if (yaxis._max) {
        yaxis._max.push({ val: ybounds[1], pad: pad });
    }

    calcColorscales(trace);

    // TODO: delegate this to webworker if possible (potential )
    stash._tree = kdtree(positions, 512);

    // stash data
    stash._x = x;
    stash._y = y;
    stash._positions = positions;

    if(trace.visible !== true) {
        isVisible = false;
        hasLines = false;
        hasErrorX = false;
        hasErrorY = false;
        hasMarkers = false;
    }
    else {
        isVisible = true;
        hasLines = subTypes.hasLines(trace);
        hasErrorX = trace.error_x.visible === true;
        hasErrorY = trace.error_y.visible === true;
        hasError = hasErrorX || hasErrorY;
        hasMarkers = subTypes.hasMarkers(trace);
    }

    // get error values
    var errorVals = hasError ? ErrorBars.calcFromTrace(trace, layout) : null;

    if(hasErrorX) {
        errorXOptions = {};
        errorXOptions.positions = positions;
        var errorsX = new Float64Array(4 * count);

        for(i = 0; i < count; ++i) {
            errorsX[ptrX++] = x[i] - errorVals[i].xs || 0;
            errorsX[ptrX++] = errorVals[i].xh - x[i] || 0;
            errorsX[ptrX++] = 0;
            errorsX[ptrX++] = 0;
        }

        if(trace.error_x.copy_ystyle) {
            trace.error_x = trace.error_y;
        }

        errorXOptions.positions = positions;
        errorXOptions.errors = errorsX;
        errorXOptions.capSize = trace.error_x.width * 2;
        errorXOptions.lineWidth = trace.error_x.thickness;
        errorXOptions.color = trace.error_x.color;
    }

    if(hasErrorY) {
        errorYOptions = {}
        errorYOptions.positions = positions;
        var errorsY = new Float64Array(4 * count);

        for(i = 0; i < count; ++i) {
            errorsY[ptrY++] = 0;
            errorsY[ptrY++] = 0;
            errorsY[ptrY++] = y[i] - errorVals[i].ys || 0;
            errorsY[ptrY++] = errorVals[i].yh - y[i] || 0;
        }

        errorYOptions.positions = positions;
        errorYOptions.errors = errorsY;
        errorYOptions.capSize = trace.error_y.width * 2;
        errorYOptions.lineWidth = trace.error_y.thickness;
        errorYOptions.color = trace.error_y.color;
    }

    if(hasLines) {
        lineOptions = {}
        lineOptions.thickness = trace.line.width;
        lineOptions.color = trace.line.color;
        lineOptions.opacity = trace.opacity;
        lineOptions.join = trace.opacity === 1.0 ? 'rect' : 'round';
        lineOptions.overlay = true;

        var dashes = (DASHES[trace.line.dash] || [1]).slice();
        for(i = 0; i < dashes.length; ++i) dashes[i] *= lineOptions.thickness;
        lineOptions.dashes = dashes;

        if(trace.line.shape === 'hv') {
            linePositions = [];
            for(i = 0; i < Math.floor(positions.length / 2) - 1; i++) {
                if(isNaN(positions[i * 2]) || isNaN(positions[i * 2 + 1])) {
                    linePositions.push(NaN);
                    linePositions.push(NaN);
                    linePositions.push(NaN);
                    linePositions.push(NaN);
                }
                else {
                    linePositions.push(positions[i * 2]);
                    linePositions.push(positions[i * 2 + 1]);
                    linePositions.push(positions[i * 2 + 2]);
                    linePositions.push(positions[i * 2 + 1]);
                }
            }
            linePositions.push(positions[positions.length - 2]);
            linePositions.push(positions[positions.length - 1]);
        }
        else if(trace.line.shape === 'vh') {
            linePositions = [];
            for(i = 0; i < Math.floor(positions.length / 2) - 1; i++) {
                if(isNaN(positions[i * 2]) || isNaN(positions[i * 2 + 1])) {
                    linePositions.push(NaN);
                    linePositions.push(NaN);
                    linePositions.push(NaN);
                    linePositions.push(NaN);
                }
                else {
                    linePositions.push(positions[i * 2]);
                    linePositions.push(positions[i * 2 + 1]);
                    linePositions.push(positions[i * 2]);
                    linePositions.push(positions[i * 2 + 3]);
                }
            }
            linePositions.push(positions[positions.length - 2]);
            linePositions.push(positions[positions.length - 1]);
        }
        else {
            linePositions = positions;
        }
        lineOptions.positions = linePositions;
    }

    if(hasFill) {
        fillOptions = {}
        fillOptions.fill = trace.fillcolor;
        fillOptions.thickness = 0;
        fillOptions.closed = true;

        var pos = [], srcPos = linePositions || positions;
        if(trace.fill === 'tozeroy') {
            pos = [srcPos[0], 0];
            pos = pos.concat(srcPos);
            pos.push(srcPos[srcPos.length - 2]);
            pos.push(0);
        }
        else if(trace.fill === 'tozerox') {
            pos = [0, srcPos[1]];
            pos = pos.concat(srcPos);
            pos.push(0);
            pos.push(srcPos[srcPos.length - 1]);
        }
        else {
            var nextTrace = trace._nexttrace;
            if(nextTrace && trace.fill === 'tonexty') {
                pos = srcPos.slice();

                // FIXME: overcalculation here
                var nextOptions = getTraceOptions(nextTrace);

                if(nextOptions && nextOptions.line) {
                    var nextPos = nextOptions.line.positions;

                    for(i = Math.floor(nextPos.length / 2); i--;) {
                        xx = nextPos[i * 2], yy = nextPos[i * 2 + 1];
                        if(isNaN(xx) || isNaN(yy)) continue;
                        pos.push(xx);
                        pos.push(yy);
                    }
                    fillOptions.fill = nextTrace.fillcolor;
                }
            }
        }
        fillOptions.positions = pos;
    }

    if(hasMarkers) {
        scatterOptions = {}
        scatterOptions.positions = positions;

        var markerSizeFunc = makeBubbleSizeFn(trace);
        var markerOpts = trace.marker;

        //get basic symbol info
        var multiMarker = Array.isArray(markerOpts.symbol);
        var symbolNumber, isOpen, symbol, noFill;
        if (!multiMarker) {
            symbolNumber = Drawing.symbolNumber(markerOpts.symbol);
            isOpen = /-open/.test(markerOpts.symbol);
            noFill = !!Drawing.symbolNoFill[symbolNumber % 100];
        }
        //prepare colors
        if (multiMarker || Array.isArray(markerOpts.color) || Array.isArray(markerOpts.line.color) || Array.isArray(markerOpts.line)) {
            scatterOptions.colors = new Array(count);
            scatterOptions.borderColors = new Array(count);

            var colors = formatColor(markerOpts, markerOpts.opacity, count);
            var borderColors = formatColor(markerOpts.line, markerOpts.opacity, count);

            if (!Array.isArray(borderColors[0])) {
                var borderColor = borderColors;
                borderColors = Array(count);
                for (i = 0; i < count; i++) {
                    borderColors[i] = borderColor;
                }
            }
            if (!Array.isArray(colors[0])) {
                var color = colors;
                colors = Array(count);
                for (i = 0; i < count; i++) {
                    colors[i] = color;
                }
            }

            scatterOptions.colors = colors;
            scatterOptions.borderColors = borderColors;

            for (i = 0; i < count; i++) {
                if (multiMarker) {
                    symbol = markerOpts.symbol[i];
                    isOpen = /-open/.test(symbol);
                }
                if (isOpen) {
                    borderColors[i] = colors[i].slice();
                    colors[i] = colors[i].slice();
                    colors[i][3] = 0;
                }
            }

            scatterOptions.opacity = trace.opacity;
        }
        else {
            scatterOptions.color = markerOpts.color;
            scatterOptions.borderColor = markerOpts.line.color;
            scatterOptions.opacity = trace.opacity * markerOpts.opacity;

            if (isOpen) {
                scatterOptions.borderColor = scatterOptions.color.slice();
                scatterOptions.color = scatterOptions.color.slice();
                scatterOptions.color[3] = 0;
            }
        }

        //prepare markers
        if (Array.isArray(markerOpts.symbol)) {
            scatterOptions.markers = new Array(count);
            for(i = 0; i < count; ++i) {
                scatterOptions.markers[i] = getSymbolSdf(markerOpts.symbol[i])
            }
        }
        else {
            scatterOptions.marker = getSymbolSdf(markerOpts.symbol)
        }

        //prepare sizes
        if(Array.isArray(markerOpts.size) || Array.isArray(markerOpts.line.width)) {
            scatterOptions.sizes = new Array(count);
            scatterOptions.borderSizes = new Array(count);

            var borderSizes = convertNumber(markerOpts.line.width, count);
            var sizes = convertArray(markerSizeFunc, markerOpts.size, count);

            for(i = 0; i < count; ++i) {
                // See  https://github.com/plotly/plotly.js/pull/1781#discussion_r121820798
                scatterOptions.sizes[i] = sizes[i];
                scatterOptions.borderSizes[i] = 0.5 * borderSizes[i];
            }
        }
        else {
            scatterOptions.size = markerSizeFunc(markerOpts.size);
            scatterOptions.borderSizes = markerOpts.line.width * .5;
        }
    }

    // make sure scene exists
    var scene = subplot._scene;
    if (!subplot._scene) {
        scene = subplot._scene = {
            count: 0,
            lineOptions: [],
            fillOptions: [],
            scatterOptions: [],
            errorXOptions: [],
            errorYOptions: []
        };

        scene.updateRange = function updateRange (range) {
            var opts = Array(scene.count).fill({range: range});
            if (scene.fill2d) scene.fill2d.update(opts);
            if (scene.scatter2d) scene.scatter2d.update(opts);
            if (scene.line2d) scene.line2d.update(opts);
            if (scene.error2d) scene.error2d.update(opts.concat(opts));
            scene.draw();
        };

        // draw traces in proper order
        scene.draw = function draw () {
            for (var i = 0; i < scene.count; i++) {
                if (scene.line2d) scene.line2d.draw(i);
                if (scene.error2d) {
                    scene.error2d.draw(i);
                    scene.error2d.draw(i + scene.count);
                }
                if (scene.scatter2d) scene.scatter2d.draw(i);
                if (scene.fill2d) scene.fill2d.draw(i);
            }
        };
    }

    // mark renderers required for the data
    if (!scene.error2d && hasError) scene.error2d = true;
    if (!scene.line2d && hasLines) scene.line2d = true;
    if (!scene.scatter2d && hasMarkers) scene.scatter2d = true;
    if (!scene.fill2d && hasFill) scene.fill2d = true;

    // save initial batch
    scene.lineOptions.push(lineOptions);
    scene.errorXOptions.push(errorXOptions);
    scene.errorYOptions.push(errorYOptions);
    scene.fillOptions.push(fillOptions);
    scene.scatterOptions.push(scatterOptions);
    scene.count++;

    return [{x: false, y: false, t: stash, trace: trace}];
};

//TODO: manages selection, range, viewport, that's it
ScatterRegl.plot = function plot(container, subplot, cdata) {
    var layout = container._fullLayout;
    var scene = subplot._scene;
    var vpSize = layout._size, width = layout.width, height = layout.height;
    var regl = layout._glcanvas.data()[1].regl;

    // that is needed for fills
    linkTraces(container, subplot, cdata);

    // make sure scenes are created
    if (scene.error2d === true) {
        scene.error2d = createError(regl);
    }
    if (scene.line2d === true) {
        scene.line2d = createLine(regl);
    }
    if (scene.scatter2d === true) {
        scene.scatter2d = createScatter(regl);
    }
    if (scene.fill2d === true) {
        scene.fill2d = createLine(regl);
    }

    // provide viewport and range
    var vpRange = cdata.map(function (cdscatter) {
        if(!cdscatter || !cdscatter[0] || !cdscatter[0].trace) return;
        var cd = cdscatter[0];
        var trace = cd.trace;
        var stash = cd.t;
        var xaxis = Axes.getFromId(container, trace.xaxis || 'x');
        var yaxis = Axes.getFromId(container, trace.yaxis || 'y');

        var range = [
            xaxis._rl[0], yaxis._rl[0], xaxis._rl[1], yaxis._rl[1]
        ];

        var viewport = [
            vpSize.l + xaxis.domain[0] * vpSize.w,
            vpSize.b + yaxis.domain[0] * vpSize.h,
            (width - vpSize.r) - (1 - xaxis.domain[1]) * vpSize.w,
            (height - vpSize.t) - (1 - yaxis.domain[1]) * vpSize.h
        ];

        return {
            viewport: viewport,
            range: range
        };
    });

    // uploat batch data to GPU
    if (scene.fill2d) {
        if (scene.fillOptions) {
            scene.fill2d.update(scene.fillOptions);
            scene.fillOptions = null;
        }
        scene.fill2d.update(vpRange);
    }
    if (scene.line2d) {
        if (scene.lineOptions) {
            scene.line2d.update(scene.lineOptions);
            scene.lineOptions = null;
        }
        scene.line2d.update(vpRange);
    }
    if (scene.error2d) {
        if (scene.errorXOptions || scene.errorYOptions) {
            var errorBatch = (scene.errorXOptions || []).concat(scene.errorYOptions || []);
            scene.error2d.update(errorBatch);
            scene.errorXOptions = scene.errorYOptions = null;
        }
        scene.error2d.update(vpRange.concat(vpRange));
    }
    if (scene.scatter2d) {
        if (scene.scatterOptions) {
            scene.scatter2d.update(scene.scatterOptions);
            scene.scatterOptions = null;
        }
        scene.scatter2d.update(vpRange);
    }

    scene.draw();

    return;
    cdata.map(function(cdscatter, order) {

        // TODO: update selection here
        if(trace.selection && trace.selection.length) {
            selIds = {};
            for(i = 0; i < trace.selection.length; i++) {
                selIds[trace.selection[i].pointNumber] = true;
            }
        }
        // TODO: recalculate fill area here since we can't calc connected traces beforehead
    });

    scene.update(batch);
};

ScatterRegl.hoverPoints = function hover(pointData, xval, yval) {
    var cd = pointData.cd,
        trace = cd[0].trace,
        xa = pointData.xa,
        ya = pointData.ya,
        positions = trace._positions,
        x = trace._x,
        y = trace._y,
        // hoveron = trace.hoveron || '',
        tree = trace._tree;

    if(!tree) return [pointData];

    // FIXME: make sure this is a proper way to calc search radius
    var ids = tree.within(xval, yval, MAXDIST / xa._m);

    // pick the id closest to the point
    var min = MAXDIST, id = ids[0], ptx, pty;
    for(var i = 0; i < ids.length; i++) {
        ptx = positions[ids[i] * 2];
        pty = positions[ids[i] * 2 + 1];
        var dx = ptx - xval, dy = pty - yval;
        var dist = Math.sqrt(dx * dx + dy * dy);
        if(dist < min) {
            min = dist;
            id = ids[i];
        }
    }

    pointData.index = id;

    if (id === undefined) return [pointData]

    // the closest data point
    var di = {
        x: x[id],
        y: y[id]
    };

    // that is single-item arrays_to_calcdata excerpt, bc we don't have to do it beforehead for 1e6 points
    mergeProp(trace.text, 'tx');
    mergeProp(trace.hovertext, 'htx');
    mergeProp(trace.customdata, 'data');
    mergeProp(trace.textposition, 'tp');
    if(trace.textfont) {
        mergeProp(trace.textfont.size, 'ts');
        mergeProp(trace.textfont.color, 'tc');
        mergeProp(trace.textfont.family, 'tf');
    }

    var marker = trace.marker;
    if(marker) {
        mergeProp(marker.size, 'ms');
        mergeProp(marker.opacity, 'mo');
        mergeProp(marker.symbol, 'mx');
        mergeProp(marker.color, 'mc');

        var markerLine = marker.line;
        if(marker.line) {
            mergeProp(markerLine.color, 'mlc');
            mergeProp(markerLine.width, 'mlw');
        }
        var markerGradient = marker.gradient;
        if(markerGradient && markerGradient.type !== 'none') {
            mergeProp(markerGradient.type, 'mgt');
            mergeProp(markerGradient.color, 'mgc');
        }
    }

    function mergeProp(list, short) {
        if (Array.isArray(list)) di[short] = list[id]
    }

    var xc = xa.c2p(di.x, true),
        yc = ya.c2p(di.y, true),
        rad = di.mrc || 1;

    Lib.extendFlat(pointData, {
        color: getTraceColor(trace, di),

        x0: xc - rad,
        x1: xc + rad,
        xLabelVal: di.x,

        y0: yc - rad,
        y1: yc + rad,
        yLabelVal: di.y
    });

    if(di.htx) pointData.text = di.htx;
    else if(trace.hovertext) pointData.text = trace.hovertext;
    else if(di.tx) pointData.text = di.tx;
    else if(trace.text) pointData.text = trace.text;
    ErrorBars.hoverInfo(di, trace, pointData);

    return [pointData];
};

ScatterRegl.selectPoints = function select(searchInfo, polygon) {
    var cd = searchInfo.cd,
        xa = searchInfo.xaxis,
        ya = searchInfo.yaxis,
        selection = [],
        trace = cd[0].trace,
        i,
        di,
        x,
        y;

    var scene = cd[0] && cd[0].trace && cd[0].trace._scene;

    if(!scene) return;

    var hasOnlyLines = (!subTypes.hasMarkers(trace) && !subTypes.hasText(trace));
    if(trace.visible !== true || hasOnlyLines) return;

    // filter out points by visible scatter ones
    if(polygon === false) {
        // clear selection
        for(i = 0; i < cd.length; i++) cd[i].dim = 0;
    }
    else {
        for(i = 0; i < cd.length; i++) {
            di = cd[i];
            x = xa.c2p(di.x);
            y = ya.c2p(di.y);
            if(polygon.contains([x, y])) {
                selection.push({
                    pointNumber: i,
                    x: di.x,
                    y: di.y
                });
                di.dim = 0;
            }
            else di.dim = 1;
        }
    }

    trace.selection = selection;
    scene([cd]);

    return selection;
};


function getSymbolSdf(symbol) {
    if(symbol === 'circle') return null

    var symbolPath, symbolSdf;
    var symbolNumber = Drawing.symbolNumber(symbol);
    var symbolFunc = Drawing.symbolFuncs[symbolNumber % 100];
    var symbolNoDot = !!Drawing.symbolNoDot[symbolNumber % 100];
    var symbolNoFill = !!Drawing.symbolNoFill[symbolNumber % 100];

    var isOpen = /-open/.test(symbol);
    var isDot = /-dot/.test(symbol);

    // get symbol sdf from cache or generate it
    if(SYMBOL_SDF[symbol]) return SYMBOL_SDF[symbol];

    if(isDot && !symbolNoDot) {
        symbolPath = symbolFunc(SYMBOL_SIZE * 1.1) + SYMBOL_SVG_CIRCLE;
    }
    else {
        symbolPath = symbolFunc(SYMBOL_SIZE);
    }

    symbolSdf = svgSdf(symbolPath, {
        w: SYMBOL_SDF_SIZE,
        h: SYMBOL_SDF_SIZE,
        viewBox: [-SYMBOL_SIZE, -SYMBOL_SIZE, SYMBOL_SIZE, SYMBOL_SIZE],
        stroke: symbolNoFill ? SYMBOL_STROKE : -SYMBOL_STROKE
    });
    SYMBOL_SDF[symbol] = symbolSdf;

    return symbolSdf || null;
}

var convertNumber = convertArray.bind(null, function(x) { return +x; });

// handle the situation where values can be array-like or not array like
function convertArray(convert, data, count) {
    if(!Array.isArray(data)) data = [data];

    return _convertArray(convert, data, count);
}

function _convertArray(convert, data, count) {
    var result = new Array(count),
        data0 = data[0];

    for(var i = 0; i < count; ++i) {
        result[i] = (i >= data.length) ?
            convert(data0) :
            convert(data[i]);
    }

    return result;
}
