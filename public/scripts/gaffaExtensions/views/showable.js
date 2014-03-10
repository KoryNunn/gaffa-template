var Gaffa = require('gaffa'),
    Flap = require('flaps'),
    crel = require('crel'),
    venfix = require('venfix'),
    doc = require('doc-js');

function Showable(){
}
Showable = Gaffa.createSpec(Showable, Gaffa.ContainerView);

Showable.prototype.type = 'showable';
Showable.prototype.show = new Gaffa.Property({
    update:function(view, value){
        if(value){
            view.flap.open();
        }else{
            view.flap.close();
        }
    },
    value:false
});
Showable.delegateTarget = 'body';
Showable.prototype.render = function(){
    var view = this,
        modal,
        content,
        mask,
        renderedElement = crel('div', {'class':'showableWrapper'},
            content = crel('div', {'class':'showable'}),
            mask = crel('div', {'class':'mask'})
        ),
        flap = new Flap(renderedElement);

    flap.width = 280;
    flap.delegateTarget = this.delegateTarget;
    flap.on('settle', function(){
        view.show.set(flap.state === 'open');
    });
    flap.on('move', function(){
        mask.style[venfix('transform')] = 'translate3d(' + -(100 - this.percentOpen()) + '%,0,0)';
    });
    flap.on('ready', function(){
        setTimeout(resize,300);
    });

    this.flap = flap;

    this.views.content.element = content;

    this.renderedElement = renderedElement;

    function resize(){
        if(window.innerWidth >= 600){
            flap.disable();
        }else{
            flap.enable();
        }
    }

    window.addEventListener('resize', resize);
};

module.exports = Showable;