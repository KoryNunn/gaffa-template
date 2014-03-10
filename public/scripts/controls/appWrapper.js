module.exports = function(app){
    var views = app.views,
        actions = app.actions,
        behaviours = app.behaviours;

    function createAppWrapper(){
        var wrapper = new views.container();

        wrapper.views.content.add([
            require('./header')(app),
            require('../controls/mainMenu')(app),
            require('./appBody')(app)
        ]);

        return wrapper;
    }

    return createAppWrapper();

};