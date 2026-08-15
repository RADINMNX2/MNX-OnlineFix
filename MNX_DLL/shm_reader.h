#pragma once
#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

#pragma pack(push, 1)
typedef struct {
    uint32_t magic;             // 4 bytes: Magic (0x4D4E5853 "MNXS")
    uint32_t version;           // 4 bytes: Struct Layout Version (1)
    uint32_t port;              // 4 bytes: Redirect Port (e.g., 27015)
    uint8_t is_host;            // 1 byte: 1 if host, 0 if client
    uint8_t padding[3];         // 3 bytes: Struct Alignment Padding
    uint8_t ip_address[256];    // 256 bytes: Null-terminated UTF-8 IP string
    uint8_t reserved[240];      // 240 bytes: Future expansion / Total 512 bytes
} SharedNetworkConfig;
#pragma pack(pop)

/**
 * High-performance, non-blocking Win32 IPC bridge reader.
 * Intercepts the shared memory and copies values safely.
 *
 * @param out_ip Buffer to receive null-terminated string (must be at least 256 bytes).
 * @param out_port Pointer to receive the target redirect port.
 * @param out_is_host Pointer to receive the host status byte (1 = host, 0 = client).
 * @return 1 if successfully read and verified, 0 if segment is unavailable or uninitialized.
 */
int mnx_read_network_config(
    uint8_t* out_ip,
    uint32_t* out_port,
    uint8_t* out_is_host
);

#ifdef __cplusplus
}
#endif
