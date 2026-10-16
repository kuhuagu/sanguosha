/* 三国杀联机房间服务器 —— Node 标准库实现，零依赖。
 * 用法：  node server.js [端口]     （默认 8765）
 * 房主浏览器打开  http://localhost:8765/  → 点「联机开房」创建房间；
 * 其他玩家打开    http://<房主IP>:8765/?mp=net&room=房间码  即可加入。
 * 本服务器只做“消息中转 + 静态文件”，牌局逻辑全部在房主客户端里权威运行。
 */
"use strict";
const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const PORT = process.env.PORT ? +process.env.PORT : +(process.argv[2] || 8765);   // 平台部署走环境变量 PORT，本机走命令行参数
const ROOT = __dirname;
const MIME = { ".html":"text/html; charset=utf-8", ".js":"text/javascript", ".css":"text/css",
  ".png":"image/png", ".jpg":"image/jpeg", ".svg":"image/svg+xml", ".ico":"image/x-icon", ".json":"application/json" };

/** room code -> { hostUid, seats:{uid:{seen,msgs[],wait[]}}, lastAct } */
const rooms = new Map();
const rid = () => crypto.randomBytes(4).toString("hex").toUpperCase();

function getRoom(code){ return rooms.get(code); }
function touch(o){ o.seen = Date.now(); }

function readBody(req){
  return new Promise((res, rej) => {
    let b = ""; req.on("data", c => { b += c; if (b.length > 2e6) req.destroy(); });
    req.on("end", () => { try { res(b ? JSON.parse(b) : {}); } catch (e) { rej(e); } });
    req.on("error", rej);
  });
}
function send(res, code, obj){
  const s = JSON.stringify(obj);
  res.writeHead(code, { "Content-Type":"application/json; charset=utf-8", "Access-Control-Allow-Origin":"*" });
  res.end(s);
}

function deliver(room, to){ // 尝试把该收件人队列里的消息喂给挂起的 GET
  const seat = room.seats[to]; if (!seat) return;
  while (seat.msgs.length && seat.wait.length){
    const { res, timer } = seat.wait.shift();
    clearTimeout(timer);
    send(res, 200, { ok:1, msgs: seat.msgs.splice(0, seat.msgs.length) });
  }
}
function enqueue(room, to, msg){ // to: uid 或 "all"
  const targets = to === "all" ? Object.keys(room.seats) : [to];
  for (const t of targets){
    const seat = room.seats[t]; if (!seat) continue;
    seat.msgs.push(msg); touch(seat);
    if (seat.msgs.length > 600) seat.msgs.splice(0, seat.msgs.length - 600);
    deliver(room, t);
  }
}

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, "http://x");
  try {
    if (req.method === "OPTIONS"){ res.writeHead(204, { "Access-Control-Allow-Origin":"*", "Access-Control-Allow-Headers":"Content-Type" }); return res.end(); }

    if (req.method === "POST" && u.pathname === "/api/create"){
      const b = await readBody(req);
      const code = b.room && /^[A-Z0-9]{2,8}$/i.test(b.room) ? b.room.toUpperCase() : rid().slice(0,4);
      if (getRoom(code)) return send(res, 200, { ok:0, err:"房间码已被占用" });
      const uid = "u" + crypto.randomBytes(5).toString("hex");
      const room = { hostUid: uid, seats: { [uid]: { msgs:[], wait:[], seen:Date.now() } }, lastAct: Date.now() };
      rooms.set(code, room);
      console.log(`[房间 ${code}] 创建，房主 uid=${uid}`);
      return send(res, 200, { ok:1, room: code, uid, hostUid: uid });
    }

    if (req.method === "POST" && u.pathname === "/api/join"){
      const b = await readBody(req);
      const room = getRoom(String(b.room || "").toUpperCase());
      if (!room) return send(res, 200, { ok:0, err:"房间不存在（检查房间码，或房主未创建房间）" });
      const uid = "u" + crypto.randomBytes(5).toString("hex");
      room.seats[uid] = { msgs:[], wait:[], seen:Date.now() };
      room.lastAct = Date.now();
      console.log(`[房间 ${codeOf(room)}] 新玩家加入 uid=${uid}（共 ${Object.keys(room.seats).length} 人）`);
      return send(res, 200, { ok:1, room: String(b.room).toUpperCase(), uid, hostUid: room.hostUid });
    }

    if (req.method === "POST" && u.pathname === "/api/put"){
      const b = await readBody(req);
      const room = getRoom(String(b.room || "").toUpperCase());
      if (!room) return send(res, 200, { ok:0, err:"房间不存在" });
      room.lastAct = Date.now();
      enqueue(room, String(b.to || "all"), Object.assign({ from: b.from }, b.msg));
      return send(res, 200, { ok:1 });
    }

    if (req.method === "GET" && u.pathname === "/api/get"){
      const room = getRoom(String(u.searchParams.get("room") || "").toUpperCase());
      const uid = String(u.searchParams.get("uid") || "");
      if (!room || !room.seats[uid]) return send(res, 200, { ok:0, msgs:[], err:"no-room" });
      const seat = room.seats[uid]; touch(seat); room.lastAct = Date.now();
      if (seat.msgs.length) return send(res, 200, { ok:1, msgs: seat.msgs.splice(0, seat.msgs.length) });
      // 长轮询挂起，最长 28 秒
      const timer = setTimeout(() => {
        seat.wait = seat.wait.filter(w => w.res !== res);
        send(res, 200, { ok:1, msgs: [] });
      }, 28000);
      seat.wait.push({ res, timer });
      return;
    }

    // 静态文件
    let fp = decodeURIComponent(u.pathname);
    if (fp === "/") fp = "/sanguosha.html";
    const abs = path.join(ROOT, path.normalize(fp).replace(/^([.][.][/\\])+/, ""));
    if (!abs.startsWith(ROOT) || !fs.existsSync(abs) || fs.statSync(abs).isDirectory()){
      res.writeHead(404, { "Content-Type":"text/plain; charset=utf-8" }); return res.end("404");
    }
    res.writeHead(200, { "Content-Type": MIME[path.extname(abs).toLowerCase()] || "application/octet-stream" });
    fs.createReadStream(abs).pipe(res);
  } catch (e){
    send(res, 500, { ok:0, err: String(e && e.message || e) });
  }
});

function codeOf(room){ for (const [k,v] of rooms) if (v === room) return k; return "?"; }

// 清理 45 分钟无活动的房间与 3 分钟失联的座位（座位失联不影响已开始的牌局——由房主端处理托管）
setInterval(() => {
  const now = Date.now();
  for (const [k, r] of rooms){
    if (now - r.lastAct > 45*60e3){ rooms.delete(k); console.log(`[房间 ${k}] 超时清理`); }
  }
}, 60e3);

server.listen(PORT, () => {
  console.log("三国杀联机服务器已启动：");
  console.log(`  本机访问:   http://localhost:${PORT}/`);
  try {
    const os = require("os");
    for (const [name, addrs] of Object.entries(os.networkInterfaces()))
      for (const a of addrs) if (a.family === "IPv4" && !a.internal)
        console.log(`  局域网访问: http://${a.address}:${PORT}/   (${name})`);
  } catch {}
  console.log("玩家加入格式:  http://<上面的地址>:" + PORT + "/?mp=net&room=房间码");
});
