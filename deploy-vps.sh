#!/usr/bin/env bash
# 三国杀·风林火山 —— 云服务器一键部署（Ubuntu/Debian/CentOS/Alma/Rocky 通用）
# 用法：把部署包解压到服务器任意目录，cd 进去后执行  sudo bash deploy-vps.sh [端口]
set -e
cd "$(dirname "$0")"
PORT="${1:-8765}"
SUDO=""; [ "$(id -u)" != "0" ] && SUDO="sudo"

if ! command -v node >/dev/null 2>&1; then
  echo "[deploy] 未检测到 Node.js，开始安装 Node 20 ..."
  if command -v apt-get >/dev/null 2>&1; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y nodejs
  elif command -v yum >/dev/null 2>&1; then
    curl -fsSL https://rpm.nodesource.com/setup_20.x | bash -
    yum install -y nodejs
  elif command -v dnf >/dev/null 2>&1; then
    curl -fsSL https://rpm.nodesource.com/setup_20.x | bash -
    dnf install -y nodejs
  else
    echo "[deploy] 请手动安装 Node.js 16+ 后重新运行"; exit 1
  fi
fi
echo "[deploy] Node 版本: $(node -v)"

cat >/etc/systemd/system/sanguosha.service <<EOF
[Unit]
Description=Sanguosha Web Game Server
After=network.target

[Service]
WorkingDirectory=$(pwd)
ExecStart=$(command -v node) server.js ${PORT}
Environment=PORT=${PORT}
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF

$SUDO systemctl daemon-reload
$SUDO systemctl enable --now sanguosha
$SUDO systemctl restart sanguosha
sleep 1
$SUDO systemctl --no-pager --lines=3 status sanguosha || true

# 系统防火墙（云控制台"安全组"需另行放行 ${PORT}/tcp）
if command -v firewall-cmd >/dev/null 2>&1 && firewall-cmd --state >/dev/null 2>&1; then
  firewall-cmd --permanent --add-port=${PORT}/tcp >/dev/null && firewall-cmd --reload >/dev/null
  echo "[deploy] firewalld 已放行 ${PORT}/tcp"
elif command -v ufw >/dev/null 2>&1 && ufw status 2>/dev/null | grep -qi active; then
  ufw allow ${PORT}/tcp >/dev/null
  echo "[deploy] ufw 已放行 ${PORT}/tcp"
fi

IP=$(curl -s --max-time 3 ifconfig.me || hostname -I | awk '{print $1}')
echo ""
echo "✅ 部署完成！游戏已常驻后台（崩溃自动重启，服务器重启自动拉起）"
echo "   房主开局:  http://${IP}:${PORT}/?mp=net&host"
echo "   玩家加入:  http://${IP}:${PORT}/  → 组局开黑 → 输入房间码"
echo "   常用命令:  systemctl status|restart|stop sanguosha    日志: journalctl -u sanguosha -f"
