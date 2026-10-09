const express = require('express');
const router = express.Router();
const controller = require('../controllers/usuariosController');
const { permitir } = require('../middlewares/auth');

const PAPEIS_GESTAO = ['admin', 'gestor_regional', 'gestor_area', 'gestor_unidade'];

// listar é liberado pra qualquer gestor (não só admin) — é o que alimenta
// o seletor de responsável dentro de causa/ação; o controller já filtra
// por unidade_id (condicaoUnidade), então gestor_unidade só vê gente da
// própria unidade, gestor_area da própria área etc. — admin continua
// vendo todo mundo. Ver um usuário específico por id, editar e excluir
// continuam só do admin — isso sim é "gerenciar usuários" (a tela de
// Gestão > Usuários). Criar/convidar e checar e-mail também ficam
// liberados: é o que sustenta "Convidar responsável" de dentro de uma
// causa/ação, que não é "gerenciar usuários", é atribuir responsabilidade
// no que já gerem.
router.get('/', permitir(...PAPEIS_GESTAO), controller.listar);
router.get('/verificar-email', permitir(...PAPEIS_GESTAO), controller.verificarEmail);
router.get('/:id', permitir('admin'), controller.buscarPorId);
router.post('/', permitir(...PAPEIS_GESTAO), controller.criarOuConvidar);
router.patch('/:id', permitir('admin'), controller.atualizar);
router.delete('/:id', permitir('admin'), controller.remover);

module.exports = router;
