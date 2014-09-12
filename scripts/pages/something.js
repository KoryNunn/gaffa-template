module.exports = function(){
    var app = require('../app'),
        views = app.views,
        actions = app.actions,
        behaviours = app.behaviours;

    function createSomeForm(){
        var someHeading = new views.Heading();
        someHeading.level = 2;
        someHeading.text.binding = '(join ": " "Some value is" [someValue])';

        var someTexbox = new views.Textbox();
        someTexbox.updateEventName = 'keyup';
        someTexbox.value.binding = '[someValue]';

        var someAction = new actions.Remove();
        someAction.target.binding = '[someValue]';

        var someButton = new views.Button();
        someButton.text.value = 'Delete value';
        someButton.actions.click = [someAction];

        var someButton2 = new views.Button();
        someButton2.text.value = 'Delete value 2';
        someButton2.actions.click = [someAction];

        var form = new views.Form();
        form.views.content.add([
            someHeading,
            someTexbox,
            someButton,
            someButton2
        ]);

        return form;
    }

    function createSomePage(){
        var somePage = new views.Container(),
            welcomeSection = new views.Container(),
            homeText = new views.Label();

        homeText.tagName = 'p';
        homeText.text.value = 'Some page';

        welcomeSection.tagName = 'section';
        welcomeSection.views.content.add([
            homeText
        ]);

        somePage.classes.value = 'home';
        somePage.views.content.add([
            welcomeSection,
            createSomeForm()
        ]);

        return somePage;
    }

    return createSomePage();

};