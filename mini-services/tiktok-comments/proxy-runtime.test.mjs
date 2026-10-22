import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { once } from "node:events";
import { Server } from "proxy-chain";

test("the browser proxy forwards HTTP CONNECT and binary data under Node.js", { timeout: 5000 }, async (t) => {
  const sockets = new Set();
  const upstream = http.createServer();
  upstream.on("connect", (request, socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
    socket.write("HTTP/1.1 200 Connection Established\r\n\r\n");
    socket.on("data", (data) => socket.write(data));
  });
  await new Promise((resolve) => upstream.listen(0, "127.0.0.1", resolve));
  const bridge = new Server({
    host: "127.0.0.1", port: 0,
    prepareRequestFunction: () => ({ upstreamProxyUrl: `http://127.0.0.1:${upstream.address().port}` }),
  });
  t.after(async () => {
    await bridge.close(true);
    for (const socket of sockets) socket.destroy();
    await new Promise((resolve) => upstream.close(resolve));
  });
  await bridge.listen();
  const request = http.request({ hostname: "127.0.0.1", port: bridge.port, method: "CONNECT", path: "example.invalid:443" });
  const connected = once(request, "connect");
  request.end();
  const [response, tunnel] = await connected;
  t.after(() => tunnel.destroy());
  assert.equal(response.statusCode, 200);
  const data = once(tunnel, "data");
  const payload = Buffer.from([0, 255, 1, 42, 128]);
  tunnel.write(payload);
  assert.deepEqual((await data)[0], payload);
});
