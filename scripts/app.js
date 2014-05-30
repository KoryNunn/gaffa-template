var app = {},
    Gaffa = require('gaffa'),
    gaffa = new Gaffa(),
    views = app.views = require('./views'),
    actions = app.actions = require('./actions'),
    behaviours = app.behaviours = require('./behaviours');

for(var key in views){
    gaffa.registerConstructor(views[key]);
}

for(var key in actions){
    gaffa.registerConstructor(actions[key]);
}

for(var key in behaviours){
    gaffa.registerConstructor(behaviours[key]);
}

app.gaffa = gaffa;

module.exports = app;