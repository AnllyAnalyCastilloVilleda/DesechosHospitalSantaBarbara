// backend/src/routes/auth.routes.js
const router = require('express').Router();
const { login } = require('../controllers/auth.controller');

router.post('/usuarios/login', login);

module.exports = router;
