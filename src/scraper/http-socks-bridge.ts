// HTTP-to-SOCKS5 bridge — chisel'ning SOCKS5 proxy-DNS muammosini hal qiladi.
// Chromium --proxy-server=http://127.0.0.1:PORT bilan ishlatiladi.
// Bridge har bir CONNECT request uchun:
//   1. Hostname'ni mahalliy DNS orqali IP'ga aylantiradi
//   2. SOCKS5 ulanish qiladi (chisel 127.0.0.1:1080 ga)
//   3. CONNECT komandasi ichida IP yuboradi (proxy-DNS o'rniga)
//   4. Trafikni ikki yo'nalishda uzatadi
import { createServer } from 'node:http';
import { Socket, connect as netConnect } from 'node:net';
import { lookup } from 'node:dns/promises';

import { childLogger } from '../common/logger.js';

const log = childLogger('http-socks-bridge');

interface BridgeOptions {
  listenPort: number;
  socksHost: string;
  socksPort: number;
}

/** SOCKS5 CONNECT request to IP:port. Returns connected socket. */
function socks5Connect(socksHost: string, socksPort: number, targetIp: string, targetPort: number): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const socket = netConnect({ host: socksHost, port: socksPort });
    let stage = 0;

    const cleanup = (err: Error): void => {
      socket.destroy();
      reject(err);
    };

    socket.once('error', cleanup);
    socket.on('data', (data) => {
      if (stage === 0) {
        // Auth response: [0x05, 0x00] (no auth)
        if (data.length < 2 || data[0] !== 0x05) {
          cleanup(new Error(`SOCKS handshake xato: ${data.toString('hex')}`));
          return;
        }
        stage = 1;
        // CONNECT request: VER=5 CMD=1 RSV=0 ATYP=1(IPv4) DST=ip(4) PORT=port(2)
        const parts = targetIp.split('.').map(Number);
        if (parts.length !== 4 || parts.some((p) => isNaN(p) || p < 0 || p > 255)) {
          cleanup(new Error(`Yaroqsiz IP: ${targetIp}`));
          return;
        }
        const buf = Buffer.from([
          0x05, 0x01, 0x00, 0x01,
          parts[0], parts[1], parts[2], parts[3],
          (targetPort >> 8) & 0xff, targetPort & 0xff,
        ]);
        socket.write(buf);
      } else if (stage === 1) {
        // Connect response: [VER, REP, RSV, ATYP, ...]
        if (data.length < 2 || data[0] !== 0x05 || data[1] !== 0x00) {
          cleanup(new Error(`SOCKS CONNECT xato: REP=${data[1]}`));
          return;
        }
        stage = 2;
        // Tayyor — listenerlarni o'chiramiz, sof socket qaytaramiz
        socket.removeListener('error', cleanup);
        socket.removeAllListeners('data');
        resolve(socket);
      }
    });

    socket.once('connect', () => {
      // Greeting: VER=5 NMETHODS=1 METHODS=0 (no auth)
      socket.write(Buffer.from([0x05, 0x01, 0x00]));
    });
  });
}

export function startHttpSocksBridge(opts: BridgeOptions): { stop: () => void } {
  const server = createServer((_req, res) => {
    res.writeHead(400, { 'Content-Type': 'text/plain' });
    res.end('Faqat HTTPS CONNECT method qo\'llanadi');
  });

  server.on('connect', async (...args: unknown[]) => {
    const req = args[0] as { url?: string };
    const clientSocket = args[1] as Socket;
    const head = args[2] as Buffer;
    const target = req.url ?? '';
    const [host, portStr] = target.split(':');
    const port = parseInt(portStr, 10);
    if (!host || !port) {
      clientSocket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
      return;
    }

    try {
      // Mahalliy DNS resolution
      const { address: ip } = await lookup(host);
      // SOCKS5 orqali IP ga ulanamiz
      const remote = await socks5Connect(opts.socksHost, opts.socksPort, ip, port);

      // Chromium'ga "200 Connection Established" javob beramiz
      clientSocket.write('HTTP/1.1 200 Connection Established\r\nProxy-Agent: royaltaxi-bridge\r\n\r\n');

      // Pipe
      if (head && head.length > 0) remote.write(head);
      clientSocket.pipe(remote).pipe(clientSocket);

      // Error handling — bittasini yopgan zahoti ikkinchisi ham yopiladi
      const closeBoth = (): void => {
        try { clientSocket.end(); } catch { /* ignore */ }
        try { remote.end(); } catch { /* ignore */ }
      };
      clientSocket.once('error', closeBoth);
      clientSocket.once('end', closeBoth);
      remote.once('error', closeBoth);
      remote.once('end', closeBoth);
    } catch (err) {
      log.warn({ host, err: (err as Error).message }, 'CONNECT xato');
      try {
        clientSocket.end('HTTP/1.1 502 Bad Gateway\r\n\r\n');
      } catch { /* ignore */ }
    }
  });

  server.listen(opts.listenPort, '127.0.0.1', () => {
    log.info(
      { listen: `127.0.0.1:${opts.listenPort}`, socks: `${opts.socksHost}:${opts.socksPort}` },
      '🔌 HTTP-to-SOCKS5 bridge ishga tushdi',
    );
  });

  return {
    stop: () => {
      try { server.close(); } catch { /* ignore */ }
    },
  };
}
