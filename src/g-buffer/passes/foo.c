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

typedef struct{
    float x;
    float y;
    float z;
} vec3_f32;

typedef struct {
    float x;
    float y;
    float z;
    float w;
} vec4_f32;

typedef struct {
    float m[4][4];
} mat4x4_f32;

vec2_u32 convert1DTo2D(vec2_u32 size, uint32_t index) {
    vec2_u32 result;
    result.x = index % size.x;
    result.y = index / size.x;
    return result;
}

vec4_f32 matrixMul(mat4x4_f32 m, vec4_f32 v) {
    vec4_f32 result;
    result.x = m.m[0][0] * v.x + m.m[0][1] * v.y + m.m[0][2] * v.z + m.m[0][3] * v.w;
    result.y = m.m[1][0] * v.x + m.m[1][1] * v.y + m.m[1][2] * v.z + m.m[1][3] * v.w;
    result.z = m.m[2][0] * v.x + m.m[2][1] * v.y + m.m[2][2] * v.z + m.m[2][3] * v.w;
    result.w = m.m[3][0] * v.x + m.m[3][1] * v.y + m.m[3][2] * v.z + m.m[3][3] * v.w;
    return result;
}

vec3_f32 mul3(vec3_f32 a, vec3_f32 b) {
    vec3_f32 result;
    result.x = a.x * b.x;
    result.y = a.y * b.y;
    result.z = a.z * b.z;
    return result;
}

vec2_f32 mul2(vec2_f32 a, vec2_f32 b) {
    vec2_f32 result;
    result.x = a.x * b.x;
    result.y = a.y * b.y;
    return result;
}

vec3_f32 mulScalar3(vec3_f32 a, float b) {
    vec3_f32 result;
    result.x = a.x * b;
    result.y = a.y * b;
    result.z = a.z * b;
    return result;
}

vec2_f32 mulScalar2(vec2_f32 a, float b) {
    vec2_f32 result;
    result.x = a.x * b;
    result.y = a.y * b;
    return result;
}

vec3_f32 cross3(vec3_f32 a, vec3_f32 b) {
    vec3_f32 result;
    result.x = a.y * b.z - a.z * b.y;
    result.y = a.z * b.x - a.x * b.z;
    result.z = a.x * b.y - a.y * b.x;
    return result;
}

float dot3(vec3_f32 a, vec3_f32 b) {
    return a.x * b.x + a.y * b.y + a.z * b.z;
}

vec3_f32 normalize3(vec3_f32 a) {
    float length = sqrtf(a.x * a.x + a.y * a.y + a.z * a.z);
    vec3_f32 result;
    result.x = a.x / length;
    result.y = a.y / length;
    result.z = a.z / length;
    return result;
}

vec3_f32 divScalar3(vec3_f32 a, float b) {
    vec3_f32 result;
    result.x = a.x / b;
    result.y = a.y / b;
    result.z = a.z / b;
    return result;
}

vec3_f32 sub3(vec3_f32 a, vec3_f32 b) {
    vec3_f32 result;
    result.x = a.x - b.x;
    result.y = a.y - b.y;
    result.z = a.z - b.z;
    return result;
}

vec2_f32 sub2(vec2_f32 a, vec2_f32 b) {
    vec2_f32 result;
    result.x = a.x - b.x;
    result.y = a.y - b.y;
    return result;
}

vec3_f32 add3(vec3_f32 a, vec3_f32 b) {
    vec3_f32 result;
    result.x = a.x + b.x;
    result.y = a.y + b.y;
    result.z = a.z + b.z;
    return result;
}

vec2_f32 vec2f(float x, float y) {
    vec2_f32 result;
    result.x = x;
    result.y = y;
    return result;
}

vec3_f32 vec3f(float x, float y, float z) {
    vec3_f32 result;
    result.x = x;
    result.y = y;
    result.z = z;
    return result;
}

vec4_f32 vec4f(float x, float y, float z, float w) {
    vec4_f32 result;
    result.x = x;
    result.y = y;
    result.z = z;
    result.w = w;
    return result;
}

vec3_f32 calculateRayDirection(vec2_f32 uv, mat4x4_f32 inverseProjection) {
  vec2_f32 clipSpace = sub2(mulScalar2(vec2f(1.0 - uv.x, 1.0 - uv.y),2.0),vec2f(1.0, 1.0));
  vec3_f32 viewRay = vec3f(clipSpace.x, clipSpace.y, 1.0);
  vec4_f32 viewRayView = matrixMul(inverseProjection, vec4f(viewRay.x, viewRay.y, viewRay.z, 1.0));
  return normalize3(vec3f(viewRayView.x, viewRayView.y, viewRayView.z));
}

EXTERN EMSCRIPTEN_KEEPALIVE
void populate(uint8_t* array, uint32_t length, uint32_t frameIndex, uint32_t resolutionX, uint32_t resolutionY) {
     for (uint32_t byteIndex = 0; byteIndex < length; byteIndex += 4) {
        uint32_t index = byteIndex / 4;
        vec2_u32 resolution = { resolutionX, resolutionY };
        vec2_u32 pixel = convert1DTo2D(resolution, index);
        vec2_f32 uv = { (float)pixel.x / (float)resolution.x, (float)pixel.y / (float)resolution.y };
        uint8_t r = (uint8_t)(uv.x * 255.0);
        uint8_t g = (uint8_t)(uv.y * 255.0);
        uint8_t b = 0;
        uint8_t a = 255;

        v128_t color = wasm_i8x16_make(r, g, b, a, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0);
        wasm_v128_store(array + byteIndex, color);
    }
}