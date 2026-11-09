// „Über <Site>“ unter /ueber-<site-code>, z. B. /ueber-tri-hotel (Inhalt je Site, siehe services/about.js)
const express = require('express');
const about = require('../services/about');

const router = express.Router();

router.get('/ueber-:code', (req, res, next) => {
  if (!req.site || req.params.code !== req.site.code) return next();
  const page = about.viewData(req.site, req.hostRanking, res.locals.siteUrl);
  if (!page) return next();
  res.render(page.view, page.locals);
});

module.exports = router;
