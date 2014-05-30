var Router = require('route-tree');

module.exports = new Router({
    home:{
        _url: ['/', ''],
        something: {
            _url: '/#something'
        }
    }
});
module.exports.basePath = window.location.href.split('/').slice(0,-1).join('/');