module.exports = function(){
    var app = require('../app'),
        views = app.views,
        actions = app.actions,
        behaviours = app.behaviours;

    function createPageBehaviours(){
        var fetchHomepageContent = new actions.Ajax();
        fetchHomepageContent.url.value = 'homeText.html';
        fetchHomepageContent.target.binding = '[/homeText]';
        fetchHomepageContent.dataType = 'text';

        var onLoad = new behaviours.PageLoad();
        onLoad.actions.load = [fetchHomepageContent];

        return [onLoad];
    }

    function createHomePage(){

        var homeText = new views.Html();
        homeText.html.binding = '[/homeText]';

        var welcomeSection = new views.Container();
        welcomeSection.tagName = 'section';
        welcomeSection.views.content.add([
            homeText
        ]);

        var homePage = new views.Container();
        homePage.classes.value = 'home';
        homePage.views.content.add([
            welcomeSection
        ]);
        homePage.behaviours = createPageBehaviours();

        return homePage;
    }

    return {
        views: [createHomePage()]
    };

};