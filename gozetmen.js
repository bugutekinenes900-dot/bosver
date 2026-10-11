const { spawn } = require("child_process");
const http = require("http");
const path = require("path");

const CLOUDFLARED = path.join(
  process.env.LOCALAPPDATA || "",
  "cloudflared",
  "cloudflared.exe"
);

let server = null;
let tunnel = null;
let bootingServer = false;

function ping() {
  return new Promise((resolve) => {
    const req = http.get("http://127.0.0.1:3000/api/tiers", (res) => {
      res.resume();
      resolve(res.statusCode === 200);
    });
    req.on("error", () => resolve(false));
    req.setTimeout(4000, () => {
      req.destroy();
      resolve(false);
    });
  });
}

function cloudflaredRunning() {
  return new Promise((resolve) => {
    const task = spawn("tasklist", ["/FI", "IMAGENAME eq cloudflared.exe", "/NH"], {
      windowsHide: true,
    });
    let out = "";
    task.stdout.on("data", (chunk) => {
      out += chunk.toString();
    });
    task.on("exit", () => resolve(/cloudflared\.exe/i.test(out)));
    task.on("error", () => resolve(false));
  });
}

function startServer() {
  if (server || bootingServer) return;
  bootingServer = true;
  console.log("Sunucu yeniden açılıyor...");
  server = spawn(process.execPath, ["server.js"], {
    cwd: __dirname,
    stdio: "inherit",
    windowsHide: false,
  });
  server.on("exit", () => {
    server = null;
    bootingServer = false;
    console.log("Sunucu durdu, birazdan tekrar denenecek.");
  });
  setTimeout(() => {
    bootingServer = false;
  }, 8000);
}

function startTunnel() {
  if (tunnel) return;
  console.log("HTTPS tüneli açılıyor...");
  tunnel = spawn(CLOUDFLARED, ["tunnel", "--url", "http://127.0.0.1:3000"], {
    windowsHide: true,
  });
  const onData = (chunk) => {
    const text = chunk.toString();
    process.stdout.write(text);
    const match = text.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
    if (match) console.log(`\nTELEFON ADRESI: ${match[0]}\n`);
  };
  tunnel.stdout.on("data", onData);
  tunnel.stderr.on("data", onData);
  tunnel.on("exit", () => {
    tunnel = null;
    console.log("Tünel koptu, yeni adresle tekrar açılacak.");
  });
}

async function tick() {
  const up = await ping();
  if (!up) startServer();
  const tunnelUp = tunnel || (await cloudflaredRunning());
  if (!tunnelUp) startTunnel();
}

console.log("Gözetmen açık. Bilgisayar uyumaz ve kapanmazsa sunucu düşerse kalkar.");
console.log("Bilgisayarda: http://localhost:3000");
setInterval(() => {
  tick().catch((err) => console.error(err.message));
}, 20000);
tick().catch((err) => console.error(err.message));
