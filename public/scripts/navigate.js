var url = require('url'),
    statham = require('statham');

module.exports = function(gaffa, router){
    var pageCache = {};

    function load(app, target){

        var targetView = gaffa.views;

        if(target){
            var targetParts = target.split('.'),
                targetName = targetParts[0],
                targetViewContainer = targetParts[1];

            targetView = gaffa.namedViews[targetName].views[targetViewContainer];
        }

        //clear state first
        if (app.views) {
            targetView.empty();
        }

        //set up state
        if (app.model) {
            gedi.set({});
            gaffa.model.set(app.model, null, null, false);
        }
        if (app.views) {
            for(var i = 0; i < app.views.length; i++) {
                app.views[i] = gaffa.initialiseViewItem(app.views[i], gaffa, gaffa.views.constructors);
            }
            targetView.add(app.views);
        }
        if (app.behaviours) {
            for(var i = 0; i < app.behaviours.length; i++) {
                app.behaviours[i] = initialiseBehaviour(app.behaviours[i], gaffa);
            }
            gaffa.behaviours.add(app.behaviours);
        }
    }

    function navigate(href, target, pushState, data) {

        // Data will be passed to the route as a querystring
        // but will not be displayed visually in the address bar.
        // This is to help resolve caching issues.

        // default target
        if(target === undefined){
            target = 'appBody.content';
        }

        function success (data) {
            var title;

            data.target = target;

            if(data !== undefined && data !== null && data.title){
                title = data.title;
            }

            // Always use pushstate unless triggered by onpopstate
            if(pushState !== false) {
                gaffa.pushState(data, title, href);
            }

            pageCache[href] = data;

            load(statham.revive(pageCache[href]), target);

            gaffa.notifications.notify("navigation.success");

            window.scrollTo(0,0);
        }

        function error(error){
            gaffa.notifications.notify("navigation.error", error);
        }

        function complete(){
            gaffa.notifications.notify("navigation.complete");
        }

        gaffa.notifications.notify("navigation.begin");

        if(gaffa.cacheNavigates !== false && pageCache[href]){
            success(statham.revive(pageCache[href]));
            complete();
            return;
        }

        gaffa.ajax({
            headers:{
                'x-gaffa': 'navigate'
            },
            cache: navigator.appName !== 'Microsoft Internet Explorer',
            url: router.find(href) + '.json',
            type: "get",
            data: data, // This is to avoid the cached HTML version of a page if you are bootstrapping.
            dataType: "json",
            success: success,
            error: error,
            complete: complete
        });
    };

    return navigate;

};