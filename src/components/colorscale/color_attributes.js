/**
* Copyright 2012-2017, Plotly, Inc.
* All rights reserved.
*
* This source code is licensed under the MIT license found in the
* LICENSE file in the root directory of this source tree.
*/

'use strict';

var colorScaleAttributes = require('./attributes');
var extendFlat = require('../../lib/extend').extendFlat;
var palettes = require('./scales.js');

/*
 * Make all the attributes for a regular colorscale:
 *  color, colorscale, cauto, cmin, cmax, autocolorscale, reversescale
 *
 * @param {string} context:
 *   the container this is in (*marker*, *marker.line* etc)
 * @param {optional string} editTypeOverride:
 *   most of these attributes already require a recalc, but the ones that do not
 *   have editType *style* or *plot* unless you override (presumably with *calc*)
 * @param {optional bool} autoColorDflt:
 *   normally autocolorscale.dflt is `true`, but pass `false` to override
 *
 * @return {object} the finished attributes object
 */
module.exports = function makeColorScaleAttributes(context, editTypeOverride, autoColorDflt) {
    var contextHead = context ? (context + '.') : '';

    return {
        color: {
            valType: 'color',
            arrayOk: true,
            role: 'style',
            editType: editTypeOverride || 'style',
            description: [
                'Sets the', context, 'color. It accepts either a specific color',
                'or an array of numbers that are mapped to the colorscale',
                'relative to the max and min values of the array or relative to',
                '`cmin` and `cmax` if set.'
            ].join(' ')
        },
        colorscale: extendFlat({}, colorScaleAttributes.colorscale, {
            description: [
                'Sets the colorscale and only has an effect',
                'if `' + contextHead + 'color` is set to a numerical array.',
                'The colorscale must be an array containing',
                'arrays mapping a normalized value to an',
                'rgb, rgba, hex, hsl, hsv, or named color string.',
                'At minimum, a mapping for the lowest (0) and highest (1)',
                'values are required. For example,',
                '`[[0, \'rgb(0,0,255)\', [1, \'rgb(255,0,0)\']]`.',
                'To control the bounds of the colorscale in color space,',
                'use `' + contextHead + 'cmin` and `' + contextHead + 'cmax`.',
                'Alternatively, `colorscale` may be a palette name string',
                'of the following list:',
                Object.keys(palettes).join(', ')
            ].join(' ')
        }),
        cauto: extendFlat({}, colorScaleAttributes.zauto, {
            impliedEdits: {cmin: undefined, cmax: undefined},
            description: [
                'Has an effect only if `' + contextHead + 'color` is set to a numerical array',
                'and `cmin`, `cmax` are set by the user. In this case,',
                'it controls whether the range of colors in `colorscale` is mapped to',
                'the range of values in the `color` array (`cauto: true`), or the `cmin`/`cmax`',
                'values (`cauto: false`).',
                'Defaults to `false` when `cmin`, `cmax` are set by the user.'
            ].join(' ')
        }),
        cmax: extendFlat({}, colorScaleAttributes.zmax, {
            editType: editTypeOverride || colorScaleAttributes.zmax.editType,
            impliedEdits: {cauto: false},
            description: [
                'Has an effect only if `' + contextHead + 'color` is set to a numerical array.',
                'Sets the upper bound of the color domain.',
                'Value should be associated to the `' + contextHead + 'color` array index,',
                'and if set, `' + contextHead + 'cmin` must be set as well.'
            ].join(' ')
        }),
        cmin: extendFlat({}, colorScaleAttributes.zmin, {
            editType: editTypeOverride || colorScaleAttributes.zmin.editType,
            impliedEdits: {cauto: false},
            description: [
                'Has an effect only if `' + contextHead + 'color` is set to a numerical array.',
                'Sets the lower bound of the color domain.',
                'Value should be associated to the `' + contextHead + 'color` array index,',
                'and if set, `' + contextHead + 'cmax` must be set as well.'
            ].join(' ')
        }),
        autocolorscale: extendFlat({}, colorScaleAttributes.autocolorscale, {
            description: [
                'Has an effect only if `' + contextHead + 'color` is set to a numerical array.',
                'Determines whether the colorscale is a default palette (`autocolorscale: true`)',
                'or the palette determined by `' + contextHead + 'colorscale`.',
                'In case `colorscale` is unspecified or `autocolorscale` is true, the default ',
                'palette will be chosen according to whether numbers in the `color` array are',
                'all positive, all negative or mixed.'
            ].join(' '),
            dflt: autoColorDflt === false ? autoColorDflt : colorScaleAttributes.autocolorscale.dflt
        }),
        reversescale: extendFlat({}, colorScaleAttributes.reversescale, {
            description: [
                'Has an effect only if `' + contextHead + 'color` is set to a numerical array.',
                'Reverses the color mapping if true (`cmin` will correspond to the last color',
                'in the array and `cmax` will correspond to the first color).'
            ].join(' ')
        })
    };
};
