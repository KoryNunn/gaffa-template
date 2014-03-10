var app = {},
    Gaffa = require('gaffa'),
    gaffa = new Gaffa(),
    views = gaffa.views.constructors = app.views = require('./views'),
    actions = gaffa.actions.constructors = app.actions = require('./actions'),
    behaviours = gaffa.behaviours.constructors = app.behaviours = require('./behaviours');

app.gaffa = gaffa;

module.exports = app;