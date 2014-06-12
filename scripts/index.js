var Gaffa = require('gaffa'),
    app = require('./app'),
    gaffa = app.gaffa,
    router = require('./router'),
    url = require('url');

// Debugging
window.gaffa = app.gaffa;

// A custom router
app.router = router;

// Add extra gel functions
require('./gelExtensions')(app);

// Define what the default target is for navigation
gaffa.navigateTarget = 'appBody.content';

// Override how gaffa finds content pages
gaffa.createNavigateUrl = function(href){
    return 'build/pages/' + router.find(url.resolve(window.location.hostname, href)) + '.json';
};

// Store the current page name in the model, after navigating
gaffa.on('navigate.success', function(){
    gaffa.model.set('[currentPage]', router.find());
});

// Treat hash changes as navigation
window.onhashchange = function(){
   gaffa.navigate(window.location.href);
};

window.addEventListener('load', function(){

    // Add views to gaffa
    gaffa.views.add([
        require('./controls/appWrapper')(app)
    ]);

    // Navigate to the page associated with the current URL
    gaffa.navigate(window.location.href);
});