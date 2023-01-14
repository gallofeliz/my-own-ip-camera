const HttpServer = require('@gallofeliz/js-libs/http-server').default
const createLogger = require('@gallofeliz/js-libs/logger').default
const {handleExitSignals} = require('@gallofeliz/js-libs/exit-handle')
const { Logger } = require('@gallofeliz/js-libs/logger')
const runProcess = require('@gallofeliz/js-libs/process').default
const httpRequest = require('@gallofeliz/js-libs/http-request').default
const { durationToMilliSeconds } = require('@gallofeliz/js-libs/utils')
const loadConfig = require('@gallofeliz/js-libs/config').default
const { PersistantObjectFileHandler, default:createPersistantObject } = require('@gallofeliz/js-libs/persistant-object')

;(async () => {

    const config = loadConfig({
        filename: '/etc/cam/config.yml',
        mandatoryFile: false,
        userProvidedConfigSchema: {
            type: 'object',
            properties: {
                logs: {
                    type: 'object',
                    properties: {
                        level: { enum: ['debug', 'info'], default: 'info' }
                    },
                    default: {}
                },
                shutter: {
                    type: 'object',
                    properties: {
                        enabled: { type: 'boolean', default: true },
                        openValue: { type: 'number', default: 12.5 },
                        closedValue: { type: 'number', default: 2.5 }
                    },
                    default: {}
                }
            }
        }
    })

    const logger = createLogger(config.logs.level)

    const state = await createPersistantObject(
        { flip: false, shutterAutoWaitBeforeClose: '0s' },
        new PersistantObjectFileHandler('/var/lib/cam/state.json')
    )

    const shutterSupport = config.shutter.enabled
    let cameraIsBusy = false
    let cameraIsBusyBy = null

    const shutterOpenValue = config.shutter.openValue
    const shutterClosedValue = config.shutter.closedValue

    class Shutter {
        constructor() {
            this.currentRunningShutter = null
            this.autoTimeout = null
            // Notice I
            this.shutterOpen = null
            this.setMode('auto')
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
            // Avoid collisions with promise "queue"
            await (this.currentRunningShutter = (this.currentRunningShutter || Promise.resolve())
            .then(async () => {
                await runProcess({
                    command: [
                        './shutter.py',
                        open ? shutterOpenValue : shutterClosedValue
                    ],
                    logger
                }, true)
                this.shutterOpen = open
            }))
        }

        async onCameraBusyChange(cameraIsBusy) {
            if (this.mode !== 'auto') {
                return
            }

            this.clearAutoTimeout()

            if (!cameraIsBusy) {
                this.autoTimeout = setTimeout(
                    () => {
                        this.putHardwareShutter(false)
                        this.clearAutoTimeout()
                    }, durationToMilliSeconds(state.shutterAutoWaitBeforeClose)
                )
            } else {
                // Avoid make noise !
                if (!this.shutterOpen) {
                    await this.putHardwareShutter(true)
                }
            }
        }
    }

    const shutter = shutterSupport ? new Shutter : null;

    async function setCameraBusy(whoUseIt) {
        cameraIsBusy = !!whoUseIt
        cameraIsBusyBy = whoUseIt

        logger.info('Camera busy', { cameraIsBusyBy })

        if (shutter) {
            await shutter.onCameraBusyChange(cameraIsBusy)
        }
    }

    async function doFlip() {
        state.flip = !state.flip

        await httpRequest({
            method: 'POST',
            url: 'http://127.0.0.1:9997/v1/config/paths/edit/fhd',
            bodyData: {
                rpiCameraVFlip: state.flip,
                rpiCameraHFlip: state.flip
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
                        setCameraBusy('video')

                        req.once('close', () => {
                            setCameraBusy(null)
                        })
                    }
                },
                {
                    method: 'POST',
                    path: '/flip',
                    async handler(req, res) {
                        await doFlip()
                        res.status(201).end()
                    }
                },
                {
                    method: 'POST',
                    inputBodySchema: {
                        type: 'string'
                    },
                    path: '/shutter/auto-wait',
                    async handler(req, res) {
                        state.shutterAutoWaitBeforeClose = req.body
                        res.status(201).end()
                    }
                },
                {
                    method: 'GET',
                    path: '/shutter/auto-wait',
                    async handler(req, res) {
                        res.send(JSON.stringify(state.shutterAutoWaitBeforeClose))
                    }
                },
                {
                    method: 'POST',
                    path: '/reboot',
                    async handler(req, res) {
                        res.status(201).end()

                        await runProcess({
                            command: 'echo b > /sysrq',
                            logger
                        }, true)
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
                    inputQuerySchema: {
                        type: 'object',
                        properties: {
                            quality: {
                                type: 'number',
                                multipleOf: 1,
                                minimum: 1,
                                maximum: 100
                            },
                            forceVideoSource: { type: 'boolean' }
                        }
                    },
                    path: '/:sizeName(fhd|hd).jpg',
                    async handler(req, res) {
                        const sizeName = req.params.sizeName

                        const quality = req.query.quality || 90
                        const forceVideoSource = req.query.forceVideoSource

                        const sizes = {
                            fhd: [1920, 1080],
                            hd: [1280, 720]
                        }

                        const size = sizes[sizeName]

                        const ffmpegQuality = Math.floor((101-quality)*30/100)+1

                        res.header('Content-Type: image/jpeg')
                        // Use video stream if already busy by it
                        // But also if too many requests on image endpoint
                        if (cameraIsBusy || forceVideoSource) {
                            await runProcess({
                                command: [
                                    'ffmpeg',
                                    '-i', 'http://localhost:8888/fhd/stream.m3u8',
                                    '-ss', '00:00:01.500',
                                    '-f', 'image2',
                                    '-frames:v', '1',
                                    '-vf', 'scale=' + size.join(':'),
                                    '-q:v', ffmpegQuality,
                                    '-'
                                ],
                                logger,
                                outputStream: res
                            }, true)
                        } else {
                            await setCameraBusy('image')
                            try {
                                await runProcess({
                                    command: [
                                        'libcamera-jpeg',
                                        '--mode', size.join(':'),
                                        '--width', size[0],
                                        '--height', size[1],
                                        '-n', '-o', '-', '-q', quality, '-t', 5
                                    ].concat(state.flip ? ['--hflip', '1', '--vflip', '1']: []),
                                    logger,
                                    outputStream: res
                                }, true)
                            } finally {
                                setCameraBusy(null)
                            }
                        }
                    }
                }
            ]
        }
    })

    server.start()
    logger.info('My Own Camera IP started. Welcome !')

    handleExitSignals(() => {
        logger.info('bye bye')
        server.stop()
    })

})()
