require('./polyfills');

var Gaffa = require('gaffa'),
    app = require('./app'),
    gaffa = app.gaffa,
    router = require('./router'),
    url = require('url');

// Debugging
window.gaffa = app.gaffa;

// A custom router
router();

// Add extra gel functions
require('./gelExtensions')(app);

window.addEventListener('load', function(){

    // Add views to gaffa
    gaffa.views.add([
        require('./controls/appWrapper')(app)
    ]);
});