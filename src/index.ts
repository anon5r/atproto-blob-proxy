import { Hono } from 'hono/quick'
import { Context } from 'hono'
import { AtpAgent, ComAtprotoSyncGetBlob } from '@atproto/api'
import image from './proxy/image'
import video from './proxy/video'

type Bindings = {
  BUCKET: R2Bucket
}


const app = new Hono<{Bindings: Bindings}>()

const proxy = new Hono()



app.get('/ping', (c: Context) => c.text('pong'))

proxy.get('/:pds/image', (c: Context) => c.text('No image'))


proxy.get('/:pds/image/:did/:cid', async (c: Context) => {
  const { pds, did, cid } = c.req.param()

  console.log(`target PDS = ${pds}`)
  console.log(`did = ${did}`, `cid = ${cid}`)

  const cache: Cache = caches.default
  const cacheAge: number = 60 * 60 * 24 * 3 // 3 days
  const cacheKey: string = `${pds}/${did.replaceAll(':','/')}/${cid}`
  console.log(`cacheKey = ${cacheKey}`)

  try {
    // Cache hit
    //let response = await cache.match(c.req.url)
    let response: Response | null = null

    if (!response) {
      try {
        // Get from Cloudflare R2
        console.log('Get from R2')
        // let object = await c.env.BUCKET.head(cacheKey)
        let object = await c.env.BUCKET.get(cacheKey)
        console.debug(object)
        // object = null
        if (object && object.size > 0) {
          console.info('R2: Object found!')
          const data = await object.arrayBuffer()
          response = new Response(data, {
            status: 200,
            headers: {
              'Content-Type': object.httpMetadata?.contentType,
              'Content-Length': object.httpMetadata?.contentLength,
              'Cache-Control': `public, max-age=${cacheAge}, immutable`,
            },
          })
        } else {

          // Fetch from PDS repo

          const getAgent = () => {
            return new AtpAgent({ service: `https://${pds}` })
          }

          const blobResp: ComAtprotoSyncGetBlob.Response = await getAgent().api.com.atproto.sync.getBlob({
            did: did,
            cid: cid,
          })
          if (!blobResp.success) throw new Error('Not found')

          const contentType = blobResp.headers['content-type']


proxy.get('/:pds/image/:did/:cid', image);
proxy.get('/:pds/video/:did/:cid', video);

app.route('/proxy', proxy)

export default app
