import { Hono, Context } from "hono";
import { AtpAgent } from "@atproto/api";

let atp: AtpAgent | null = null;

const app = new Hono();

const proxy = new Hono();

app.get("/ping", (c: Context) => c.text("pong"));

proxy.get("/image", (c: Context) => c.text("No image"));
proxy.get("/image/:did/:cid", async (c: Context) => {
  const { did, cid } = c.req.param();

  console.log("did = ", did, "\ncid = ", cid);

  const cache = caches.default;

  const cacheKey = `${c.req.url}/.blob`;
  console.log("cacheKey = ", cacheKey);

  const getAgent = () => {
    atp = new AtpAgent({ service: "https://bsky.social" });
    return atp;
  };

  try {
    let response = await cache.match(cacheKey);

    if (!response) {
      const blobResp = await getAgent().api.com.atproto.sync.getBlob({
        did: did,
        cid: cid,
      });
      if (!blobResp.success) throw new Error("Not found");

      const blobObject = new Blob([blobResp.data], {
        type: blobResp.headers["Content-Type"] as string,
      });

      //URL.createObjectURL(blobObject)
      response = new Response(blobObject, blobResp.headers);
      response.headers.append("Cache-Control", "s-maxage=3600");

      c.executionCtx.waitUntil(cache.put(cacheKey, response.clone()));
    }

    return response;
  } catch (error) {
    console.error(error);
    c.status(404);
    c.text("Not found");
    return c.res;
  }
});

app.route("/proxy", proxy);

export default app;
