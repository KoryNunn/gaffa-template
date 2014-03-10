var beeline = require('beeline'),
    publicPath = './public',
    path = require('path');

module.exports = function(routes){
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
    });
};