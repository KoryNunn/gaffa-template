var statham = require('statham'),
    addEventListener = function(){},
    window = {
        addEventListener: addEventListener,
        document: {
            addEventListener: addEventListener
        }
    };

GLOBAL.window = window;
GLOBAL.document = window.document;

function buildPage(appPath, pagePath){
    delete require.cache[require.resolve(pagePath)];
    delete require.cache[require.resolve(appPath)];

    var app = require(appPath),
        page = {
            views: [require(pagePath)(app)]
        };

    return statham.stringify(page);
}

module.exports = buildPage;