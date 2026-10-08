const express = require('express');
const router = express.Router();
const controller = require('../controllers/acoesController');
const { permitir } = require('../middlewares/auth');

const PAPEIS_GESTAO = ['admin', 'gestor_regional', 'gestor_area', 'gestor_unidade'];

router.get('/prazos', controller.prazos);
router.get('/', controller.listar);
router.get('/:id', controller.buscarPorId);
router.post('/', permitir(...PAPEIS_GESTAO), controller.criar);
// PATCH liberado pra colaborador também: ele executa a ação (data_iniciada/
// data_finalizada/evidência) quando está entre os responsáveis — a posse é
// checada dentro do controller.
router.patch('/:id', controller.atualizar);
router.delete('/:id', permitir(...PAPEIS_GESTAO), controller.remover);

module.exports = router;
