module.exports = function(app){
    var views = app.views,
        actions = app.actions,
        behaviours = app.behaviours;

    function createAppBody(){
        var appBody = new views.Frame();

        appBody.classes.value = 'appBody';
        appBody.url.binding = '(router.get "page" [/route])';

        return appBody;
    }

    return createAppBody();

};