const express = require('express');
const router = express.Router();
const controller = require('../controllers/authController');
const { autenticar } = require('../middlewares/auth');

// Login (e-mail + senha) e definição de senha (primeiro acesso de
// convidado) — únicas rotas públicas da API.
router.post('/login', controller.login);
router.get('/convites/:token', controller.verConvite);
router.post('/convites/:token/aceitar', controller.aceitarConvite);

router.get('/me', autenticar, controller.me);

module.exports = router;
