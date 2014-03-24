module.exports = {
    navigate : require('gaffa-navigate'),
    set : require('gaffa-set'),
    push : require('gaffa-push'),
    concat : require('gaffa-concat'),
    remove : require('gaffa-remove'),
    toggle : require('gaffa-toggle'),
    conditional : require('gaffa-conditional'),
    ajax : require('gaffa-ajax'),

    // custom
    back: require('./gaffaExtensions/actions/back')
};