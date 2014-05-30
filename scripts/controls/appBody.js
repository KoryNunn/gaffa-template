module.exports = function(app){
    var views = app.views,
        actions = app.actions,
        behaviours = app.behaviours;

    function createAppBody(){
        var appBody = new views.Container();

        appBody.classes.value = 'appBody';
        appBody.name = 'appBody'

        return appBody;
    }

    return createAppBody();

};