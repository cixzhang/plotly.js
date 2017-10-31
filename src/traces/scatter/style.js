/**
* Copyright 2012-2017, Plotly, Inc.
* All rights reserved.
*
* This source code is licensed under the MIT license found in the
* LICENSE file in the root directory of this source tree.
*/


'use strict';

var d3 = require('d3');

var Drawing = require('../../components/drawing');
var Color = require('../../components/color');
var ErrorBars = require('../../components/errorbars');

module.exports = function style(gd, cd) {
    var s = cd ? cd[0].node3 : d3.select(gd).selectAll('g.trace.scatter');

    s.style('opacity', function(d) {
        return d[0].trace.opacity;
    });

    s.selectAll('g.points')
        .each(function(d) {
            var el = d3.select(this);
            var pts = el.selectAll('path.point');
            var trace = d.trace || d[0].trace;

            pts.call(Drawing.pointStyle, trace, gd);

            el.selectAll('text')
                .call(Drawing.textPointStyle, trace, gd);

            if(trace.selectedpoints) {
                pts.style('opacity', function(d) {
                    return d.selected ?
                        trace.selected.marker.opacity :
                        trace.unselected.marker.opacity;
                });

                pts.each(function(d) {
                    Color.fill(d3.select(this), d.selected ?
                        trace.selected.marker.color :
                        trace.unselected.marker.color
                    );
                });

                // TODO textfont.color !!1
            }
        });

    s.selectAll('g.trace path.js-line')
        .call(Drawing.lineGroupStyle);

    s.selectAll('g.trace path.js-fill')
        .call(Drawing.fillGroupStyle);

    s.call(ErrorBars.style);
};
