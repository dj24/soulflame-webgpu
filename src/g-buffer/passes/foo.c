#include <stdint.h>
#include <stdio.h>
#include <emscripten.h>
#include <math.h>
#include <wasm_simd128.h>
#define EXTERN

EXTERN EMSCRIPTEN_KEEPALIVE
void populate(uint8_t* array, uint32_t length, uint32_t frameIndex) {
     for (uint32_t i = 0; i < length; i += 16) {
        uint8_t r = (uint8_t)(255 * (sin(frameIndex / 50.0) * 0.5 + 0.5));     // R
        uint8_t g = (uint8_t)(255 * (sin(frameIndex / 100.0) * 0.5 + 0.5));   // G
        uint8_t b = (uint8_t)(255 * (cos(frameIndex / 50.0) * 0.5 + 0.5));   // B
        uint8_t a = 255; // A

        v128_t color = wasm_i8x16_make(r, g, b, a, r, g, b, a, r, g, b, a, r, g, b, a);
        wasm_v128_store(array + i, color);
    }
}