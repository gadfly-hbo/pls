#!/bin/bash

echo "🚀 正在启动 PLS 前端 MVP 工作台..."
cd "$(dirname "$0")/apps/web"

if [ ! -d "node_modules" ]; then
  echo "📦 正在安装依赖，请稍候..."
  npm install
fi

echo "🌐 启动本地开发服务器..."
npm run dev
