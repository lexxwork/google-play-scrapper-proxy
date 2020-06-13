'use strict';

const connect = require('connect');
const connectRoute = require('connect-route');
const gplay = require('google-play-scraper');
const path = require('path');
const query = require('connect-query');
const qs = require('querystring');
var proxyAgent = require('proxy-agent');

const app = connect();

process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

const toList = (apps) => ({
  results: apps
});

const cleanUrls = (req) => (app) => Object.assign({}, app, {
  playstoreUrl: app.url,
  url: buildUrl(req, 'apps/' + app.appId),
  permissions: buildUrl(req, 'apps/' + app.appId + '/permissions'),
  similar: buildUrl(req, 'apps/' + app.appId + '/similar'),
  reviews: buildUrl(req, 'apps/' + app.appId + '/reviews'),
  developer: {
    devId: app.developer,
    url: buildUrl(req, 'developers/' + qs.escape(app.developer))
  }
});

const protocol = 'http'
const buildUrl = (req, subpath) => req.protocol || protocol + '://' + path.posix.join(req.headers['host'], subpath);

const gplayConstants = Object.keys(gplay).filter(k => typeof gplay[k] === 'object')

function queryObjToGplayConstants(queryObj) {
  Object.keys(queryObj)
    .filter(key => gplayConstants.indexOf(key) >= 0)
    .forEach(key => queryObj[key] = gplay[key][queryObj[key]] || queryObj[key])
  return queryObj
}

app.use(query())

/* return json  */
app.use(function (req, res, next) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.json = function (obj) {
    return res.end(JSON.stringify(obj))
  }
  next()
})

/* pass proxy */
app.use(function (req, res, next) {
  if (req.query.proxy && req.query.proxy.length > 0) {
    //const proxyParts = req.query.proxy.match(/^(?<proto>(https?|socks\d):\/\/)((?<userName>.*?):(?<password>.*?)@)?(?<host>[^:]+):(?<port>\d+)$/ ).groups;
    req.query.requestOptions = {
      agent: new proxyAgent(req.query.proxy),
      timeout: 10000
    }
    delete req.query.proxy
  }
  next()
})

app.use(connectRoute(function (router) {

  router.get('/', (req, res) =>
    res.json({
      apps: buildUrl(req, 'apps'),
      developers: buildUrl(req, 'developers')
    }));

  /* App search */
  router.get('/apps/', function (req, res, next) {
    if (!req.query.q) {
      return next();
    }

    const opts = Object.assign({
      term: req.query.q
    }, req.query);

    gplay.search(opts)
      //.then((apps) => apps.map(cleanUrls(req)))
      .then(toList)
      .then(res.json.bind(res))
      .catch(next);
  });

  /* Search suggest */
  router.get('/apps/', function (req, res, next) {
    if (!req.query.suggest) {
      return next();
    }

    const toJSON = (term) => ({
      term,
      url: buildUrl(req, '/apps/') + '?' + qs.stringify({
        q: term
      })
    });

    gplay.suggest({
        term: req.query.suggest
      })
      .then((terms) => terms.map(toJSON))
      .then(toList)
      .then(res.json.bind(res))
      .catch(next);
  });

  /* App list */
  router.get('/apps/', function (req, res, next) {
    function paginate(apps) {
      const num = parseInt(req.query.num || '60');
      const start = parseInt(req.query.start || '0');

      if (start - num >= 0) {
        req.query.start = start - num;
        apps.prev = buildUrl(req, '/apps/') + '?' + qs.stringify(req.query);
      }

      if (start + num <= 500) {
        req.query.start = start + num;
        apps.next = buildUrl(req, '/apps/') + '?' + qs.stringify(req.query);
      }

      return apps;
    }
    const query = queryObjToGplayConstants(req.query)
    gplay.list(query)
      //.then((apps) => apps.map(cleanUrls(req)))
      .then(toList).then(paginate)
      .then(res.json.bind(res))
      .catch(next);
  });

  /* App detail*/
  router.get('/apps/:appId', function (req, res, next) {
    const opts = Object.assign({
      appId: req.params.appId
    }, req.query);
    gplay.app(opts)
      //.then(cleanUrls(req))
      .then(res.json.bind(res))
      .catch(next);
  });

  /* Similar apps */
  router.get('/apps/:appId/similar', function (req, res, next) {
    const opts = Object.assign({
      appId: req.params.appId
    }, req.query);
    gplay.similar(opts)
      //.then((apps) => apps.map(cleanUrls(req)))
      .then(toList)
      .then(res.json.bind(res))
      .catch(next);
  });

  /* App permissions */
  router.get('/apps/:appId/permissions', function (req, res, next) {
    const opts = Object.assign({
      appId: req.params.appId
    }, req.query);
    gplay.permissions(opts)
      .then(toList)
      .then(res.json.bind(res))
      .catch(next);
  });

  /* App reviews */
  router.get('/apps/:appId/reviews', function (req, res, next) {
    function paginate(apps) {
      const page = parseInt(req.query.page || '0');

      const subpath = '/apps/' + req.params.appId + '/reviews/';
      if (page > 0) {
        req.query.page = page - 1;
        apps.prev = buildUrl(req, subpath) + '?' + qs.stringify(req.query);
      }

      if (apps.results.length) {
        req.query.page = page + 1;
        apps.next = buildUrl(req, subpath) + '?' + qs.stringify(req.query);
      }

      return apps;
    }
    const query = queryObjToGplayConstants(req.query)
    const opts = Object.assign({
      appId: req.params.appId
    }, query);
    gplay.reviews(opts)
      .then(toList)
      .then(paginate)
      .then(res.json.bind(res))
      .catch(next);
  });

  /* Apps by developer */
  router.get('/developers/:devId/', function (req, res, next) {
    const opts = Object.assign({
      devId: req.params.devId
    }, req.query);

    gplay.developer(opts)
      //.then((apps) => apps.map(cleanUrls(req)))
      .then((apps) => ({
        devId: req.params.devId,
        apps
      }))
      .then(res.json.bind(res))
      .catch(next);
  });

  /* Developer list (not supported) */
  router.get('/developers/', (req, res) =>
    res.json({
      message: 'Please specify a developer id.',
      example: buildUrl(req, '/developers/' + qs.escape('DxCo Games'))
    }));

  /* gplay categories */
  router.get('/categories/', (req, res) =>
    gplay.categories().then(res.json)
  )

  function errorHandler(err, req, res, next) {
    res.json({
      message: err.message
    });
    next();
  }

  app.use(errorHandler);

}));

//const server = https.createServer(app)

app.listen(3000)

console.log('server started at http://locahost:3000');

