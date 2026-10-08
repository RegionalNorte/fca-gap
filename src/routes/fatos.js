const express = require('express');
const router = express.Router();
const controller = require('../controllers/fatosController');
const { permitir } = require('../middlewares/auth');

const PAPEIS_GESTAO = ['admin', 'gestor_regional', 'gestor_area', 'gestor_unidade'];

router.get('/', controller.listar);
router.get('/:id', controller.buscarPorId);
router.post('/', permitir(...PAPEIS_GESTAO), controller.criar);
router.patch('/:id', permitir(...PAPEIS_GESTAO), controller.atualizar);
router.delete('/:id', permitir(...PAPEIS_GESTAO), controller.remover);

module.exports = router;
