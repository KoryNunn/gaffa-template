var Router = require('route-tree');

module.exports = new Router({
    home:{
        _url: ['/', ''],
        signin:{
            _url: '/signin'
        },
        something: {
            _url: '/something'
        },
        majigger: {
            _url: '/majigger'
        },
        whatsits: {
            _url: '/whatsits'
        }
    }
});