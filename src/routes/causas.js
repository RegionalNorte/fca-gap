const express = require('express');
const router = express.Router();
const controller = require('../controllers/causasController');
const { permitir } = require('../middlewares/auth');

const PAPEIS_GESTAO = ['admin', 'gestor_regional', 'gestor_area', 'gestor_unidade'];

router.get('/', controller.listar);
router.get('/:id', controller.buscarPorId);
router.post('/', permitir(...PAPEIS_GESTAO), controller.criar);
// PATCH liberado pra colaborador também: ele pode ser o responsável pela
// causa (dono/quem identificou) — a posse é checada dentro do controller.
router.patch('/:id', controller.atualizar);
router.delete('/:id', permitir(...PAPEIS_GESTAO), controller.remover);

module.exports = router;
