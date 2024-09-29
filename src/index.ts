import { Hono } from 'hono/quick'
import { Context } from 'hono'

import image from './proxy/image'
import video from './proxy/video'

type Bindings = {
  BUCKET: R2Bucket
}


const app = new Hono<{Bindings: Bindings}>()

const proxy = new Hono()



app.get('/ping', (c: Context) => c.text('pong'))

proxy.get('/:pds/image', (c: Context) => c.text('No image'))
proxy.get('/:pds/video', (c: Context) => c.text('No video'))


proxy.get('/:pds/image/:did/:cid', image);
proxy.get('/:pds/video/:did/:cid', video);

app.route('/proxy', proxy)


export default app
