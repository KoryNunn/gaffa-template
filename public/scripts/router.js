var Router = require('route-tree');

module.exports = new Router({
    '/': 'home',
    '/signin': 'signin',
    '/something': 'something',
    '/majigger': 'majigger',
    '/whatsits': 'whatsits'
});