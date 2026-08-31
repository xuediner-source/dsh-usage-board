import https from "node:https";
import http from "node:http";
import net from "node:net";
import { URL } from "node:url";

export const TIMEOUT_MS = 20000;
export const BROWSER_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

export function envProxy() {
  return process.env.HTTPS_PROXY || process.env.https_proxy || process.env.HTTP_PROXY || process.env.http_proxy || "";
}

function portOpen(port) {
  return new Promise((resolve) => {
    const socket = net.connect({ host: "127.0.0.1", port, timeout: 250 });
    socket.on("connect", () => { socket.destroy(); resolve(true); });
    socket.on("error", () => resolve(false));
    socket.on("timeout", () => { socket.destroy(); resolve(false); });
  });
}

export async function resolveProxyUrl() {
  const fromEnv = envProxy();
  if (fromEnv) return fromEnv;
  for (const port of [7890, 7897, 10809, 20171, 1080]) {
    if (await portOpen(port)) return "http://127.0.0.1:" + port;
  }
  return "";
}

export function errorText(error) {
  const parts = [];
  let cur = error;
  for (let i = 0; i < 4 && cur; i++) {
    parts.push(cur.message || String(cur));
    cur = cur.cause;
  }
  return parts.join(" → ");
}

function httpsJsonOnce(urlStr, headers, proxyUrl, timeoutMs, method = "GET", body) {
  return new Promise((resolve, reject) => {
    const target = new URL(urlStr);
    const chunks = [];
    const collect = (res) => {
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        let parsed = null;
        try { parsed = JSON.parse(text); } catch {}
        resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode, body: parsed, text });
      });
    };
    const payload = body == null ? undefined : Buffer.from(typeof body === "string" ? body : JSON.stringify(body));
    const hdrs = { ...headers };
    if (payload && !hdrs["Content-Length"] && !hdrs["content-length"]) hdrs["Content-Length"] = String(payload.length);
    const reqOpts = {
      method: method || "GET",
      hostname: target.hostname,
      port: 443,
      path: target.pathname + target.search,
      headers: hdrs,
      timeout: timeoutMs || TIMEOUT_MS,
      servername: target.hostname
    };
    if (!proxyUrl) {
      const req = https.request(reqOpts, collect);
      req.on("error", reject);
      req.on("timeout", () => req.destroy(new Error("https timeout")));
      req.end(payload);
      return;
    }
    let proxy;
    try { proxy = new URL(proxyUrl); } catch (e) { reject(e); return; }
    const connect = http.request({
      method: "CONNECT",
      hostname: proxy.hostname,
      port: proxy.port || 80,
      path: target.hostname + ":443",
      timeout: timeoutMs || TIMEOUT_MS,
      headers: { Host: target.hostname + ":443" }
    });
    connect.on("connect", (res, socket) => {
      if (res.statusCode !== 200) {
        socket.destroy();
        reject(new Error("proxy CONNECT HTTP " + res.statusCode));
        return;
      }
      const req = https.request({ ...reqOpts, socket, agent: false }, collect);
      req.on("error", reject);
      req.on("timeout", () => req.destroy(new Error("https timeout via proxy")));
      req.end(payload);
    });
    connect.on("error", reject);
    connect.on("timeout", () => connect.destroy(new Error("proxy CONNECT timeout")));
    connect.end();
  });
}

export async function httpsJson(urlStr, headers = {}, opts = {}) {
  const hdrs = { Accept: "application/json", "User-Agent": BROWSER_UA, ...headers };
  const timeoutMs = opts.timeoutMs || TIMEOUT_MS;
  const method = opts.method || "GET";
  const body = opts.body;
  try {
    return await httpsJsonOnce(urlStr, hdrs, "", timeoutMs, method, body);
  } catch (directErr) {
    const proxyUrl = opts.proxyUrl || (await resolveProxyUrl());
    if (!proxyUrl) throw directErr;
    try {
      return await httpsJsonOnce(urlStr, hdrs, proxyUrl, timeoutMs, method, body);
    } catch (proxyErr) {
      throw new Error(errorText(directErr) + " | proxy: " + errorText(proxyErr));
    }
  }
}
