var Gaffa = require('gaffa');

function Back(){
}
Back = Gaffa.createSpec(Back, Gaffa.Action);

Back.prototype.type = 'back';
Back.prototype.trigger = function(){
    window.history.back();
};

module.exports = Back;