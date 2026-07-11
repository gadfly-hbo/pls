#!/bin/zsh -f
# PLS 工作台一键启动 — 双击运行
# -f 跳过 ~/.zshrc，避免 oh-my-zsh 更新提示等交互吞掉脚本路径首字符。

cd "$(dirname "$0")" || exit 1

WEB_HOST="127.0.0.1"
WEB_PORT="5174"
API_HOST="127.0.0.1"
API_PORT="3100"
WEB_URL="http://${WEB_HOST}:${WEB_PORT}"
API_HEALTH_URL="http://${API_HOST}:${API_PORT}/health"
MODEL_MARKER=".modelevol/capabilities/product-channel-fit/runtime-artifact.json"

is_ready() {
  curl -fsS -o /dev/null "$WEB_URL" 2>/dev/null &&
  curl -fsS -o /dev/null "$API_HEALTH_URL" 2>/dev/null
}

open_browser() {
  if open -a "Google Chrome" --fresh "$WEB_URL" 2>/dev/null; then
    return 0
  fi
  open "$WEB_URL"
}

kill_port_listeners() {
  lsof -ti "tcp:$1" 2>/dev/null | xargs kill -9 2>/dev/null || true
}

if ! command -v npm >/dev/null 2>&1; then
  export PATH="/usr/local/bin:/opt/homebrew/bin:$HOME/.nvm/versions/node/*/bin:$PATH"
fi
if ! command -v npm >/dev/null 2>&1; then
  echo "❌ 找不到 npm，请确认 Node.js 已安装并在 PATH 中。"
  echo "按回车关闭…"; read; exit 1
fi

if is_ready; then
  echo "✅ 检测到 PLS 服务 已在运行，直接打开浏览器…"
  open_browser
  exit 0
fi

if [ ! -d "apps/web/node_modules" ]; then
  echo "📦 首次启动，安装前端依赖..."
  (cd apps/web && npm install) || { echo "❌ 前端 npm install 失败"; echo "按回车关闭…"; read; exit 1; }
fi

if [ ! -d "apps/server/node_modules" ]; then
  echo "📦 首次启动，安装后端依赖..."
  (cd apps/server && npm install) || { echo "❌ 后端 npm install 失败"; echo "按回车关闭…"; read; exit 1; }
fi

kill_port_listeners "$WEB_PORT"
kill_port_listeners "$API_PORT"

export VITE_USE_MOCK=false
if [ -f "$MODEL_MARKER" ]; then
  MODEL_PATH="$(node -e "const fs=require('fs'); const marker=JSON.parse(fs.readFileSync(process.argv[1],'utf8')); process.stdout.write(marker.locked_artifact_path || '')" "$MODEL_MARKER" 2>/dev/null)"
  if [ -n "$MODEL_PATH" ] && [ -f "$MODEL_PATH" ]; then
    export SINGLE_PRODUCT_PORTRAIT_MODEL_PATH="$MODEL_PATH"
    echo "✅ 单款画像模型: $SINGLE_PRODUCT_PORTRAIT_MODEL_PATH"
  else
    echo "⚠️ 未找到有效 ModelEvol locked artifact，单款画像将使用本地 fallback 模型。"
  fi
else
  echo "⚠️ 未找到 $MODEL_MARKER，单款画像将使用本地 fallback 模型。"
fi
export SIMULATED_MARKET_MODEL="${SIMULATED_MARKET_MODEL:-minimax-m3}"
export SIMULATED_MARKET_FAKE_LLM="${SIMULATED_MARKET_FAKE_LLM:-false}"
export SIMULATED_MARKET_PI_MODEL="${SIMULATED_MARKET_PI_MODEL:-minimax-cn/MiniMax-M3}"
if command -v "${PLS_PI_BIN:-pi}" >/dev/null 2>&1; then
  echo "✅ 模拟市场 LLM: pi-agent 已配置（pi model=$SIMULATED_MARKET_PI_MODEL, result model=$SIMULATED_MARKET_MODEL）"
else
  echo "ℹ️ 模拟市场 LLM: 未检测到 ${PLS_PI_BIN:-pi}，真实 LLM 不可用时将 fallback。"
fi

echo "🚀 启动后端服务 (Port 3100)..."
(cd apps/server && npm run dev) &
BACKEND_PID=$!

echo "🚀 启动前端工作台 (Port 5174)..."
(cd apps/web && npm run dev -- --host "$WEB_HOST" --port "$WEB_PORT" --strictPort) &
FRONTEND_PID=$!

cleanup() {
  echo "\n🛑 正在停止 PLS 服务..."
  kill "$FRONTEND_PID" 2>/dev/null
  kill "$BACKEND_PID" 2>/dev/null
  kill_port_listeners "$WEB_PORT"
  kill_port_listeners "$API_PORT"
}
trap cleanup INT TERM EXIT

echo -n "⏳ 等待服务就绪"
READY=0
for i in {1..60}; do
  if is_ready; then
    echo " 就绪！"
    READY=1
    open_browser
    break
  fi
  echo -n "."
  sleep 1
done

if [ "$READY" -eq 0 ]; then
  echo "\n⚠️ 等待超时（60s），仍未检测到服务就绪。已尝试打开浏览器，请稍后手动刷新：$WEB_URL"
  open_browser
fi

echo "\n———————————————————————————————"
echo "  PLS 服务运行中，端口如下："
echo "  - 前端工作台: $WEB_URL"
echo "  - 后端API: http://${API_HOST}:${API_PORT}"
echo ""
echo "  关闭此终端窗口或按 Ctrl+C 即停止所有服务"
echo "———————————————————————————————"

wait "$FRONTEND_PID"
wait "$BACKEND_PID"
