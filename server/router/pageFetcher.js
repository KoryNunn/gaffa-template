var statham = require('statham'),
    pageCache = {},
    addEventListener = function(){},
    window = {
        addEventListener: addEventListener,
        document: {
            addEventListener: addEventListener
        }
    };

GLOBAL.window = window;
GLOBAL.document = window.document;


function buildPage(pageName){
    var app = require('../../public/scripts/app'),
        page = {
            views: [require('../../public/scripts/pages/' + pageName)(app)]
        };

    return statham.stringify(page);
}

function getPage(pageName){
    delete require.cache[require.resolve('../../public/scripts/pages/' + pageName)];
    delete require.cache[require.resolve('../../public/scripts/app')];
    //if(!pageCache[pageName]){
        pageCache[pageName] = buildPage(pageName);
    //}
    return pageCache[pageName];
}

module.exports = getPage;