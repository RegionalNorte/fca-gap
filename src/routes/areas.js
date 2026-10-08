const express = require('express');
const router = express.Router();
const controller = require('../controllers/areasController');
const { permitir } = require('../middlewares/auth');

router.get('/', controller.listar);
router.get('/:id', controller.buscarPorId);
router.post('/', permitir('admin', 'gestor_regional'), controller.criar);
router.patch('/:id', permitir('admin', 'gestor_regional'), controller.atualizar);
router.delete('/:id', permitir('admin', 'gestor_regional'), controller.remover);

module.exports = router;
