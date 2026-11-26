import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { createWhiteboardMcpServer, WHITEBOARD_URL } from '../src/mcp/server.js';

const MAX_BYTES = 8192;
const securityHeaders = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
const ORIGIN = new URL(WHITEBOARD_URL).origin;

class OversizeBody extends Error {}

async function readJson(request) {
  const stream = request.body?.getReader();
  if (!stream) throw new SyntaxError();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let length = 0;
  let payload = '';
  try {
    for (;;) {
      const {value, done} = await stream.read();
      if (done) break;
      length += value.byteLength;
      if (length > MAX_BYTES) {
        void stream.cancel().catch(() => {});
        throw new OversizeBody();
      }
      payload += decoder.decode(value, {stream: true});
    }
    return JSON.parse(payload + decoder.decode());
  } finally {
    stream.releaseLock();
  }
}

const error = (status, code, message) => Response.json(
  {jsonrpc: '2.0', id: null, error: {code, message}}, {status, headers: securityHeaders},
);

export async function handleWhiteboardMcp(request) {
  const origin = request.headers.get('origin');
  if (origin !== null && origin !== ORIGIN) return error(403, -32000, 'Origin not allowed.');
  if (request.method !== 'POST') return new Response(null, {
    status: 405, headers: {...securityHeaders, Allow: 'POST'},
  });
  if (request.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase() !== 'application/json') {
    return error(415, -32600, 'Expected application/json.');
  }
  if (Number(request.headers.get('content-length')) > MAX_BYTES) return error(413, -32600, 'Request too large.');
  let body;
  try { body = await readJson(request); }
  catch (cause) {
    return cause instanceof OversizeBody ? error(413, -32600, 'Request too large.') : error(400, -32700, 'Invalid JSON.');
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return error(400, -32600, 'One JSON-RPC message is required.');

  const server = createWhiteboardMcpServer();
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  try {
    await server.connect(transport);
    const response = await transport.handleRequest(request, { parsedBody: body });
    const headers = new Headers(response.headers);
    for (const [key, value] of Object.entries(securityHeaders)) headers.set(key, value);
    return new Response(response.body, {status: response.status, headers});
  } finally {
    await server.close();
  }
}

export default { fetch: handleWhiteboardMcp };
