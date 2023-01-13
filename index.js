const HttpServer = require('@gallofeliz/js-libs/http-server').default
const createLogger = require('@gallofeliz/js-libs/logger').default
const {handleExitSignals} = require('@gallofeliz/js-libs/exit-handle')
const { Logger } = require('@gallofeliz/js-libs/logger')
const runProcess = require('@gallofeliz/js-libs/process').default
const httpRequest = require('@gallofeliz/js-libs/http-request').default

const logger = createLogger('info')

let autoShutter = true

async function shutter(open) {
    const openValue = 12.5
    const closedValue = 2.5

    await runProcess({
        command: [
            './shutter.py',
            open ? openValue : closedValue
        ],
        logger
    }, true)
}

const server = new HttpServer({
    port: 80,
    logger,
    webUiFilesPath: 'ui',
    api: {
        routes: [
            {
                method: 'POST',
                path: '/shutter',
                inputBodySchema: { enum: ['open', 'closed', 'auto'] },
                async handler(req, res) {
                    const expected = req.body
                    autoShutter = expected === 'auto'
                    await shutter(expected === 'open')
                    res.status(201).end()
                }
            },
            {
                method: 'GET',
                path: '/fhd.jpg',
                async handler(req, res) {
                    try {
                        if (autoShutter) {
                            shutter(true)
                        }

                        res.header('Content-Type: image/jpeg')

                        const camAlreadyUsedByVideoServer = await httpRequest({
                            url: 'http://127.0.0.1:9997/v1/paths/list',
                            outputType: 'json',
                            logger,
                            responseTransformation: 'items.fhd.sourceReady'
                        })

                        if (camAlreadyUsedByVideoServer) {
                            await runProcess({
                                command: ['ffmpeg', '-i', 'http://localhost:8888/fhd/stream.m3u8', '-ss', '00:00:01.500', '-f', 'image2', '-frames:v', '1', '-'],
                                logger,
                                outputStream: res
                            }, true)
                        } else {
                            await runProcess({
                                command: ['libcamera-jpeg', '--mode', '1920:1080', '--width', '1920', '--height', '1080', '--hflip', '1', '--vflip', '1', '-n', '-o', '-'],
                                logger,
                                outputStream: res
                            }, true)
                        }

                    } finally {
                        if (autoShutter) {
                            shutter(false)
                        }
                    }

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
