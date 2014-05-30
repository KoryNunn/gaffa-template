var gulp = require('gulp'),
    stylus = require('gulp-stylus'),
    concat = require('gulp-concat'),
    source = require('vinyl-source-stream');
    browserify = require('browserify'),
    fs = require('fs'),
    path = require('path'),
    viewBuilder = require('gaffa-viewbuilder'),
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
        .pipe(source('index.js'))
        .pipe(gulp.dest('./build/'))
        .on('end', function(){
            fs.readdir('./scripts/pages', function(error, files){
                if(error){
                    console.error(error);
                    return;
                }

                files = files.filter(function(file) {
                    return path.extname(file) === '.js';
                });

                var paths = files.map(function(file) {
                    return './scripts/pages/' + file;
                });

                viewBuilder(paths, function(error, views){
                    if(error){
                        return console.log(error);
                    }
                    views.forEach(function(view){
                        var baseName = path.basename(view.sourcePath, '.js');
                        fs.writeFile(path.join(
                            './build/pages',
                            baseName + '.json'
                        ), view.result, function(error){
                            if(error){
                                console.log(error);
                            }else{
                                console.log('Built ' + baseName);
                            }
                        });
                    });
                });

            });
        });
});

gulp.task('watch', function () {
   gulp.watch(['./styles/**/*.styl'], ['styles']);
   gulp.watch(['./scripts/**/*.js'], ['build']);
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

gulp.task('default', ['watch', 'styles', 'build', 'serve']);