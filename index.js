const HttpServer = require('@gallofeliz/js-libs/http-server').default
const createLogger = require('@gallofeliz/js-libs/logger').default
const {handleExitSignals} = require('@gallofeliz/js-libs/exit-handle')
const { Logger } = require('@gallofeliz/js-libs/logger')
const runProcess = require('@gallofeliz/js-libs/process').default
const httpRequest = require('@gallofeliz/js-libs/http-request').default
const { durationToMilliSeconds } = require('@gallofeliz/js-libs/utils')

const logger = createLogger('info')

let doFlip = false

const shutterSupport = true
const autoShufferWaitBeforeClose = '15s'

class Shutter {
    constructor() {
        this.setMode('closed')
        this.autoTimeout = null
    }

    clearAutoTimeout() {
        clearTimeout(this.autoTimeout)
        this.autoTimeout = null
    }

    setMode(mode) {
        if (this.mode === mode === 'auto') {
            return
        }

        this.mode = mode

        switch(this.mode) {
            case 'auto':
                if (cameraIsBusy) {
                    this.onCameraBusyChange(cameraIsBusy)
                } else {
                    this.putHardwareShutter(false)
                }
                break
            case 'closed':
                this.clearAutoTimeout()
                this.putHardwareShutter(false)
                break
            case 'open':
                this.clearAutoTimeout()
                this.putHardwareShutter(true)
                break
        }
    }

    async putHardwareShutter(open) {
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

    onCameraBusyChange(cameraIsBusy) {
        if (this.mode !== 'auto') {
            return
        }

        this.clearAutoTimeout()

        if (!cameraIsBusy) {
            this.autoTimeout = setTimeout(
                () => {
                    this.putHardwareShutter(false)
                    this.clearAutoTimeout()
                }, durationToMilliSeconds(autoShufferWaitBeforeClose)
            )
        } else {
            this.putHardwareShutter(true)
        }
    }
}

const shutter = shutterSupport ? new Shutter : null;

let cameraIsBusy = false

function setCameraBusy(bool) {
    cameraIsBusy = bool

    if (shutter) {
        shutter.onCameraBusyChange(cameraIsBusy)
    }
}

async function flip() {
    doFlip = !doFlip

    await httpRequest({
        method: 'POST',
        url: 'http://127.0.0.1:9997/v1/config/paths/edit/fhd',
        bodyData: {
            rpiCameraVFlip: doFlip,
            rpiCameraHFlip: doFlip
        },
        bodyType: 'json',
        logger,
    })
}

const server = new HttpServer({
    port: 80,
    logger,
    webUiFilesPath: 'ui',
    api: {
        routes: [
            {
                method: 'POST',
                path: '/internal/video-uses-camera',
                async handler(req, res) {
                    setCameraBusy(true)

                    req.once('close', () => {
                        setCameraBusy(false)
                    })
                }
            },
            {
                method: 'POST',
                path: '/flip',
                async handler(req, res) {
                    await flip()
                    res.status(201).end()
                }
            },
            {
                method: 'POST',
                path: '/shutter',
                inputBodySchema: { enum: ['open', 'closed', 'auto'] },
                async handler(req, res) {
                    if (!shutter) {
                        throw new Error('No Shutter')
                    }
                    await shutter.setMode(req.body)
                    res.status(201).end()
                }
            },
            {
                method: 'GET',
                path: '/fhd.jpg',
                async handler(req, res) {
                    res.header('Content-Type: image/jpeg')

                    if (cameraIsBusy) {
                        await runProcess({
                            command: [
                                'ffmpeg',
                                '-i', 'http://localhost:8888/fhd/stream.m3u8',
                                '-ss', '00:00:01.500',
                                '-f', 'image2',
                                '-frames:v', '1',
                                 '-'
                            ],
                            logger,
                            outputStream: res
                        }, true)
                    } else {
                        setCameraBusy(true)
                        try {
                            await runProcess({
                                command: [
                                    'libcamera-jpeg',
                                    '--mode', '1920:1080',
                                    '--width', '1920',
                                    '--height', '1080',
                                    '-n', '-o', '-'
                                ].concat(doFlip ? ['--hflip', '1', '--vflip', '1']: []),
                                logger,
                                outputStream: res
                            }, true)
                        } finally {
                            setCameraBusy(false)
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
