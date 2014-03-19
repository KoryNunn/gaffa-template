var beeline = require('beeline'),
    publicPath = './public';

module.exports = function(routes){
    routes['/'] = beeline.staticFile(publicPath + '/index.html', 'text/html', 0),
    routes['/`path...`'] = beeline.staticDir(publicPath, {
        '.txt': 'text/plain',
        '.html': 'text/html',
        '.css': 'text/css',
        '.xml': 'text/xml',
        '.gif': 'image/gif',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.ico': 'image/x-icon',
        '.js': 'application/javascript',
        '.json': 'application/json'
    }, 0);
};