module.exports = function(app){
    var views = app.views,
        actions = app.actions,
        behaviours = app.behaviours;

    function createPageBehaviours(){
        var fetchHomepageContent = new actions.ajax();
        fetchHomepageContent.url.value = 'homeText.html';
        fetchHomepageContent.target.binding = '[/homeText]';
        fetchHomepageContent.dataType = 'text';

        var onLoad = new behaviours.pageLoad();
        onLoad.actions.load = [fetchHomepageContent];

        return [onLoad];
    }

    function createHomePage(){

        var homeText = new views.html();
        homeText.html.binding = '[/homeText]';

        var welcomeSection = new views.container();
        welcomeSection.tagName = 'section';
        welcomeSection.views.content.add([
            homeText
        ]);

        var homePage = new views.container();
        homePage.classes.value = 'home';
        homePage.views.content.add([
            welcomeSection
        ]);
        homePage.behaviours = createPageBehaviours();

        return homePage;
    }

    return createHomePage();

};