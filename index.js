const HttpServer = require('@gallofeliz/js-libs/http-server').default
const createLogger = require('@gallofeliz/js-libs/logger').default
const {handleExitSignals} = require('@gallofeliz/js-libs/exit-handle')
const { Logger } = require('@gallofeliz/js-libs/logger')
const runProcess = require('@gallofeliz/js-libs/process').default
const httpRequest = require('@gallofeliz/js-libs/http-request').default
const { durationToMilliSeconds } = require('@gallofeliz/js-libs/utils')
const loadConfig = require('@gallofeliz/js-libs/config').default
const { PersistantObjectFileHandler, default:createPersistantObject } = require('@gallofeliz/js-libs/persistant-object')
const { writeFile } = require('fs/promises')

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
                },
                leds: {
                    type: 'object',
                    default: {},
                    properties: {
                        enabled: { type: 'boolean', default: false }
                    }
                },
                auth: {
                    type: 'object',
                    default: {},
                    properties: {
                        publicView: { type: 'boolean', default: false },
                        viewer: {
                            type: 'object',
                            default: {},
                            properties: {
                                username: { type: 'string', default: 'viewer' },
                                password: { type: 'string', default: 'viewer' },
                            }
                        },
                        admin: {
                            type: 'object',
                            default: {},
                            properties: {
                                username: { type: 'string', default: 'admin' },
                                password: { type: 'string', default: 'admin' },
                            }
                        },
                    }
                }
            }
        }
    })

    const logger = createLogger(config.logs.level)

    class Led {
        constructor(path) {
            this.path = path
            this.state = false
        }
        async getState() {
            return this.state
        }
        async on() {
            await this.setState(true)
        }
        async off() {
            await this.setState(false)
        }
        async flip() {
            await this.setState(!this.state)
        }
        async setState(state) {
            const value = state ? 1 : 0
            await writeFile(this.path, value.toString())
            this.state = state
        }
    }

    class LedsBlinker {
        constructor(leds) {
            this.leds = leds
            this.intervalFn = null
        }
        startBlink() {
            if (this.intervalFn) {
                return
            }
            this.intervalFn = setInterval(() => this.blink(false), 500)
            this.blink(true)
        }
        stopBlink() {
            clearInterval(this.intervalFn)
            this.intervalFn = null
            this.leds.forEach(led => led.off())
        }
        blink(initial) {
            if (initial) {
                this.leds.forEach((led, index) => {
                    index % 2 === 0 ? led.on() : led.off()
                })
                return
            }

            this.leds.forEach(led => led.flip())
        }
    }

    const blinker = config.leds.enabled && new LedsBlinker([
        new Led('/sys/class/leds/led0/brightness'),
        new Led('/sys/class/leds/led1/brightness')
    ])

    const state = await createPersistantObject(
        { rotate: 'none', shutterAutoWaitBeforeClose: '0s', shutterMode: 'auto' },
        new PersistantObjectFileHandler('/var/lib/cam/state.json')
    )

    const shutterSupport = config.shutter.enabled
    let cameraIsBusy = false
    let cameraIsBusyBy = null

    const shutterOpenValue = config.shutter.openValue
    const shutterClosedValue = config.shutter.closedValue

    class Shutter {
        constructor(mode = 'auto') {
            this.currentRunningShutter = null
            this.autoTimeout = null
            // Notice I
            this.shutterOpen = null
            this.setMode(mode)
        }

        clearAutoTimeout() {
            clearTimeout(this.autoTimeout)
            this.autoTimeout = null
        }

        setMode(mode) {
            if (this.mode === mode === 'auto') {
                return
            }

            this.mode = state.shutterMode = mode

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

        close() {
            this.putHardwareShutter(false)
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

    const shutter = shutterSupport ? new Shutter(state.shutterMode) : null;

    async function setCameraBusy(whoUseIt) {
        cameraIsBusy = !!whoUseIt
        cameraIsBusyBy = whoUseIt

        logger.info('Camera busy', { cameraIsBusyBy })

        if (blinker) {
            if (cameraIsBusy) {
                blinker.startBlink()
            } else {
                blinker.stopBlink()
            }
        }

        if (shutter) {
            await shutter.onCameraBusyChange(cameraIsBusy)
        }
    }

    async function rotate(value) {
        if (state.rotate === value) {
            return
        }

        state.rotate = value

        await httpRequest({
            method: 'POST',
            url: 'http://127.0.0.1:9997/v1/config/paths/edit/source',
            bodyData: {
                rpiCameraVFlip: state.rotate === 'reverse',
                rpiCameraHFlip: state.rotate === 'reverse'
            },
            bodyType: 'json',
            logger,
        })

        await configureRtspStreams()
    }

    async function configureRtspStreams() {
        const transposeStr = state.rotate.includes('clockwise')
            ? ['-vf', 'transpose=' + (state.rotate === 'clockwise' ? 1 : 2)].join(' ')
            : ''

        await httpRequest({
            method: 'POST',
            url: 'http://127.0.0.1:9997/v1/config/paths/edit/fhd',
            bodyData: {
                runOnDemand: 'ffmpeg -hide_banner -loglevel error -i rtsp://'
                    + encodeURIComponent(config.auth.viewer.username)+':'+encodeURIComponent(config.auth.viewer.password)
                    +'@localhost/source '+transposeStr+' -f rtsp rtsp://'
                    + encodeURIComponent(config.auth.viewer.username)+':'+encodeURIComponent(config.auth.viewer.password)+'@localhost/fhd'
            },
            bodyType: 'json',
            logger,
        })
        await httpRequest({
            method: 'POST',
            url: 'http://127.0.0.1:9997/v1/config/paths/edit/hd',
            bodyData: {
                runOnDemand: 'ffmpeg -hide_banner -loglevel error -i rtsp://'
                    + encodeURIComponent(config.auth.viewer.username)+':'+encodeURIComponent(config.auth.viewer.password)
                    +'@localhost/source -vf scale=1280:720 '+transposeStr+' -pix_fmt yuv420p -c:v libx264 -preset ultrafast -b:v 600k -max_muxing_queue_size 1024 -f rtsp rtsp://'
                    + encodeURIComponent(config.auth.viewer.username)+':'+encodeURIComponent(config.auth.viewer.password)+'@localhost/hd'
            },
            bodyType: 'json',
            logger,
        })
    }

    configureRtspStreams()

    const internalServer = new HttpServer({
        port: 8199,
        host: '127.0.0.1',
        logger,
        api: {
            routes: [
                {
                    method: 'POST',
                    path: '/video-uses-camera',
                    async handler(req, res) {
                        setCameraBusy('video')

                        req.once('close', () => {
                            setCameraBusy(null)
                        })
                    }
                },
                {
                    method: 'POST',
                    path: '/video-auth',
                    async handler(req, res) {
                        if (req.body.action === 'publish' && ['hd', 'fhd'].includes(req.body.path) && ['::1', '127.0.0.1'].includes(req.body.ip)) {
                            res.status(201).end()
                            return
                        }

                        if (req.body.action !== 'read') {
                            res.status(401).end()
                            return
                        }

                        if (req.body.path === 'source' && !['::1', '127.0.0.1'].includes(req.body.ip)) {
                            res.status(401).end()
                            return
                        }

                        if (!config.auth.publicView) {
                            if (!server.getAuth().validate(req.body.user, req.body.password, ['view'])) {
                                res.status(401).end()
                                return
                            }
                        }

                        res.status(201).end()
                    }
                }
            ]
        }
    })

    const server = new HttpServer({
        port: 80,
        logger,
        auth: {
            users: [
                {
                    username: config.auth.viewer.username,
                    password: config.auth.viewer.password,
                    roles: ['view', 'shutter-read', 'rotate-read', 'infos']
                },
                {
                    username: config.auth.admin.username,
                    password: config.auth.admin.username,
                    roles: ['all']
                }
            ],
            extendedRoles: {
                shutter: ['shutter-read', 'shutter-write'],
                rotate: ['rotate-read', 'rotate-write'],
                all: ['view', 'shutter', 'system-write', 'rotate', 'infos']
            }
        },
        webUi: {
            filesPath: 'ui',
            auth: {
                required: !config.auth.publicView,
                roles:['view']
            }
        },
        api: {
            routes: [
                {
                    method: 'POST',
                    path: '/rotate',
                    auth: {
                        roles: ['rotate-write']
                    },
                    inputBodySchema: {
                        enum: ['none', 'counterclockwise', 'clockwise', 'reverse']
                    },
                    async handler(req, res) {
                        await rotate(req.body)
                        res.status(201).end()
                    }
                },
                {
                    method: 'GET',
                    path: '/infos',
                    auth: {
                        required: !config.auth.publicView,
                        roles: ['infos']
                    },
                    async handler(req, res) {
                        const host = req.get('host')
                        const viewerUrlCred = config.auth.publicView
                            ? host
                            : encodeURIComponent(config.auth.viewer.username)+':'+encodeURIComponent(config.auth.viewer.password) + '@' + host

                        const auth = req.auth || {}

                        res.send(JSON.stringify({
                            imageUrls: {
                                fhd: 'http://' + viewerUrlCred + '/fhd.jpg',
                                hd: 'http://' + viewerUrlCred + '/hd.jpg',
                            },
                            videoUrls: {
                                rtsp: {
                                    fhd: 'rtsp://' + viewerUrlCred + '/fhd',
                                    hd: 'rtsp://' + viewerUrlCred + '/hd'
                                },
                                hls: {
                                    fhd: 'http://' + viewerUrlCred + ':8888/fhd',
                                    hd: 'http://' + viewerUrlCred + ':8888/hd'
                                },
                                rtmp: {
                                    fhd: 'rtmp://' + viewerUrlCred + '/fhd',
                                    hd: 'rtmp://' + viewerUrlCred + '/hd'
                                }
                            },
                            actions: {
                                shutterWrite: server.getAuth().validate(auth.user, auth.password, ['shutter-write']),
                                rotateWrite: server.getAuth().validate(auth.user, auth.password, ['rotate-write']),
                                system: server.getAuth().validate(auth.user, auth.password, ['system-write'])
                            }
                        }))
                    }
                },
                {
                    method: 'GET',
                    path: '/rotate',
                    auth: {
                        required: !config.auth.publicView,
                        roles: ['rotate-read']
                    },
                    async handler(req, res) {
                        res.send(JSON.stringify(state.rotate))
                    }
                },
                {
                    method: 'POST',
                    inputBodySchema: {
                        type: 'string'
                    },
                    path: '/shutter/auto-wait',
                    auth: {
                        roles: ['shutter-write']
                    },
                    async handler(req, res) {
                        state.shutterAutoWaitBeforeClose = req.body
                        res.status(201).end()
                    }
                },
                {
                    method: 'GET',
                    path: '/shutter/auto-wait',
                    auth: {
                        required: !config.auth.publicView,
                        roles: ['shutter-read']
                    },
                    async handler(req, res) {
                        res.send(JSON.stringify(state.shutterAutoWaitBeforeClose))
                    }
                },
                {
                    method: 'POST',
                    path: '/system',
                    auth: {
                        roles: ['system-write']
                    },
                    inputBodySchema: {
                        enum: ['halt', 'reboot']
                    },
                    async handler(req, res) {
                        res.status(201).end()

                        const mapping = {
                            halt: 'o',
                            reboot: 'b'
                        }

                        await runProcess({
                            command: 'echo '+mapping[req.body]+' > /sysrq',
                            logger
                        }, true)
                    }
                },
                {
                    method: 'POST',
                    path: '/shutter',
                    inputBodySchema: { enum: ['open', 'closed', 'auto'] },
                    auth: {
                        roles: ['shutter-write']
                    },
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
                    auth: {
                        required: !config.auth.publicView,
                        roles: ['view']
                    },
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
                                    '-hide_banner', '-loglevel', 'error',
                                    '-i', 'http://' + encodeURIComponent(config.auth.viewer.username)+':'+encodeURIComponent(config.auth.viewer.password)+'@localhost:8888/source/stream.m3u8',
                                    '-ss', '00:00:01.000',
                                    '-f', 'image2',
                                    '-frames:v', '1',
                                    '-vf', 'scale=' + size.join(':')
                                ].concat(
                                    state.rotate.includes('clockwise')
                                        ? ['-vf', 'transpose=' + (state.rotate === 'clockwise' ? 1 : 2)]
                                        : []
                                )
                                .concat(['-q:v', ffmpegQuality, '-']
                                ),
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
                                    ].concat(state.rotate === 180 ? ['--hflip', '1', '--vflip', '1']: [])
                                    .concat(
                                        state.rotate.includes('clockwise')
                                            ? ['|', 'ffmpeg', '-hide_banner', '-loglevel', 'error', '-i', '-','-f', 'image2', '-vf', 'transpose=' + (state.rotate === 'clockwise' ? 1 : 2), '-']
                                            : []
                                        )
                                    .join(' '),
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

    internalServer.start()
    server.start()

    logger.info('My Own Camera IP started. Welcome !')

    handleExitSignals(() => {
        logger.info('bye bye')
        internalServer.stop()
        server.stop()
        if (blinker) {
            blinker.stopBlink()
        }
        if (shutter) {
            shutter.close()
        }
    })

})()
