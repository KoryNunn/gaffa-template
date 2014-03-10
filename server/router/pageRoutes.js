var addGaffaPageRoute = require('./addGaffaPageRoute');

module.exports = function(routes){
    addGaffaPageRoute(routes, "/something", 'something', true);
    addGaffaPageRoute(routes, "/", 'home', true);
};