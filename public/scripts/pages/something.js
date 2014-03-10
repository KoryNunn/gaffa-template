module.exports = function(app){
    var views = app.views,
        actions = app.actions,
        behaviours = app.behaviours;

    function createSomeForm(){
        var someHeading = new views.heading();
        someHeading.level = 2;
        someHeading.text.binding = '(join ": " "Some value is" [someValue])';

        var someTexbox = new views.textbox();
        someTexbox.updateEventName = 'keyup';
        someTexbox.value.binding = '[someValue]';

        var someAction = new actions.remove();
        someAction.target.binding = '[someValue]';

        var someButton = new views.button();
        someButton.text.value = 'Delete value';
        someButton.actions.click = [someAction];

        var someButton2 = new views.button();
        someButton2.text.value = 'Delete value 2';
        someButton2.actions.click = [someAction];

        var form = new views.form();
        form.views.content.add([
            someHeading,
            someTexbox,
            someButton,
            someButton2
        ]);

        return form;
    }

    function createSomePage(){
        var somePage = new views.container(),
            welcomeSection = new views.container(),
            homeText = new views.label();

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