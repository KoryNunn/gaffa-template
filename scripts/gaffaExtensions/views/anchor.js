var OldAnchor = require('gaffa-anchor'),
    crel = require('crel'),
    Gaffa = require('gaffa');

function Anchor(){}
Anchor = Gaffa.createSpec(Anchor, OldAnchor);
Anchor.prototype.render = function(){
    var textNode = document.createTextNode(''),
        renderedElement = crel('a',textNode),
        view = this;

    this.views.content.element = renderedElement;

    this.renderedElement = renderedElement;

    this.text.textNode = textNode;

    if(!this.external){
        // Prevent default click action reguardless of gaffa.event implementation
        renderedElement.onclick = function(event){
            if(event.button === 1){
                event.preventDefault();
            }
        };

        this.gaffa.events.on('click', renderedElement, function(event){
            if(event.button === 1){

                // Custom app-specific routing.
                view.gaffa.model.set('[/route]', {
                    name: view.gaffa.gedi.get('(router.find href)', {href: view.href.value}),
                    values: view.gaffa.gedi.get('(router.values href)', {href: view.href.value})
                });
            }
        });
    }
};
Anchor.prototype.route = new Gaffa.Property(function(view, value){
    view.href.set(view.gaffa.gedi.get('(router.get route.name route.values)', {
        route: value
    }));
});

module.exports = Anchor;