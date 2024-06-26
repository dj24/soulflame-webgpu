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
  uint8_t r;
  uint8_t g;
  uint8_t b;
  uint8_t a;
} colour;

typedef struct {
    float m[4][4];
} mat4x4_f32;

typedef struct {
v128_t columns[4];
} mat4x4_f32_simd;

typedef struct {
  v128_t data;
} vec4_f32_simd;

vec4_f32_simd vec4f_simd(float x, float y, float z, float w) {
    vec4_f32_simd result;
    result.data = wasm_f32x4_make(x, y, z, w);
    return result;
}

vec4_f32_simd mul_simd(vec4_f32_simd a, vec4_f32_simd b) {
    vec4_f32_simd result;
    result.data = wasm_f32x4_mul(a.data, b.data);
    return result;
}

vec4_f32_simd mulScalar_simd(vec4_f32_simd a, float b) {
    vec4_f32_simd result;
    result.data = wasm_f32x4_mul(a.data, wasm_f32x4_splat(b));
    return result;
}

vec4_f32_simd add_simd(vec4_f32_simd a, vec4_f32_simd b) {
    vec4_f32_simd result;
    result.data = wasm_f32x4_add(a.data, b.data);
    return result;
}

vec4_f32_simd sub_simd(vec4_f32_simd a, vec4_f32_simd b) {
    vec4_f32_simd result;
    result.data = wasm_f32x4_sub(a.data, b.data);
    return result;
}

vec4_f32_simd div_simd(vec4_f32_simd a, vec4_f32_simd b) {
    vec4_f32_simd result;
    result.data = wasm_f32x4_div(a.data, b.data);
    return result;
}

vec4_f32_simd divScalar_simd(vec4_f32_simd a, float b) {
    vec4_f32_simd result;
    result.data = wasm_f32x4_div(a.data, wasm_f32x4_splat(b));
    return result;
}

vec4_f32_simd cross_simd(vec4_f32_simd a, vec4_f32_simd b) {
    vec4_f32_simd result;
    result.data = wasm_f32x4_make(
        a.data[1] * b.data[2] - a.data[2] * b.data[1],
        a.data[2] * b.data[0] - a.data[0] * b.data[2],
        a.data[0] * b.data[1] - a.data[1] * b.data[0],
        0.0
    );
    return result;
}

float dot_simd(vec4_f32_simd a, vec4_f32_simd b) {
    return a.data[0] * b.data[0] + a.data[1] * b.data[1] + a.data[2] * b.data[2];
}

typedef struct {
  mat4x4_f32 viewProjection;
  mat4x4_f32 previousViewProjection;
  mat4x4_f32 inverseViewProjection;
  mat4x4_f32 previousInverseViewProjection;
  mat4x4_f32 projection;
  mat4x4_f32 inverseProjection;
} camera_matrices;

typedef struct {
  mat4x4_f32_simd viewProjection;
  mat4x4_f32_simd previousViewProjection;
  mat4x4_f32_simd inverseViewProjection;
  mat4x4_f32_simd previousInverseViewProjection;
  mat4x4_f32_simd projection;
  mat4x4_f32_simd inverseProjection;
} camera_matrices_simd;

vec2_u32 convert1DTo2D(vec2_u32 size, uint32_t index) {
    vec2_u32 result;
    result.x = index % size.x;
    result.y = index / size.x;
    return result;
}

// column major
vec4_f32 matrixMul(mat4x4_f32 m, vec4_f32 v) {
    vec4_f32 result;
    result.x = m.m[0][0] * v.x + m.m[1][0] * v.y + m.m[2][0] * v.z + m.m[3][0] * v.w;
    result.y = m.m[0][1] * v.x + m.m[1][1] * v.y + m.m[2][1] * v.z + m.m[3][1] * v.w;
    result.z = m.m[0][2] * v.x + m.m[1][2] * v.y + m.m[2][2] * v.z + m.m[3][2] * v.w;
    result.w = m.m[0][3] * v.x + m.m[1][3] * v.y + m.m[2][3] * v.z + m.m[3][3] * v.w;
    return result;
}

v128_t matrixMul_simd(mat4x4_f32_simd m, v128_t v) {
    v128_t result;
    result = wasm_f32x4_mul(m.columns[0], wasm_f32x4_splat(wasm_f32x4_extract_lane(v, 0)));
    result = wasm_f32x4_add(result, wasm_f32x4_mul(m.columns[1], wasm_f32x4_splat(wasm_f32x4_extract_lane(v, 1))));
    result = wasm_f32x4_add(result, wasm_f32x4_mul(m.columns[2], wasm_f32x4_splat(wasm_f32x4_extract_lane(v, 2))));
    result = wasm_f32x4_add(result, wasm_f32x4_mul(m.columns[3], wasm_f32x4_splat(wasm_f32x4_extract_lane(v, 3))));
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

v128_t normalize_simd(v128_t a) {
    float x = wasm_f32x4_extract_lane(a, 0);
    float y = wasm_f32x4_extract_lane(a, 1);
    float z = wasm_f32x4_extract_lane(a, 2);
    float w = wasm_f32x4_extract_lane(a, 3);
    float length = sqrtf(x * x + y * y + z * z + w * w);
    return wasm_f32x4_div(a, wasm_f32x4_splat(length));
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

vec2_u32 vec2u(uint32_t x, uint32_t y) {
    vec2_u32 result;
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

vec3_f32 calculateRayDirection(vec2_f32 uv, mat4x4_f32 inverseViewProjection) {
  vec2_f32 clipSpace = sub2(mulScalar2(vec2f(1.0 - uv.x, 1.0 - uv.y),2.0),vec2f(1.0, 1.0));
  vec3_f32 viewRay = vec3f(clipSpace.x, clipSpace.y, 1.0);
  vec4_f32 viewRayView = matrixMul(inverseViewProjection, vec4f(viewRay.x, viewRay.y, viewRay.z, 1.0));
  return normalize3(vec3f(viewRayView.x, viewRayView.y, viewRayView.z));
}

v128_t calculateRayDirection_simd(v128_t uv, mat4x4_f32_simd inverseViewProjection) {
    v128_t clipSpace = wasm_f32x4_sub(wasm_f32x4_mul(wasm_f32x4_splat(2.0), wasm_f32x4_sub(wasm_f32x4_splat(1.0), uv)), wasm_f32x4_splat(1.0));
    v128_t viewRay = wasm_f32x4_make(wasm_f32x4_extract_lane(clipSpace, 0), wasm_f32x4_extract_lane(clipSpace, 1), 1.0, 0.0);
    v128_t viewRayView = matrixMul_simd(inverseViewProjection, viewRay);
    return normalize_simd(viewRayView);
}

vec2_f32 calculateUV(uint32_t index, vec2_u32* resolution, vec2_f32 uvReciprocal) {
    vec2_f32 result;
    result.x = (float)(index % resolution->x) * uvReciprocal.x;
    result.y = (float)(index / resolution->x) * uvReciprocal.y;
    return result;
}

v128_t calculateUV_simd(uint32_t index, vec2_u32* resolution, vec4_f32_simd uvReciprocal_simd) {
    v128_t pixel = wasm_f32x4_make((float)(index % resolution->x), (float)(index / resolution->x), 0.0, 0.0);
    return wasm_f32x4_mul(pixel, uvReciprocal_simd.data);
}

vec3_f32 mix(vec3_f32 a, vec3_f32 b, float t) {
    vec3_f32 result;
    result.x = a.x * (1.0 - t) + b.x * t;
    result.y = a.y * (1.0 - t) + b.y * t;
    result.z = a.z * (1.0 - t) + b.z * t;
    return result;
}

EXTERN EMSCRIPTEN_KEEPALIVE
void populate(uint8_t* arrayPtr, uint32_t length, uint32_t frameIndex, vec2_u32* resolution, camera_matrices* cameraMatrices) {
    vec4_f32_simd uvReciprocal_simd = div_simd(vec4f_simd(1.0, 1.0, 0.0, 0.0), vec4f_simd((float)resolution->x, (float)resolution->y, 0.0, 0.0));
    for (uint32_t byteIndex = 0; byteIndex < length; byteIndex += 4) {
        uint32_t index = (byteIndex) / 4;
        v128_t uv_simd = calculateUV_simd(index, resolution, uvReciprocal_simd); // (uint8_t)(wasm_f32x4_extract_lane(uv, 1) * 255.0)
        vec2_f32 uv = {wasm_f32x4_extract_lane(uv_simd, 0), wasm_f32x4_extract_lane(uv_simd, 1)};
        vec3_f32 rayDirection = calculateRayDirection(uv, cameraMatrices->inverseViewProjection);
        uint8_t r = (uint8_t)(rayDirection.x * 255.0);
        uint8_t g = (uint8_t)(rayDirection.y * 255.0);
        uint8_t b = (uint8_t)(rayDirection.z * 255.0);
        uint8_t a = 255;

//         v128_t rayDirection = calculateRayDirection_simd(uv_simd, cameraMatrices->inverseViewProjection);
//         uint8_t r = (uint8_t)(wasm_f32x4_extract_lane(rayDirection, 0) * 255.0);
//         uint8_t g = (uint8_t)(wasm_f32x4_extract_lane(rayDirection, 1) * 255.0);
//         uint8_t b = (uint8_t)(wasm_f32x4_extract_lane(rayDirection, 2) * 255.0);
//         uint8_t a = 255;

        v128_t colours = wasm_u8x16_make(r, g, b, a, 0,0,0,0,0,0,0,0,0,0,0,0);
        wasm_v128_store32_lane(arrayPtr + byteIndex, colours, 0);
    }
}