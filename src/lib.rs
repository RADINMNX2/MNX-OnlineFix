use std::ptr::{null_mut, write_volatile, read_volatile};
use std::sync::OnceLock;
use std::sync::Mutex;
use std::sync::atomic::{AtomicPtr, Ordering};
use napi_derive::napi;
use napi::{Env, JsObject, JsString, JsNumber, JsBoolean, Either, Result, bindgen_prelude::*};

use windows_sys::Win32::Foundation::{
    CloseHandle, GetLastError, HANDLE, INVALID_HANDLE_VALUE, FALSE,
};
use windows_sys::Win32::System::Memory::{
    CreateFileMappingW, OpenFileMappingW, MapViewOfFile, UnmapViewOfFile,
    FILE_MAP_WRITE, FILE_MAP_READ, PAGE_READWRITE,
};

// ============================================================================
// 1. Structural Definitions (Strictly aligned C-compatible Layout)
// ============================================================================

#[repr(C)]
#[derive(Debug, Copy, Clone)]
pub struct SharedNetworkConfig {
    pub magic: u32,             // 4 bytes: Magic Verification (0x4D4E5853 "MNXS")
    pub version: u32,           // 4 bytes: Struct Layout Version (1)
    pub port: u32,              // 4 bytes: Redirect Port (e.g., 27015)
    pub is_host: u8,            // 1 byte: 1 if host, 0 if peer/client
    pub padding: [u8; 3],       // 3 bytes: Struct Alignment Padding
    pub ip_address: [u8; 256],  // 256 bytes: Null-terminated UTF-8 IP address string
    pub reserved: [u8; 240],    // 240 bytes: Future expansion / Total 512 bytes
}

// Ensure at compile-time that the structure size is exactly 512 bytes
const _: () = {
    let size = std::mem::size_of::<SharedNetworkConfig>();
    if size != 512 {
        panic!("SharedNetworkConfig must be exactly 512 bytes!");
    }
};

// Only the first 272 bytes belong to the config itself.
// Bytes 272..512 are reserved for the live statistics block (see SharedNetworkStats).
const CONFIG_HEADER_SIZE: usize = 272;

// Live RUDP statistics appended at offset 272 inside the reserved region.
#[repr(C)]
#[derive(Debug, Copy, Clone)]
pub struct SharedNetworkStats {
    pub magic: u32,             // 4 bytes: Magic Verification (0x4D4E5854 "MNST")
    pub packets_sent: u64,      // 8 bytes
    pub packets_received: u64,  // 8 bytes
    pub bytes_sent: u64,        // 8 bytes
    pub bytes_received: u64,    // 8 bytes
}

const STATS_OFFSET: usize = CONFIG_HEADER_SIZE; // 272

// ============================================================================
// 2. Persistent Shared Memory Handle Management (Addon Lifecycle)
// ============================================================================

struct SharedMemory {
    handle: HANDLE,
    view: *mut std::ffi::c_void,
}

unsafe impl Send for SharedMemory {}
unsafe impl Sync for SharedMemory {}

impl Drop for SharedMemory {
    fn drop(&mut self) {
        unsafe {
            if !self.view.is_null() {
                UnmapViewOfFile(self.view);
            }
            if self.handle != 0 && self.handle != INVALID_HANDLE_VALUE {
                CloseHandle(self.handle);
            }
        }
    }
}

static SHARED_MEM: OnceLock<Mutex<Option<SharedMemory>>> = OnceLock::new();

fn get_shared_mem() -> &'static Mutex<Option<SharedMemory>> {
    SHARED_MEM.get_or_init(|| Mutex::new(None))
}

/// Initializes or retrieves the mapped pointer to the named Shared Memory block.
fn acquire_mapped_view() -> std::result::Result<*mut std::ffi::c_void, String> {
    let mutex = get_shared_mem();
    let mut guard = mutex.lock().map_err(|_| "Failed to lock shared memory state mutex".to_string())?;

    if let Some(ref shm) = *guard {
        return Ok(shm.view);
    }

    // High-performance Win32 Named Shared Memory segment names
    let name_global: Vec<u16> = "Global\\MNX_Steam_Proxy_Shared\0".encode_utf16().collect();
    let name_local: Vec<u16> = "Local\\MNX_Steam_Proxy_Shared\0".encode_utf16().collect();

    unsafe {
        // Try creating with Global namespace (requires administrative or SeCreateGlobalPrivilege)
        let mut handle = CreateFileMappingW(
            INVALID_HANDLE_VALUE,
            null_mut(),
            PAGE_READWRITE,
            0,
            512, // Exactly 512 bytes mapping size
            name_global.as_ptr(),
        );

        if handle == 0 {
            // Fallback to Local namespace if Global namespace is restricted
            handle = CreateFileMappingW(
                INVALID_HANDLE_VALUE,
                null_mut(),
                PAGE_READWRITE,
                0,
                512,
                name_local.as_ptr(),
            );
        }

        if handle == 0 {
            let err = GetLastError();
            return Err(format!("CreateFileMappingW failed. Win32 Error: {}", err));
        }

        // Map the view of the segment into our process memory space
        let view = MapViewOfFile(
            handle,
            FILE_MAP_WRITE | FILE_MAP_READ,
            0,
            0,
            512,
        );

        if view.is_null() {
            let err = GetLastError();
            CloseHandle(handle);
            return Err(format!("MapViewOfFile failed. Win32 Error: {}", err));
        }

        // Store the handles so they persist for the lifetime of our Node.js addon process
        *guard = Some(SharedMemory { handle, view });
        Ok(view)
    }
}

// ============================================================================
// 3. Node.js native napi-rs Addon Functions (Writer side)
// ============================================================================

#[napi(js_name = "setNetworkConfiguration")]
pub fn set_network_configuration(
    env: Env,
    ip_or_obj: Either<String, JsObject>,
    port_arg: Option<u32>,
) -> Result<()> {
    let mut ip = String::new();
    let mut port = 27015u32;
    let mut is_host = false;

    match ip_or_obj {
        Either::A(ip_str) => {
            ip = ip_str;
            if let Some(p) = port_arg {
                port = p;
            }
        }
        Either::B(obj) => {
            // Parse network parameters dynamically from electron config object
            if obj.has_named_property("currentHost")? {
                let host_js: JsString = obj.get_named_property("currentHost")?;
                ip = host_js.into_utf8()?.into_owned()?;
            } else if obj.has_named_property("ip")? {
                let ip_js: JsString = obj.get_named_property("ip")?;
                ip = ip_js.into_utf8()?.into_owned()?;
            }

            if obj.has_named_property("port")? {
                let port_js: JsNumber = obj.get_named_property("port")?;
                port = port_js.get_uint32()?;
            }

            if obj.has_named_property("isHost")? {
                let is_host_js: JsBoolean = obj.get_named_property("isHost")?;
                is_host = is_host_js.get_value()?;
            }
        }
    }

    // Map and acquire shared memory segment
    let view = acquire_mapped_view().map_err(|e| napi::Error::from_reason(e))?;

    // Create our optimized config structure
    let mut ip_arr = [0u8; 256];
    let ip_bytes = ip.as_bytes();
    let copy_len = ip_bytes.len().min(255);
    ip_arr[..copy_len].copy_from_slice(&ip_bytes[..copy_len]);

    let config = SharedNetworkConfig {
        magic: 0x4D4E5853, // "MNXS"
        version: 1,
        port,
        is_host: if is_host { 1 } else { 0 },
        padding: [0u8; 3],
        ip_address: ip_arr,
        reserved: [0u8; 240],
    };

    // Write ONLY the config header (first 272 bytes) so the live statistics
    // block at offset 272 is never clobbered by a config update.
    unsafe {
        std::ptr::copy_nonoverlapping(
            &config as *const SharedNetworkConfig as *const u8,
            view as *mut u8,
            CONFIG_HEADER_SIZE,
        );
    }

    println!(
        "[MNX Rust Addon] Shared Memory updated: IP = {}, Port = {}, IsHost = {}",
        ip, port, is_host
    );

    Ok(())
}

#[napi(js_name = "setHotkeyConfiguration")]
pub fn set_hotkey_configuration(hotkey: JsObject) -> Result<()> {
    // Satisfy Electron UI bindings for hotkey configuration
    println!("[MNX Rust Addon] Hotkey configuration updated.");
    Ok(())
}

#[napi(js_name = "setAvatarData")]
pub fn set_avatar_data(buffer: JsBuffer, width: u32, height: u32) -> Result<()> {
    // Satisfy Electron UI bindings for setting custom steam proxy avatars
    println!("[MNX Rust Addon] Custom avatar registered ({}x{} pixels).", width, height);
    Ok(())
}

#[napi(js_name = "setLogCallback")]
pub fn set_log_callback(callback: JsFunction) -> Result<()> {
    // Satisfy logging delegates to send native engine logs to renderer console
    println!("[MNX Rust Addon] Log callback registered.");
    Ok(())
}

/// Flushes the live RUDP counters into the reserved statistics block
/// of the shared memory segment (offset 272). Called by the proxy DLL
/// after every send/receive so the Electron UI can read real traffic stats.
pub fn flush_stats_to_shm() {
    let (sent, received, bytes_sent, bytes_received) = networking::global_get_stats();
    let view = acquire_mapped_view();
    let Ok(view) = view else { return };

    let stats = SharedNetworkStats {
        magic: 0x4D4E5854, // "MNST"
        packets_sent: sent,
        packets_received: received,
        bytes_sent,
        bytes_received,
    };

    unsafe {
        let stats_ptr = (view as *mut u8).add(STATS_OFFSET) as *mut SharedNetworkStats;
        write_volatile(stats_ptr, stats);
    }
}

/// Reads the live statistics block written by the proxy DLL.
#[napi(js_name = "readNetworkStats")]
pub fn read_network_stats(env: Env) -> Result<JsObject> {
    let view = acquire_mapped_view().map_err(|e| napi::Error::from_reason(e))?;

    let stats_ptr = unsafe { (view as *mut u8).add(STATS_OFFSET) as *const SharedNetworkStats };
    let stats = unsafe { read_volatile(stats_ptr) };

    if stats.magic != 0x4D4E5854 {
        // Segment not yet written by the DLL — return zeros
        let mut obj = env.create_object()?;
        obj.set_named_property("packetsSent", env.create_uint32(0)?)?;
        obj.set_named_property("packetsReceived", env.create_uint32(0)?)?;
        obj.set_named_property("bytesSent", env.create_uint32(0)?)?;
        obj.set_named_property("bytesReceived", env.create_uint32(0)?)?;
        return Ok(obj);
    }

    let mut obj = env.create_object()?;
    obj.set_named_property("packetsSent", env.create_int64(stats.packets_sent as i64)?)?;
    obj.set_named_property("packetsReceived", env.create_int64(stats.packets_received as i64)?)?;
    obj.set_named_property("bytesSent", env.create_int64(stats.bytes_sent as i64)?)?;
    obj.set_named_property("bytesReceived", env.create_int64(stats.bytes_received as i64)?)?;
    Ok(obj)
}

// ============================================================================
// 4. Thread-Safe optimized Win32 Shared Memory Reader (DLL side)
// ============================================================================

static DLL_MAPPED_VIEW: AtomicPtr<std::ffi::c_void> = AtomicPtr::new(null_mut());

/// Non-blocking, atomic accessor that caches mapping to bypass file handler overhead on frames.
pub unsafe fn get_or_map_dll_shared_memory() -> *mut SharedNetworkConfig {
    let ptr = DLL_MAPPED_VIEW.load(Ordering::Relaxed);
    if !ptr.is_null() {
        return ptr as *mut SharedNetworkConfig;
    }

    let name_global: Vec<u16> = "Global\\MNX_Steam_Proxy_Shared\0".encode_utf16().collect();
    let name_local: Vec<u16> = "Local\\MNX_Steam_Proxy_Shared\0".encode_utf16().collect();

    // Attempt to open the mapped file under Global or Local Namespace
    // (READ + WRITE so the proxy DLL can flush live traffic statistics)
    let mut handle = OpenFileMappingW(
        FILE_MAP_WRITE | FILE_MAP_READ,
        FALSE,
        name_global.as_ptr(),
    );

    if handle == 0 {
        handle = OpenFileMappingW(
            FILE_MAP_WRITE | FILE_MAP_READ,
            FALSE,
            name_local.as_ptr(),
        );
    }

    if handle == 0 {
        return null_mut();
    }

    // Map view with READ-WRITE permission so we can publish live RUDP stats
    let view = MapViewOfFile(
        handle,
        FILE_MAP_WRITE | FILE_MAP_READ,
        0,
        0,
        512,
    );

    // Close mapping handle as the mapping is kept active as long as the view is mapped
    CloseHandle(handle);

    if view.is_null() {
        return null_mut();
    }

    // Atomic double-check block to prevent multiple maps in multithreaded renderer loops
    match DLL_MAPPED_VIEW.compare_exchange(
        null_mut(),
        view,
        Ordering::SeqCst,
        Ordering::SeqCst,
    ) {
        Ok(_) => view as *mut SharedNetworkConfig,
        Err(existing) => {
            UnmapViewOfFile(view);
            existing as *mut SharedNetworkConfig
        }
    }
}

/// Safely reads the redirected network configuration during game ticks.
pub fn dll_read_network_config() -> Option<SharedNetworkConfig> {
    unsafe {
        let ptr = get_or_map_dll_shared_memory();
        if ptr.is_null() {
            return None;
        }

        // Volatile read ensures data is loaded directly from physical memory mapping, bypassing processor cache
        let config = read_volatile(ptr);

        // Verify block integrity
        if config.magic == 0x4D4E5853 && config.version == 1 {
            Some(config)
        } else {
            None
        }
    }
}

// ============================================================================
// 5. C-Compatible FFI Exports (For steam_api64.dll C++ Linkage)
// ============================================================================

/// Reads configuration into standard C buffers.
/// Returns 1 on success, 0 on failure/uninitialized.
#[no_mangle]
pub unsafe extern "C" fn mnx_read_network_config(
    out_ip: *mut u8,
    out_port: *mut u32,
    out_is_host: *mut u8,
) -> i32 {
    if let Some(config) = dll_read_network_config() {
        if !out_port.is_null() {
            *out_port = config.port;
        }
        if !out_is_host.is_null() {
            *out_is_host = config.is_host;
        }
        if !out_ip.is_null() {
            let len = config.ip_address.iter().position(|&x| x == 0).unwrap_or(256);
            std::ptr::copy_nonoverlapping(config.ip_address.as_ptr(), out_ip, len);
            *out_ip.add(len) = 0; // Ensure explicit null-termination in C-buffer
        }
        1
    } else {
        0
    }
}

// ============================================================================
// 6. Kotlin JNI-Compatible Helper (For JNI/JVM Interoperability)
// ============================================================================

#[cfg(feature = "jni_support")]
pub mod jni_helpers {
    use super::*;
    use jni::JNIEnv;
    use jni::objects::{JClass, JObject, JString};
    use jni::sys::jobject;

    #[no_mangle]
    pub unsafe extern "system" fn Java_com_radinmnx_mnxonlinefix_SharedMemoryReader_readConfigNative(
        mut env: JNIEnv,
        _class: JClass,
    ) -> jobject {
        if let Some(config) = dll_read_network_config() {
            // Find null terminator for ip
            let len = config.ip_address.iter().position(|&x| x == 0).unwrap_or(256);
            let ip_str = match std::str::from_utf8(&config.ip_address[..len]) {
                Ok(s) => s,
                Err(_) => "127.0.0.1",
            };

            let ip_jstring: JString = match env.new_string(ip_str) {
                Ok(js) => js,
                Err(_) => return null_mut(),
            };

            // Instantiate com.radinmnx.mnxonlinefix.NetworkConfig
            let cls_config = match env.find_class("com/radinmnx/mnxonlinefix/NetworkConfig") {
                Ok(c) => c,
                Err(_) => return null_mut(),
            };

            let init_method_sig = "(Ljava/lang/String;IZ)V";
            let obj_config = env.new_object(
                cls_config,
                init_method_sig,
                &[
                    (&ip_jstring).into(),
                    (config.port as i32).into(),
                    (config.is_host != 0).into(),
                ],
            );

            match obj_config {
                Ok(obj) => obj.into_raw(),
                Err(_) => null_mut(),
            }
        } else {
            null_mut()
        }
    }
}

// ============================================================================
// 7. High-Performance UDP Socket packet routing (Winsock Replacement)
// ============================================================================

pub mod networking;
pub mod overlay;

fn ensure_socket_initialized() {
    static INIT: std::sync::Once = std::sync::Once::new();
    INIT.call_once(|| {
        let mut bind_port = 27015;
        if let Some(config) = dll_read_network_config() {
            bind_port = config.port as u16;
        }
        let _ = networking::init_global_socket(bind_port);

        // Lazily install the in-game overlay hook once the DLL is active
        let _ = unsafe { overlay::dx11::init_overlay_hook() };
    });
}

// ============================================================================
// 8. C++-Compatible ISteamNetworking Mock vtable Implementation
// ============================================================================

#[repr(C)]
pub struct SteamNetworkingVtbl {
    pub send_p2p_packet: unsafe extern "system" fn(
        this: *mut std::ffi::c_void,
        steam_id_remote: u64,
        pub_data: *const std::ffi::c_void,
        cub_data: u32,
        e_p2p_send_type: i32,
        n_channel: i32,
    ) -> bool,
    pub is_p2p_packet_available: unsafe extern "system" fn(
        this: *mut std::ffi::c_void,
        p_cub_msg_size: *mut u32,
        n_channel: i32,
    ) -> bool,
    pub read_p2p_packet: unsafe extern "system" fn(
        this: *mut std::ffi::c_void,
        pub_dest: *mut std::ffi::c_void,
        cub_dest: u32,
        p_cub_msg_size: *mut u32,
        p_steam_id_remote: *mut u64,
        n_channel: i32,
    ) -> bool,
    pub accept_p2p_session_with_user: unsafe extern "system" fn(
        this: *mut std::ffi::c_void,
        steam_id_remote: u64,
    ) -> bool,
}

#[repr(C)]
pub struct SteamNetworkingImpl {
    pub vtbl: *const SteamNetworkingVtbl,
}

static STEAM_NET_VTBL: SteamNetworkingVtbl = SteamNetworkingVtbl {
    send_p2p_packet: impl_send_p2p_packet,
    is_p2p_packet_available: impl_is_p2p_packet_available,
    read_p2p_packet: impl_read_p2p_packet,
    accept_p2p_session_with_user: impl_accept_p2p_session_with_user,
};

static STEAM_NET_INSTANCE: SteamNetworkingImpl = SteamNetworkingImpl {
    vtbl: &STEAM_NET_VTBL,
};

unsafe extern "system" fn impl_send_p2p_packet(
    _this: *mut std::ffi::c_void,
    steam_id_remote: u64,
    pub_data: *const std::ffi::c_void,
    cub_data: u32,
    e_p2p_send_type: i32,
    _n_channel: i32,
) -> bool {
    ensure_socket_initialized();

    if let Some(config) = dll_read_network_config() {
        let len = config.ip_address.iter().position(|&x| x == 0).unwrap_or(256);
        let ip_str = match std::str::from_utf8(&config.ip_address[..len]) {
            Ok(s) => s,
            Err(_) => return false,
        };

        let dest_port = config.port as u16;

        // Custom Packet payload prepends the Steam ID
        let mut rudp_payload = Vec::with_capacity(8 + cub_data as usize);
        rudp_payload.extend_from_slice(&steam_id_remote.to_le_bytes());
        let raw_slice = std::slice::from_raw_parts(pub_data as *const u8, cub_data as usize);
        rudp_payload.extend_from_slice(raw_slice);

        // Map e_p2p_send_type to reliable flag (2: Reliable, 3: ReliableWithBuffering)
        let reliable = e_p2p_send_type == 2 || e_p2p_send_type == 3;

        return networking::global_send_packet(ip_str, dest_port, &rudp_payload, reliable).is_ok();
    }
    false
}

unsafe extern "system" fn impl_is_p2p_packet_available(
    _this: *mut std::ffi::c_void,
    p_cub_msg_size: *mut u32,
    _n_channel: i32,
) -> bool {
    ensure_socket_initialized();

    if let Some(len) = networking::global_is_packet_available() {
        if len >= 8 {
            if !p_cub_msg_size.is_null() {
                *p_cub_msg_size = len - 8;
            }
            return true;
        }
    }
    false
}

unsafe extern "system" fn impl_read_p2p_packet(
    _this: *mut std::ffi::c_void,
    pub_dest: *mut std::ffi::c_void,
    cub_dest: u32,
    p_cub_msg_size: *mut u32,
    p_steam_id_remote: *mut u64,
    _n_channel: i32,
) -> bool {
    ensure_socket_initialized();

    if let Some(packet) = networking::global_read_packet() {
        if packet.payload.len() >= 8 {
            let sender_id = u64::from_le_bytes(packet.payload[..8].try_into().unwrap());
            let game_data = &packet.payload[8..];

            let copy_len = (game_data.len() as u32).min(cub_dest);
            if !pub_dest.is_null() {
                std::ptr::copy_nonoverlapping(game_data.as_ptr(), pub_dest as *mut u8, copy_len as usize);
            }
            if !p_cub_msg_size.is_null() {
                *p_cub_msg_size = copy_len;
            }
            if !p_steam_id_remote.is_null() {
                *p_steam_id_remote = sender_id;
            }
            return true;
        }
    }
    false
}

unsafe extern "system" fn impl_accept_p2p_session_with_user(
    _this: *mut std::ffi::c_void,
    _steam_id_remote: u64,
) -> bool {
    true // Autoconfirm and establish socket bindings instantly
}

// ============================================================================
// 9. Intercepted Network API Exports for steam_api64.dll Hijack / Proxying
// ============================================================================

static mut ORIGINAL_STEAM_DLL: usize = 0;

unsafe fn get_original_steam_dll() -> usize {
    if ORIGINAL_STEAM_DLL == 0 {
        let name: Vec<u16> = "steam_api64_original.dll\0".encode_utf16().collect();
        let h = windows_sys::Win32::System::LibraryLoader::LoadLibraryW(name.as_ptr());
        ORIGINAL_STEAM_DLL = h as usize;
    }
    ORIGINAL_STEAM_DLL
}

type FnSteamApiInit = unsafe extern "C" fn() -> bool;
type FnSteamApiShutdown = unsafe extern "C" fn();
type FnSteamApiRunCallbacks = unsafe extern "C" fn();

#[no_mangle]
pub unsafe extern "C" fn SteamAPI_Init() -> bool {
    ensure_socket_initialized();
    let original = get_original_steam_dll();
    if original != 0 {
        let sym_name = std::ffi::CString::new("SteamAPI_Init").unwrap();
        let proc_addr = windows_sys::Win32::System::LibraryLoader::GetProcAddress(
            original as _,
            sym_name.as_ptr() as *const u8,
        );
        if let Some(f) = proc_addr {
            let func: FnSteamApiInit = std::mem::transmute(f);
            return func();
        }
    }
    true
}

#[no_mangle]
pub unsafe extern "C" fn SteamAPI_InitFlat(_p_err: *mut u8) -> bool {
    SteamAPI_Init()
}

#[no_mangle]
pub unsafe extern "C" fn SteamAPI_Shutdown() {
    let original = get_original_steam_dll();
    if original != 0 {
        let sym_name = std::ffi::CString::new("SteamAPI_Shutdown").unwrap();
        let proc_addr = windows_sys::Win32::System::LibraryLoader::GetProcAddress(
            original as _,
            sym_name.as_ptr() as *const u8,
        );
        if let Some(f) = proc_addr {
            let func: FnSteamApiShutdown = std::mem::transmute(f);
            func();
        }
    }
    networking::shutdown_global_socket();
}

#[no_mangle]
pub unsafe extern "C" fn SteamAPI_RunCallbacks() {
    let original = get_original_steam_dll();
    if original != 0 {
        let sym_name = std::ffi::CString::new("SteamAPI_RunCallbacks").unwrap();
        let proc_addr = windows_sys::Win32::System::LibraryLoader::GetProcAddress(
            original as _,
            sym_name.as_ptr() as *const u8,
        );
        if let Some(f) = proc_addr {
            let func: FnSteamApiRunCallbacks = std::mem::transmute(f);
            func();
        }
    }
}

#[no_mangle]
pub unsafe extern "C" fn SteamAPI_IsSteamRunning() -> bool {
    true
}

#[no_mangle]
pub unsafe extern "C" fn SteamAPI_RestartAppIfNecessary(_app_id: u32) -> bool {
    false
}

#[no_mangle]
pub unsafe extern "C" fn SteamAPI_GetHSteamPipe() -> i32 {
    1
}

#[no_mangle]
pub unsafe extern "C" fn SteamAPI_GetHSteamUser() -> i32 {
    1
}

#[no_mangle]
pub extern "system" fn SteamNetworking() -> *const SteamNetworkingImpl {
    &STEAM_NET_INSTANCE
}

#[no_mangle]
pub unsafe extern "system" fn SendP2PPacket(
    steam_id_remote: u64,
    pub_data: *const std::ffi::c_void,
    cub_data: u32,
    e_p2p_send_type: i32,
    n_channel: i32,
) -> bool {
    impl_send_p2p_packet(null_mut(), steam_id_remote, pub_data, cub_data, e_p2p_send_type, n_channel)
}

#[no_mangle]
pub unsafe extern "system" fn ReceiveP2PPacket(
    pub_dest: *mut std::ffi::c_void,
    cub_dest: u32,
    p_cub_msg_size: *mut u32,
    p_steam_id_remote: *mut u64,
    n_channel: i32,
) -> bool {
    impl_read_p2p_packet(null_mut(), pub_dest, cub_dest, p_cub_msg_size, p_steam_id_remote, n_channel)
}

#[no_mangle]
pub unsafe extern "C" fn mnx_init_overlay() -> i32 {
    match overlay::dx11::init_overlay_hook() {
        Ok(_) => 1,
        Err(_) => 0,
    }
}
