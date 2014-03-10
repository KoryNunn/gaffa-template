var environmentName = process.env.NODE_ENV || 'development',
    config = require('./' + environmentName + '.json');

config.environmentName = environmentName;

module.exports = config;
