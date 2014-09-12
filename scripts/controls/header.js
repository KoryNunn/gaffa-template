module.exports = function(app){
    var views = app.views,
        actions = app.actions,
        behaviours = app.behaviours;

    function createHeader(){
        var header = new views.Container(),
            actionRegion = new views.Container(),
            contextRegion = new views.Container(),
            isHomeAction = new actions.Switch(),
            back = new actions.Back(),
            toggleMenu = new actions.Toggle(),
            logo = new views.Image(),
            title = new views.Heading();

        title.text.value = 'My awesome app';
        logo.source.value = 'images/logo.png';

        header.classes.value = 'header';

        contextRegion.classes.binding = '(join " " "contextRegion" (? (== [currentPage] "home") "menu" "back"))';

        isHomeAction.switch.binding = '[currentPage]';
        isHomeAction.actions.home = [toggleMenu];
        isHomeAction.actions.default = [back];

        toggleMenu.target.binding = '[showMainMenu]';

        actionRegion.classes.value = 'actionRegion';
        actionRegion.views.content.add([
            contextRegion,
            logo,
            title
        ]);
        actionRegion.actions.click = [isHomeAction];

        header.views.content.add([
            actionRegion
        ]);

        return header;
    }

    return createHeader();

};