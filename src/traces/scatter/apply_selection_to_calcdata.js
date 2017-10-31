/**
* Copyright 2012-2017, Plotly, Inc.
* All rights reserved.
*
* This source code is licensed under the MIT license found in the
* LICENSE file in the root directory of this source tree.
*/


'use strict';

module.exports = function applySelectionToCalcdatr(cd, trace) {
    var selectedpoints = trace.selectedpoints;
//     var selectedids = trace.selectedids;
    var i;

    if(!selectedpoints) return;

    var selectedPointIndex = {};
    for(i = 0; i < selectedpoints.length; i++) {
        selectedPointIndex[selectedpoints[i]] = 1;
    }

    for(i = 0; i < cd.length; i++) {
        cd[i].selected = selectedPointIndex[i] || 0;
    }
};
