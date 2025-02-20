'use strict';

var express = require('express'),
    path = require('path'),
    superagent = require('superagent'),
    bodyParser = require('body-parser'),
    lastMile = require('connect-lastmile'),
    Dom = require('xmldom').DOMParser,
    xpath = require('xpath'),
    config = require('./config.js'),
    users = require('./routes/users.js'),
    files = require('./routes/files.js'),
    shares = require('./routes/shares.js'),
    office = require('./routes/office.js'),
    webdav = require('./routes/webdav.js'),
    preview = require('./routes/preview.js'),
    multipart = require('./routes/multipart.js'),
    morgan = require('morgan'),
    HttpError = require('connect-lastmile').HttpError,
    HttpSuccess = require('connect-lastmile').HttpSuccess;

exports = module.exports = {
    init
};

function init(callback) {
    var app = express();
    var router = new express.Router();

    app.set('json spaces', 2); // pretty json

    // for rate limiting
    app.enable('trust proxy');

    app.use(morgan(function (tokens, req, res) {
        return [
            tokens.method(req, res),
            tokens.url(req, res).replace(/(access_token=)[^&]+/, '$1' + '<redacted>'),
            tokens.status(req, res),
            res.errorBody ? res.errorBody.status : '',  // attached by connect-lastmile. can be missing when router errors like 404
            res.errorBody ? res.errorBody.message : '', // attached by connect-lastmile. can be missing when router errors like 404
            tokens['response-time'](req, res), 'ms', '-',
            tokens.res(req, res, 'content-length')
        ].join(' ');
    }, {
        immediate: false,
        // only log failed requests by default
        // skip: function (req, res) { return res.statusCode < 400; }
    }));

    router.del = router.delete; // amend router.del for readability further on

    router.post('/api/v1/login', users.login);
    router.get ('/api/v1/profile', users.tokenAuth, users.profile);
    router.get ('/api/v1/config', users.tokenAuth, async function (req, res, next) {
        // currently we only send configs for collabora

        const tmp = {
            viewers: {}
        };

        const collaboraHost = config.get('collabora.host', '');
        if (collaboraHost) {
            let result;
            try {
                result = await superagent.get(`${collaboraHost}/hosting/discovery`);
            } catch (error) {
                console.error('Failed to get collabora config.', error);
            }

            var doc = new Dom().parseFromString(result.text);
            if (doc) {
                var nodes = xpath.select("/wopi-discovery/net-zone/app/action", doc);
                if (nodes) {
                    const extensions = nodes.map(function (n) { return n.getAttribute('ext'); }).filter(function (e) { return !!e; });
                    tmp.viewers.collabora = { extensions };
                }
            }
        }

        next(new HttpSuccess(200, tmp));
    });

    router.get ('/api/v1/users', users.tokenAuth, users.list);

    router.get ('/api/v1/recent', users.tokenAuth, files.recent);

    router.head('/api/v1/files', users.tokenAuth, files.head);
    router.get ('/api/v1/files', users.tokenAuth, files.get);
    router.post('/api/v1/files', users.tokenAuth, multipart({ maxFieldsSize: 2 * 1024, limit: '512mb', timeout: 3 * 60 * 1000 }), files.add);
    router.put ('/api/v1/files', users.tokenAuth, files.update);
    router.del ('/api/v1/files', users.tokenAuth, files.remove);

    router.get ('/api/v1/shares', users.tokenAuth, shares.listShares);
    router.post('/api/v1/shares', users.tokenAuth, shares.createShare);
    router.del ('/api/v1/shares', users.tokenAuth, shares.removeShare);

    router.head('/api/v1/shares/:shareId', users.optionalTokenAuth, shares.attachReceiver, shares.head);
    router.get ('/api/v1/shares/:shareId', users.optionalTokenAuth, shares.attachReceiver, shares.get);
    router.post('/api/v1/shares/:shareId', users.optionalTokenAuth, shares.attachReceiver, multipart({ maxFieldsSize: 2 * 1024, limit: '512mb', timeout: 3 * 60 * 1000 }), shares.add);
    router.put ('/api/v1/shares/:shareId', users.optionalTokenAuth, shares.attachReceiver, shares.update);
    router.del ('/api/v1/shares/:shareId', users.optionalTokenAuth, shares.attachReceiver, shares.remove);

    router.get ('/api/v1/preview/:type/:id/:hash', users.optionalTokenAuth, preview.get);

    router.get ('/api/v1/office/handle', users.tokenAuth, office.getHandle);
    router.get ('/api/v1/office/wopi/files/:shareId', users.tokenAuth, office.checkFileInfo);
    router.get ('/api/v1/office/wopi/files/:shareId/contents', users.tokenAuth, office.getFile);
    router.post('/api/v1/office/wopi/files/:shareId/contents', users.tokenAuth, bodyParser.raw(), office.putFile);

    app.use('/api/healthcheck', function (req, res) { res.status(200).send(); });
    app.use('/api', bodyParser.json());
    app.use('/api', bodyParser.urlencoded({ extended: false, limit: '100mb' }));
    app.use(webdav.express());
    app.use(router);
    app.use('/', express.static(path.resolve(__dirname, '../dist')));

    app.use(lastMile());

    var server = app.listen(3000, function () {
        var host = server.address().address;
        var port = server.address().port;

        console.log(`Listening on http://${host}:${port}`);

        callback(null);
    });
}
