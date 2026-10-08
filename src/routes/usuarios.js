const express = require('express');
const router = express.Router();
const controller = require('../controllers/usuariosController');
const { permitir } = require('../middlewares/auth');

const PAPEIS_GESTAO = ['admin', 'gestor_regional', 'gestor_area', 'gestor_unidade'];

// O diretório de usuários (listar/ver) é só do admin — faz parte da Gestão.
// Criar/convidar e checar e-mail continuam liberados pros demais gestores:
// é o que sustenta "Convidar responsável" de dentro de uma causa/ação, que
// não é "gerenciar usuários", é atribuir responsabilidade no que já gerem.
router.get('/', permitir('admin'), controller.listar);
router.get('/verificar-email', permitir(...PAPEIS_GESTAO), controller.verificarEmail);
router.get('/:id', permitir('admin'), controller.buscarPorId);
router.post('/', permitir(...PAPEIS_GESTAO), controller.criarOuConvidar);
router.patch('/:id', permitir('admin'), controller.atualizar);

module.exports = router;
