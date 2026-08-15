#pragma once

// --- Windows & DirectX ---
#include <windows.h>
#include <winsock2.h>
#include <ws2tcpip.h>
#include <d3d11.h>
#include <dxgi.h>

// --- C++ Standard Library ---
#include <string>
#include <vector>
#include <functional>
#include <thread>
#include <chrono>
#include <mutex>
#include <atomic>
#include <map>
#include <deque>
#include <cstdarg>

// --- Third-Party Libraries ---
// NOTE: The source files for these libraries must be included in the project.
#include "MinHook.h" // Hooking library
#include "json.hpp"  // JSON parsing for IPC
#include "zlib.h"    // Packet compression

// --- Project Headers ---
#include "isteamnetworking.h"

// --- Global Structs & Defines ---
#define OVERLAY_PIPE_NAME "\\\\.\\pipe\\mnx_overlay_pipe"

struct QueuedPacket {
    uint64_t senderID;
    std::vector<char> data;
    bool isPredicted = false;
};

struct OverlayData {
    float ping = 0.0f;
    std::vector<std::string> players;
};

// --- Link Libraries ---
#pragma comment(lib, "ws2_32.lib")
#pragma comment(lib, "zlib.lib")
#pragma comment(lib, "d3d11.lib")
#pragma comment(lib, "dxgi.lib")

// --- Dear ImGui Forward Declarations ---
// We forward declare these to avoid including the full headers here,
// they will be included in dllmain.cpp.
struct ImGuiContext;
namespace ImGui {
    IMGUI_API ImGuiContext* CreateContext(void* shared_font_atlas = NULL);
    IMGUI_API void DestroyContext(ImGuiContext* ctx = NULL);
    IMGUI_API void NewFrame();
    IMGUI_API void Render();
}
