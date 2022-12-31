const HttpServer = require('@gallofeliz/js-libs/http-server').default
const createLogger = require('@gallofeliz/js-libs/logger').default
const {handleExitSignals} = require('@gallofeliz/js-libs/exit-handle')
const { Logger } = require('@gallofeliz/js-libs/logger')
const runProcess = require('@gallofeliz/js-libs/process').default

const logger = createLogger('info')

const server = new HttpServer({
    port: 8080,
    logger,
    api: {
        routes: [
            {
                method: 'GET',
                path: '/fhd',
                async handler(req, res) {
                    res.header('Content-Type: image/jpeg')
                    await runProcess({
                        cmd: 'ffmpeg',
                        args: ['-i', 'http://localhost:8888/fhd/stream.m3u8', '-f', 'image2', '-vframes', '1', '-'],
                        logger,
                        outputStream: res
                    }, true)
                }
            }
        ]
    }
})

server.start()

 handleExitSignals(() => server.stop())
