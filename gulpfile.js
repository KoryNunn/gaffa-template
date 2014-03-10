var gulp = require('gulp'),
    stylus = require('gulp-stylus'),
    concat = require('gulp-concat'),
    minify = require('gulp-uglify'),
    browserify = require('gulp-browserify');

gulp.task('styles', function() {
    gulp.src('./public/styles/index.styl')
        .pipe(stylus({
            compress: true
        }))
        .pipe(gulp.dest('./public/styles'));
});

gulp.task('build', function() {
    gulp.src(['./public/scripts/index.js'])
        .pipe(browserify({
          debug : false
        }))
        .pipe(concat('../build/app.browser.js'))
        .pipe(gulp.dest('./public/scripts'))
});

gulp.task('watch', function () {
   gulp.watch(['./public/styles/**/*.styl'], ['styles']);
   gulp.watch(['./public/scripts/**/*.js'], ['build']);
});

gulp.task('default', ['watch', 'styles', 'build']);