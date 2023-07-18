import { Hono, Context } from "hono";
import { AtpAgent } from "@atproto/api";

let atp: AtpAgent | null = null;

const app = new Hono();

const proxy = new Hono();

app.get("/ping", (c: Context) => c.text("pong"));

proxy.get("/:service/image", (c: Context) => c.text("No image"));
proxy.get("/:service/image/:did/:cid", async (c: Context) => {
  const { service, did, cid } = c.req.param();

  console.log(`target Service = ${service}`)
  console.log(`did = ${did}`, `cid = ${cid}`);

  const cache = caches.default;

  const cacheKey = `${c.req.url}.blob`;
  console.log("cacheKey = ", cacheKey);

  try {
    const getAgent = () => {
      atp = new AtpAgent({ service: `https://${service}` });
      return atp;
    };
    
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
      const cacheAge = 60 * 60 * 24 * 7 // 1 week
      response = new Response(blobObject, blobResp.headers);
      response.headers.append("Cache-Control", `s-maxage=${cacheAge}`);

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
