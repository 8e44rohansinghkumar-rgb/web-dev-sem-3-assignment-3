const express = require('express');
const router = express.Router();

/**
 * Simple liveness/readiness probe so the API is easy to smoke-test.
 */
router.get('/', (req, res) => {
  res.json({
    status: 'ok',
    service: 'Inventory & Data Management API',
    uptime: Number(process.uptime().toFixed(2)),
    timestamp: new Date().toISOString(),
  });
});

module.exports = router;
