var gulp = require('gulp'),
    stylus = require('gulp-stylus'),
    concat = require('gulp-concat'),
    minify = require('gulp-uglify'),
    browserify = require('gulp-browserify'),
    fs = require('fs'),
    pagebuilder = require('./pagebuilder');

gulp.task('styles', function() {
    gulp.src('./public/styles/index.styl')
        .pipe(stylus({
            compress: true
        }))
        .pipe(gulp.dest('./public/build'));
});

gulp.task('build', function() {
    gulp.src(['./public/scripts/index.js'])
        .pipe(browserify({
          debug : false
        }))

        // Comment this line out for development
        //.pipe(minify())

        .pipe(concat('../build/app.browser.js'))
        .pipe(gulp.dest('./public/scripts'))
        .on('end', function(){
            fs.readdir('./public/scripts/pages', function(error, files){
                if(error){
                    console.error(error);
                    return;
                }

                console.log(files);

                files.forEach(function(file){
                    var parts = file.split('.');
                    if(parts[1] !== 'js'){
                        return;
                    }

                    fs.writeFile('./public/build/pages/' + parts[0] + '.json', pagebuilder('./public/scripts/app', './public/scripts/pages/' + file), function(){
                        if(error){
                            console.error(error);
                        }
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