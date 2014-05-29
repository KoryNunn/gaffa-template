var gulp = require('gulp'),
    stylus = require('gulp-stylus'),
    concat = require('gulp-concat'),
    source = require('vinyl-source-stream');
    browserify = require('browserify'),
    fs = require('fs'),
    path = require('path'),
    viewBuilder = require('gaffa-viewbuilder');

gulp.task('styles', function() {
    gulp.src('./public/styles/index.styl')
        .pipe(stylus({
            compress: true
        }))
        .pipe(gulp.dest('./public/build'));
});

gulp.task('build', function() {
    browserify('./public/scripts/index.js')
        .bundle()
        .on('error', function(error){
            console.log(error);
        })
        .pipe(source('index.js'))
        .pipe(gulp.dest('./public/build/'))
        .on('end', function(){
            fs.readdir('./public/scripts/pages', function(error, files){
                if(error){
                    console.error(error);
                    return;
                }

                files = files.filter(function(file) {
                    return path.extname(file) === '.js';
                });

                var paths = files.map(function(file) {
                    return './public/scripts/pages/' + file;
                });

                viewBuilder(paths, function(error, views){
                    if(error){
                        return console.log(error);
                    }
                    views.forEach(function(view){
                        var baseName = path.basename(view.sourcePath, '.js');
                        fs.writeFile(path.join(
                            './public/build/pages',
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
   gulp.watch(['./public/styles/**/*.styl'], ['styles']);
   gulp.watch(['./public/scripts/**/*.js'], ['build']);
});

gulp.task('default', ['watch', 'styles', 'build']);