module.exports = {
    navigate : require('gaffa/actions/navigate'),
    set : require('gaffa/actions/set'),
    push : require('gaffa/actions/push'),
    concat : require('gaffa/actions/concat'),
    remove : require('gaffa/actions/remove'),
    generic : require('gaffa/actions/generic'),
    forEach : require('gaffa/actions/forEach'),
    toggle : require('gaffa/actions/toggle'),
    delay : require('gaffa/actions/delay'),
    conditional : require('gaffa/actions/conditional'),
    'switch' : require('gaffa/actions/switch'),
    clean : require('gaffa/actions/clean'),

    // custom

    back: require('./gaffaExtensions/actions/back'),

    // npm'd

    ajax : require('gaffa-ajax')
};