package com.radinmnx.mnxonlinefix

import com.sun.jna.Pointer
import com.sun.jna.platform.win32.Kernel32
import com.sun.jna.platform.win32.WinBase
import com.sun.jna.platform.win32.WinNT

/**
 * Data class representing the retrieved network configuration.
 */
data class NetworkConfig(
    val ip: String,
    val port: Int,
    val isHost: Boolean
)

/**
 * High-performance, non-blocking Win32 IPC bridge reader for Kotlin applications.
 * Uses Java Native Access (JNA) to map and read raw Win32 Named Shared Memory blocks
 * without calling custom external C++/Rust libraries directly.
 */
class SharedMemoryReader {
    companion object {
        private const val SHM_NAME_GLOBAL = "Global\\MNX_Steam_Proxy_Shared"
        private const val SHM_NAME_LOCAL = "Local\\MNX_Steam_Proxy_Shared"
        private const val FILE_MAP_READ = 0x0004

        /**
         * Safely reads the redirected network configuration from the shared memory segment.
         * 
         * @return The parsed NetworkConfig object if successfully read and verified, or null otherwise.
         */
        fun readNetworkConfig(): NetworkConfig? {
            val kernel32 = Kernel32.INSTANCE

            // 1. Attempt to open Global file mapping first
            var hMapFile = kernel32.OpenFileMapping(
                FILE_MAP_READ,
                false,
                SHM_NAME_GLOBAL
            )

            // 2. Fall back to Local namespace if Global mapping doesn't exist
            if (hMapFile == null || hMapFile == WinBase.INVALID_HANDLE_VALUE) {
                hMapFile = kernel32.OpenFileMapping(
                    FILE_MAP_READ,
                    false,
                    SHM_NAME_LOCAL
                )
            }

            if (hMapFile == null || hMapFile == WinBase.INVALID_HANDLE_VALUE) {
                System.err.println("[MNX Kotlin SHM] Failed to open Shared Memory segment. Segment may not be created yet.")
                return null
            }

            // 3. Map the file segment into JVM process address space (512 bytes read-only)
            val pBuf = kernel32.MapViewOfFile(
                hMapFile,
                FILE_MAP_READ,
                0,
                0,
                512
            )

            if (pBuf == null) {
                System.err.println("[MNX Kotlin SHM] Failed to map view of file.")
                kernel32.CloseHandle(hMapFile)
                return null
            }

            try {
                // Struct Layout Offset Calculations (Total: 512 bytes):
                // - magic: u32 (0 -> 4 bytes)
                // - version: u32 (4 -> 8 bytes)
                // - port: u32 (8 -> 12 bytes)
                // - isHost: u8 (12 -> 13 bytes)
                // - padding: 3 bytes (13 -> 16 bytes)
                // - ip_address: 256 bytes (16 -> 272 bytes)
                // - reserved: 240 bytes (272 -> 512 bytes)
                val magic = pBuf.getInt(0)
                val version = pBuf.getInt(4)

                // Verify block integrity via magic identifier
                if (magic != 0x4D4E5853 || version != 1) {
                    System.err.println("[MNX Kotlin SHM] Block verification failed. Magic: " + 
                        Integer.toHexString(magic) + ", Version: " + version)
                    return null
                }

                val port = pBuf.getInt(8)
                val isHost = pBuf.getByte(12).toInt() != 0

                // Read null-terminated string for IP Address from offset 16
                val ipBytes = ByteArray(256)
                pBuf.read(16, ipBytes, 0, 256)

                var stringLength = 0
                while (stringLength < ipBytes.size && ipBytes[stringLength] != 0.toByte()) {
                    stringLength++
                }

                val ip = String(ipBytes, 0, stringLength, Charsets.UTF_8)
                return NetworkConfig(ip, port, isHost)

            } catch (ex: Exception) {
                System.err.println("[MNX Kotlin SHM] Error parsing shared memory: " + ex.message)
                return null
            } finally {
                // Clean up mapping and handle allocations
                kernel32.UnmapViewOfFile(pBuf)
                kernel32.CloseHandle(hMapFile)
            }
        }
    }
}
