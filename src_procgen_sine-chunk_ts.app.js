/*
 * ATTENTION: The "eval" devtool has been used (maybe by default in mode: "development").
 * This devtool is neither made for production nor for readable output files.
 * It uses "eval()" calls to create a separate source file in the browser devtools.
 * If you are trying to read the output file, select a different devtool (https://webpack.js.org/configuration/devtool/)
 * or disable the default devtool with "devtool: false".
 * If you are looking for production-ready output files, see mode: "production" (https://webpack.js.org/configuration/mode/).
 */
/******/ (() => { // webpackBootstrap
/******/ 	var __webpack_modules__ = ({

/***/ "./src/procgen/easing.ts":
/*!*******************************!*\
  !*** ./src/procgen/easing.ts ***!
  \*******************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

"use strict";
eval("__webpack_require__.r(__webpack_exports__);\n/* harmony export */ __webpack_require__.d(__webpack_exports__, {\n/* harmony export */   easeInCirc: () => (/* binding */ easeInCirc),\n/* harmony export */   easeInCubic: () => (/* binding */ easeInCubic),\n/* harmony export */   easeInOutCubic: () => (/* binding */ easeInOutCubic),\n/* harmony export */   easeOutCirc: () => (/* binding */ easeOutCirc)\n/* harmony export */ });\nfunction easeInCubic(x) {\n    return x * x * x;\n}\nfunction easeInCirc(x) {\n    return 1 - Math.sqrt(1 - Math.pow(x, 2));\n}\nfunction easeOutCirc(x) {\n    return Math.sqrt(1 - Math.pow(x - 1, 2));\n}\nfunction easeInOutCubic(x) {\n    return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;\n}\n\n\n//# sourceURL=webpack://soulflame-webgpu/./src/procgen/easing.ts?");

/***/ }),

/***/ "./src/procgen/fractal-noise-3d.ts":
/*!*****************************************!*\
  !*** ./src/procgen/fractal-noise-3d.ts ***!
  \*****************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

"use strict";
eval("__webpack_require__.r(__webpack_exports__);\n/* harmony export */ __webpack_require__.d(__webpack_exports__, {\n/* harmony export */   fractalNoise3D: () => (/* binding */ fractalNoise3D),\n/* harmony export */   myrng: () => (/* binding */ myrng),\n/* harmony export */   ridgedFractalNoise3D: () => (/* binding */ ridgedFractalNoise3D)\n/* harmony export */ });\n/* harmony import */ var seedrandom__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! seedrandom */ \"./node_modules/seedrandom/index.js\");\n/* harmony import */ var seedrandom__WEBPACK_IMPORTED_MODULE_0___default = /*#__PURE__*/__webpack_require__.n(seedrandom__WEBPACK_IMPORTED_MODULE_0__);\n/* harmony import */ var simplex_noise__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! simplex-noise */ \"./node_modules/simplex-noise/dist/esm/simplex-noise.js\");\n\n\nconst myrng = seedrandom__WEBPACK_IMPORTED_MODULE_0___default()(\"crystals\");\nconst noise3D = (0,simplex_noise__WEBPACK_IMPORTED_MODULE_1__.createNoise3D)(myrng);\nconst fractalNoise3D = (x, y, z, frequency = 1, octaves = 3, persistence = 0.5) => {\n    let totalWeight = 0;\n    let value = 0;\n    let amplitude = 1;\n    for (let i = 0; i < octaves; i++) {\n        const scale = 1 << i; // scale doubles each octave\n        value +=\n            noise3D(x * scale * frequency, y * scale * frequency, z * scale * frequency) * amplitude;\n        totalWeight += amplitude;\n        amplitude *= persistence; // reduce amplitude for each octave\n    }\n    return value / totalWeight; // normalize the result\n};\nconst ridgedFractalNoise3D = (x, y, z, octaves = 3, persistence = 0.5) => {\n    let totalWeight = 0;\n    let value = 0;\n    let amplitude = 1;\n    for (let i = 0; i < octaves; i++) {\n        const scale = 1 << i;\n        value += Math.abs(noise3D(x * scale, y * scale, z * scale)) * amplitude;\n        totalWeight += amplitude;\n        amplitude *= persistence;\n    }\n    return value / totalWeight;\n};\n\n\n//# sourceURL=webpack://soulflame-webgpu/./src/procgen/fractal-noise-3d.ts?");

/***/ }),

/***/ "./src/procgen/sine-chunk.ts":
/*!***********************************!*\
  !*** ./src/procgen/sine-chunk.ts ***!
  \***********************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

"use strict";
eval("__webpack_require__.r(__webpack_exports__);\n/* harmony export */ __webpack_require__.d(__webpack_exports__, {\n/* harmony export */   CHUNK_HEIGHT: () => (/* binding */ CHUNK_HEIGHT),\n/* harmony export */   createOctreeAndReturnBytes: () => (/* binding */ createOctreeAndReturnBytes),\n/* harmony export */   getCachedVoxel: () => (/* binding */ getCachedVoxel)\n/* harmony export */ });\n/* harmony import */ var _renderer_octree_octree__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! @renderer/octree/octree */ \"./src/renderer/octree/octree.ts\");\n/* harmony import */ var comlink__WEBPACK_IMPORTED_MODULE_4__ = __webpack_require__(/*! comlink */ \"./node_modules/comlink/dist/esm/comlink.mjs\");\n/* harmony import */ var _fractal_noise_3d__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ./fractal-noise-3d */ \"./src/procgen/fractal-noise-3d.ts\");\n/* harmony import */ var _easing__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! ./easing */ \"./src/procgen/easing.ts\");\n/* harmony import */ var _voxel_cache__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! ./voxel-cache */ \"./src/procgen/voxel-cache.ts\");\n\n\n\n\n\nconst CHUNK_HEIGHT = 256;\nlet octree;\nlet noiseCache;\nlet voxelCache;\nconst NOISE_FREQUENCY = 0.001;\nconst getCachedVoxel = (x, y, z, yStart) => {\n    const n = (0,_fractal_noise_3d__WEBPACK_IMPORTED_MODULE_1__.fractalNoise3D)(x, y, z, NOISE_FREQUENCY, 5);\n    // 0 at the y top, 1 at the bottom\n    const squashFactor = (yStart + y) / CHUNK_HEIGHT;\n    const density = (0,_easing__WEBPACK_IMPORTED_MODULE_2__.easeInOutCubic)((n + 1) / 2);\n    if (density > squashFactor) {\n        return { red: 0, green: 255 - (0,_fractal_noise_3d__WEBPACK_IMPORTED_MODULE_1__.myrng)() * 128, blue: 0 };\n    }\n    return null;\n};\nconst createOctreeAndReturnBytes = async (position, size, buffer) => {\n    voxelCache = new _voxel_cache__WEBPACK_IMPORTED_MODULE_3__.VoxelCache((x, y, z) => getCachedVoxel(x + position[0], y + position[1], z + position[2], position[1]), size);\n    const getVoxel = (x, y, z) => {\n        return voxelCache.get([x, y, z]);\n    };\n    octree = new _renderer_octree_octree__WEBPACK_IMPORTED_MODULE_0__.Octree(getVoxel, () => 1, Math.max(...size), buffer);\n    voxelCache = undefined;\n    return octree.totalSizeBytes + _renderer_octree_octree__WEBPACK_IMPORTED_MODULE_0__.OCTREE_STRIDE;\n};\nconst worker = {\n    createOctreeAndReturnBytes,\n};\n(0,comlink__WEBPACK_IMPORTED_MODULE_4__.expose)(worker);\n\n\n//# sourceURL=webpack://soulflame-webgpu/./src/procgen/sine-chunk.ts?");

/***/ }),

/***/ "./src/procgen/voxel-cache.ts":
/*!************************************!*\
  !*** ./src/procgen/voxel-cache.ts ***!
  \************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

"use strict";
eval("__webpack_require__.r(__webpack_exports__);\n/* harmony export */ __webpack_require__.d(__webpack_exports__, {\n/* harmony export */   VoxelCache: () => (/* binding */ VoxelCache)\n/* harmony export */ });\nconst convert3DTo1D = (size, position) => {\n    return (position[0] + position[1] * size[0] + position[2] * (size[0] * size[1]));\n};\nconst STRIDE = 4;\n// Created a noise field for a given volume size\nclass VoxelCache {\n    cache;\n    size;\n    getVoxel;\n    constructor(getVoxel, size) {\n        this.size = size;\n        this.getVoxel = getVoxel;\n        this.cache = new Uint8Array(size[0] * size[1] * size[2] * STRIDE);\n        for (let x = 0; x < size[0]; x++) {\n            for (let y = 0; y < size[1]; y++) {\n                for (let z = 0; z < size[2]; z++) {\n                    const index = convert3DTo1D(size, [x, y, z]);\n                    const voxel = getVoxel(x, y, z);\n                    if (voxel === null) {\n                        continue;\n                    }\n                    this.cache[index * STRIDE] = voxel.red;\n                    this.cache[index * STRIDE + 1] = voxel.green;\n                    this.cache[index * STRIDE + 2] = voxel.blue;\n                }\n            }\n        }\n    }\n    get buffer() {\n        return this.cache.buffer;\n    }\n    get([x, y, z]) {\n        const index = convert3DTo1D(this.size, [x, y, z]);\n        const red = this.cache[index * STRIDE];\n        const green = this.cache[index * STRIDE + 1];\n        const blue = this.cache[index * STRIDE + 2];\n        if (red === 0 && green === 0 && blue === 0) {\n            return null;\n        }\n        return { red, green, blue };\n    }\n}\n\n\n//# sourceURL=webpack://soulflame-webgpu/./src/procgen/voxel-cache.ts?");

/***/ }),

/***/ "./src/renderer/octree/bitmask.ts":
/*!****************************************!*\
  !*** ./src/renderer/octree/bitmask.ts ***!
  \****************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

"use strict";
eval("__webpack_require__.r(__webpack_exports__);\n/* harmony export */ __webpack_require__.d(__webpack_exports__, {\n/* harmony export */   clearBit: () => (/* binding */ clearBit),\n/* harmony export */   clearBitLE: () => (/* binding */ clearBitLE),\n/* harmony export */   getBit: () => (/* binding */ getBit),\n/* harmony export */   getBitLE: () => (/* binding */ getBitLE),\n/* harmony export */   setBit: () => (/* binding */ setBit),\n/* harmony export */   setBitLE: () => (/* binding */ setBitLE)\n/* harmony export */ });\nconst setBit = (bitmask, index) => {\n    return bitmask | (1 << index);\n};\nconst setBitLE = (bitmask, index, totalBits = 8) => {\n    return bitmask | (1 << (totalBits - 1 - index));\n};\nconst clearBit = (bitmask, index) => {\n    return bitmask & ~(1 << index);\n};\nconst clearBitLE = (bitmask, index, totalBits = 8) => {\n    return bitmask & ~(1 << (totalBits - 1 - index));\n};\nconst getBit = (bitmask, index) => {\n    return (bitmask & (1 << index)) !== 0;\n};\nconst getBitLE = (bitmask, index) => {\n    return (bitmask & (1 << (7 - index))) !== 0;\n};\n\n\n//# sourceURL=webpack://soulflame-webgpu/./src/renderer/octree/bitmask.ts?");

/***/ }),

/***/ "./src/renderer/octree/octree.ts":
/*!***************************************!*\
  !*** ./src/renderer/octree/octree.ts ***!
  \***************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

"use strict";
eval("__webpack_require__.r(__webpack_exports__);\n/* harmony export */ __webpack_require__.d(__webpack_exports__, {\n/* harmony export */   OCTREE_STRIDE: () => (/* binding */ OCTREE_STRIDE),\n/* harmony export */   Octree: () => (/* binding */ Octree),\n/* harmony export */   bitmaskToString: () => (/* binding */ bitmaskToString),\n/* harmony export */   octantIndexToOffset: () => (/* binding */ octantIndexToOffset),\n/* harmony export */   setInternalNode: () => (/* binding */ setInternalNode),\n/* harmony export */   setLeafNode: () => (/* binding */ setLeafNode)\n/* harmony export */ });\n/* harmony import */ var _bitmask__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ./bitmask */ \"./src/renderer/octree/bitmask.ts\");\n\nconst OCTREE_STRIDE = 8;\nconst bitmaskToString = (bitmask, bits = 8) => {\n    return bitmask.toString(2).padStart(bits, \"0\");\n};\n/** Converts an octant index to an offset in the parent octant\n * Bits represent the following octants:\n *\n * 0 = [0,0,0]\n *\n * 1 = [1,0,0]\n *\n * 2 = [0,1,0]\n *\n * 3 = [1,1,0]\n *\n * 4 = [0,0,1]\n *\n * 5 = [1,0,1]\n *\n * 6 = [0,1,1]\n *\n * 7 = [1,1,1]\n */\nconst octantIndexToOffset = (index) => {\n    return [index & 1 ? 1 : 0, index & 2 ? 1 : 0, index & 4 ? 1 : 0];\n};\nconst ceilToNextPowerOfTwo = (n) => {\n    return Math.pow(2, Math.ceil(Math.log2(n)));\n};\n/**\n * Handles construction of an Octree for a single voxel object.\n */\nclass Octree {\n    nodes;\n    #pointer;\n    #getVoxel;\n    #getMinVoxelSize;\n    #dataView;\n    constructor(getVoxel, getMinVoxelSize, size, buffer) {\n        this.nodes = [];\n        this.#pointer = 0;\n        this.#dataView = new DataView(buffer);\n        this.#getVoxel = getVoxel;\n        this.#getMinVoxelSize = getMinVoxelSize;\n        this.#build(size, 0, [0, 0, 0]);\n    }\n    // Allocate memory for 8 nodes, and return the index of the first node\n    #mallocOctant(nodeCount = 8) {\n        this.#pointer += nodeCount;\n        return this.#pointer - (nodeCount - 1);\n    }\n    #build(size, startIndex, offset) {\n        const isLeaf = size <= this.#getMinVoxelSize(offset[0], offset[1], offset[2]);\n        if (isLeaf) {\n            const voxel = this.#getVoxel(offset[0], offset[1], offset[2]);\n            const { red, green, blue } = voxel;\n            const node = {\n                red,\n                green,\n                blue,\n                x: offset[0],\n                y: offset[1],\n                z: offset[2],\n                size,\n            };\n            setLeafNode(this.#dataView, startIndex, node);\n            return;\n        }\n        // The voxels contained within each child octant\n        const childOctantsVoxelCount = Array.from({ length: 8 }, () => 0);\n        const objectSize = ceilToNextPowerOfTwo(size);\n        const childOctantSize = objectSize / 2;\n        // For each child octant, check if it contains any voxels\n        for (let i = 0; i < 8; i++) {\n            const origin = octantIndexToOffset(i);\n            const x = offset[0] + origin[0] * childOctantSize;\n            const y = offset[1] + origin[1] * childOctantSize;\n            const z = offset[2] + origin[2] * childOctantSize;\n            for (let octantX = x; octantX < x + childOctantSize; octantX++) {\n                for (let octantY = y; octantY < y + childOctantSize; octantY++) {\n                    for (let octantZ = z; octantZ < z + childOctantSize; octantZ++) {\n                        if (this.#getVoxel(octantX, octantY, octantZ)) {\n                            childOctantsVoxelCount[i]++;\n                        }\n                    }\n                }\n            }\n        }\n        // We can save space by only allocating up to the last child node\n        let requiredChildNodes = 0;\n        // Once we have the valid child octants, create a node for the current octant\n        const childMask = childOctantsVoxelCount.reduce((mask, octantVoxels, i) => {\n            if (octantVoxels > 0) {\n                requiredChildNodes = i + 1;\n                return (0,_bitmask__WEBPACK_IMPORTED_MODULE_0__.setBit)(mask, i);\n            }\n            return mask;\n        }, 0);\n        const totalVoxels = childOctantsVoxelCount.reduce((total, octantVoxels) => total + octantVoxels, 0);\n        const isAllVoxelsFilled = totalVoxels === objectSize ** 3;\n        if (isAllVoxelsFilled) {\n            const centerOfOctant = offset.map((o) => o + objectSize / 2);\n            const { red, green, blue } = this.#getVoxel(centerOfOctant[0], centerOfOctant[1], centerOfOctant[2]);\n            const node = {\n                red,\n                green,\n                blue,\n                x: offset[0],\n                y: offset[1],\n                z: offset[2],\n                size,\n            };\n            setLeafNode(this.#dataView, startIndex, node);\n            return;\n        }\n        // Allocate memory for child nodes\n        const firstChildIndex = this.#mallocOctant(requiredChildNodes);\n        const relativeIndex = firstChildIndex - startIndex;\n        childOctantsVoxelCount.forEach((octantVoxels, i) => {\n            if (octantVoxels) {\n                const childIndex = firstChildIndex + i;\n                const origin = octantIndexToOffset(i);\n                const x = offset[0] + origin[0] * childOctantSize;\n                const y = offset[1] + origin[1] * childOctantSize;\n                const z = offset[2] + origin[2] * childOctantSize;\n                this.#build(childOctantSize, childIndex, [x, y, z]);\n            }\n        });\n        // Create the parent node\n        const node = {\n            firstChildIndex: relativeIndex,\n            childMask,\n            x: offset[0],\n            y: offset[1],\n            z: offset[2],\n            size: objectSize,\n        };\n        setInternalNode(this.#dataView, startIndex, node);\n    }\n    get totalSizeBytes() {\n        return this.#pointer * OCTREE_STRIDE;\n    }\n}\nconst setLeafNode = (dataView, index, node) => {\n    dataView.setUint8(index * OCTREE_STRIDE, 0);\n    dataView.setUint8(index * OCTREE_STRIDE + 1, node.x);\n    dataView.setUint8(index * OCTREE_STRIDE + 2, node.y);\n    dataView.setUint8(index * OCTREE_STRIDE + 3, node.z);\n    dataView.setUint8(index * OCTREE_STRIDE + 4, node.red);\n    dataView.setUint8(index * OCTREE_STRIDE + 5, node.green);\n    dataView.setUint8(index * OCTREE_STRIDE + 6, node.blue);\n    dataView.setUint8(index * OCTREE_STRIDE + 7, Math.log2(node.size));\n};\nconst setInternalNode = (dataView, index, node) => {\n    console.assert(node.firstChildIndex < 2 ** 24 - 1, `First child index of ${node.firstChildIndex} is too large to fit in 3 bytes`);\n    console.assert(node.x < 2 ** 8, `X position of ${node.x} is too large to fit in 1 byte`);\n    console.assert(node.y < 2 ** 8, `Y position of ${node.y} is too large to fit in 1 byte`);\n    console.assert(node.z < 2 ** 8, `Z position of ${node.z} is too large to fit in 1 byte`);\n    dataView.setUint8(index * OCTREE_STRIDE, node.childMask);\n    dataView.setUint8(index * OCTREE_STRIDE + 1, node.x);\n    dataView.setUint8(index * OCTREE_STRIDE + 2, node.y);\n    dataView.setUint8(index * OCTREE_STRIDE + 3, node.z);\n    dataView.setUint32(index * OCTREE_STRIDE + 4, node.firstChildIndex, true);\n    dataView.setUint8(index * OCTREE_STRIDE + 7, Math.log2(node.size));\n};\n\n\n//# sourceURL=webpack://soulflame-webgpu/./src/renderer/octree/octree.ts?");

/***/ }),

/***/ "?d4c0":
/*!************************!*\
  !*** crypto (ignored) ***!
  \************************/
/***/ (() => {

eval("/* (ignored) */\n\n//# sourceURL=webpack://soulflame-webgpu/crypto_(ignored)?");

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
/******/ 			id: moduleId,
/******/ 			loaded: false,
/******/ 			exports: {}
/******/ 		};
/******/ 	
/******/ 		// Execute the module function
/******/ 		__webpack_modules__[moduleId].call(module.exports, module, module.exports, __webpack_require__);
/******/ 	
/******/ 		// Flag the module as loaded
/******/ 		module.loaded = true;
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
/******/ 		var __webpack_exports__ = __webpack_require__.O(undefined, ["vendors-node_modules_seedrandom_index_js-node_modules_comlink_dist_esm_comlink_mjs-node_modul-7865fa"], () => (__webpack_require__("./src/procgen/sine-chunk.ts")))
/******/ 		__webpack_exports__ = __webpack_require__.O(__webpack_exports__);
/******/ 		return __webpack_exports__;
/******/ 	};
/******/ 	
/************************************************************************/
/******/ 	/* webpack/runtime/amd define */
/******/ 	(() => {
/******/ 		__webpack_require__.amdD = function () {
/******/ 			throw new Error('define cannot be used indirect');
/******/ 		};
/******/ 	})();
/******/ 	
/******/ 	/* webpack/runtime/amd options */
/******/ 	(() => {
/******/ 		__webpack_require__.amdO = {};
/******/ 	})();
/******/ 	
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
/******/ 	/* webpack/runtime/compat get default export */
/******/ 	(() => {
/******/ 		// getDefaultExport function for compatibility with non-harmony modules
/******/ 		__webpack_require__.n = (module) => {
/******/ 			var getter = module && module.__esModule ?
/******/ 				() => (module['default']) :
/******/ 				() => (module);
/******/ 			__webpack_require__.d(getter, { a: getter });
/******/ 			return getter;
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
/******/ 			return "" + chunkId + ".app.js";
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
/******/ 	/* webpack/runtime/node module decorator */
/******/ 	(() => {
/******/ 		__webpack_require__.nmd = (module) => {
/******/ 			module.paths = [];
/******/ 			if (!module.children) module.children = [];
/******/ 			return module;
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
/******/ 					while (i > -1 && (!scriptUrl || !/^http(s?):/.test(scriptUrl))) scriptUrl = scripts[i--].src;
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
/******/ 			"src_procgen_sine-chunk_ts": 1
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
/******/ 			return __webpack_require__.e("vendors-node_modules_seedrandom_index_js-node_modules_comlink_dist_esm_comlink_mjs-node_modul-7865fa").then(next);
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