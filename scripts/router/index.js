var Router = require('route-tree'),
    routes = require('./routes');

module.exports = function(){
    var app = require('../app'),
        router = new Router(routes);
    router.basePath = window.location.href.match(/(^[^?#]*)\/.*$/)[1];

    function updateRoute(){
        app.gaffa.model.set('[route/name]', router.find());
        app.gaffa.model.set('[route/values]', router.values());
    }

    window.addEventListener('hashchange', updateRoute);
    window.addEventListener('load', updateRoute);

    app.gaffa.gedi.bind('[route]', function(event){
        var route = event.getValue();

        if(!route){
            return;
        }

        var href = router.get(route.name, route.values);

        if(!href){
            console.error('No route was found named "' + route.name + '"');
            return;
        }

        if(href !== window.location.href){
            window.location.hash = href.slice(href.indexOf('#'));
        }
    });

    app.router = router;


    return router;
};
