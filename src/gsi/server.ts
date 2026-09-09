import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from 'node:http';
import type { MatchState } from '../domain/state';
import { OFFLINE } from '../domain/state';
import { parsePayload } from './parse';
import type { GsiPayload } from './types';

export const MAX_BODY_BYTES = 512 * 1024;

export type GsiServerOptions = {
  port: number;
  host: string;
  token: string;
  staleMs: number;
  onState?: (state: MatchState) => void;
  onRaw?: (payload: GsiPayload) => void;
};

export type GsiStats = {
  packets: number;
  rejected: number;
  lastAtMs: number;
};

export class GsiServer {
  /** Reassignable so the app can subscribe after the server is constructed. */
  onState: ((state: MatchState) => void) | undefined;

  private readonly options: GsiServerOptions;
  private readonly server: Server;
  private latest: MatchState = OFFLINE;
  private packets = 0;
  private rejected = 0;
  private lastAtMs = 0;

  constructor(options: GsiServerOptions) {
    this.options = options;
    this.onState = options.onState;
    this.server = createServer((request, response) => {
      this.handle(request, response).catch(() => {
        respond(response, 500, 'error');
      });
    });
  }

  get stats(): GsiStats {
    return { packets: this.packets, rejected: this.rejected, lastAtMs: this.lastAtMs };
  }

  get endpoint() {
    return `http://${this.options.host}:${this.options.port}/`;
  }

  /** The last state Dota reported, or offline once the feed goes quiet. */
  state(nowMs = Date.now()): MatchState {
    if (!this.lastAtMs || nowMs - this.lastAtMs > this.options.staleMs) {
      return OFFLINE;
    }

    return this.latest;
  }

  start() {
    return new Promise<void>((resolve, reject) => {
      const onError = (error: Error) => reject(error);
      this.server.once('error', onError);
      this.server.listen(this.options.port, this.options.host, () => {
        this.server.off('error', onError);
        resolve();
      });
    });
  }

  stop() {
    return new Promise<void>((resolve) => {
      this.server.closeAllConnections();
      this.server.close(() => resolve());
    });
  }

  private async handle(request: IncomingMessage, response: ServerResponse) {
    if (request.method !== 'POST') {
      respond(response, 200, statusLine(this.stats, this.latest));
      return;
    }

    let body: string;
    try {
      body = await readBody(request);
    } catch {
      this.rejected += 1;
      respond(response, 413, 'too large');
      return;
    }

    let payload: GsiPayload;
    try {
      payload = JSON.parse(body) as GsiPayload;
    } catch {
      this.rejected += 1;
      respond(response, 400, 'bad json');
      return;
    }

    if (this.options.token && payload.auth?.token !== this.options.token) {
      this.rejected += 1;
      respond(response, 403, 'bad token');
      return;
    }

    this.accept(payload);
    respond(response, 200, 'ok');
  }

  /** Exposed so the demo feed and tests can push payloads without a socket. */
  accept(payload: GsiPayload, nowMs = Date.now()) {
    this.packets += 1;
    this.lastAtMs = nowMs;
    this.latest = parsePayload(payload, nowMs);
    this.options.onRaw?.(payload);
    this.onState?.(this.latest);
  }
}

function readBody(request: IncomingMessage) {
  return new Promise<string>((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;

    request.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        request.destroy();
        reject(new Error('body too large'));
        return;
      }
      chunks.push(chunk);
    });
    request.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    request.on('error', reject);
  });
}

function respond(response: ServerResponse, status: number, body: string) {
  if (response.writableEnded) {
    return;
  }
  response.writeHead(status, { 'content-type': 'text/plain; charset=utf-8' });
  response.end(body);
}

function statusLine(stats: GsiStats, state: MatchState) {
  const age = stats.lastAtMs
    ? `${Math.round((Date.now() - stats.lastAtMs) / 1000)}s ago`
    : 'never';

  return [
    'busybar-mydota GSI endpoint',
    `packets: ${stats.packets} (${stats.rejected} rejected), last: ${age}`,
    `phase: ${state.phase}, match: ${state.matchId || '-'}`,
    '',
    'Dota 2 posts here. Nothing to see in a browser.',
  ].join('\n');
}

/** Node reports a port someone else already holds as EADDRINUSE on `listen`. */
export function isAddressInUse(error: unknown) {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'EADDRINUSE'
  );
}
