// routes/legalRoutes.js
const express = require('express');
const router = express.Router();

router.get('/privacy-policy', (req, res) => {
  res.render('legal/privacy');
});

router.get('/terms-and-conditions', (req, res) => {
  res.render('legal/terms');
});

module.exports = router;
