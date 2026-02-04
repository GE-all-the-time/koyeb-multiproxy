import express from "express";
import morgan from "morgan";
import { createProxyMiddleware } from "http-proxy-middleware";

const app = express();
app.disable("x-powered-by");
app.use(morgan("combined"));

/**
 * Koyeb 会注入 PORT（常见为 8000）
 * 我们必须监听这个端口，否则健康检查会失败。
 */
const PORT = process.env.PORT || 8000;

/**
 * 通用：设置一些更适合反代的 header
 */
function onProxyReq(proxyReq, req) {
  // 保持 Host 由 changeOrigin 处理；这里补充一些常用头
  proxyReq.setHeader("X-Forwarded-Proto", req.protocol);
  proxyReq.setHeader("X-Forwarded-Host", req.headers.host);
}

/**
 * 1) GitHub 代理
 * 使用方式：/gh/xxx -> https://github.com/xxx
 */
app.use(
  "/gh",
  createProxyMiddleware({
    target: "https://github.com",
    changeOrigin: true,
    secure: true,
    pathRewrite: { "^/gh": "" },
    onProxyReq
  })
);

/**
 * 2) TMDB API 代理
 * 使用方式：/tmdb/3/movie/xxx -> https://api.themoviedb.org/3/movie/xxx
 */
app.use(
  "/tmdb",
  createProxyMiddleware({
    target: "https://api.themoviedb.org",
    changeOrigin: true,
    secure: true,
    pathRewrite: { "^/tmdb": "" },
    onProxyReq
  })
);

/**
 * 3) Docker Hub / Registry 代理（关键）
 * Docker 拉镜像会访问两个关键域名：
 * - https://auth.docker.io/token  （拿 token）
 * - https://registry-1.docker.io/v2/... （拉取 manifest/layers）
 *
 * 我们用两个路径入口分别转发，便于你后续在客户端做替换：
 * - /docker-auth -> https://auth.docker.io
 * - /docker-reg  -> https://registry-1.docker.io
 *
 * 然后再提供一个聚合入口 /docker ，把常见路径自动分流：
 * - /docker/token -> auth
 * - /docker/v2/... -> registry
 */

// /docker-auth/*
app.use(
  "/docker-auth",
  createProxyMiddleware({
    target: "https://auth.docker.io",
    changeOrigin: true,
    secure: true,
    pathRewrite: { "^/docker-auth": "" },
    onProxyReq
  })
);

// /docker-reg/*
app.use(
  "/docker-reg",
  createProxyMiddleware({
    target: "https://registry-1.docker.io",
    changeOrigin: true,
    secure: true,
    pathRewrite: { "^/docker-reg": "" },
    onProxyReq
  })
);

// /docker/* 智能分流
app.use("/docker", (req, res, next) => {
  // 典型 token 请求：/docker/token?service=registry.docker.io&scope=repository:library/nginx:pull
  if (req.path.startsWith("/token")) {
    req.url = req.originalUrl.replace(/^\/docker/, "/docker-auth");
    return app._router.handle(req, res, next);
  }
  // 典型 registry 请求：/docker/v2/...
  if (req.path.startsWith("/v2")) {
    req.url = req.originalUrl.replace(/^\/docker/, "/docker-reg");
    return app._router.handle(req, res, next);
  }
  // 其它情况默认去 registry
  req.url = req.originalUrl.replace(/^\/docker/, "/docker-reg");
  return app._router.handle(req, res, next);
});

// 健康检查 & 主页提示
app.get("/", (req, res) => {
  res.type("text").send(
    [
      "Koyeb Multi-Proxy is running.",
      "",
      "Paths:",
      "  /gh/*        -> github.com",
      "  /tmdb/*      -> api.themoviedb.org",
      "  /docker/*    -> docker hub (token + registry)",
      "  /docker-auth/* -> auth.docker.io",
      "  /docker-reg/*  -> registry-1.docker.io"
    ].join("\n")
  );
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Multi-proxy listening on http://0.0.0.0:${PORT}`);
});
