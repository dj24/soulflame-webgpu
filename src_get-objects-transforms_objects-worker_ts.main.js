/*
 * ATTENTION: The "eval" devtool has been used (maybe by default in mode: "development").
 * This devtool is neither made for production nor for readable output files.
 * It uses "eval()" calls to create a separate source file in the browser devtools.
 * If you are trying to read the output file, select a different devtool (https://webpack.js.org/configuration/devtool/)
 * or disable the default devtool with "devtool: false".
 * If you are looking for production-ready output files, see mode: "production" (https://webpack.js.org/configuration/mode/).
 */
/******/ (() => { // webpackBootstrap
/******/ 	"use strict";
/******/ 	var __webpack_modules__ = ({

/***/ "./src/get-objects-transforms/objects-worker.ts":
/*!******************************************************!*\
  !*** ./src/get-objects-transforms/objects-worker.ts ***!
  \******************************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

eval("__webpack_require__.r(__webpack_exports__);\n/* harmony import */ var wgpu_matrix__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! wgpu-matrix */ \"./node_modules/wgpu-matrix/dist/2.x/wgpu-matrix.module.js\");\n/* harmony import */ var _voxel_object__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../voxel-object */ \"./src/voxel-object.ts\");\n\n\nconst ctx = self;\nconst vikingSize = [18, 15, 8];\nconst cornellSize = [7, 7, 7];\nconst getOuterBox = (rotateY) => {\n    let m = wgpu_matrix__WEBPACK_IMPORTED_MODULE_1__.mat4.identity();\n    let x = 0;\n    let z = 0;\n    let y = 0;\n    wgpu_matrix__WEBPACK_IMPORTED_MODULE_1__.mat4.translate(m, [x, y, z], m);\n    wgpu_matrix__WEBPACK_IMPORTED_MODULE_1__.mat4.translate(m, wgpu_matrix__WEBPACK_IMPORTED_MODULE_1__.vec3.divScalar(cornellSize, 2), m);\n    wgpu_matrix__WEBPACK_IMPORTED_MODULE_1__.mat4.scale(m, [1, 1, 1], m);\n    wgpu_matrix__WEBPACK_IMPORTED_MODULE_1__.mat4.rotateY(m, rotateY, m);\n    wgpu_matrix__WEBPACK_IMPORTED_MODULE_1__.mat4.translate(m, wgpu_matrix__WEBPACK_IMPORTED_MODULE_1__.vec3.divScalar(cornellSize, -2), m);\n    return new _voxel_object__WEBPACK_IMPORTED_MODULE_0__.VoxelObject(m, cornellSize, [0, 0, 0]);\n};\nconst getInnerBox = (rotateY) => {\n    let m = wgpu_matrix__WEBPACK_IMPORTED_MODULE_1__.mat4.identity();\n    let x = -5;\n    let z = 0;\n    let y = -5;\n    wgpu_matrix__WEBPACK_IMPORTED_MODULE_1__.mat4.translate(m, [x, y, z], m);\n    wgpu_matrix__WEBPACK_IMPORTED_MODULE_1__.mat4.translate(m, wgpu_matrix__WEBPACK_IMPORTED_MODULE_1__.vec3.divScalar(vikingSize, 2), m);\n    wgpu_matrix__WEBPACK_IMPORTED_MODULE_1__.mat4.scale(m, [0.2, 0.2, 0.2], m);\n    wgpu_matrix__WEBPACK_IMPORTED_MODULE_1__.mat4.rotateY(m, rotateY, m);\n    wgpu_matrix__WEBPACK_IMPORTED_MODULE_1__.mat4.translate(m, wgpu_matrix__WEBPACK_IMPORTED_MODULE_1__.vec3.divScalar(vikingSize, -2), m);\n    return new _voxel_object__WEBPACK_IMPORTED_MODULE_0__.VoxelObject(m, vikingSize, [cornellSize[0], 0, 0]);\n};\n// TODO: allow dynamic objects to be passed, probably via object atlas\nconst getObjectTransforms = ({ maxObjectCount, objectCount, scale, translateX, rotateY, camera, objectSize, }) => {\n    // const spaceBetweenObjects = 16;\n    // const gapX = objectSize[0] + spaceBetweenObjects;\n    // const gapZ = objectSize[2] + spaceBetweenObjects;\n    // const rows = 12;\n    // let voxelObjects = [...Array(maxObjectCount).keys()].map((index) => {\n    //   let m = mat4.identity();\n    //   let x = (index % rows) * gapX;\n    //   let z = Math.floor(index / rows) * gapZ;\n    //   let y = Math.sin(x + z) * 20;\n    //   mat4.translate(m, [translateX + x, y, z], m);\n    //   mat4.translate(m, vec3.divScalar(objectSize, 2), m);\n    //   mat4.rotateY(m, rotateY, m);\n    //   mat4.scale(m, [scale, scale, scale], m);\n    //   mat4.translate(m, vec3.divScalar(objectSize, -2), m);\n    //   return new VoxelObject(m, objectSize);\n    // });\n    let voxelObjects = [getInnerBox(rotateY), getOuterBox(rotateY)];\n    // sort by distance to the camera\n    // voxelObjects = voxelObjects.sort((a, b) => {\n    //   const aDistance = vec3.distance(a.worldSpaceCenter, camera.position);\n    //   const bDistance = vec3.distance(b.worldSpaceCenter, camera.position);\n    //   return aDistance - bDistance;\n    // });\n    let activeVoxelObjects = voxelObjects;\n    //\n    // activeVoxelObjects = activeVoxelObjects.filter(\n    //   (voxelObject, index) => index <= objectCount,\n    // );\n    activeVoxelObjects = activeVoxelObjects.slice(0, objectCount);\n    // TODO: figure out what this does\n    const bufferPadding = [\n        ...Array(maxObjectCount - activeVoxelObjects.length).keys(),\n    ].map(() => new _voxel_object__WEBPACK_IMPORTED_MODULE_0__.VoxelObject(wgpu_matrix__WEBPACK_IMPORTED_MODULE_1__.mat4.identity(), [0, 0, 0], [0, 0, 0]));\n    voxelObjects = [...activeVoxelObjects, ...bufferPadding];\n    return voxelObjects;\n};\nctx.onmessage = (event) => {\n    const result = getObjectTransforms(event.data).flatMap((voxelObject) => voxelObject.toArray());\n    ctx.postMessage(result);\n};\n\n\n//# sourceURL=webpack://soulflame-webgpu/./src/get-objects-transforms/objects-worker.ts?");

/***/ }),

/***/ "./src/voxel-object.ts":
/*!*****************************!*\
  !*** ./src/voxel-object.ts ***!
  \*****************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

eval("__webpack_require__.r(__webpack_exports__);\n/* harmony export */ __webpack_require__.d(__webpack_exports__, {\n/* harmony export */   VoxelObject: () => (/* binding */ VoxelObject)\n/* harmony export */ });\n/* harmony import */ var wgpu_matrix__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! wgpu-matrix */ \"./node_modules/wgpu-matrix/dist/2.x/wgpu-matrix.module.js\");\n\nclass VoxelObject {\n    transform;\n    inverseTransform;\n    size;\n    atlasLocation;\n    constructor(transform, size, atlasLocation) {\n        this.transform = transform;\n        this.size = size;\n        this.inverseTransform = wgpu_matrix__WEBPACK_IMPORTED_MODULE_0__.mat4.invert(this.transform);\n        this.atlasLocation = atlasLocation;\n    }\n    get worldSpaceBounds() {\n        let minBound = wgpu_matrix__WEBPACK_IMPORTED_MODULE_0__.vec3.create();\n        let maxBound = wgpu_matrix__WEBPACK_IMPORTED_MODULE_0__.vec3.create();\n        wgpu_matrix__WEBPACK_IMPORTED_MODULE_0__.vec3.transformMat4(wgpu_matrix__WEBPACK_IMPORTED_MODULE_0__.vec3.create(), this.transform, minBound);\n        wgpu_matrix__WEBPACK_IMPORTED_MODULE_0__.vec3.transformMat4(this.size, this.transform, maxBound);\n        return { minBound, maxBound };\n    }\n    get worldSpaceCenter() {\n        return wgpu_matrix__WEBPACK_IMPORTED_MODULE_0__.vec3.lerp(this.worldSpaceBounds.minBound, this.worldSpaceBounds.maxBound, 0.5);\n    }\n    toArray() {\n        return [\n            ...this.transform,\n            ...this.inverseTransform,\n            ...this.size,\n            0.0, //padding for 4 byte stride\n            ...this.atlasLocation,\n            0.0, //padding for 4 byte stride\n        ];\n    }\n}\n\n\n//# sourceURL=webpack://soulflame-webgpu/./src/voxel-object.ts?");

/***/ })

/******/ 	});
/************************************************************************/
/******/ 	// The module cache
/******/ 	var __webpack_module_cache__ = {};
/******/ 	
/******/ 	// The require function
/******/ 	function __webpack_require__(moduleId) {
/******/ 		// Check if module is in cache
/******/ 		var cachedModule = __webpack_module_cache__[moduleId];
/******/ 		if (cachedModule !== undefined) {
/******/ 			return cachedModule.exports;
/******/ 		}
/******/ 		// Create a new module (and put it into the cache)
/******/ 		var module = __webpack_module_cache__[moduleId] = {
/******/ 			// no module.id needed
/******/ 			// no module.loaded needed
/******/ 			exports: {}
/******/ 		};
/******/ 	
/******/ 		// Execute the module function
/******/ 		__webpack_modules__[moduleId](module, module.exports, __webpack_require__);
/******/ 	
/******/ 		// Return the exports of the module
/******/ 		return module.exports;
/******/ 	}
/******/ 	
/******/ 	// expose the modules object (__webpack_modules__)
/******/ 	__webpack_require__.m = __webpack_modules__;
/******/ 	
/******/ 	// the startup function
/******/ 	__webpack_require__.x = () => {
/******/ 		// Load entry module and return exports
/******/ 		// This entry module depends on other loaded chunks and execution need to be delayed
/******/ 		var __webpack_exports__ = __webpack_require__.O(undefined, ["vendors-node_modules_wgpu-matrix_dist_2_x_wgpu-matrix_module_js"], () => (__webpack_require__("./src/get-objects-transforms/objects-worker.ts")))
/******/ 		__webpack_exports__ = __webpack_require__.O(__webpack_exports__);
/******/ 		return __webpack_exports__;
/******/ 	};
/******/ 	
/************************************************************************/
/******/ 	/* webpack/runtime/chunk loaded */
/******/ 	(() => {
/******/ 		var deferred = [];
/******/ 		__webpack_require__.O = (result, chunkIds, fn, priority) => {
/******/ 			if(chunkIds) {
/******/ 				priority = priority || 0;
/******/ 				for(var i = deferred.length; i > 0 && deferred[i - 1][2] > priority; i--) deferred[i] = deferred[i - 1];
/******/ 				deferred[i] = [chunkIds, fn, priority];
/******/ 				return;
/******/ 			}
/******/ 			var notFulfilled = Infinity;
/******/ 			for (var i = 0; i < deferred.length; i++) {
/******/ 				var [chunkIds, fn, priority] = deferred[i];
/******/ 				var fulfilled = true;
/******/ 				for (var j = 0; j < chunkIds.length; j++) {
/******/ 					if ((priority & 1 === 0 || notFulfilled >= priority) && Object.keys(__webpack_require__.O).every((key) => (__webpack_require__.O[key](chunkIds[j])))) {
/******/ 						chunkIds.splice(j--, 1);
/******/ 					} else {
/******/ 						fulfilled = false;
/******/ 						if(priority < notFulfilled) notFulfilled = priority;
/******/ 					}
/******/ 				}
/******/ 				if(fulfilled) {
/******/ 					deferred.splice(i--, 1)
/******/ 					var r = fn();
/******/ 					if (r !== undefined) result = r;
/******/ 				}
/******/ 			}
/******/ 			return result;
/******/ 		};
/******/ 	})();
/******/ 	
/******/ 	/* webpack/runtime/define property getters */
/******/ 	(() => {
/******/ 		// define getter functions for harmony exports
/******/ 		__webpack_require__.d = (exports, definition) => {
/******/ 			for(var key in definition) {
/******/ 				if(__webpack_require__.o(definition, key) && !__webpack_require__.o(exports, key)) {
/******/ 					Object.defineProperty(exports, key, { enumerable: true, get: definition[key] });
/******/ 				}
/******/ 			}
/******/ 		};
/******/ 	})();
/******/ 	
/******/ 	/* webpack/runtime/ensure chunk */
/******/ 	(() => {
/******/ 		__webpack_require__.f = {};
/******/ 		// This file contains only the entry chunk.
/******/ 		// The chunk loading function for additional chunks
/******/ 		__webpack_require__.e = (chunkId) => {
/******/ 			return Promise.all(Object.keys(__webpack_require__.f).reduce((promises, key) => {
/******/ 				__webpack_require__.f[key](chunkId, promises);
/******/ 				return promises;
/******/ 			}, []));
/******/ 		};
/******/ 	})();
/******/ 	
/******/ 	/* webpack/runtime/get javascript chunk filename */
/******/ 	(() => {
/******/ 		// This function allow to reference async chunks and sibling chunks for the entrypoint
/******/ 		__webpack_require__.u = (chunkId) => {
/******/ 			// return url for filenames based on template
/******/ 			return "" + chunkId + ".main.js";
/******/ 		};
/******/ 	})();
/******/ 	
/******/ 	/* webpack/runtime/get mini-css chunk filename */
/******/ 	(() => {
/******/ 		// This function allow to reference async chunks and sibling chunks for the entrypoint
/******/ 		__webpack_require__.miniCssF = (chunkId) => {
/******/ 			// return url for filenames based on template
/******/ 			return undefined;
/******/ 		};
/******/ 	})();
/******/ 	
/******/ 	/* webpack/runtime/global */
/******/ 	(() => {
/******/ 		__webpack_require__.g = (function() {
/******/ 			if (typeof globalThis === 'object') return globalThis;
/******/ 			try {
/******/ 				return this || new Function('return this')();
/******/ 			} catch (e) {
/******/ 				if (typeof window === 'object') return window;
/******/ 			}
/******/ 		})();
/******/ 	})();
/******/ 	
/******/ 	/* webpack/runtime/hasOwnProperty shorthand */
/******/ 	(() => {
/******/ 		__webpack_require__.o = (obj, prop) => (Object.prototype.hasOwnProperty.call(obj, prop))
/******/ 	})();
/******/ 	
/******/ 	/* webpack/runtime/make namespace object */
/******/ 	(() => {
/******/ 		// define __esModule on exports
/******/ 		__webpack_require__.r = (exports) => {
/******/ 			if(typeof Symbol !== 'undefined' && Symbol.toStringTag) {
/******/ 				Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });
/******/ 			}
/******/ 			Object.defineProperty(exports, '__esModule', { value: true });
/******/ 		};
/******/ 	})();
/******/ 	
/******/ 	/* webpack/runtime/publicPath */
/******/ 	(() => {
/******/ 		var scriptUrl;
/******/ 		if (__webpack_require__.g.importScripts) scriptUrl = __webpack_require__.g.location + "";
/******/ 		var document = __webpack_require__.g.document;
/******/ 		if (!scriptUrl && document) {
/******/ 			if (document.currentScript)
/******/ 				scriptUrl = document.currentScript.src;
/******/ 			if (!scriptUrl) {
/******/ 				var scripts = document.getElementsByTagName("script");
/******/ 				if(scripts.length) {
/******/ 					var i = scripts.length - 1;
/******/ 					while (i > -1 && !scriptUrl) scriptUrl = scripts[i--].src;
/******/ 				}
/******/ 			}
/******/ 		}
/******/ 		// When supporting browsers where an automatic publicPath is not supported you must specify an output.publicPath manually via configuration
/******/ 		// or pass an empty string ("") and set the __webpack_public_path__ variable from your code to use your own logic.
/******/ 		if (!scriptUrl) throw new Error("Automatic publicPath is not supported in this browser");
/******/ 		scriptUrl = scriptUrl.replace(/#.*$/, "").replace(/\?.*$/, "").replace(/\/[^\/]+$/, "/");
/******/ 		__webpack_require__.p = scriptUrl;
/******/ 	})();
/******/ 	
/******/ 	/* webpack/runtime/importScripts chunk loading */
/******/ 	(() => {
/******/ 		// no baseURI
/******/ 		
/******/ 		// object to store loaded chunks
/******/ 		// "1" means "already loaded"
/******/ 		var installedChunks = {
/******/ 			"src_get-objects-transforms_objects-worker_ts": 1
/******/ 		};
/******/ 		
/******/ 		// importScripts chunk loading
/******/ 		var installChunk = (data) => {
/******/ 			var [chunkIds, moreModules, runtime] = data;
/******/ 			for(var moduleId in moreModules) {
/******/ 				if(__webpack_require__.o(moreModules, moduleId)) {
/******/ 					__webpack_require__.m[moduleId] = moreModules[moduleId];
/******/ 				}
/******/ 			}
/******/ 			if(runtime) runtime(__webpack_require__);
/******/ 			while(chunkIds.length)
/******/ 				installedChunks[chunkIds.pop()] = 1;
/******/ 			parentChunkLoadingFunction(data);
/******/ 		};
/******/ 		__webpack_require__.f.i = (chunkId, promises) => {
/******/ 			// "1" is the signal for "already loaded"
/******/ 			if(!installedChunks[chunkId]) {
/******/ 				if(true) { // all chunks have JS
/******/ 					importScripts(__webpack_require__.p + __webpack_require__.u(chunkId));
/******/ 				}
/******/ 			}
/******/ 		};
/******/ 		
/******/ 		var chunkLoadingGlobal = self["webpackChunksoulflame_webgpu"] = self["webpackChunksoulflame_webgpu"] || [];
/******/ 		var parentChunkLoadingFunction = chunkLoadingGlobal.push.bind(chunkLoadingGlobal);
/******/ 		chunkLoadingGlobal.push = installChunk;
/******/ 		
/******/ 		// no HMR
/******/ 		
/******/ 		// no HMR manifest
/******/ 	})();
/******/ 	
/******/ 	/* webpack/runtime/startup chunk dependencies */
/******/ 	(() => {
/******/ 		var next = __webpack_require__.x;
/******/ 		__webpack_require__.x = () => {
/******/ 			return __webpack_require__.e("vendors-node_modules_wgpu-matrix_dist_2_x_wgpu-matrix_module_js").then(next);
/******/ 		};
/******/ 	})();
/******/ 	
/************************************************************************/
/******/ 	
/******/ 	// run startup
/******/ 	var __webpack_exports__ = __webpack_require__.x();
/******/ 	
/******/ })()
;