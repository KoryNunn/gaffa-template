var beeline = require('beeline'),
    routes = {};

require('./staticRoutes')(routes);

module.exports = beeline.route(routes);