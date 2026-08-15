import dgram from 'dgram';
import { createHash } from 'crypto';
import path from 'path';
import { promises as fs } from 'fs';
import { createReadStream } from 'fs';
import { PeerInfo, LogLevel } from '../../shared/types';

export const DISCOVERY_PORT = 47777;

type LogFn = (message: string, level?: LogLevel) => void;
type PeerCallback = (peer: PeerInfo) => void;

interface DiscoveredPeer {
  ip: string;
  version: string | null;
  ping?: number;
  lastSeen: number;
}

interface LanMessage {
  t: 'announce' | 'ping' | 'pong';
  name?: string;
  version?: string | null;
  playerName?: string;
  seq?: number;
  ts?: number;
}

const PING_INTERVAL_MS = 2500;
const ANNOUNCE_INTERVAL_MS = 3000;
const PEER_TIMEOUT_MS = 8000;

/**
 * GHOST PROTOCOL — Real LAN Discovery + Live Ping over raw UDP.
 */
export class LanService {
  private socket: dgram.Socket | null = null;
  private announceTimer: ReturnType<typeof setInterval> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private pruneTimer: ReturnType<typeof setInterval> | null = null;

  private peers = new Map<string, DiscoveredPeer>();
  private pendingPings = new Map<number, number>(); // seq -> sent ts
  private seqCounter = 0;

  private gameName = '';
  private gameVersion: string | null = null;
  private playerName = '';
  private myIP = '';

  public packetsSent = 0;
  public packetsReceived = 0;
  public bytesSent = 0;
  public bytesReceived = 0;

  private log: LogFn;
  private onPeerDiscovered: PeerCallback;
  private onPeerUpdated: PeerCallback;

  constructor(log: LogFn, onPeerDiscovered: PeerCallback, onPeerUpdated: PeerCallback) {
    this.log = log;
    this.onPeerDiscovered = onPeerDiscovered;
    this.onPeerUpdated = onPeerUpdated;
  }

  get isRunning(): boolean {
    return !!this.socket;
  }

  private async computeGameVersion(gamePath: string): Promise<string | null> {
    try {
      const entries = await fs.readdir(gamePath);
      const exe = entries.find((f) => f.toLowerCase().endsWith('.exe'));
      if (!exe) return null;
      const hash = createHash('md5');
      await new Promise<void>((resolve, reject) => {
        const stream = createReadStream(path.join(gamePath, exe));
        stream.on('data', (chunk) => hash.update(chunk));
        stream.on('end', () => resolve());
        stream.on('error', reject);
      });
      return hash.digest('hex').slice(0, 8);
    } catch {
      return null;
    }
  }

  private getLocalIP(): string {
    try {
      const os = require('os');
      const nets = os.networkInterfaces();
      for (const name of Object.keys(nets)) {
        for (const net of nets[name] ?? []) {
          if (net.family === 'IPv4' && !net.internal) return net.address;
        }
      }
    } catch { /* ignore */ }
    return '127.0.0.1';
  }

  private handleMessage(msg: Buffer, rinfo: dgram.RemoteInfo): void {
    this.packetsReceived++;
    this.bytesReceived += msg.length;

    let parsed: LanMessage | null = null;
    try {
      parsed = JSON.parse(msg.toString('utf-8'));
    } catch {
      return;
    }
    if (!parsed || !parsed.t) return;

    const fromIP = rinfo.address;

    if (parsed.t === 'announce') {
      const existing = this.peers.get(fromIP);
      this.peers.set(fromIP, {
        ip: fromIP,
        version: parsed.version ?? null,
        lastSeen: Date.now(),
      });

      if (existing) {
        if (existing.version !== parsed.version) {
          this.onPeerUpdated({ ip: fromIP, version: parsed.version ?? null, ping: existing.ping });
        }
      } else {
        this.log(`Peer announced: ${fromIP} (${parsed.version ?? '?'})`, 'info');
        this.onPeerDiscovered({ ip: fromIP, version: parsed.version ?? null });
      }

      // Reply so the other side learns about us too
      this.send(JSON.stringify({
        t: 'announce',
        name: this.gameName,
        version: this.gameVersion,
        playerName: this.playerName,
      }), fromIP);
    } else if (parsed.t === 'ping' && parsed.ts !== undefined) {
      // Echo back for round-trip measurement
      this.send(JSON.stringify({ t: 'pong', seq: parsed.seq, ts: parsed.ts }), fromIP);
    } else if (parsed.t === 'pong' && parsed.ts !== undefined && parsed.seq !== undefined) {
      const sentAt = this.pendingPings.get(parsed.seq);
      if (sentAt !== undefined) {
        this.pendingPings.delete(parsed.seq);
        const rtt = Date.now() - parsed.ts;
        const existing = this.peers.get(fromIP);
        if (existing) {
          existing.ping = rtt;
          existing.lastSeen = Date.now();
          this.onPeerUpdated({ ip: fromIP, version: existing.version, ping: rtt });
        }
      }
    }
  }

  private send(payload: string, targetIP: string, port: number = DISCOVERY_PORT): void {
    if (!this.socket) return;
    const buf = Buffer.from(payload, 'utf-8');
    try {
      this.socket.send(buf, port, targetIP);
      this.packetsSent++;
      this.bytesSent += buf.length;
    } catch { /* drop */ }
  }

  async start(gamePath: string, playerName: string): Promise<void> {
    this.stop();

    this.gameName = path.basename(gamePath);
    this.gameVersion = await this.computeGameVersion(gamePath);
    this.playerName = playerName;
    this.myIP = this.getLocalIP();

    const socket = dgram.createSocket('udp4');
    this.socket = socket;

    socket.on('message', (msg, rinfo) => this.handleMessage(msg, rinfo));
    socket.on('error', (err) => {
      this.log(`LAN socket error: ${err.message}`, 'error');
    });

    try {
      socket.bind(DISCOVERY_PORT);
    } catch {
      this.log(`Could not bind discovery port ${DISCOVERY_PORT}`, 'warn');
    }
    socket.setBroadcast(true);

    this.announceTimer = setInterval(() => {
      this.send(JSON.stringify({
        t: 'announce',
        name: this.gameName,
        version: this.gameVersion,
        playerName: this.playerName,
      }), '255.255.255.255');
    }, ANNOUNCE_INTERVAL_MS);

    this.pingTimer = setInterval(() => {
      for (const ip of this.peers.keys()) {
        const seq = ++this.seqCounter;
        this.pendingPings.set(seq, Date.now());
        this.send(JSON.stringify({ t: 'ping', seq, ts: Date.now() }), ip);
      }
    }, PING_INTERVAL_MS);

    this.pruneTimer = setInterval(() => {
      const now = Date.now();
      for (const [ip, peer] of this.peers) {
        if (now - peer.lastSeen > PEER_TIMEOUT_MS) {
          this.peers.delete(ip);
          this.log(`Peer timed out: ${ip}`, 'warn');
          this.onPeerUpdated({ ip, version: peer.version, ping: undefined });
        }
      }
    }, PEER_TIMEOUT_MS);

    this.send(JSON.stringify({
      t: 'announce',
      name: this.gameName,
      version: this.gameVersion,
      playerName: this.playerName,
    }), '255.255.255.255');

    this.log(`LAN discovery active (${DISCOVERY_PORT}/udp) as "${this.playerName}"`, 'success');
  }

  stop(): void {
    if (this.announceTimer) clearInterval(this.announceTimer);
    if (this.pingTimer) clearInterval(this.pingTimer);
    if (this.pruneTimer) clearInterval(this.pruneTimer);
    this.announceTimer = null;
    this.pingTimer = null;
    this.pruneTimer = null;

    if (this.socket) {
      try { this.socket.close(); } catch { /* ignore */ }
      this.socket = null;
    }
    this.peers.clear();
    this.pendingPings.clear();
  }

  getPeers(): DiscoveredPeer[] {
    return Array.from(this.peers.values());
  }

  isPeerAlive(ip: string, maxAgeMs: number = 6000): boolean {
    const peer = this.peers.get(ip);
    if (!peer) return false;
    return Date.now() - peer.lastSeen < maxAgeMs;
  }

  getPeer(ip: string): DiscoveredPeer | undefined {
    return this.peers.get(ip);
  }
}