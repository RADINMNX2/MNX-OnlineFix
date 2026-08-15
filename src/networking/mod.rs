pub mod rudp;

pub use rudp::{
    init_global_socket,
    shutdown_global_socket,
    global_send_packet,
    global_read_packet,
    global_is_packet_available,
    ReceivedPacket,
};
