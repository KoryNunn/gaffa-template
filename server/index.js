var http = require('http'),
    config = require('./config'),
    router = require('./router'),
    retorter = require('./router/retorter'),
    port = config.port || 8080,
    server = http.createServer();

server.on('request', function(request, response){
    retorter.retort(request, response);
    router(request, response);
});

server.listen(port, function(error){
    if(error){
        logger.error(error);
        return process.exit(-1);
    }

    console.log('Listening on port: ' + port);
});