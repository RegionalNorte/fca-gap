const express = require('express');
const router = express.Router();
const controller = require('../controllers/dashboardController');
const { permitir } = require('../middlewares/auth');

router.get('/', permitir('admin', 'gestor_regional', 'gestor_area', 'gestor_unidade'), controller.resumo);

module.exports = router;
