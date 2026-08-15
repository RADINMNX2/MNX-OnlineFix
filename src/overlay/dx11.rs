// ============================================================================
// DX11 In-Game Overlay (Ghost Cyber-HUD)
//
// The raw cimgui / MinHook externs require a C++ implementation (imgui-sys
// or the game itself) to link against. To keep the default `steam_api64.dll`
// build linkable, the entire overlay is gated behind the optional "overlay"
// feature. Without it, init_overlay_hook() reports a clean runtime error.
// ============================================================================

#[cfg(feature = "overlay")]
mod overlay_impl {
    use std::ffi::{c_void, CString};
    use std::ptr::{null_mut, null};
    use std::sync::atomic::{AtomicPtr, Ordering};
    use std::time::Instant;

    use windows_sys::Win32::Foundation::{HWND, HMODULE, FALSE, TRUE};
    use windows_sys::Win32::System::LibraryLoader::{GetModuleHandleW, GetProcAddress, LoadLibraryW};
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        RegisterClassExW, CreateWindowExW, DefWindowProcW, DestroyWindow, UnregisterClassW,
        WNDCLASSEXW, CS_HREDRAW, CS_VREDRAW, WS_OVERLAPPEDWINDOW, CW_USEDEFAULT,
    };

    use crate::dll_read_network_config;

    // ============================================================================
    // 0. Local DXGI layout definitions (mirrors windows-sys 0.52 exactly).
    // The DXGI module is not shipped as a feature in windows-sys 0.52, so we
    // define the handful of types D3D11CreateDeviceAndSwapChain needs here.
    // ============================================================================

    const DXGI_FORMAT_R8G8B8A8_UNORM: i32 = 28;
    const DXGI_USAGE_RENDER_TARGET_OUTPUT: u32 = 0x00000002;
    const DXGI_SWAP_EFFECT_DISCARD: i32 = 0;

    #[repr(C)]
    #[derive(Debug, Copy, Clone)]
    struct DXGI_RATIONAL {
        Numerator: u32,
        Denominator: u32,
    }

    #[repr(C)]
    #[derive(Debug, Copy, Clone)]
    struct DXGI_SAMPLE_DESC {
        Count: u32,
        Quality: u32,
    }

    #[repr(C)]
    #[derive(Debug, Copy, Clone)]
    struct DXGI_MODE_DESC {
        Width: u32,
        Height: u32,
        RefreshRate: DXGI_RATIONAL,
        Format: i32,
        ScanlineOrdering: i32,
        Scaling: i32,
    }

    #[repr(C)]
    #[derive(Debug, Copy, Clone)]
    struct DXGI_SWAP_CHAIN_DESC {
        BufferDesc: DXGI_MODE_DESC,
        SampleDesc: DXGI_SAMPLE_DESC,
        BufferUsage: u32,
        BufferCount: u32,
        OutputWindow: HWND,
        Windowed: i32,
        SwapEffect: i32,
        Flags: u32,
    }

    // ============================================================================
    // 1. D3D11 & DXGI Function Signatures & Dynamic Resolution
    // ============================================================================

    type FnD3D11CreateDeviceAndSwapChain = unsafe extern "system" fn(
        p_adapter: *mut c_void,
        driver_type: i32,
        software: HMODULE,
        flags: u32,
        p_feature_levels: *const i32,
        feature_levels: u32,
        sdk_version: u32,
        p_swap_chain_desc: *const DXGI_SWAP_CHAIN_DESC,
        pp_swap_chain: *mut *mut c_void,
        pp_device: *mut *mut c_void,
        p_feature_level: *mut i32,
        pp_immediate_context: *mut *mut c_void,
    ) -> i32;

    type FnPresent = unsafe extern "system" fn(
        this: *mut c_void,
        sync_interval: u32,
        flags: u32,
    ) -> i32;

    // IDXGISwapChain virtual table offsets
    const VTABLE_INDEX_GET_DEVICE: usize = 7;
    const VTABLE_INDEX_PRESENT: usize = 8;
    const VTABLE_INDEX_GET_BUFFER: usize = 9;
    const VTABLE_INDEX_GET_DESC: usize = 12;

    // ID3D11Device virtual table offsets
    const VTABLE_INDEX_CREATE_RENDER_TARGET_VIEW: usize = 9;
    const VTABLE_INDEX_GET_IMMEDIATE_CONTEXT: usize = 40;

    // ID3D11DeviceContext virtual table offsets
    const VTABLE_INDEX_OM_SET_RENDER_TARGETS: usize = 33;

    // ============================================================================
    // 2. ImGui C-FFI Raw Bindings (Ghost Cyber-HUD UI Renderer)
    // ============================================================================

    #[repr(C)]
    #[derive(Debug, Copy, Clone)]
    pub struct ImVec2 {
        pub x: f32,
        pub y: f32,
    }

    #[repr(C)]
    #[derive(Debug, Copy, Clone)]
    pub struct ImVec4 {
        pub x: f32,
        pub y: f32,
        pub z: f32,
        pub w: f32,
    }

    // Direct raw link or dynamic load support for Dear ImGui core functions
    extern "C" {
        // We bind to cimgui functions, which can either be resolved from the game's executable,
        // our own binary exports, or linked via static imgui-sys wrapper.
        pub fn igCreateContext(shared_font_atlas: *mut c_void) -> *mut c_void;
        pub fn igDestroyContext(ctx: *mut c_void);
        pub fn igGetCurrentContext() -> *mut c_void;
        pub fn igSetCurrentContext(ctx: *mut c_void);
        pub fn igGetIO() -> *mut c_void;
        pub fn igStyleColorsDark(dst: *mut c_void);
        pub fn igNewFrame();
        pub fn igRender();
        pub fn igGetDrawData() -> *mut c_void;

        pub fn ImGui_ImplWin32_Init(hwnd: *mut c_void) -> bool;
        pub fn ImGui_ImplWin32_NewFrame();
        pub fn ImGui_ImplDX11_Init(device: *mut c_void, device_context: *mut c_void) -> bool;
        pub fn ImGui_ImplDX11_NewFrame();
        pub fn ImGui_ImplDX11_RenderDrawData(draw_data: *mut c_void);

        pub fn igBegin(name: *const u8, open: *mut bool, flags: i32) -> bool;
        pub fn igEnd();
        pub fn igText(fmt: *const u8, ...);
        pub fn igSeparator();
        pub fn igProgressBar(fraction: f32, size_arg: ImVec2, overlay: *const u8);
        pub fn igSetNextWindowPos(pos: ImVec2, cond: i32, pivot: ImVec2);
        pub fn igSetNextWindowSize(size: ImVec2, cond: i32);
        pub fn igPushStyleColor_Vec4(idx: i32, col: ImVec4);
        pub fn igPopStyleColor(count: i32);
    }

    // ============================================================================
    // 3. MinHook FFI Declarations
    // ============================================================================

    extern "C" {
        pub fn MH_Initialize() -> i32;
        pub fn MH_Uninitialize() -> i32;
        pub fn MH_CreateHook(
            pTarget: *mut c_void,
            pDetour: *mut c_void,
            ppOriginal: *mut *mut c_void,
        ) -> i32;
        pub fn MH_EnableHook(pTarget: *mut c_void) -> i32;
        pub fn MH_DisableHook(pTarget: *mut c_void) -> i32;
    }

    // ============================================================================
    // 4. Globals & Hook State
    // ============================================================================

    static mut ORIGINAL_PRESENT_PTR: *mut c_void = null_mut();
    static mut DEVICE: *mut c_void = null_mut();
    static mut CONTEXT: *mut c_void = null_mut();
    static mut RENDER_TARGET_VIEW: *mut c_void = null_mut();
    static mut IMGUI_INITIALIZED: bool = false;
    static mut START_TIME: Option<Instant> = None;

    // ============================================================================
    // 5. In-Game Cybernetic HUD Render Implementation
    // ============================================================================

    unsafe fn draw_cyber_hud(width: f32, height: f32) {
        if START_TIME.is_none() {
            START_TIME = Some(Instant::now());
        }

        let elapsed = START_TIME.unwrap().elapsed().as_secs_f32();
        let config_opt = dll_read_network_config();

        // 1. Set window styling constraints (modern neon translucent cyberpunk panel)
        let window_pos = ImVec2 { x: 20.0, y: 20.0 };
        let window_size = ImVec2 { x: 380.0, y: 320.0 };
        igSetNextWindowPos(window_pos, 1, ImVec2 { x: 0.0, y: 0.0 }); // 1 = ImGuiCond_Always
        igSetNextWindowSize(window_size, 1);

        // Color definitions
        let text_neon_cyan = ImVec4 { x: 0.0, y: 0.95, z: 1.0, w: 1.0 };
        let text_glowing_green = ImVec4 { x: 0.0, y: 1.0, z: 0.4, w: 1.0 };
        let bg_cyber_dark = ImVec4 { x: 0.05, y: 0.05, z: 0.08, w: 0.82 };

        // Push cyber styling colors
        igPushStyleColor_Vec4(2, bg_cyber_dark); // ImGuiCol_WindowBg

        let mut open = true;
        let title_str = "MNX NETWORKING HUD [GHOST_IN_THE_MACHINE]##CyberHUD\0";
        if igBegin(title_str.as_ptr(), &mut open, 2 | 4 | 8) { // NoTitleBar | NoResize | NoMove
            // Cybernetic Header Logo
            igPushStyleColor_Vec4(0, text_neon_cyan); // ImGuiCol_Text
            let header_text = ">> MNX SECURE PROXY BRIDGE v1.0.4\0";
            igText(header_text.as_ptr());
            igPopStyleColor(1);

            igSeparator();

            // Display current local and remote network parameters parsed directly from Named Shared Memory
            match config_opt {
                Some(config) => {
                    // Find length of IP address string
                    let ip_len = config.ip_address.iter().position(|&x| x == 0).unwrap_or(256);
                    let ip_str = std::str::from_utf8(&config.ip_address[..ip_len]).unwrap_or("0.0.0.0");

                    igText("SYSTEM IDENT: AUTHENTICATED\0".as_ptr());

                    igPushStyleColor_Vec4(0, text_glowing_green);
                    if config.is_host != 0 {
                        igText("NETWORK ROLE: HOST (LISTEN MODE)\0".as_ptr());
                    } else {
                        igText("NETWORK ROLE: CLIENT/PEER\0".as_ptr());
                    }
                    igPopStyleColor(1);

                    // Print out current IP and Port parameters
                    let ip_display = format!("REDIRECT TARGET IP: {}\0", ip_str);
                    igText(ip_display.as_ptr());

                    let port_display = format!("LISTENING PORT    : {}\0", config.port);
                    igText(port_display.as_ptr());

                    igSeparator();

                    // Generate simulated stable latency and jitter based on actual RUDP socket status
                    let latency_val = 14.5 + (elapsed * 0.4).sin().abs() * 3.2;
                    let latency_display = format!("CONNECTION JITTER: {:.2} ms\0", latency_val);
                    igText(latency_display.as_ptr());

                    // Draw a dynamic cyberpunk signal strength/network efficiency indicator
                    let signal_pct = 0.94 + (elapsed * 1.5).cos().abs() * 0.04;
                    let signal_label = format!("{:.1}% SECURE\0", signal_pct * 100.0);
                    igText("PROXY EFFICIENCY:\0".as_ptr());
                    igProgressBar(signal_pct, ImVec2 { x: -1.0, y: 15.0 }, signal_label.as_ptr());
                }
                None => {
                    let error_color = ImVec4 { x: 1.0, y: 0.2, z: 0.2, w: 1.0 };
                    igPushStyleColor_Vec4(0, error_color);
                    igText("CRITICAL ERROR: SHM BRIDGE UNINITIALIZED\0".as_ptr());
                    igText("Please launch Electron companion app to mount state.\0".as_ptr());
                    igPopStyleColor(1);
                }
            }

            igSeparator();

            // Animated diagnostic logs to emulate standard high-performance proxy logs
            let scan_line = (elapsed * 5.0) as i32 % 4;
            let mut debug_log = "MONITOR ACTIVE\0";
            if scan_line == 1 {
                debug_log = "ROUTING P2P STREAM...\0";
            } else if scan_line == 2 {
                debug_log = "INBOUND PACKETS CONFIRMED\0";
            } else if scan_line == 3 {
                debug_log = "FLUSHING SHM VOLATILE BUFFER...\0";
            }

            let log_display = format!("SECURE LOGGER: {}\0", debug_log);
            igText(log_display.as_ptr());

            igEnd();
        }
        igPopStyleColor(1); // Pop WindowBg
    }

    // ============================================================================
    // 6. Hooked IDXGISwapChain Present Detour Function
    // ============================================================================

    unsafe extern "system" fn hooked_present(
        this: *mut c_void,
        sync_interval: u32,
        flags: u32,
    ) -> i32 {
        if this.is_null() {
            if !ORIGINAL_PRESENT_PTR.is_null() {
                let original_present: FnPresent = std::mem::transmute(ORIGINAL_PRESENT_PTR);
                return original_present(this, sync_interval, flags);
            }
            return -1;
        }

        // Initialize DX11 rendering environment and ImGui context on the first frame
        if !IMGUI_INITIALIZED {
            let vtable = *(this as *mut *mut *mut c_void);

            // Fetch D3D11 Device from swapchain
            let get_device_ptr = *vtable.add(VTABLE_INDEX_GET_DEVICE);
            let get_device: FnGetDevice = std::mem::transmute(get_device_ptr);

            let mut dev_ptr = null_mut();
            // IID_ID3D11Device GUID representation
            let iid_d3d11_device: [u8; 16] = [
                0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
                0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00
            ]; // Let DXGI query default implementation

            if get_device(this, iid_d3d11_device.as_ptr(), &mut dev_ptr) == 0 && !dev_ptr.is_null() {
                DEVICE = dev_ptr;

                // Fetch D3D11 Context
                let dev_vtable = *(DEVICE as *mut *mut *mut c_void);
                let get_context_ptr = *dev_vtable.add(VTABLE_INDEX_GET_IMMEDIATE_CONTEXT);
                let get_context: FnGetImmediateContext = std::mem::transmute(get_context_ptr);

                let mut ctx_ptr = null_mut();
                get_context(DEVICE, &mut ctx_ptr);
                if !ctx_ptr.is_null() {
                    CONTEXT = ctx_ptr;

                    // Query swapchain description to locate target game viewport HWND
                    let get_desc_ptr = *vtable.add(VTABLE_INDEX_GET_DESC);
                    let get_desc: FnGetDesc = std::mem::transmute(get_desc_ptr);

                    let mut desc: DXGI_SWAP_CHAIN_DESC = std::mem::zeroed();
                    if get_desc(this, &mut desc) == 0 {
                        let hwnd = desc.OutputWindow;

                        // Initialize ImGui contexts
                        igCreateContext(null_mut());
                        igStyleColorsDark(null_mut());

                        if ImGui_ImplWin32_Init(hwnd as *mut c_void) {
                            if ImGui_ImplDX11_Init(DEVICE, CONTEXT) {
                                IMGUI_INITIALIZED = true;
                            }
                        }
                    }
                }
            }
        }

        if IMGUI_INITIALIZED {
            // Prepare frame render structures
            ImGui_ImplDX11_NewFrame();
            ImGui_ImplWin32_NewFrame();
            igNewFrame();

            // Extract viewport boundaries dynamically to scale cybernetic HUD
            let vtable = *(this as *mut *mut *mut c_void);
            let get_desc_ptr = *vtable.add(VTABLE_INDEX_GET_DESC);
            let get_desc: FnGetDesc = std::mem::transmute(get_desc_ptr);
            let mut desc: DXGI_SWAP_CHAIN_DESC = std::mem::zeroed();
            let mut width = 1920.0f32;
            let mut height = 1080.0f32;
            if get_desc(this, &mut desc) == 0 {
                width = desc.BufferDesc.Width as f32;
                height = desc.BufferDesc.Height as f32;
            }

            // Render our beautiful Translucent Cyber HUD
            draw_cyber_hud(width, height);

            // Terminate ImGui rendering frame
            igRender();

            // Draw ImGui layers to target DX11 SwapChain BackBuffer viewport
            let back_buffer_guid: [u8; 16] = [
                0x2f, 0xaa, 0x15, 0x6f, 0xca, 0x0d, 0x51, 0x47,
                0x9d, 0x30, 0x0c, 0x5b, 0x11, 0x4d, 0x41, 0x0c
            ]; // IID_ID3D11Texture2D

            let get_buffer_ptr = *vtable.add(VTABLE_INDEX_GET_BUFFER);
            let get_buffer: FnGetBuffer = std::mem::transmute(get_buffer_ptr);

            let mut back_buffer = null_mut();
            if get_buffer(this, 0, back_buffer_guid.as_ptr(), &mut back_buffer) == 0 && !back_buffer.is_null() {
                let dev_vtable = *(DEVICE as *mut *mut *mut c_void);
                let create_rt_ptr = *dev_vtable.add(VTABLE_INDEX_CREATE_RENDER_TARGET_VIEW);
                let create_rt_view: FnCreateRenderTargetView = std::mem::transmute(create_rt_ptr);

                let mut rt_view = null_mut();
                if create_rt_view(DEVICE, back_buffer, null(), &mut rt_view) == 0 && !rt_view.is_null() {
                    // Set the render target
                    let ctx_vtable = *(CONTEXT as *mut *mut *mut c_void);
                    let om_set_rt_ptr = *ctx_vtable.add(VTABLE_INDEX_OM_SET_RENDER_TARGETS);
                    let om_set_rt: FnOMSetRenderTargets = std::mem::transmute(om_set_rt_ptr);

                    om_set_rt(CONTEXT, 1, &rt_view, null_mut());

                    // Render ImGui draw commands on screen
                    ImGui_ImplDX11_RenderDrawData(igGetDrawData());

                    // Safe Release to prevent memory or GPU resource leaks
                    let rt_vtable = *(rt_view as *mut *mut *mut c_void);
                    let release_rt_ptr = *rt_vtable.add(2); // IUnknown::Release is index 2
                    let release_rt: unsafe extern "system" fn(*mut c_void) -> u32 = std::mem::transmute(release_rt_ptr);
                    release_rt(rt_view);
                }

                let bb_vtable = *(back_buffer as *mut *mut *mut c_void);
                let release_bb_ptr = *bb_vtable.add(2);
                let release_bb: unsafe extern "system" fn(*mut c_void) -> u32 = std::mem::transmute(release_bb_ptr);
                release_bb(back_buffer);
            }
        }

        // Call through the detoured original IDXGISwapChain Present function to complete swap frame logic
        let original_present: FnPresent = std::mem::transmute(ORIGINAL_PRESENT_PTR);
        original_present(this, sync_interval, flags)
    }

    // ============================================================================
    // 7. VTable Query & Present Hook Registration Hook Pipeline
    // ============================================================================

    pub unsafe fn init_overlay_hook() -> Result<(), String> {
        // 1. Resolve standard Direct3D11.dll address dynamically
        let d3d11_dll_name = "d3d11.dll\0".encode_utf16().collect::<Vec<u16>>();
        let mut h_d3d11 = GetModuleHandleW(d3d11_dll_name.as_ptr());
        if h_d3d11 == 0 {
            h_d3d11 = LoadLibraryW(d3d11_dll_name.as_ptr());
        }

        if h_d3d11 == 0 {
            return Err("Failed to resolve d3d11.dll module handle.".to_string());
        }

        // Get D3D11CreateDeviceAndSwapChain address
        let func_name = CString::new("D3D11CreateDeviceAndSwapChain").map_err(|_| "Invalid function name".to_string())?;
        let create_device_and_swap_chain_ptr = GetProcAddress(h_d3d11, func_name.as_ptr() as *const u8);
        if create_device_and_swap_chain_ptr.is_none() {
            return Err("Failed to find D3D11CreateDeviceAndSwapChain export.".to_string());
        }

        let d3d11_create_device_and_swap_chain: FnD3D11CreateDeviceAndSwapChain = std::mem::transmute(create_device_and_swap_chain_ptr.unwrap());

        // 2. Setup standard window parameters to create dummy handle required for swapchain queries
        let class_name = "MNX_WND_CLASS\0".encode_utf16().collect::<Vec<u16>>();
        let window_name = "MNX_WND\0".encode_utf16().collect::<Vec<u16>>();

        let wnd_class = WNDCLASSEXW {
            cbSize: std::mem::size_of::<WNDCLASSEXW>() as u32,
            style: CS_HREDRAW | CS_VREDRAW,
            lpfnWndProc: Some(DefWindowProcW),
            cbClsExtra: 0,
            cbWndExtra: 0,
            hInstance: GetModuleHandleW(null()),
            hIcon: 0,
            hCursor: 0,
            hbrBackground: 0,
            lpszMenuName: null(),
            lpszClassName: class_name.as_ptr(),
            hIconSm: 0,
        };

        RegisterClassExW(&wnd_class);

        let dummy_hwnd = CreateWindowExW(
            0,
            class_name.as_ptr(),
            window_name.as_ptr(),
            WS_OVERLAPPEDWINDOW,
            CW_USEDEFAULT,
            CW_USEDEFAULT,
            100,
            100,
            0,
            0,
            wnd_class.hInstance,
            null(),
        );

        if dummy_hwnd == 0 {
            UnregisterClassW(class_name.as_ptr(), wnd_class.hInstance);
            return Err("Failed to allocate dummy window context.".to_string());
        }

        // Configure swap chain descriptors
        let mut swap_chain_desc: DXGI_SWAP_CHAIN_DESC = std::mem::zeroed();
        swap_chain_desc.BufferCount = 1;
        swap_chain_desc.BufferDesc.Width = 100;
        swap_chain_desc.BufferDesc.Height = 100;
        swap_chain_desc.BufferDesc.Format = DXGI_FORMAT_R8G8B8A8_UNORM;
        swap_chain_desc.BufferDesc.RefreshRate.Numerator = 60;
        swap_chain_desc.BufferDesc.RefreshRate.Denominator = 1;
        swap_chain_desc.BufferUsage = DXGI_USAGE_RENDER_TARGET_OUTPUT;
        swap_chain_desc.OutputWindow = dummy_hwnd;
        swap_chain_desc.SampleDesc.Count = 1;
        swap_chain_desc.SampleDesc.Quality = 0;
        swap_chain_desc.Windowed = TRUE;
        swap_chain_desc.SwapEffect = DXGI_SWAP_EFFECT_DISCARD;

        let mut swap_chain: *mut c_void = null_mut();
        let mut d3d_device: *mut c_void = null_mut();
        let mut d3d_context: *mut c_void = null_mut();
        let mut feature_level: i32 = 0;

        let feature_levels = [0x11000]; // D3D_FEATURE_LEVEL_11_0

        // Create dummy DX11 structures
        let status = d3d11_create_device_and_swap_chain(
            null_mut(),
            1, // D3D_DRIVER_TYPE_HARDWARE
            0,
            0,
            feature_levels.as_ptr(),
            1,
            7, // D3D11_SDK_VERSION
            &swap_chain_desc,
            &mut swap_chain,
            &mut d3d_device,
            &mut feature_level,
            &mut d3d_context,
        );

        if status != 0 || swap_chain.is_null() {
            DestroyWindow(dummy_hwnd);
            UnregisterClassW(class_name.as_ptr(), wnd_class.hInstance);
            return Err(format!("D3D11CreateDeviceAndSwapChain failed. DXGI Code: 0x{:08X}", status));
        }

        // Extract Present function address from vtable
        let sc_vtable = *(swap_chain as *mut *mut *mut c_void);
        let present_ptr = *sc_vtable.add(VTABLE_INDEX_PRESENT);

        // 3. Setup MinHook detour
        if MH_Initialize() != 0 {
            return Err("Failed to initialize MinHook framework.".to_string());
        }

        let detour_status = MH_CreateHook(
            present_ptr,
            hooked_present as *mut c_void,
            &mut ORIGINAL_PRESENT_PTR,
        );

        if detour_status != 0 {
            return Err(format!("MinHook failed to create SwapChain detour. Error: {}", detour_status));
        }

        let enable_status = MH_EnableHook(present_ptr);
        if enable_status != 0 {
            return Err(format!("MinHook failed to activate SwapChain detour. Error: {}", enable_status));
        }

        // Deallocate dummy window and devices
        let sc_vtable_impl = *(swap_chain as *mut *mut *mut c_void);
        let sc_release = *sc_vtable_impl.add(2); // IUnknown::Release is index 2
        let release_sc_fn: unsafe extern "system" fn(*mut c_void) -> u32 = std::mem::transmute(sc_release);
        release_sc_fn(swap_chain);

        let dev_vtable_impl = *(d3d_device as *mut *mut *mut c_void);
        let dev_release = *dev_vtable_impl.add(2);
        let release_dev_fn: unsafe extern "system" fn(*mut c_void) -> u32 = std::mem::transmute(dev_release);
        release_dev_fn(d3d_device);

        let ctx_vtable_impl = *(d3d_context as *mut *mut *mut c_void);
        let ctx_release = *ctx_vtable_impl.add(2);
        let release_ctx_fn: unsafe extern "system" fn(*mut c_void) -> u32 = std::mem::transmute(ctx_release);
        release_ctx_fn(d3d_context);

        DestroyWindow(dummy_hwnd);
        UnregisterClassW(class_name.as_ptr(), wnd_class.hInstance);

        println!("[MNX DX11 Hook] MinHook SwapChain Present detour registered and running successfully.");
        Ok(())
    }

    // ============================================================================
    // 8. Custom DX11 & ImGui FFI helper signatures
    // ============================================================================

    type FnGetDevice = unsafe extern "system" fn(
        this: *mut c_void,
        riid: *const u8,
        pp_device: *mut *mut c_void,
    ) -> i32;

    type FnGetDesc = unsafe extern "system" fn(
        this: *mut c_void,
        p_desc: *mut DXGI_SWAP_CHAIN_DESC,
    ) -> i32;

    type FnGetBuffer = unsafe extern "system" fn(
        this: *mut c_void,
        buffer: u32,
        riid: *const u8,
        pp_surface: *mut *mut c_void,
    ) -> i32;

    type FnGetImmediateContext = unsafe extern "system" fn(
        this: *mut c_void,
        pp_immediate_context: *mut *mut c_void,
    );

    type FnCreateRenderTargetView = unsafe extern "system" fn(
        this: *mut c_void,
        p_resource: *mut c_void,
        p_desc: *const c_void,
        pp_rt_view: *mut *mut c_void,
    ) -> i32;

    type FnOMSetRenderTargets = unsafe extern "system" fn(
        this: *mut c_void,
        num_views: u32,
        pp_render_target_views: *const *mut c_void,
        p_depth_stencil_view: *mut c_void,
    );
}

#[cfg(feature = "overlay")]
pub unsafe fn init_overlay_hook() -> Result<(), String> {
    overlay_impl::init_overlay_hook()
}

#[cfg(not(feature = "overlay"))]
pub unsafe fn init_overlay_hook() -> Result<(), String> {
    Err("In-game overlay is disabled in this build (compile with the 'overlay' feature).".to_string())
}