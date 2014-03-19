var http = require('http'),
    config = require('./config'),
    router = require('./router'),
    port = config.port || 8080,
    server = http.createServer();

server.on('request', router);

server.listen(port, function(error){
    if(error){
        console.error(error);
        return process.exit(-1);
    }

    console.log('Listening on port: ' + port);
});