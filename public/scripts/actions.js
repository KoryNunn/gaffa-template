module.exports = {
    navigate : require('gaffa-navigate'),
    set : require('gaffa-set'),
    push : require('gaffa-push'),
    concat : require('gaffa-concat'),
    remove : require('gaffa-remove'),
    generic : require('gaffa-generic'),
    forEach : require('gaffa-for-each'),
    toggle : require('gaffa-toggle'),
    delay : require('gaffa-delay'),
    conditional : require('gaffa-conditional'),
    'switch' : require('gaffa-switch'),
    clean : require('gaffa-clean'),

    // custom

    back: require('./gaffaExtensions/actions/back'),

    // npm'd

    ajax : require('gaffa-ajax')
};