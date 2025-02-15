/*!
 * @license
 * chartjs-plugin-advancedzoom
 * http://chartjs.org/
 * Version: 0.7.3
 *
 * Copyright 2019 Chart.js Contributors
 * Released under the MIT license
 * https://github.com/chartjs/chartjs-plugin-advancedzoom/blob/master/LICENSE.md
 */
(function (global, factory) {
typeof exports === 'object' && typeof module !== 'undefined' ? module.exports = factory(require('hammerjs')) :
typeof define === 'function' && define.amd ? define(['hammerjs'], factory) :
(global = global || self, global.ChartAdvancedZoom = factory(global.Hammer));
}(this, function (Hammer) { 'use strict';

Hammer = Hammer && Hammer.hasOwnProperty('default') ? Hammer['default'] : Hammer;

var helpers = Chart.helpers;

// Take the zoom namespace of Chart
var AdvancedZoomNS = Chart.AdvancedZoom = Chart.AdvancedZoom || {};

const panFinger = 0;

// Where we store functions to handle different scale types
var zoomFunctions = AdvancedZoomNS.zoomFunctions = AdvancedZoomNS.zoomFunctions || {};
var panFunctions = AdvancedZoomNS.panFunctions = AdvancedZoomNS.panFunctions || {};

Chart.AdvancedZoom.defaults = Chart.defaults.global.plugins.advancedzoom = {
	pan: {
		enabled: false,
		mode: 'xy',
		speed: 20,
		threshold: 10
	},
	zoom: {
		enabled: true,
		mode: 'x', 
		sensitivity: 3,
		speed: 0.1
	}
};

function resolveOptions(chart, options) {
	// Install listeners. Do this dynamically based on options so that we can turn zoom on and off
	// We also want to make sure listeners aren't always on. E.g. if you're scrolling down a page
	// and the mouse goes over a chart you don't want it intercepted unless the plugin is enabled
	var node = chart.$advancedzoom._node = chart.ctx.canvas;
	var props = chart.$advancedzoom;

	chart.$advancedzoom._options = options;

	var zoomEnabled = options.zoom && options.zoom.enabled;
	var dragEnabled = options.zoom.drag;

	if (zoomEnabled) {
		node.addEventListener('wheel', props._wheelHandler);
		if(dragEnabled) {
			node.addEventListener('mousedown', props._mouseDownHandler);
			node.ownerDocument.addEventListener('mouseup', props._mouseUpHandler);
		}
	} else {
		node.removeEventListener('wheel', props._wheelHandler);
		node.removeEventListener('mousedown', props._mouseDownHandler);
		node.removeEventListener('mousemove', props._mouseMoveHandler);
		node.ownerDocument.removeEventListener('mouseup', props._mouseUpHandler);
	}
}

function storeOriginalOptions(chart) {
	var originalOptions = chart.$advancedzoom._originalOptions;
	helpers.each(chart.scales, function(scale) {
		if (!originalOptions[scale.id]) {
			originalOptions[scale.id] = helpers.clone(scale.options);
		}
	});
	helpers.each(originalOptions, function(opt, key) {
		if (!chart.scales[key]) {
			delete originalOptions[key];
		}
	});
}

function directionEnabled(mode, dir) {
	if (mode === undefined) {
		return true;
	} else if (typeof mode === 'string') {
		return mode.indexOf(dir) !== -1;
	}

	return false;
}

function rangeMaxLimiter(zoomPanOptions, newMax) {
	if (zoomPanOptions.scaleAxes && zoomPanOptions.rangeMax &&
			!helpers.isNullOrUndef(zoomPanOptions.rangeMax[zoomPanOptions.scaleAxes])) {
		var rangeMax = zoomPanOptions.rangeMax[zoomPanOptions.scaleAxes];
		if (newMax > rangeMax) {
			newMax = rangeMax;
		}
	}
	return newMax;
}

function rangeMinLimiter(zoomPanOptions, newMin) {
	if (zoomPanOptions.scaleAxes && zoomPanOptions.rangeMin &&
			!helpers.isNullOrUndef(zoomPanOptions.rangeMin[zoomPanOptions.scaleAxes])) {
		var rangeMin = zoomPanOptions.rangeMin[zoomPanOptions.scaleAxes];
		if (newMin < rangeMin) {
			newMin = rangeMin;
		}
	}
	return newMin;
}

function zoomCategoryScale(scale, zoom, center, zoomOptions) {
	var labels = scale.chart.data.labels;
	var minIndex = scale.minIndex;
	var lastLabelIndex = labels.length - 1;
	var maxIndex = scale.maxIndex;
	var sensitivity = zoomOptions.sensitivity;
	var chartCenter = scale.isHorizontal() ? scale.left + (scale.width / 2) : scale.top + (scale.height / 2);
	var centerPointer = scale.isHorizontal() ? center.x : center.y;

	AdvancedZoomNS.zoomCumulativeDelta = zoom > 1 ? AdvancedZoomNS.zoomCumulativeDelta + 1 : AdvancedZoomNS.zoomCumulativeDelta - 1;

	if (Math.abs(AdvancedZoomNS.zoomCumulativeDelta) > sensitivity) {
		if (AdvancedZoomNS.zoomCumulativeDelta < 0) {
			if (centerPointer >= chartCenter) {
				if (minIndex <= 0) {
					maxIndex = Math.min(lastLabelIndex, maxIndex + 1);
				} else {
					minIndex = Math.max(0, minIndex - 1);
				}
			} else if (centerPointer < chartCenter) {
				if (maxIndex >= lastLabelIndex) {
					minIndex = Math.max(0, minIndex - 1);
				} else {
					maxIndex = Math.min(lastLabelIndex, maxIndex + 1);
				}
			}
			AdvancedZoomNS.zoomCumulativeDelta = 0;
		} else if (AdvancedZoomNS.zoomCumulativeDelta > 0) {
			if (centerPointer >= chartCenter) {
				minIndex = minIndex < maxIndex ? minIndex = Math.min(maxIndex, minIndex + 1) : minIndex;
			} else if (centerPointer < chartCenter) {
				maxIndex = maxIndex > minIndex ? maxIndex = Math.max(minIndex, maxIndex - 1) : maxIndex;
			}
			AdvancedZoomNS.zoomCumulativeDelta = 0;
		}
		scale.options.ticks.min = rangeMinLimiter(zoomOptions, labels[minIndex]);
		scale.options.ticks.max = rangeMaxLimiter(zoomOptions, labels[maxIndex]);
	}
}

function zoomNumericalScale(scale, zoom, center, zoomOptions) {
	var range = scale.max - scale.min;
	var newDiff = range * (zoom - 1);

	var centerPoint = scale.isHorizontal() ? center.x : center.y;
	var minPercent = (scale.getValueForPixel(centerPoint) - scale.min) / range;
	var maxPercent = 1 - minPercent;

	var minDelta = newDiff * minPercent;
	var maxDelta = newDiff * maxPercent;

	scale.options.ticks.min = rangeMinLimiter(zoomOptions, scale.min + minDelta);
	scale.options.ticks.max = rangeMaxLimiter(zoomOptions, scale.max - maxDelta);
}

function zoomTimeScale(scale, zoom, center, zoomOptions) {
	zoomNumericalScale(scale, zoom, center, zoomOptions);
}

function zoomScale(scale, zoom, center, zoomOptions) {
	var fn = zoomFunctions[scale.type];
	if (fn) {
		fn(scale, zoom, center, zoomOptions);
	}
}

/**
 * @param chart The chart instance
 * @param {number} percentZoomX The zoom percentage in the x direction
 * @param {number} percentZoomY The zoom percentage in the y direction
 * @param {{x: number, y: number}} focalPoint The x and y coordinates of zoom focal point. The point which doesn't change while zooming. E.g. the location of the mouse cursor when "drag: false"
 * @param {string} whichAxes `xy`, 'x', or 'y'
 */
function doZoom(chart, percentZoomX, percentZoomY, focalPoint, whichAxes, doUpdate) {
	var ca = chart.chartArea;
	if (!focalPoint) {
		focalPoint = {
			x: (ca.left + ca.right) / 2,
			y: (ca.top + ca.bottom) / 2,
		};
	}

	if(doUpdate === undefined) {
		doUpdate = true;
	}

	var zoomOptions = chart.$advancedzoom._options.zoom;

	if (zoomOptions.enabled) {
		storeOriginalOptions(chart);
		// Do the zoom here
		var zoomMode = zoomOptions.mode;

		// Which axe should be modified when figers were used.
		var _whichAxes;
		if (zoomMode === 'xy' && whichAxes !== undefined) {
			// based on fingers positions
			_whichAxes = whichAxes;
		} else {
			// no effect
			_whichAxes = 'xy';
		}

		helpers.each(chart.scales, function(scale) {
			if (scale.isHorizontal() && directionEnabled(zoomMode, 'x') && directionEnabled(_whichAxes, 'x')) {
				zoomOptions.scaleAxes = 'x';
				zoomScale(scale, percentZoomX, focalPoint, zoomOptions);
			} else if (!scale.isHorizontal() && directionEnabled(zoomMode, 'y') && directionEnabled(_whichAxes, 'y')) {
				// Do Y zoom
				zoomOptions.scaleAxes = 'y';
				zoomScale(scale, percentZoomY, focalPoint, zoomOptions);
			}
		});

		if(doUpdate) {
			chart.update(0);
		}

		if (typeof zoomOptions.onZoom === 'function') {
			zoomOptions.onZoom({chart: chart});
		}
	}
}

function panCategoryScale(scale, delta, panOptions) {
	var labels = scale.chart.data.labels;
	var lastLabelIndex = labels.length - 1;
	var offsetAmt = Math.max(scale.ticks.length, 1);
	var panSpeed = panOptions.speed;
	var minIndex = scale.minIndex;
	var step = Math.round(scale.width / (offsetAmt * panSpeed));
	var maxIndex;

	AdvancedZoomNS.panCumulativeDelta += delta;

	minIndex = AdvancedZoomNS.panCumulativeDelta > step ? Math.max(0, minIndex - 1) : AdvancedZoomNS.panCumulativeDelta < -step ? Math.min(lastLabelIndex - offsetAmt + 1, minIndex + 1) : minIndex;
	AdvancedZoomNS.panCumulativeDelta = minIndex !== scale.minIndex ? 0 : AdvancedZoomNS.panCumulativeDelta;

	maxIndex = Math.min(lastLabelIndex, minIndex + offsetAmt - 1);

	scale.options.ticks.min = rangeMinLimiter(panOptions, labels[minIndex]);
	scale.options.ticks.max = rangeMaxLimiter(panOptions, labels[maxIndex]);
}

function panNumericalScale(scale, delta, panOptions) {
	var tickOpts = scale.options.ticks;
	var prevStart = scale.min;
	var prevEnd = scale.max;
	var newMin = scale.getValueForPixel(scale.getPixelForValue(prevStart) - delta);
	var newMax = scale.getValueForPixel(scale.getPixelForValue(prevEnd) - delta);
	// The time scale returns date objects so convert to numbers. Can remove at Chart.js v3
	newMin = newMin.valueOf ? newMin.valueOf() : newMin;
	newMax = newMax.valueOf ? newMax.valueOf() : newMax;
	var rangeMin = newMin;
	var rangeMax = newMax;
	var diff;

	if (panOptions.scaleAxes && panOptions.rangeMin &&
			!helpers.isNullOrUndef(panOptions.rangeMin[panOptions.scaleAxes])) {
		rangeMin = panOptions.rangeMin[panOptions.scaleAxes];
	}
	if (panOptions.scaleAxes && panOptions.rangeMax &&
			!helpers.isNullOrUndef(panOptions.rangeMax[panOptions.scaleAxes])) {
		rangeMax = panOptions.rangeMax[panOptions.scaleAxes];
	}

	if (newMin >= rangeMin && newMax <= rangeMax) {
		tickOpts.min = newMin;
		tickOpts.max = newMax;
	} else if (newMin < rangeMin) {
		diff = prevStart - rangeMin;
		tickOpts.min = rangeMin;
		tickOpts.max = prevEnd - diff;
	} else if (newMax > rangeMax) {
		diff = rangeMax - prevEnd;
		tickOpts.max = rangeMax;
		tickOpts.min = prevStart + diff;
	}
}

function panTimeScale(scale, delta, panOptions) {
	panNumericalScale(scale, delta, panOptions);
}

function panScale(scale, delta, panOptions) {
	var fn = panFunctions[scale.type];
	if (fn) {
		fn(scale, delta, panOptions);
	}
}

function doPan(chartInstance, deltaX, deltaY) {
	storeOriginalOptions(chartInstance);
	var panOptions = chartInstance.$advancedzoom._options.pan;
	if (panOptions.enabled) {
		var panMode = panOptions.mode;

		helpers.each(chartInstance.scales, function(scale) {
			if (scale.isHorizontal() && directionEnabled(panMode, 'x') && deltaX !== 0) {
				panOptions.scaleAxes = 'x';
				panScale(scale, deltaX, panOptions);
			} else if (!scale.isHorizontal() && directionEnabled(panMode, 'y') && deltaY !== 0) {
				panOptions.scaleAxes = 'y';
				panScale(scale, deltaY, panOptions);
			}
		});

		chartInstance.update(0);

		if (typeof panOptions.onPan === 'function') {
			panOptions.onPan({chart: chartInstance});
		}
	}
}

function getXAxis(chartInstance) {
	var scales = chartInstance.scales;
	var scaleIds = Object.keys(scales);
	for (var i = 0; i < scaleIds.length; i++) {
		var scale = scales[scaleIds[i]];

		if (scale.isHorizontal()) {
			return scale;
		}
	}
}

function getYAxis(chartInstance) {
	var scales = chartInstance.scales;
	var scaleIds = Object.keys(scales);
	for (var i = 0; i < scaleIds.length; i++) {
		var scale = scales[scaleIds[i]];

		if (!scale.isHorizontal()) {
			return scale;
		}
	}
}

// Store these for later
AdvancedZoomNS.zoomFunctions.category = zoomCategoryScale;
AdvancedZoomNS.zoomFunctions.time = zoomTimeScale;
AdvancedZoomNS.zoomFunctions.linear = zoomNumericalScale;
AdvancedZoomNS.zoomFunctions.logarithmic = zoomNumericalScale;
AdvancedZoomNS.panFunctions.category = panCategoryScale;
AdvancedZoomNS.panFunctions.time = panTimeScale;
AdvancedZoomNS.panFunctions.linear = panNumericalScale;
AdvancedZoomNS.panFunctions.logarithmic = panNumericalScale;
// Globals for category pan and zoom
AdvancedZoomNS.panCumulativeDelta = 0;
AdvancedZoomNS.zoomCumulativeDelta = 0;
AdvancedZoomNS.zoomPercentage;

// Chartjs Zoom Plugin
var advancedZoomPlugin = {
	id: 'advancedzoom',

	afterDatasetUpdate: function(chartInstance, options) {
		
	},

	afterInit: function(chartInstance) {
		chartInstance.resetZoom = function() {
			storeOriginalOptions(chartInstance);
			var originalOptions = chartInstance.$advancedzoom._originalOptions;
			helpers.each(chartInstance.scales, function(scale) {

				var timeOptions = scale.options.time;
				var tickOptions = scale.options.ticks;

				if (originalOptions[scale.id]) {
					tickOptions.min = originalOptions[scale.id].ticks.min;
					tickOptions.max = originalOptions[scale.id].ticks.max;
				} else {
					if (timeOptions) {
						delete timeOptions.min;
						delete timeOptions.max;
					}

					if (tickOptions) {
						delete tickOptions.min;
						delete tickOptions.max;
					}
				}
			});

			chartInstance.update();
		};
		chartInstance.update(0);
	},

	beforeRender: function(chart, options) {
		
	},

	beforeUpdate: function(chart, options) {
		resolveOptions(chart, options);
	},

	beforeInit: function(chartInstance, options) {
		chartInstance.$advancedzoom = {
			_originalOptions: {}
		};
		var node = chartInstance.$advancedzoom._node = chartInstance.ctx.canvas;
		resolveOptions(chartInstance, options);
		chartInstance.$advancedzoom._options = options;

		var panThreshold = options.pan && options.pan.threshold;

		chartInstance.$advancedzoom._mouseDownHandler = function(event) {
			node.addEventListener('mousemove', chartInstance.$advancedzoom._mouseMoveHandler);
			if(event.button == panFinger) {
				chartInstance.$advancedzoom.panning = true;
			} else {
				chartInstance.$advancedzoom._dragZoomStart = event;
			}
			event.preventDefault();
		};

		chartInstance.$advancedzoom._mouseMoveHandler = function(event) {
			if(chartInstance.$advancedzoom.panning) {
				doPan(chartInstance, event.movementX, event.movementY);
			} else if (chartInstance.$advancedzoom._dragZoomStart) {
				chartInstance.$advancedzoom._dragZoomEnd = event;
				//chartInstance.update(0);
			}
		};

		chartInstance.$advancedzoom._mouseUpHandler = function(event) {
			node.removeEventListener('mousemove', chartInstance.$advancedzoom._mouseMoveHandler);

			if(event.button == panFinger) {
				chartInstance.$advancedzoom.panning = false;
				event.preventDefault();
				return;
			}

			if (!chartInstance.$advancedzoom._dragZoomStart) {
				return;
			}

			var beginPoint = chartInstance.$advancedzoom._dragZoomStart;

			var offsetX = beginPoint.target.getBoundingClientRect().left;
			var startX = Math.min(beginPoint.clientX, event.clientX) - offsetX;
			var endX = Math.max(beginPoint.clientX, event.clientX) - offsetX;

			var offsetY = beginPoint.target.getBoundingClientRect().top;
			var startY = Math.min(beginPoint.clientY, event.clientY) - offsetY;
			var endY = Math.max(beginPoint.clientY, event.clientY) - offsetY;

			var dragDistanceX = endX - startX;
			var dragDistanceY = endY - startY;

			// Remove drag start and end before chart update to stop drawing selected area
			chartInstance.$advancedzoom._dragZoomStart = null;
			chartInstance.$advancedzoom._dragZoomEnd = null;

			if (dragDistanceX <= 0 && dragDistanceY <= 0) {
				return;
			}

			var chartArea = chartInstance.chartArea;

			var zoomOptions = chartInstance.$advancedzoom._options.zoom;
			var chartDistanceX = chartArea.right - chartArea.left;
			var xEnabled = directionEnabled(zoomOptions.mode, 'x');
			var zoomX = xEnabled && dragDistanceX ? 1 + ((chartDistanceX - dragDistanceX) / chartDistanceX) : 1;

			var chartDistanceY = chartArea.bottom - chartArea.top;
			var yEnabled = directionEnabled(zoomOptions.mode, 'y');
			var zoomY = yEnabled && dragDistanceY ? 1 + ((chartDistanceY - dragDistanceY) / chartDistanceY) : 1;

			doZoom(chartInstance, zoomX, zoomY, {
				x: (startX - chartArea.left) / (1 - dragDistanceX / chartDistanceX) + chartArea.left,
				y: (startY - chartArea.top) / (1 - dragDistanceY / chartDistanceY) + chartArea.top
			});

			if (typeof zoomOptions.onZoomComplete === 'function') {
				zoomOptions.onZoomComplete({chart: chartInstance});
			}
		};

		var _scrollTimeout = null;
		chartInstance.$advancedzoom._wheelHandler = function(event) {
			var rect = event.target.getBoundingClientRect();
			var offsetX = event.clientX - rect.left;
			var offsetY = event.clientY - rect.top;

			var center = {
				x: offsetX,
				y: offsetY
			};

			var zoomOptions = chartInstance.$advancedzoom._options.zoom;
			var speedPercent = zoomOptions.speed;

			if (event.deltaY >= 0) {
				speedPercent = -speedPercent;
			}
			doZoom(chartInstance, 1 + speedPercent, 1 + speedPercent, center);

			clearTimeout(_scrollTimeout);
			_scrollTimeout = setTimeout(function() {
				if (typeof zoomOptions.onZoomComplete === 'function') {
					zoomOptions.onZoomComplete({chart: chartInstance});
				}
			}, 250);

			// Prevent the event from triggering the default behavior (eg. Content scrolling).
			if (event.cancelable) {
				event.preventDefault();
			}
		};

		if (Hammer) {
			var mc = new Hammer.Manager(node);
			mc.add(new Hammer.Pinch());
			mc.add(new Hammer.Pan({
				threshold: panThreshold
			}));

			// Hammer reports the total scaling. We need the incremental amount
			var currentPinchScaling;
			var handlePinch = function(e) {
				var diff = 1 / (currentPinchScaling) * e.scale;
				var rect = e.target.getBoundingClientRect();
				var offsetX = e.center.x - rect.left;
				var offsetY = e.center.y - rect.top;
				var center = {
					x: offsetX,
					y: offsetY
				};

				// fingers position difference
				var x = Math.abs(e.pointers[0].clientX - e.pointers[1].clientX);
				var y = Math.abs(e.pointers[0].clientY - e.pointers[1].clientY);

				// diagonal fingers will change both (xy) axes
				var p = x / y;
				var xy;
				if (p > 0.3 && p < 1.7) {
					xy = 'xy';
				} else if (x > y) {
					xy = 'x'; // x axis
				} else {
					xy = 'y'; // y axis
				}

				doZoom(chartInstance, diff, diff, center, xy);

				// Keep track of overall scale
				currentPinchScaling = e.scale;
			};

			mc.on('pinchstart', function() {
				currentPinchScaling = 1; // reset tracker
			});
			mc.on('pinch', handlePinch);
			mc.on('pinchend', function(e) {
				handlePinch(e);
				currentPinchScaling = null; // reset
				AdvancedZoomNS.zoomCumulativeDelta = 0;
			});

			var currentDeltaX = null;
			var currentDeltaY = null;
			var panning = false;
			var handlePan = function(e) {
				if (currentDeltaX !== null && currentDeltaY !== null) {
					panning = true;
					var deltaX = e.deltaX - currentDeltaX;
					var deltaY = e.deltaY - currentDeltaY;
					currentDeltaX = e.deltaX;
					currentDeltaY = e.deltaY;
					doPan(chartInstance, deltaX, deltaY);
				}
			};

			mc.on('panstart', function(e) {
				currentDeltaX = 0;
				currentDeltaY = 0;
				handlePan(e);
			});
			mc.on('panmove', handlePan);
			mc.on('panend', function() {
				currentDeltaX = null;
				currentDeltaY = null;
				AdvancedZoomNS.panCumulativeDelta = 0;
				setTimeout(function() {
					panning = false;
				}, 500);

				var panOptions = chartInstance.$advancedzoom._options.pan;
				if (typeof panOptions.onPanComplete === 'function') {
					panOptions.onPanComplete({chart: chartInstance});
				}
			});

			chartInstance.$advancedzoom._ghostClickHandler = function(e) {
				if (panning && e.cancelable) {
					e.stopImmediatePropagation();
					e.preventDefault();
				}
			};
			node.addEventListener('click', chartInstance.$advancedzoom._ghostClickHandler);

			chartInstance._mc = mc;
		}
	},

	beforeDatasetsDraw: function(chartInstance) {
		var ctx = chartInstance.ctx;

		if (chartInstance.$advancedzoom._dragZoomEnd) {
			var xAxis = getXAxis(chartInstance);
			var yAxis = getYAxis(chartInstance);
			var beginPoint = chartInstance.$advancedzoom._dragZoomStart;
			var endPoint = chartInstance.$advancedzoom._dragZoomEnd;

			var startX = xAxis.left;
			var endX = xAxis.right;
			var startY = yAxis.top;
			var endY = yAxis.bottom;

			if (directionEnabled(chartInstance.$advancedzoom._options.zoom.mode, 'x')) {
				var offsetX = beginPoint.target.getBoundingClientRect().left;
				startX = Math.min(beginPoint.clientX, endPoint.clientX) - offsetX;
				endX = Math.max(beginPoint.clientX, endPoint.clientX) - offsetX;
			}

			if (directionEnabled(chartInstance.$advancedzoom._options.zoom.mode, 'y')) {
				var offsetY = beginPoint.target.getBoundingClientRect().top;
				startY = Math.min(beginPoint.clientY, endPoint.clientY) - offsetY;
				endY = Math.max(beginPoint.clientY, endPoint.clientY) - offsetY;
			}

			var rectWidth = endX - startX;
			var rectHeight = endY - startY;
			var dragOptions = chartInstance.$advancedzoom._options.zoom.drag;

			ctx.save();
			ctx.beginPath();
			ctx.fillStyle = dragOptions.backgroundColor || 'rgba(225,225,225,0.3)';
			ctx.fillRect(startX, startY, rectWidth, rectHeight);

			if (dragOptions.borderWidth > 0) {
				ctx.lineWidth = dragOptions.borderWidth;
				ctx.strokeStyle = dragOptions.borderColor || 'rgba(225,225,225)';
				ctx.strokeRect(startX, startY, rectWidth, rectHeight);
			}
			ctx.restore();
		}
	},

	destroy: function(chartInstance) {
		if (!chartInstance.$advancedzoom) {
			return;
		}
		var props = chartInstance.$advancedzoom;
		var node = Chart.node;

		node.removeEventListener('mousedown', props._mouseDownHandler);
		node.removeEventListener('mousemove', props._mouseMoveHandler);
		node.ownerDocument.removeEventListener('mouseup', props._mouseUpHandler);
		node.removeEventListener('wheel', props._wheelHandler);
		node.removeEventListener('click', props._ghostClickHandler);

		delete chartInstance.$advancedzoom;

		var mc = chartInstance._mc;
		if (mc) {
			mc.remove('pinchstart');
			mc.remove('pinch');
			mc.remove('pinchend');
			mc.remove('panstart');
			mc.remove('pan');
			mc.remove('panend');
		}
	}
};

Chart.plugins.register(advancedZoomPlugin);

return advancedZoomPlugin;

}));
