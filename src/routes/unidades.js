const express = require('express');
const router = express.Router();
const controller = require('../controllers/unidadesController');
const { permitir } = require('../middlewares/auth');

router.get('/', controller.listar);
router.get('/:id', controller.buscarPorId);
router.post('/', permitir('admin', 'gestor_regional', 'gestor_area'), controller.criar);
router.patch('/:id', permitir('admin', 'gestor_regional', 'gestor_area'), controller.atualizar);
router.delete('/:id', permitir('admin', 'gestor_regional', 'gestor_area'), controller.remover);

module.exports = router;
