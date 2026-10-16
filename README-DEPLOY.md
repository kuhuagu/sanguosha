# 三国杀·风林火山 —— 上线部署指南

牌局引擎在房主浏览器里权威运行，`server.js` 只做两件事：**发布网页 + 中转房间消息**。
部署成网站后，任何人打开网址即可开局/加入，无需安装任何东西。

包内文件：

| 文件 | 说明 |
|---|---|
| `sanguosha.html` | 游戏本体（单机三模式 + 联机客户端） |
| `server.js` | 静态网站 + 房间中继服务器（Node 零依赖） |
| `cards_img/` | 162 张卡牌扫描图（必须与 html 同目录） |
| `package.json` / `Dockerfile` | `npm start` / 容器化 |
| `deploy-vps.sh` | **方式一**：Linux 云服务器一键部署脚本 |
| `render.yaml` | **方式三**：Render 自动蓝图 |
| `fly.toml` | **方式三**：fly.io 配置（新加坡区） |
| `railway.json` | **方式三**：Railway 配置 |

---

## 方式一：云服务器（国内推荐，稳定、国内直连快）

适用：腾讯云/阿里云/华为云等任意 Linux 轻量服务器（Ubuntu / Debian / CentOS 均可）。

1. **上传部署包**到服务器（任选其一）：
   - 本机 PowerShell：`scp sanguosha-deploy.zip root@服务器IP:/opt/`
   - 宝塔/1Panel 面板直接上传 zip
2. **登录服务器执行**（共两条命令）：
   ```bash
   cd /opt && unzip sanguosha-deploy.zip -d sanguosha && cd sanguosha
   sed -i 's/\r$//' deploy-vps.sh && sudo bash deploy-vps.sh 8765
   ```
   脚本自动：装 Node 20 → 注册 systemd 常驻服务（崩溃自动重启、开机自启）→ 放行系统防火墙。
3. **云控制台放行安全组**：入方向 TCP `8765`（或你指定的端口）。
4. **开始游戏**：
   - 房主：`http://服务器IP:8765/?mp=net&host`
   - 玩家：`http://服务器IP:8765/?mp=net&room=房间码`（链接由房主大厅生成，直接转发即可）

日常运维：`systemctl status|restart|stop sanguosha`，日志 `journalctl -u sanguosha -f`。

> Windows 服务器：装 Node 后在本目录执行 `netsh advfirewall firewall add rule name="sanguosha" dir=in action=allow protocol=TCP localport=8765`，再 `npm start`（或用 nssm 注册为服务）。

---

## 方式三：免费 PaaS（零成本，10 分钟拥有公网网址）

本机没装 git 也没关系——**GitHub 网页拖拽上传**即可完成。

### 3.1 上传代码到 GitHub（5 分钟）

1. 注册 [github.com](https://github.com) → 右上 `+` → **New repository** → 起名 `sanguosha` → Create
2. 进入新仓库 → **uploading an existing file** → 把本目录**所有文件**（含 `cards_img` 整个文件夹）拖进去 → Commit changes。完成。

### 3.2 部署到 Render（最简单，自动识别 render.yaml）

1. 注册 [render.com](https://render.com)（可用 GitHub 账号直接登录授权）
2. Dashboard → **New +** → **Blueprint** → 选 `sanguosha` 仓库 → Render 自动读取 `render.yaml`，什么都不用改 → **Apply**
3. 约 2 分钟后得到网址 `https://sanguosha.onrender.com`：
   - 房主：`https://sanguosha.onrender.com/?mp=net&host`
   - 玩家：`https://sanguosha.onrender.com/?mp=net&room=房间码`

> 免费层限制：15 分钟无人访问会休眠，下次访问等 30 秒左右自动唤醒；每账号 750 小时/月额度（单应用整月够用）。

### 3.3 备选：fly.io（新加坡机房，国内直连更快）

装 [flyctl](https://fly.io/docs/hands-on/install-flyctl/) 后（这一步需要本机 git bash/WSL 或服务器上做）：

```bash
fly launch --no-deploy && fly deploy
```

`fly.toml` 已配好新加坡区 + Docker + PORT=8080。得到 `https://sanguosha-wfls.fly.dev` 同格式网址。

### 3.4 备选：Railway

railway.com → New Project → Deploy from GitHub repo → 自动读取 `railway.json` → Generate Domain。

---

## 通用须知

- **房主即主机**：牌局引擎跑在房主浏览器，房主关页面全场暂停；玩家掉线 95 秒自动 AI 托管。
- **房间在内存**：`server.js` 重启后房间清空，重新建房即可；45 分钟无活动自动回收。
- **https**：方式三天然 https；方式一要 https 可加 nginx + certbot（域名需先备案/解析）。
- **国内访问**：方式一国内秒开；Render 在美国机房，部分地区较慢但可用；fly 新加坡折中。
