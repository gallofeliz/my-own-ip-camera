const HttpServer = require('@gallofeliz/js-libs/http-server').default
const createLogger = require('@gallofeliz/js-libs/logger').default
const {handleExitSignals} = require('@gallofeliz/js-libs/exit-handle')

const server = new HttpServer({
    port: 80,
    logger: createLogger('info'),
    api: {
        routes: [
{
method: 'GET',
path: '/fhd',
handler(req, res) {
   res.end('Hello')
}
}
        ]
    }
})

server.start()

 handleExitSignals(() => server.stop())
