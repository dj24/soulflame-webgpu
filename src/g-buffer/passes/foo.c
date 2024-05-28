#include <stdint.h>
#include <stdio.h>
#include <emscripten.h>
#include <math.h>
#include <wasm_simd128.h>
#define EXTERN

typedef struct {
    uint32_t x;
    uint32_t y;
} vec2_u32;

typedef struct {
    float x;
    float y;
} vec2_f32;

vec2_u32 convert1DTo2D(vec2_u32 size, uint32_t index) {
    vec2_u32 result;
    result.x = index % size.x;
    result.y = index / size.x;
    return result;
}

EXTERN EMSCRIPTEN_KEEPALIVE
void populate(uint8_t* array, uint32_t length, uint32_t frameIndex, uint32_t resolutionX, uint32_t resolutionY) {
     for (uint32_t i = 0; i < length; i += 16) {
        vec2_u32 resolution = { resolutionX, resolutionY };
        vec2_u32 pixel = convert1DTo2D(resolution, i / 16);
        vec2_f32 uv = { (float)pixel.x / (float)resolution.x, (float)pixel.y / (float)resolution.y };
        uint8_t r = (uint8_t)((float)((i / 16) % resolution.x) * 255.0);
        uint8_t g = (uint8_t)((float)i / (float)length * 255.0);
        g = 0;

        uint8_t b = 0;
        uint8_t a = 255;

        v128_t color = wasm_i8x16_make(r, g, b, a, r, g, b, a, r, g, b, a, r, g, b, a);
        wasm_v128_store(array + i, color);
    }
}