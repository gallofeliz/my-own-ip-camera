const HttpServer = require('@gallofeliz/js-libs/http-server').default
const createLogger = require('@gallofeliz/js-libs/logger').default
const {handleExitSignals} = require('@gallofeliz/js-libs/exit-handle')
const { Logger } = require('@gallofeliz/js-libs/logger')
const runProcess = require('@gallofeliz/js-libs/process').default
const httpRequest = require('@gallofeliz/js-libs/http-request').default

const logger = createLogger('info')

const server = new HttpServer({
    port: 8080,
    logger,
    api: {
        routes: [
            {
                method: 'GET',
                path: '/fhd.jpg',
                async handler(req, res) {
                    res.header('Content-Type: image/jpeg')

                    const camAlreadyUsedByVideoServer = (await httpRequest({
                        url: 'http://127.0.0.1:9997/v1/paths/list',
                        outputType: 'json',
                        logger
                    })).items.fhd.sourceReady

                    if (camAlreadyUsedByVideoServer) {
                        return await runProcess({
                            cmd: 'ffmpeg',
                            args: ['-i', 'http://localhost:8888/fhd/stream.m3u8', '-ss', '00:00:01.500', '-f', 'image2', '-frames:v', '1', '-'],
                            logger,
                            outputStream: res
                        }, true)
                    }

                    await runProcess({
                        cmd: 'libcamera-jpeg',
                        args: ['--mode', '1920:1080', '--width', '1920', '--height', '1080', '--hflip', '1', '--vflip', '1', '-n', '-o', '-'],
                        logger,
                        outputStream: res
                    }, true)
                }
            }
        ]
    }
})

server.start()

 handleExitSignals(() => {
    logger.info('bye bye')
    server.stop()
})
