const {
  router,
  get
} = require('microrouter')

const gplay = require('google-play-scraper');
const path = require('path');
const qs = require('querystring');
var proxyAgent = require('proxy-agent');

const toList = (apps) => ({
  results: apps
});

const protocol = 'https'
const buildUrl = (req, subpath) => req.protocol || protocol + '://' + path.posix.join(req.headers['host'], subpath);

const gplayConstants = Object.keys(gplay).filter(k => typeof gplay[k] === 'object')

function queryObjToGplayConstants(queryObj) {
  Object.keys(queryObj)
    .filter(key => gplayConstants.indexOf(key) >= 0)
    .forEach(key => queryObj[key] = gplay[key][queryObj[key]] || queryObj[key])
  return queryObj
}

function errorHandler(error, res) {
  res.end(JSON.stringify({error}));
}

function applyProxy(req) {
  if (req.query.proxy && req.query.proxy.length > 0) {
    req.query.requestOptions = {
      agent: new proxyAgent(req.query.proxy),
      timeout: 9000
    }
    delete req.query.proxy
  }
}

module.exports = router(

  //get('/*', (req, res) => applyProxy(req)),

  get('/', (req, res) => {
    applyProxy(req);
    res.json({
      apps: buildUrl(req, 'apps'),
      developers: buildUrl(req, 'developers')
    })
  }),

  /* App search */
  get('/apps/', function (req, res) {
    applyProxy(req);
    if (req.query.q) {
      const opts = Object.assign({
        term: req.query.q
      }, req.query);

      gplay.search(opts)
        //.then((apps) => apps.map(cleanUrls(req)))
        .then(toList)
        .then(res.json)
        .catch(err => errorHandler(err, res));
    }
    /* Search suggest */
    else if (req.query.suggest) {
      gplay.suggest({
          term: req.query.suggest
        })
        .then((terms) => terms.map(toJSON))
        .then(toList)
        .then(res.json)
        .catch(err => errorHandler(err, res));
    }
    /* App list */
    else {
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
        .then(res.json)
        .catch(err => errorHandler(err, res));
    }
  }),

  /* App detail*/
  get('/apps/:appId', function (req, res) {
    applyProxy(req);
    const opts = Object.assign({
      appId: req.params.appId
    }, req.query);
    gplay.app(opts)
      //.then(cleanUrls(req))
      .then(res.json)
      .catch(err => errorHandler(err, res));
  }),

  /* Similar apps */
  get('/apps/:appId/similar', function (req, res) {
    applyProxy(req);
    const opts = Object.assign({
      appId: req.params.appId
    }, req.query);
    gplay.similar(opts)
      //.then((apps) => apps.map(cleanUrls(req)))
      .then(toList)
      .then(res.json)
      .catch(err => errorHandler(err, res));
  }),

  /* App permissions */
  get('/apps/:appId/permissions', function (req, res) {
    applyProxy(req);
    const opts = Object.assign({
      appId: req.params.appId
    }, req.query);
    gplay.permissions(opts)
      .then(toList)
      .then(res.json)
      .catch(err => errorHandler(err, res));
  }),

  /* App reviews */
  get('/apps/:appId/reviews', async function (req, res) {
    applyProxy(req);

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
      .then(res.json)
      .catch(err => errorHandler(err, res));
  }),

  /* Apps by developer */
  get('/developers/:devId/', function (req, res) {
    applyProxy(req);
    const opts = Object.assign({
      devId: req.params.devId
    }, req.query);

    gplay.developer(opts)
      //.then((apps) => apps.map(cleanUrls(req)))
      .then((apps) => ({
        devId: req.params.devId,
        apps
      }))
      .then(res.json)
      .catch(err => errorHandler(err, res));
  }),

  /* Developer list (not supported) */
  get('/developers/', (req, res) => {
    res.json({
      message: 'Please specify a developer id.',
      example: buildUrl(req, '/developers/' + qs.escape('DxCo Games'))
    })
  }),

  /* gplay categories */
  get('/categories/', (req, res) => {
    gplay.categories().then(res.json)
  })
);