#include <napi.h>
#include <string>
#include <vector>
#include <functional>
#include <atomic>
#include <mutex>

// Define global variables that will be shared with dllmain.cpp
// These are set by the Node.js frontend.
std::string g_originalHostIP = "127.0.0.1";
std::string g_currentHostIP = "127.0.0.1";
std::vector<std::string> g_peerIPs;
std::atomic<bool> g_isHost(false);
std::string g_myIP = "127.0.0.1";
std::string g_playerName = "MNX_Player"; // Default name
std::function<void(const std::string&)> g_logCallback = nullptr;

// Avatar data
extern std::vector<uint8_t> g_avatarRGBA;
extern int g_avatarWidth;
extern int g_avatarHeight;
extern std::mutex g_avatarMutex;

// Hotkey data
std::atomic<UINT> g_hotkeyVkCode(0x09); // VK_TAB
std::atomic<bool> g_hotkeyCtrl(false);
std::atomic<bool> g_hotkeyAlt(false);
std::atomic<bool> g_hotkeyShift(true);


Napi::ThreadSafeFunction g_tsfn = nullptr;

void SendLogToNode(const std::string& log) { /* ... same as before ... */ }

// Comprehensive function to set the entire network state from Node.js
Napi::Value SetNetworkConfiguration(const Napi::CallbackInfo& info) { /* ... same as before ... */ }

// Function to set the player's avatar from a raw RGBA buffer
Napi::Value SetAvatarData(const Napi::CallbackInfo& info) { /* ... same as before ... */ }

Napi::Value SetLogCallback(const Napi::CallbackInfo& info) { /* ... same as before ... */ }

// Function to set the overlay hotkey from Node.js
Napi::Value SetHotkeyConfiguration(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    if (info.Length() != 1 || !info[0].IsObject()) {
        Napi::TypeError::New(env, "Expected one argument: a hotkey object").ThrowAsJavaScriptException();
        return env.Null();
    }
    Napi::Object hotkey = info[0].As<Napi::Object>();

    if (!hotkey.Has("vkCode") || !hotkey.Has("ctrl") || !hotkey.Has("alt") || !hotkey.Has("shift")) {
        Napi::TypeError::New(env, "Hotkey object is missing required properties").ThrowAsJavaScriptException();
        return env.Null();
    }
    
    g_hotkeyVkCode = hotkey.Get("vkCode").As<Napi::Number>().Uint32Value();
    g_hotkeyCtrl = hotkey.Get("ctrl").As<Napi::Boolean>().Value();
    g_hotkeyAlt = hotkey.Get("alt").As<Napi::Boolean>().Value();
    g_hotkeyShift = hotkey.Get("shift").As<Napi::Boolean>().Value();

    return env.Undefined();
}


Napi::Object Init(Napi::Env env, Napi::Object exports) {
    exports.Set(Napi::String::New(env, "setNetworkConfiguration"), Napi::Function::New(env, SetNetworkConfiguration));
    exports.Set(Napi::String::New(env, "setAvatarData"), Napi::Function::New(env, SetAvatarData));
    exports.Set(Napi::String::New(env, "setLogCallback"), Napi::Function::New(env, SetLogCallback));
    exports.Set(Napi::String::New(env, "setHotkeyConfiguration"), Napi::Function::New(env, SetHotkeyConfiguration));
    return exports;
}

NAPI_MODULE(NODE_GYP_MODULE_NAME, Init)
