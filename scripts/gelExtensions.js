module.exports = function(app){
    require('gel-url')(app.gaffa.gedi.gel);

    app.gaffa.gedi.gel.scope.router = {
        get: function(scope, args){
            return app.router.get.apply(app.router, args.all());
        },
        find: function(scope, args){
            return app.router.find.apply(app.router, args.all());
        },
        upOne: function(scope, args){
            return app.router.upOne.apply(app.router, args.all());
        },
        isIn: function(scope, args){
            return app.router.isIn.apply(app.router, args.all());
        },
        values: function(scope, args){
            return app.router.values.apply(app.router, args.all());
        },
        drill: function(scope, args){
            return app.router.drill.apply(app.router, args.all());
        },
        to: function(scope, args){
            var newArgs = args.all();
            newArgs.unshift(null);
            return app.router.drill.apply(app.router, newArgs);
        }
    };
};