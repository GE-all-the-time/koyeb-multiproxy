export default {
  async fetch(request) {
    const url = new URL(request.url);
    const path = url.pathname;

    // /gh/* -> github.com
    // /tmdb/* -> api.themoviedb.org
    let upstreamOrigin = null;
    let rewrittenPath = null;

    if (path === "/gh" || path.startsWith("/gh/")) {
      upstreamOrigin = "https://github.com";
      rewrittenPath = path.replace(/^\/gh/, "") || "/";
    } else if (path === "/tmdb" || path.startsWith("/tmdb/")) {
      upstreamOrigin = "https://api.themoviedb.org";
      rewrittenPath = path.replace(/^\/tmdb/, "") || "/";
    } else if (path === "/" || path === "") {
      return new Response(
        "Worker proxy running. Paths: /gh/* , /tmdb/*\n",
        { headers: { "content-type": "text/plain; charset=utf-8" } }
      );
    } else {
      return new Response("Not Found", { status: 404 });
    }

    const upstreamUrl = new URL(upstreamOrigin);
    upstreamUrl.pathname = rewrittenPath;
    upstreamUrl.search = url.search;

    const headers = new Headers(request.headers);
    headers.set("Host", upstreamUrl.host);

    // TMDB 403 Host not permitted：通常需要转发 Host/Forwarded Host
    if (upstreamUrl.host === "api.themoviedb.org") {
      headers.set("X-Forwarded-Host", "api.themoviedb.org");
      headers.delete("Referer");
      headers.delete("Origin");
    }

    const newReq = new Request(upstreamUrl.toString(), {
      method: request.method,
      headers,
      body: ["GET", "HEAD"].includes(request.method) ? null : request.body,
      redirect: "manual",
    });

    return fetch(newReq);
  },
};
