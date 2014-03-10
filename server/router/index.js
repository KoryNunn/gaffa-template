var beeline = require('beeline'),
    routes = {};

require('./pageRoutes')(routes);
require('./staticRoutes')(routes);

module.exports = beeline.route(routes);