var Gaffa = require('gaffa'),
    app = require('./app'),
    bootstrapper = require('./bootstrapper'),
    gaffa = app.gaffa,
    router = require('./router'),
    navigate = require('./navigate')(gaffa, router);

// Debugging
window.gaffa = app.gaffa;

app.router = router;

require('./gelExtensions')(app);
require('./ajax')(app.gaffa);

gaffa.navigate = navigate;

gaffa.notifications.add('navigation', function(){
    gaffa.model.set('[currentPage]', router.find());
});

window.onpopstate = function(event){
    if(event.state){
        gaffa.navigate(window.location.toString(), event.state.target, false);
    }
};

window.addEventListener('load', function(){
    gaffa.model.set('[windowLoaded]', true);

    gaffa.views.add([
        require('./controls/appWrapper')(app)
    ]);

    bootstrapper(app);
});