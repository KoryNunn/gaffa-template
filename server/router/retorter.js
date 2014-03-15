var Retort = require('retort'),
    retorter = new Retort({
        ok: function(request, response, data, isNotJson){
            response.statusCode = 200;
            response.end(isNotJson ? data + '' : JSON.stringify(data));
        },
        forbidden: function(request, response, message, isNotJson){
            response.statusCode = 403;
            response.end(isNotJson ? message + '' : JSON.stringify(message));
        },
        unauthorised: function(request, response, message, isNotJson){
            response.statusCode = 301;
            response.end(isNotJson ? message + '' : JSON.stringify(message));
        },
        error: function(request, response, error, isNotJson){
            response.statusCode = 500;
            response.end(isNotJson ? error + '' : JSON.stringify(error));
        },
        redirect: function(request, response, location){
            response.statusCode = 302;
            response.setHeader('Location', location);
            response.end();
        }
    });

module.exports = retorter;
