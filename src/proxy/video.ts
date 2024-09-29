import { Context } from 'hono'
import { AtpAgent, ComAtprotoSyncGetBlob } from '@atproto/api'

const video = async (c: Context) => {
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

					// console.debug(blobResp.headers)
					console.debug('start putting to R2')
					const putResult = await c.env.BUCKET.put(cacheKey, blobResp.data, {
						httpMetadata: {
							contentType: contentType,
							contentLength: blobResp.headers['content-length'],
						}
					})
					console.log('R2: put result = ', putResult)
					if (putResult == null) throw new Error('Failed to put objects to R2')
					console.debug('finish putting to R2')

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
}
export default video
