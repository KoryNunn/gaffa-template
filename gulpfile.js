var gulp = require('gulp'),
    stylus = require('gulp-stylus'),
    concat = require('gulp-concat'),
    source = require('vinyl-source-stream');
    browserify = require('browserify'),
    fs = require('fs'),
    path = require('path'),
    viewBuilder = require('gaffa-viewbuilder'),
    ieify = require('ieify'),
    kgo = require('kgo'),
    nodeStatic = require('node-static');

gulp.task('styles', function() {
    gulp.src('./styles/index.styl')
        .pipe(stylus({
            compress: true
        }))
        .pipe(gulp.dest('./build'));
});

gulp.task('build', function() {
    browserify('./scripts/index.js')
        .bundle()
        .on('error', function(error){
            console.log(error);
        })
        .pipe(ieify())
        .pipe(source('index.js'))
        .pipe(gulp.dest('./build/'));
});

gulp.task('pages', function() {
    kgo
    ('files' ,fs.readdir.bind(fs, './scripts/pages'))
    (['files'], function(files, done){
        files = files.filter(function(file) {
            return path.extname(file) === '.js';
        }).forEach(function(file) {
            var pagePath = './scripts/pages/' + file,
                baseName = path.basename(pagePath, '.js');

            delete require.cache[require.resolve(pagePath)];

            var page = require(pagePath);

            fs.writeFile(path.join(
                './build/pages',
                baseName + '.json'
            ), JSON.stringify(page()), function(error){
                if(error){
                    console.log(error);
                }else{
                    console.log('Built ' + baseName);
                }
            });
        });
    });
});

gulp.task('watch', function () {
   gulp.watch(['./styles/**/*.styl'], ['styles']);
   gulp.watch(['./scripts/**/*.js', '!./scripts/pages/*.js'], ['pages']);
   gulp.watch(['./scripts/**/*.js'], ['pages']);
});

gulp.task('serve', function () {
    var file = new nodeStatic.Server('./');

    require('http').createServer(function (request, response) {
        request.addListener('end', function () {
            //
            // Serve files!
            //
            file.serve(request, response);
        }).resume();
    }).listen(8080);
});

gulp.task('default', ['watch', 'styles', 'build', 'pages', 'serve']);