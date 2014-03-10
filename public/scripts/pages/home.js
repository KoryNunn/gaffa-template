module.exports = function(app){
    var views = app.views,
        actions = app.actions,
        behaviours = app.behaviours;

    function createHomePage(){
        var homePage = new views.container(),
            welcomeSection = new views.container(),
            homeText = new views.label();

        homeText.tagName = 'p';
        homeText.text.value = 'Welcome to my awesome gaffa app';

        welcomeSection.tagName = 'section';
        welcomeSection.views.content.add([
            homeText
        ]);

        homePage.classes.value = 'home';
        homePage.views.content.add([
            welcomeSection
        ]);

        return homePage;
    }

    return createHomePage();

};