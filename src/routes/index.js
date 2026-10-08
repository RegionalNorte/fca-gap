const express = require('express');
const pool = require('../db/pool');
const { autenticar } = require('../middlewares/auth');

const router = express.Router();

router.get('/health', async (req, res, next) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', db: 'conectado' });
  } catch (err) {
    next(err);
  }
});

// Login e convite são as únicas rotas públicas; todo o resto exige token.
router.use('/auth', require('./auth'));

router.use(autenticar);

router.use('/regionais', require('./regionais'));
router.use('/areas', require('./areas'));
router.use('/unidades', require('./unidades'));
router.use('/usuarios', require('./usuarios'));
router.use('/fatos', require('./fatos'));
router.use('/causas', require('./causas'));
router.use('/acoes', require('./acoes'));
router.use('/dashboard', require('./dashboard'));

module.exports = router;
