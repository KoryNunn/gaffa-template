var pageFetcher = require('./pageFetcher'),
    path = require('path'),
    publicPath = './public',
    beeline = require('beeline');

module.exports = function addGaffaPageRoute(routes, route, page){

    routes['/' + page + '.json'] = function(request, response){
        response.end(pageFetcher(page));
    };

    routes[route] = beeline.staticFile(path.join(publicPath, 'index.html'), 'text/html');
};