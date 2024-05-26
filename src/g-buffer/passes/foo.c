#include <stdint.h>
#include <stdio.h>
#include <emscripten/emscripten.h>

#ifdef __cplusplus
#define EXTERN extern "C"
#else
#define EXTERN
#endif

EXTERN EMSCRIPTEN_KEEPALIVE
void populate(uint8_t* array, uint32_t length) {
    printf("Populating array of length %d\n", length);
    for (uint32_t i = 0; i < length; i += 4) {
        array[i] = 255;     // R
        array[i + 1] = 0;   // G
        array[i + 2] = 0;   // B
        array[i + 3] = 255; // A
    }
}