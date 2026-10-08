const express = require('express');
const router = express.Router();
const controller = require('../controllers/usuariosController');
const { permitir } = require('../middlewares/auth');

const PAPEIS_GESTAO = ['admin', 'gestor_regional', 'gestor_area', 'gestor_unidade'];

router.get('/', permitir(...PAPEIS_GESTAO), controller.listar);
router.get('/verificar-email', permitir(...PAPEIS_GESTAO), controller.verificarEmail);
router.get('/:id', permitir(...PAPEIS_GESTAO), controller.buscarPorId);
router.post('/', permitir(...PAPEIS_GESTAO), controller.criarOuConvidar);
router.patch('/:id', permitir('admin'), controller.atualizar);

module.exports = router;
