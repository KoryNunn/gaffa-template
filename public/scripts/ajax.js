var url = require('url');

module.exports = function(gaffa){
    var oldAjax = gaffa.ajax;
    gaffa.ajax = function(settings){
        var oldError = settings.error,
            targetUrl = window.location.toString();

        settings.error = function(error){

            if(error.target.status === 401){
                var responseData = JSON.parse(error.target.response);

                if(responseData.redirect){
                    if(responseData.message){
                        gaffa.model.set('[redirectMessage]', responseData.message);
                        gaffa.model.set('[targetUrl]', targetUrl);
                    }
                    gaffa.navigate(responseData.redirect);
                    return;
                }
            }

            if(error.target.status === 422){
                var responseData = JSON.parse(error.target.response);

                // ToDo: alert the user of errors.
            }
            oldError && oldError.apply(this, arguments);
        };

        return oldAjax(settings);
    };
};