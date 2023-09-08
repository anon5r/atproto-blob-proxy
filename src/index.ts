import { Hono } from 'hono/quick'
import { Context } from 'hono'
import { AtpAgent } from '@atproto/api'

type Bindings = {
  BUCKET: R2Bucket
}


const app = new Hono<{Bindings: Bindings}>()

const proxy = new Hono()



app.get('/ping', (c: Context) => c.text('pong'))

proxy.get('/:service/image', (c: Context) => c.text('No image'))


proxy.get('/:service/image/:did/:cid', async (c: Context) => {
  const { service, did, cid } = c.req.param()

  console.log(`target Service = ${service}`)
  console.log(`did = ${did}`, `cid = ${cid}`)

  const cache = caches.default
  const cacheAge = 60 * 60 * 24 * 3 // 3 days
  const cacheKey = `${service}/${did.replaceAll(':','/')}/${cid}`
  console.log(`cacheKey = ${cacheKey}`)

  try {
    // Cache hit
    //let response = await cache.match(c.req.url)
    let response = null

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
            return new AtpAgent({ service: `https://${service}` })
          }

          const blobResp = await getAgent().api.com.atproto.sync.getBlob({
            did: did,
            cid: cid,
          })
          if (!blobResp.success) throw new Error('Not found')

          const contentType = blobResp.headers['content-type']

          // console.debug(blobResp.headers)
          console.debug('start put to R2')
          const putResult = await c.env.BUCKET.put(cacheKey, blobResp.data, {
            httpMetadata: {
              contentType: contentType,
              contentLength: blobResp.headers['content-length'],
            }
          })
          console.log('R2: put result = ', putResult)
          if (putResult == null) throw new Error('Failed to put objects to R2')
          console.debug('finish put to R2')

          const blob = new Blob([blobResp.data], {
            type: contentType,
          })
          // Create response
          response = new Response(blob, blobResp.headers)
          response.headers.set('Cache-Control', `public, max-age=${cacheAge}, immutable`)
          c.executionCtx.waitUntil(cache.put(c.req.url, response.clone()))
        }
      } catch (error) {
        console.error(error)
        throw error
      }

    }

    return response


  } catch (error) {
    console.error(error)
    c.status(404)
    c.text('Not found')
    return c.res
  }
});

app.route('/proxy', proxy)

export default app
