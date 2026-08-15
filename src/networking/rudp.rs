use std::collections::{HashMap, VecDeque};
use std::sync::{Arc, Mutex, atomic::{AtomicBool, AtomicU16, AtomicU64, Ordering}};
use std::thread;
use std::time::{Duration, Instant};

use windows_sys::Win32::Foundation::{CloseHandle, GetLastError};
use windows_sys::Win32::Networking::WinSock::{
    WSAStartup, WSACleanup, WSADATA, socket, bind, sendto, recvfrom, closesocket,
    AF_INET, SOCK_DGRAM, IPPROTO_UDP, SOCKADDR, SOCKADDR_IN, ioctlsocket, FIONBIO,
};

// ============================================================================
// Constants and Definitions
// ============================================================================

const INVALID_SOCKET: usize = !0;
const SOCKET_ERROR: i32 = -1;

const FLAG_UNRELIABLE: u8 = 0x01;
const FLAG_RELIABLE: u8 = 0x02;
const FLAG_ACK: u8 = 0x03;

const RETRANSMIT_INTERVAL_MS: u64 = 200;
const MAX_RETRANSMIT_ATTEMPTS: u32 = 8;
const MAX_PACKET_SIZE: usize = 1400; // Keep under MTU

// ============================================================================
// Network Packets & Structures
// ============================================================================

#[derive(Clone, Debug)]
pub struct PendingPacket {
    pub seq: u16,
    pub dest_ip: String,
    pub dest_port: u16,
    pub payload: Vec<u8>,
    pub last_sent: Instant,
    pub retransmit_count: u32,
}

#[derive(Clone, Debug)]
pub struct ReceivedPacket {
    pub src_ip: String,
    pub src_port: u16,
    pub payload: Vec<u8>,
}

// ============================================================================
// Helper Utilities
// ============================================================================

/// Safely parses an IPv4 string into network-byte-order representation.
fn ipv4_to_u32(ip: &str) -> Option<u32> {
    let parts: Vec<&str> = ip.split('.').collect();
    if parts.len() != 4 {
        return None;
    }
    let mut ip_bytes = [0u8; 4];
    for i in 0..4 {
        ip_bytes[i] = parts[i].parse::<u8>().ok()?;
    }
    // Network-byte-order (Big Endian) u32 representation
    Some(u32::from_be_bytes(ip_bytes))
}

/// Converts a network-byte-order IP integer into standard IPv4 dot-decimal format.
fn u32_to_ipv4(ip_val: u32) -> String {
    let bytes = ip_val.to_be_bytes();
    format!("{}.{}.{}.{}", bytes[0], bytes[1], bytes[2], bytes[3])
}

// ============================================================================
// Core RUDP Socket Engine
// ============================================================================

pub struct RudpSocketEngine {
    socket: usize,
    next_seq: Arc<AtomicU16>,
    is_running: Arc<AtomicBool>,
    retransmit_queue: Arc<Mutex<HashMap<u16, PendingPacket>>>,
    receive_queue: Arc<Mutex<VecDeque<ReceivedPacket>>>,
    rx_thread_handle: Option<thread::JoinHandle<()>>,
    tx_thread_handle: Option<thread::JoinHandle<()>>,
    packets_sent: Arc<AtomicU64>,
    packets_received: Arc<AtomicU64>,
    bytes_sent: Arc<AtomicU64>,
    bytes_received: Arc<AtomicU64>,
}

unsafe impl Send for RudpSocketEngine {}
unsafe impl Sync for RudpSocketEngine {}

impl RudpSocketEngine {
    /// Returns the live traffic counters.
    pub fn get_stats(&self) -> (u64, u64, u64, u64) {
        (
            self.packets_sent.load(Ordering::Relaxed),
            self.packets_received.load(Ordering::Relaxed),
            self.bytes_sent.load(Ordering::Relaxed),
            self.bytes_received.load(Ordering::Relaxed),
        )
    }

    /// Creates and configures a raw Winsock non-blocking UDP socket.
    pub fn new(bind_port: u16) -> Result<Self, String> {
        unsafe {
            // 1. Initialize Winsock DLL v2.2
            let mut wsa_data: WSADATA = std::mem::zeroed();
            let wsa_status = WSAStartup(0x0202, &mut wsa_data);
            if wsa_status != 0 {
                return Err(format!("Winsock WSAStartup failed. Error: {}", wsa_status));
            }

            // 2. Create raw Datagram socket
            let raw_sock = socket(AF_INET as i32, SOCK_DGRAM as i32, IPPROTO_UDP);
            if raw_sock == INVALID_SOCKET {
                let err = GetLastError();
                WSACleanup();
                return Err(format!("Raw Winsock socket allocation failed. Win32 Error: {}", err));
            }

            // 3. Set non-blocking socket flag
            let mut mode: u32 = 1;
            let ioctl_res = ioctlsocket(raw_sock, FIONBIO, &mut mode);
            if ioctl_res == SOCKET_ERROR {
                let err = GetLastError();
                closesocket(raw_sock);
                WSACleanup();
                return Err(format!("ioctlsocket(FIONBIO) failed. Win32 Error: {}", err));
            }

            // 4. Bind socket to designated port
            let mut bind_addr: SOCKADDR_IN = std::mem::zeroed();
            bind_addr.sin_family = AF_INET as u16;
            bind_addr.sin_port = bind_port.to_be();
            bind_addr.sin_addr.S_un.S_addr = 0; // INADDR_ANY (Bind to all interfaces)

            let bind_res = bind(
                raw_sock,
                &bind_addr as *const SOCKADDR_IN as *const SOCKADDR,
                std::mem::size_of::<SOCKADDR_IN>() as i32,
            );

            if bind_res == SOCKET_ERROR {
                let err = GetLastError();
                closesocket(raw_sock);
                WSACleanup();
                return Err(format!("Winsock bind to port {} failed. Win32 Error: {}", bind_port, err));
            }

            let is_running = Arc::new(AtomicBool::new(true));
            let next_seq = Arc::new(AtomicU16::new(1));
            let retransmit_queue = Arc::new(Mutex::new(HashMap::new()));
            let receive_queue = Arc::new(Mutex::new(VecDeque::new()));

            let packets_sent = Arc::new(AtomicU64::new(0));
            let packets_received = Arc::new(AtomicU64::new(0));
            let bytes_sent = Arc::new(AtomicU64::new(0));
            let bytes_received = Arc::new(AtomicU64::new(0));

            // Clone smart pointers for asynchronous thread tasks
            let is_running_rx = is_running.clone();
            let is_running_tx = is_running.clone();
            let retransmit_queue_rx = retransmit_queue.clone();
            let retransmit_queue_tx = retransmit_queue.clone();
            let receive_queue_rx = receive_queue.clone();
            let packets_received_rx = packets_received.clone();
            let bytes_received_rx = bytes_received.clone();

            // 5. Spawn Non-blocking Receiver Thread (Asynchronous packet processor & ACK generator)
            let rx_thread_handle = thread::spawn(move || {
                let mut buffer = [0u8; MAX_PACKET_SIZE];
                while is_running_rx.load(Ordering::Relaxed) {
                    let mut from_addr: SOCKADDR_IN = unsafe { std::mem::zeroed() };
                    let mut from_len = std::mem::size_of::<SOCKADDR_IN>() as i32;

                    let bytes_received = unsafe {
                        recvfrom(
                            raw_sock,
                            buffer.as_mut_ptr(),
                            MAX_PACKET_SIZE as i32,
                            0,
                            &mut from_addr as *mut SOCKADDR_IN as *mut SOCKADDR,
                            &mut from_len,
                        )
                    };

                    if bytes_received > 0 {
                        // Update live traffic counters
                        packets_received_rx.fetch_add(1, Ordering::Relaxed);
                        bytes_received_rx.fetch_add(bytes_received as u64, Ordering::Relaxed);

                        // Extract IP/Port source parameters
                        let src_ip_val = unsafe { from_addr.sin_addr.S_un.S_addr };
                        let src_ip = u32_to_ipv4(src_ip_val);
                        let src_port = u16::from_be(from_addr.sin_port);

                        let raw_packet = &buffer[..bytes_received as usize];
                        if raw_packet.len() >= 3 {
                            let flag = raw_packet[0];
                            let seq = u16::from_be_bytes([raw_packet[1], raw_packet[2]]);
                            let payload = raw_packet[3..].to_vec();

                            match flag {
                                FLAG_UNRELIABLE => {
                                    // Queue packet directly for game consumption
                                    if let Ok(mut q) = receive_queue_rx.lock() {
                                        q.push_back(ReceivedPacket {
                                            src_ip,
                                            src_port,
                                            payload,
                                        });
                                    }
                                }
                                FLAG_RELIABLE => {
                                    // 1. Immediately send ACK packet back to source
                                    let ack_packet = [FLAG_ACK, raw_packet[1], raw_packet[2]];
                                    unsafe {
                                        sendto(
                                            raw_sock,
                                            ack_packet.as_ptr(),
                                            3,
                                            0,
                                            &from_addr as *const SOCKADDR_IN as *const SOCKADDR,
                                            std::mem::size_of::<SOCKADDR_IN>() as i32,
                                        );
                                    }

                                    // 2. Queue payload for client rendering loop
                                    if let Ok(mut q) = receive_queue_rx.lock() {
                                        q.push_back(ReceivedPacket {
                                            src_ip,
                                            src_port,
                                            payload,
                                        });
                                    }
                                }
                                FLAG_ACK => {
                                    // Retransmission complete: Evict corresponding packet from queue
                                    if let Ok(mut q) = retransmit_queue_rx.lock() {
                                        q.remove(&seq);
                                    }
                                }
                                _ => {}
                            }
                        }
                    } else {
                        // Non-blocking yield to prevent CPU thrashing
                        thread::sleep(Duration::from_millis(1));
                    }
                }
            });

            // 6. Spawn Retransmission Task Scheduler Thread
            let tx_thread_handle = thread::spawn(move || {
                while is_running_tx.load(Ordering::Relaxed) {
                    thread::sleep(Duration::from_millis(25)); // High frequency retransmit ticks

                    let mut packets_to_retransmit = Vec::new();
                    let now = Instant::now();

                    // Lock and evaluate all unacknowledged packets
                    if let Ok(mut q) = retransmit_queue_tx.lock() {
                        for (_, packet) in q.iter_mut() {
                            if now.duration_since(packet.last_sent).as_millis() >= RETRANSMIT_INTERVAL_MS as u128 {
                                if packet.retransmit_count < MAX_RETRANSMIT_ATTEMPTS {
                                    packet.retransmit_count += 1;
                                    packet.last_sent = now;
                                    packets_to_retransmit.push(packet.clone());
                                }
                            }
                        }

                        // Prune dead connection drops from state to prevent memory leaks
                        q.retain(|_, packet| packet.retransmit_count < MAX_RETRANSMIT_ATTEMPTS);
                    }

                    // Perform retransmission outside the locked segment to maximize throughput
                    for packet in packets_to_retransmit {
                        if let Some(dest_ip_val) = ipv4_to_u32(&packet.dest_ip) {
                            let mut dest_addr: SOCKADDR_IN = unsafe { std::mem::zeroed() };
                            dest_addr.sin_family = AF_INET as u16;
                            dest_addr.sin_port = packet.dest_port.to_be();
                            unsafe {
                                dest_addr.sin_addr.S_un.S_addr = dest_ip_val;
                            }

                            // Construct original RUDP packet payload
                            let mut frame = Vec::with_capacity(3 + packet.payload.len());
                            frame.push(FLAG_RELIABLE);
                            frame.extend_from_slice(&packet.seq.to_be_bytes());
                            frame.extend_from_slice(&packet.payload);

                            unsafe {
                                sendto(
                                    raw_sock,
                                    frame.as_ptr(),
                                    frame.len() as i32,
                                    0,
                                    &dest_addr as *const SOCKADDR_IN as *const SOCKADDR,
                                    std::mem::size_of::<SOCKADDR_IN>() as i32,
                                );
                            }
                        }
                    }
                }
            });

            println!(
                "[MNX RUDP Engine] Socket initialized successfully on port {}.",
                bind_port
            );

            Ok(RudpSocketEngine {
                socket: raw_sock,
                next_seq,
                is_running,
                retransmit_queue,
                receive_queue,
                rx_thread_handle: Some(rx_thread_handle),
                tx_thread_handle: Some(tx_thread_handle),
                packets_sent,
                packets_received,
                bytes_sent,
                bytes_received,
            })
        }
    }

    /// Safely writes dynamic data packets to the network.
    pub fn send_packet(
        &self,
        dest_ip: &str,
        dest_port: u16,
        payload: &[u8],
        reliable: bool,
    ) -> Result<(), String> {
        let dest_ip_val = ipv4_to_u32(dest_ip)
            .ok_or_else(|| format!("Invalid target IPv4 string: {}", dest_ip))?;

        let mut dest_addr: SOCKADDR_IN = unsafe { std::mem::zeroed() };
        dest_addr.sin_family = AF_INET as u16;
        dest_addr.sin_port = dest_port.to_be();
        unsafe {
            dest_addr.sin_addr.S_un.S_addr = dest_ip_val;
        }

        let seq = self.next_seq.fetch_add(1, Ordering::SeqCst);
        let mut frame = Vec::with_capacity(3 + payload.len());

        if reliable {
            frame.push(FLAG_RELIABLE);
        } else {
            frame.push(FLAG_UNRELIABLE);
        }
        frame.extend_from_slice(&seq.to_be_bytes());
        frame.extend_from_slice(payload);

        // Write to socket mapping
        let send_res = unsafe {
            sendto(
                self.socket,
                frame.as_ptr(),
                frame.len() as i32,
                0,
                &dest_addr as *const SOCKADDR_IN as *const SOCKADDR,
                std::mem::size_of::<SOCKADDR_IN>() as i32,
            )
        };

        if send_res == SOCKET_ERROR {
            let err = unsafe { GetLastError() };
            return Err(format!("sendto failed. Win32 Error: {}", err));
        }

        // If reliable, queue for background verification track
        if reliable {
            if let Ok(mut q) = self.retransmit_queue.lock() {
                q.insert(
                    seq,
                    PendingPacket {
                        seq,
                        dest_ip: dest_ip.to_string(),
                        dest_port,
                        payload: payload.to_vec(),
                        last_sent: Instant::now(),
                        retransmit_count: 0,
                    },
                );
            }
        }

        // Update counters and flush live stats to shared memory
        self.packets_sent.fetch_add(1, Ordering::Relaxed);
        self.bytes_sent.fetch_add(frame.len() as u64, Ordering::Relaxed);
        crate::flush_stats_to_shm();

        Ok(())
    }

    /// Read any incoming verified packet.
    pub fn read_packet(&self) -> Option<ReceivedPacket> {
        if let Ok(mut q) = self.receive_queue.lock() {
            q.pop_front()
        } else {
            None
        }
    }

    /// Check if packets are buffered in the read queue.
    pub fn is_packet_available(&self) -> Option<u32> {
        if let Ok(q) = self.receive_queue.lock() {
            q.front().map(|packet| packet.payload.len() as u32)
        } else {
            None
        }
    }

    /// Safely cleans up the socket allocation, terminating worker threads and closing handles.
    pub fn shutdown(&mut self) {
        self.is_running.store(false, Ordering::Relaxed);

        unsafe {
            closesocket(self.socket);
            WSACleanup();
        }

        if let Some(h) = self.rx_thread_handle.take() {
            let _ = h.join();
        }
        if let Some(h) = self.tx_thread_handle.take() {
            let _ = h.join();
        }

        println!("[MNX RUDP Engine] Socket resources deallocated.");
    }
}

impl Drop for RudpSocketEngine {
    fn drop(&mut self) {
        self.shutdown();
    }
}

// ============================================================================
// 7. Global Socket Accessor Interface for the DLL Loader
// ============================================================================

static GLOBAL_ENGINE: Mutex<Option<RudpSocketEngine>> = Mutex::new(None);

pub fn init_global_socket(bind_port: u16) -> Result<(), String> {
    let mut guard = GLOBAL_ENGINE.lock().map_err(|_| "Failed to lock engine mutex".to_string())?;
    if guard.is_none() {
        let engine = RudpSocketEngine::new(bind_port)?;
        *guard = Some(engine);
    }
    Ok(())
}

pub fn shutdown_global_socket() {
    if let Ok(mut guard) = GLOBAL_ENGINE.lock() {
        if let Some(mut engine) = guard.take() {
            engine.shutdown();
        }
    }
}

pub fn global_send_packet(
    dest_ip: &str,
    dest_port: u16,
    payload: &[u8],
    reliable: bool,
) -> Result<(), String> {
    let guard = GLOBAL_ENGINE.lock().map_err(|_| "Failed to lock engine mutex".to_string())?;
    if let Some(ref engine) = *guard {
        engine.send_packet(dest_ip, dest_port, payload, reliable)
    } else {
        Err("Global RUDP Engine is not initialized.".to_string())
    }
}

pub fn global_read_packet() -> Option<ReceivedPacket> {
    if let Ok(guard) = GLOBAL_ENGINE.lock() {
        if let Some(ref engine) = *guard {
            return engine.read_packet();
        }
    }
    None
}

pub fn global_is_packet_available() -> Option<u32> {
    if let Ok(guard) = GLOBAL_ENGINE.lock() {
        if let Some(ref engine) = *guard {
            return engine.is_packet_available();
        }
    }
    None
}

/// Returns the live RUDP traffic counters (packets_sent, packets_received,
/// bytes_sent, bytes_received) from the global engine.
pub fn global_get_stats() -> (u64, u64, u64, u64) {
    if let Ok(guard) = GLOBAL_ENGINE.lock() {
        if let Some(ref engine) = *guard {
            return engine.get_stats();
        }
    }
    (0, 0, 0, 0)
}
